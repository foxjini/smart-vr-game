import asyncio
import logging
import math
from typing import Any, Coroutine, Dict, Optional, Set

from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger("broadcaster")

VALID_DIFFICULTIES = ("easy", "normal", "hard")
# 경기 설정 중 경기장 테마와 표적 모양 (화면 코드 types/index.ts의 ThemeType·TargetShape와 같은 목록).
# 테마·표적 모양·난이도는 방 전체가 같은 값을 씀 (서버를 다시 켜면 기본값으로 돌아감)
VALID_THEMES = ("cyber", "space", "city")
VALID_SHAPES = ("drone", "sphere", "cube", "disc")
DEFAULT_THEME = "cyber"
DEFAULT_SHAPE = "drone"
DEFAULT_DIFFICULTY = "normal"
DEFAULT_MATCH_DURATION = 60
MIN_MATCH_DURATION = 10
MAX_MATCH_DURATION = 600
# 표적 1개의 배점 범위 (현재 게임은 정보·통신 2점, 제어·회로·인공·전자 1점, 기계·전기 -1점 감점).
# 이 범위를 벗어나거나 0이면 비정상 값으로 보고 1점으로 처리
MAX_TARGET_POINTS = 10
# 한 경기에서 서버가 기억하는 표적 수 상한 (메모리 보호용, 실제 경기는 수십 개 수준)
MAX_TRACKED_TARGETS = 500
# 경기 중 남은 시간을 모든 화면에 다시 알리는 간격(초).
# 막 접속한 기기가 첫 화면을 그리느라 메시지를 늦게 처리해도 이 간격 안에 시계가 맞춰짐
CLOCK_SYNC_INTERVAL = 5.0
# 친구 대결에서 한 선수만 '준비 완료'일 때 경기를 자동으로 시작하기까지 기다리는 시간(초).
# 상대 헤드셋은 그 기기에서 직접 버튼을 눌러야 VR에 들어갈 수 있으므로(WebXR 보안 규칙) 그동안 기다려 줌.
# 상대가 끝내 준비하지 않아도 이 시간이 지나면 시작하고, 상대는 VR에 들어오는 대로 합류함
READY_WAIT_SECONDS = 15.0
# 같은 기기(같은 세션)가 다시 접속해 이전 연결을 대체할 때 이전 소켓에 보내는 종료 코드.
# 클라이언트는 이 코드를 받으면 자동 재접속하지 않음
CLOSE_CODE_REPLACED = 4001
# 요청한 플레이어 자리를 다른 기기가 사용 중일 때의 종료 코드.
# 경기 중인 선수를 밀어내지 않고, 요청한 쪽이 자리가 빌 때까지 기다렸다가 다시 시도함
CLOSE_CODE_SLOT_BUSY = 4002


def _to_int(value: Any) -> Optional[int]:
    """JSON 숫자를 정수로 변환 (bool·문자열·소수 등은 None)"""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _parse_role(raw: Any) -> Optional[str]:
    req = (raw if isinstance(raw, str) else "").strip().lower()
    if req in ("spectator", "observer", "spec"):
        return "SPECTATOR"
    if req in ("p1", "1", "player1"):
        return "P1"
    if req in ("p2", "2", "player2"):
        return "P2"
    return None


def _valid_point(value: Any) -> bool:
    if not (isinstance(value, list) and len(value) == 3):
        return False
    return all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in value)


class ConnectionManager:
    def __init__(self):
        # 연결된 클라이언트 풀
        self.player_clients: Dict[int, WebSocket] = {} # 1: P1 (Cyan), 2: P2 (Magenta)
        self.player_sessions: Dict[int, str] = {} # 1: sessionId, 2: sessionId (중복 점유 방지)
        self.session_to_player: Dict[str, int] = {} # sessionId -> 1 or 2
        self.spectator_clients: Set[WebSocket] = set() # 관람객 (Observer)
        self.game_clients: Set[WebSocket] = set() # 전체 게임 소켓 (호환성 유지)
        self.pico_clients: Set[WebSocket] = set()
        self.virtual_clients: Set[WebSocket] = set()

        # 매치 상태 (경기 시간과 최종 점수는 서버가 판정)
        self.match_id = 0
        self.is_match_active = False
        self.is_match_paused = False
        self.match_duration = DEFAULT_MATCH_DURATION
        # 경기 설정 (방 전체 공통): 어느 화면(1P·2P·관전)에서 바꿔도 모든 화면에 적용되고, 경기 중에는 바뀌지 않음
        self.difficulty = DEFAULT_DIFFICULTY
        self.theme = DEFAULT_THEME
        self.target_shape = DEFAULT_SHAPE
        self.p1_score = 0
        self.p2_score = 0
        # 이번 경기에서 호스트가 생성했고 아직 격파되지 않은 표적 → 배점
        self.target_points: Dict[str, int] = {}
        self._match_deadline = 0.0 # 이벤트 루프 시각 기준 종료 예정 시각
        self._paused_remaining = 0.0 # 일시정지 시점의 남은 시간
        self._match_task: Optional[asyncio.Task] = None
        self._background_tasks: Set[asyncio.Task] = set()

        # 경기 전 '준비 완료'한 플레이어 자리 (소켓이 바뀌거나 끊기면 취소됨).
        # 접속한 자리가 모두 준비되면 바로 시작하고, 한 자리만 준비되면 READY_WAIT_SECONDS 뒤 자동 시작
        self.ready_slots: Set[int] = set()
        self._ready_deadline: Optional[float] = None # 이벤트 루프 시각 기준 자동 시작 시각
        self._ready_task: Optional[asyncio.Task] = None
        self._ready_duration = DEFAULT_MATCH_DURATION # 처음 준비한 선수가 정한 경기 시간

        self.last_pico_packet = None
        self.last_source = None

    # ------------------------------------------------------------------
    # 내부 유틸
    # ------------------------------------------------------------------
    @staticmethod
    def _now() -> float:
        return asyncio.get_running_loop().time()

    def _spawn(self, coro: Coroutine[Any, Any, Any]) -> asyncio.Task:
        """백그라운드 작업 실행 (참조를 보관해 실행 도중 수거되지 않도록 함)"""
        task = asyncio.create_task(coro)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        return task

    def _slot_of(self, websocket: WebSocket) -> Optional[int]:
        for pid, ws in self.player_clients.items():
            if ws is websocket:
                return pid
        return None

    def _host_slot(self) -> Optional[int]:
        """표적 생성과 AI 라이벌 구동을 맡는 플레이어 (1P 우선, 1P가 없으면 2P)"""
        if 1 in self.player_clients:
            return 1
        if 2 in self.player_clients:
            return 2
        return None

    def _can_act_for(self, websocket: WebSocket, player_id: Optional[int]) -> bool:
        """자기 슬롯, 또는 사람이 없는 상대 슬롯(AI 라이벌 대리)의 포즈·발사·명중만 보고할 수 있음"""
        slot = self._slot_of(websocket)
        if slot is None or player_id not in (1, 2):
            return False
        return player_id == slot or player_id not in self.player_clients

    def _is_current_match(self, data: dict) -> bool:
        """진행 중인 경기에 대한 메시지인지 확인 (matchId가 있으면 일치해야 함)"""
        if not self.is_match_active:
            return False
        match_id = data.get("matchId")
        return match_id is None or match_id == self.match_id

    def _remaining(self) -> float:
        if not self.is_match_active:
            return 0.0
        if self.is_match_paused:
            return self._paused_remaining
        return max(0.0, self._match_deadline - self._now())

    def _ready_remaining(self) -> Optional[float]:
        if self._ready_deadline is None:
            return None
        return max(0.0, self._ready_deadline - self._now())

    def _room_info(self) -> dict:
        p1 = 1 in self.player_clients
        p2 = 2 in self.player_clients
        ready_remaining = self._ready_remaining()
        return {
            "p1Connected": p1,
            "p2Connected": p2,
            "spectatorCount": len(self.spectator_clients),
            "mode": "VERSUS_PVP" if (p1 and p2) else "VERSUS_AI",
            # 경기 전 준비 상태 (클라이언트는 이 값이 있으면 시작 요청을 '준비 완료'로 보냄)
            "p1Ready": 1 in self.ready_slots,
            "p2Ready": 2 in self.ready_slots,
            "readyRemaining": None if ready_remaining is None else round(ready_remaining, 2),
        }

    def _match_state(self) -> dict:
        return {
            "matchId": self.match_id,
            "isMatchActive": self.is_match_active,
            "isPaused": self.is_match_paused,
            "duration": self.match_duration,
            "remaining": round(self._remaining(), 2),
            # 경기 설정 (클라이언트는 theme 값이 있으면 설정 변경을 서버로 보내 모든 화면을 맞춤)
            "difficulty": self.difficulty,
            "theme": self.theme,
            "targetShape": self.target_shape,
            "p1Score": self.p1_score,
            "p2Score": self.p2_score,
        }

    async def _send(self, websocket: WebSocket, message: dict) -> bool:
        try:
            await websocket.send_json(message)
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------
    # 슬롯 관리
    # ------------------------------------------------------------------
    def _release(self, websocket: WebSocket) -> Optional[int]:
        """소켓을 플레이어 슬롯과 관람석에서 제거하고, 비운 슬롯 번호를 반환"""
        self.spectator_clients.discard(websocket)
        pid = self._slot_of(websocket)
        if pid is not None:
            del self.player_clients[pid]
            self._drop_ready(pid)
            old_sid = self.player_sessions.pop(pid, None)
            if old_sid:
                self.session_to_player.pop(old_sid, None)
        return pid

    async def _claim_slot(self, websocket: WebSocket, player_id: int, session_id: Optional[str]) -> bool:
        """플레이어 슬롯을 이 소켓에 배정.
        다른 기기(다른 세션)가 쓰고 있으면 빼앗지 않고 False를 반환해 경기 중인 선수를 보호함.
        같은 기기의 재접속(같은 세션)이면 이전 소켓을 4001로 정리하고 슬롯을 넘겨받음."""
        own_slot = self._slot_of(websocket)
        if session_id is None and own_slot is not None:
            session_id = self.player_sessions.get(own_slot)

        holder = self.player_clients.get(player_id)
        if holder is not None and holder is not websocket:
            if not session_id or self.player_sessions.get(player_id) != session_id:
                return False

        self._release(websocket)

        old_ws = self.player_clients.get(player_id)
        old_sid = self.player_sessions.pop(player_id, None)
        if old_sid:
            self.session_to_player.pop(old_sid, None)

        self.player_clients[player_id] = websocket
        if session_id:
            prev_pid = self.session_to_player.get(session_id)
            if prev_pid is not None and prev_pid != player_id and self.player_sessions.get(prev_pid) == session_id:
                self.player_sessions.pop(prev_pid, None)
            self.player_sessions[player_id] = session_id
            self.session_to_player[session_id] = player_id

        if old_ws is not None and old_ws is not websocket:
            # 같은 기기가 새 연결로 돌아옴: 끊긴 채 남아 있던 이전 소켓 정리 (이전 연결의 준비는 취소)
            self._drop_ready(player_id)
            self.game_clients.discard(old_ws)
            self.spectator_clients.discard(old_ws)
            logger.info(f"Player {player_id} reconnected with a new socket (Session: {session_id})")
            try:
                await old_ws.close(code=CLOSE_CODE_REPLACED, reason="replaced by a newer connection")
            except Exception:
                pass
        return True

    # ------------------------------------------------------------------
    # 경기 전 준비 (친구 대결)
    # ------------------------------------------------------------------
    def _drop_ready(self, slot: Optional[int]) -> None:
        """한 자리의 준비를 취소 (준비한 자리가 하나도 없으면 자동 시작 대기도 끔)"""
        if slot is None:
            return
        self.ready_slots.discard(slot)
        if not self.ready_slots:
            self._cancel_ready_timer()

    def _clear_ready(self) -> None:
        self.ready_slots.clear()
        self._cancel_ready_timer()

    def _cancel_ready_timer(self) -> None:
        self._ready_deadline = None
        if self._ready_task is not None:
            self._ready_task.cancel()
            self._ready_task = None

    async def _run_ready_timer(self, deadline: float) -> None:
        await asyncio.sleep(max(0.0, deadline - self._now()))
        # 경기를 시작하면 대기 작업을 취소하므로, 먼저 이 작업을 떼어 내 자기 자신을 취소하지 않게 함
        self._ready_task = None
        self._ready_deadline = None
        if self.is_match_active or not self.ready_slots or self._host_slot() is None:
            return
        logger.info(f"Ready wait over: starting with ready slots {sorted(self.ready_slots)}")
        await self._start_match(self._ready_duration, None)

    async def _handle_player_ready(self, websocket: WebSocket, data: dict):
        """선수의 시작 요청 = 준비 완료. 접속한 자리가 모두 준비되면 바로 시작 (혼자면 바로 AI 대결),
        한 자리만 준비되면 READY_WAIT_SECONDS 뒤 자동 시작. ready가 false면 준비 취소"""
        slot = self._slot_of(websocket)
        if slot is None:
            return # 관람 화면은 준비하지 않음 (경기는 선수가 준비해야만 시작)
        if data.get("ready") is False:
            if slot in self.ready_slots:
                self._drop_ready(slot)
                await self.broadcast_room_state()
            return
        if self.is_match_active:
            # 이미 진행 중이면 요청한 선수만 현재 경기에 합류
            await self._send(websocket, {"type": "match_started", **self._match_state()})
            return
        if not self.ready_slots:
            # 처음 준비한 선수가 경기 시간을 정함. 난이도는 방의 경기 설정을 씀
            # (예전 화면이 보내는 difficulty는 무시해, 다른 화면에서 고른 설정이 바뀌지 않게 함)
            duration = _to_int(data.get("duration")) or DEFAULT_MATCH_DURATION
            self._ready_duration = max(MIN_MATCH_DURATION, min(MAX_MATCH_DURATION, duration))
        self.ready_slots.add(slot)
        if set(self.player_clients) <= self.ready_slots:
            await self._start_match(self._ready_duration, None)
            return
        if self._ready_task is None:
            # 기한은 처음 준비한 때부터 한 번만 정함 (다시 준비해도 늘어나지 않음)
            self._ready_deadline = self._now() + READY_WAIT_SECONDS
            self._ready_task = self._spawn(self._run_ready_timer(self._ready_deadline))
        await self.broadcast_room_state()

    async def _reject_busy(self, websocket: WebSocket, role: str, session_id: Optional[str]) -> None:
        """요청한 자리를 다른 기기가 쓰는 중: 알리고 연결을 닫음 (클라이언트는 잠시 후 다시 시도)"""
        logger.info(f"{role} slot is in use by another device; asking session {session_id} to wait")
        self.game_clients.discard(websocket)
        await self._send(websocket, {"type": "slot_busy", "role": role})
        try:
            await websocket.close(code=CLOSE_CODE_SLOT_BUSY, reason="slot in use by another device")
        except Exception:
            pass

    def clean_dead_sockets(self):
        """죽은 소켓이나 비정상 종료된 연결을 슬롯에서 자동 청소"""
        for ws in list(self.player_clients.values()) + list(self.spectator_clients):
            is_alive = getattr(ws, "client_state", None) == WebSocketState.CONNECTED
            if not is_alive:
                pid = self._release(ws)
                self.game_clients.discard(ws)
                if pid:
                    logger.info(f"Auto-cleaned dead socket for Player {pid}")

    async def connect_game(self, websocket: WebSocket, requested_role: Optional[str] = None, session_id: Optional[str] = None) -> bool:
        """게임 클라이언트 접속 처리. 요청한 플레이어 자리를 다른 기기가 쓰고 있으면 False (연결 종료됨)"""
        await websocket.accept()
        self.clean_dead_sockets()
        self.game_clients.add(websocket)
        if session_id:
            session_id = session_id[:64]

        player_id: Optional[int] = None
        role = _parse_role(requested_role)

        # [전시회 모드] 역할 명시적 고정 처리
        if role == "SPECTATOR":
            # 관람 중계 모니터 요청: 플레이어 슬롯이 비어있어도 절대 가로채지 않고 무조건 관람객으로 배정
            self.spectator_clients.add(websocket)
        elif role in ("P1", "P2"):
            # 1P/2P 전용 VR 헤드셋 요청: 해당 슬롯에 고정 배정.
            # 같은 기기의 재접속은 자리를 돌려받고, 다른 기기가 쓰는 중이면 빼앗지 않고 대기시킴
            player_id = 1 if role == "P1" else 2
            if not await self._claim_slot(websocket, player_id, session_id):
                await self._reject_busy(websocket, role, session_id)
                return False
        else:
            # 역할 미지정 일반 접속 (같은 세션 복귀 → 빈 슬롯 선착순 → 관람객)
            if session_id and session_id in self.session_to_player:
                player_id = self.session_to_player[session_id]
            elif 1 not in self.player_clients:
                player_id = 1
            elif 2 not in self.player_clients:
                player_id = 2

            if player_id is None or not await self._claim_slot(websocket, player_id, session_id):
                player_id = None
                self.spectator_clients.add(websocket)

        assigned_role = f"P{player_id}" if player_id else "SPECTATOR"
        logger.info(f"Client connected as {assigned_role} (PlayerId: {player_id}, Session: {session_id}). Active Players: {list(self.player_clients.keys())}, Spectators: {len(self.spectator_clients)}")

        # 1. 클라이언트에게 역할과 현재 경기 상태 안내
        await self._send(websocket, {
            "type": "client_assigned",
            "role": assigned_role,
            "playerId": player_id,
            **self._room_info(),
            **self._match_state(),
        })

        # 2. 모든 클라이언트에 방 상태 브로드캐스트
        await self.broadcast_room_state()
        return True

    def disconnect_game(self, websocket: WebSocket):
        known = (
            websocket in self.game_clients
            or websocket in self.spectator_clients
            or self._slot_of(websocket) is not None
        )
        if not known:
            return # 이미 정리된 소켓 (다른 기기로 교체된 연결 등)

        self.game_clients.discard(websocket)
        disconnected_player = self._release(websocket)

        if disconnected_player:
            logger.info(f"Player {disconnected_player} disconnected. Remaining players: {list(self.player_clients.keys())}")
        else:
            logger.info(f"Spectator disconnected. Remaining spectators: {len(self.spectator_clients)}")

        self.clean_dead_sockets()
        self._spawn(self.broadcast_room_state())

    async def broadcast_room_state(self):
        await self.broadcast_to_all({
            "type": "room_state",
            **self._room_info(),
            **self._match_state(),
        })

    async def broadcast_to_all(self, message: dict):
        dead_sockets = []
        for client in list(self.game_clients):
            if not await self._send(client, message):
                dead_sockets.append(client)
        for dead in dead_sockets:
            self.disconnect_game(dead)

    async def relay_to_others(self, sender_ws: WebSocket, message: dict):
        dead_sockets = []
        for client in list(self.game_clients):
            if client is not sender_ws and not await self._send(client, message):
                dead_sockets.append(client)
        for dead in dead_sockets:
            self.disconnect_game(dead)

    # ------------------------------------------------------------------
    # 게임 메시지 처리
    # ------------------------------------------------------------------
    async def handle_game_message(self, websocket: WebSocket, data: Any):
        if not isinstance(data, dict):
            return
        msg_type = data.get("type")

        if msg_type in ("player_pose", "fire_event"):
            # 6DoF 자세 / 총구 화염 동기화 중계 (자기 슬롯 또는 AI가 맡은 빈 슬롯만)
            if self._can_act_for(websocket, _to_int(data.get("playerId"))):
                await self.relay_to_others(websocket, data)

        elif msg_type == "target_spawn":
            await self._handle_target_spawn(websocket, data)

        elif msg_type == "hit_request":
            await self._handle_hit_request(websocket, data)

        elif msg_type == "match_start":
            await self._handle_match_start(websocket, data)

        elif msg_type == "player_ready":
            await self._handle_player_ready(websocket, data)

        elif msg_type == "match_pause":
            await self._handle_match_pause(data)

        elif msg_type == "match_resume":
            await self._handle_match_resume(data)

        elif msg_type == "match_abort":
            await self._handle_match_abort(data)

        elif msg_type in ("set_room_settings", "set_difficulty"):
            await self._handle_room_settings(websocket, data)

        elif msg_type == "request_role_change":
            await self._handle_role_change(websocket, data)

        # match_over: 경기 종료와 승패는 서버 타이머가 판정하므로 클라이언트 보고는 무시

    async def _handle_target_spawn(self, websocket: WebSocket, data: dict):
        # 표적은 플레이어만 생성 (평소에는 호스트인 1P, 호스트 화면이 멈추면 다른 플레이어가 대신).
        # 생성된 표적은 모든 화면에 중계되므로 양쪽이 같은 표적을 봄
        if self._slot_of(websocket) is None or not self._is_current_match(data):
            return
        target_id = data.get("id")
        if not isinstance(target_id, str) or not 0 < len(target_id) <= 64:
            return
        if target_id not in self.target_points and len(self.target_points) >= MAX_TRACKED_TARGETS:
            return
        points = _to_int(data.get("points"))
        if points is None or points == 0 or not -MAX_TARGET_POINTS <= points <= MAX_TARGET_POINTS:
            points = 1
        self.target_points[target_id] = points
        data["points"] = points
        data["matchId"] = self.match_id
        if data.get("shape") not in VALID_SHAPES:
            # 모양이 없거나 잘못된 표적은 방의 표적 모양으로 (모양마다 명중 판정 도형이 달라 화면마다 같아야 함)
            data["shape"] = self.target_shape
        await self.relay_to_others(websocket, data)

    async def _handle_hit_request(self, websocket: WebSocket, data: dict):
        if not self._is_current_match(data) or self.is_match_paused:
            return
        hit_by = _to_int(data.get("hitBy"))
        if not self._can_act_for(websocket, hit_by):
            return

        # 선착순 검증: 호스트가 만든 표적이고 아직 격파되지 않았을 때만 인정 (배점은 서버 기록 사용)
        target_id = data.get("targetId")
        points = self.target_points.pop(target_id, None) if isinstance(target_id, str) else None
        if points is None:
            return
        if hit_by == 1:
            self.p1_score += points
        else:
            self.p2_score += points

        hit_point = data.get("hitPoint")
        combo = _to_int(data.get("combo"))
        await self.broadcast_to_all({
            "type": "target_hit_confirmed",
            "matchId": self.match_id,
            "targetId": target_id,
            "hitBy": hit_by,
            "hitPoint": hit_point if _valid_point(hit_point) else [0, 0, 0],
            "addedScore": points,
            "p1Score": self.p1_score,
            "p2Score": self.p2_score,
            "combo": combo if combo is not None and 0 < combo < 10000 else 1,
        })

    async def _handle_match_start(self, websocket: WebSocket, data: dict):
        if self._slot_of(websocket) is None:
            # 경기는 선수만 시작함 (관람 화면은 보기·일시정지·중단만).
            # 관람 화면은 client_assigned·room_state로 진행 중인 경기를 이미 따라가므로 합류 응답도 보내지 않음
            return
        if self.is_match_active:
            # 이미 진행 중이면 새로 시작하지 않고, 요청한 클라이언트만 현재 경기에 합류시킴
            await self._send(websocket, {"type": "match_started", **self._match_state()})
            return
        if self._host_slot() is None:
            return # 접속한 플레이어가 없으면 경기를 열지 않음

        duration = _to_int(data.get("duration")) or DEFAULT_MATCH_DURATION
        duration = max(MIN_MATCH_DURATION, min(MAX_MATCH_DURATION, duration))
        await self._start_match(duration, data.get("difficulty"))

    async def _start_match(self, duration: int, difficulty: Any) -> None:
        """새 경기 시작. 상태는 첫 await 전에 모두 정해, 방송하는 사이 들어온 요청이 경기를 다시 열지 않게 함"""
        if difficulty in VALID_DIFFICULTIES:
            self.difficulty = difficulty
        self._clear_ready()
        self.match_id += 1
        self.is_match_active = True
        self.is_match_paused = False
        self.match_duration = duration
        self._match_deadline = self._now() + duration
        self.p1_score = 0
        self.p2_score = 0
        self.target_points.clear()
        self._start_match_timer()
        logger.info(
            f"Match {self.match_id} started ({duration}s, difficulty={self.difficulty}, "
            f"theme={self.theme}, shape={self.target_shape})"
        )
        await self.broadcast_to_all({"type": "match_started", **self._match_state()})
        await self.broadcast_room_state()

    async def _handle_room_settings(self, websocket: WebSocket, data: dict):
        """경기 설정(테마·표적 모양·난이도) 변경. 선수·관람 화면 어디서 바꿔도 방 전체에 적용.
        경기 중에는 바꾸지 않음 (진행 중인 경기의 배경·표적이 화면마다 달라지지 않게).
        바뀐 값이 있으면 모든 화면에 room_state를 방송하고, 거부했거나 바뀐 값이 없으면
        요청한 화면에만 현재 값을 보내 그 화면의 선택 표시를 실제 값으로 되돌림.
        예전 화면이 보내는 set_difficulty도 같은 방식으로 처리함"""
        changed = False
        if not self.is_match_active:
            theme = data.get("theme")
            if theme in VALID_THEMES and theme != self.theme:
                self.theme = theme
                changed = True
            shape = data.get("targetShape")
            if shape in VALID_SHAPES and shape != self.target_shape:
                self.target_shape = shape
                changed = True
            difficulty = data.get("difficulty")
            if difficulty in VALID_DIFFICULTIES and difficulty != self.difficulty:
                self.difficulty = difficulty
                changed = True
        if changed:
            logger.info(f"Room settings: theme={self.theme}, shape={self.target_shape}, difficulty={self.difficulty}")
            await self.broadcast_room_state()
        else:
            await self._send(websocket, {"type": "room_state", **self._room_info(), **self._match_state()})

    async def _handle_match_pause(self, data: dict):
        if not self._is_current_match(data) or self.is_match_paused:
            return
        self._paused_remaining = max(0.0, self._match_deadline - self._now())
        self.is_match_paused = True
        self._cancel_match_timer()
        await self.broadcast_to_all({
            "type": "match_paused",
            "matchId": self.match_id,
            "remaining": round(self._paused_remaining, 2),
        })

    async def _handle_match_resume(self, data: dict):
        if not self._is_current_match(data) or not self.is_match_paused:
            return
        self.is_match_paused = False
        self._match_deadline = self._now() + self._paused_remaining
        self._start_match_timer()
        await self.broadcast_to_all({
            "type": "match_resumed",
            "matchId": self.match_id,
            "remaining": round(self._paused_remaining, 2),
        })

    async def _handle_match_abort(self, data: dict):
        # 플레이어의 긴급 탈출 또는 운영자(관람 중계 PC)의 [경기 중단]
        if not self._is_current_match(data):
            return
        self.is_match_active = False
        self.is_match_paused = False
        self._cancel_match_timer()
        self.target_points.clear()
        self._clear_ready()
        abort_msg = data.get("message")
        if not isinstance(abort_msg, str) or not abort_msg.strip():
            abort_msg = "경기가 관리자 또는 플레이어에 의해 중단되었습니다."
        abort_msg = abort_msg[:200]
        logger.info(f"Match {self.match_id} aborted: {abort_msg}")
        await self.broadcast_to_all({
            "type": "match_aborted",
            "matchId": self.match_id,
            "message": abort_msg,
        })
        await self.broadcast_room_state()

    async def _handle_role_change(self, websocket: WebSocket, data: dict):
        role = _parse_role(data.get("role")) or "SPECTATOR"
        sid = data.get("sessionId")
        session_id = sid[:64] if isinstance(sid, str) and sid else None

        player_id: Optional[int] = None
        if role == "SPECTATOR":
            self._release(websocket)
            self.spectator_clients.add(websocket)
        else:
            player_id = 1 if role == "P1" else 2
            if not await self._claim_slot(websocket, player_id, session_id):
                # 다른 기기가 쓰는 자리: 현재 역할을 유지하고 알리기만 함
                await self._send(websocket, {"type": "slot_busy", "role": role})
                return

        assigned_role = f"P{player_id}" if player_id else "SPECTATOR"
        logger.info(f"Role changed for client to {assigned_role} (PlayerId: {player_id})")
        await self._send(websocket, {
            "type": "client_assigned",
            "role": assigned_role,
            "playerId": player_id,
            **self._room_info(),
            **self._match_state(),
        })
        await self.broadcast_room_state()

    # ------------------------------------------------------------------
    # 경기 타이머 (서버가 종료 시각과 승패를 판정)
    # ------------------------------------------------------------------
    def _start_match_timer(self) -> None:
        self._cancel_match_timer()
        self._match_task = self._spawn(self._run_match_timer(self.match_id))

    def _cancel_match_timer(self) -> None:
        if self._match_task is not None:
            self._match_task.cancel()
            self._match_task = None

    async def _run_match_timer(self, match_id: int) -> None:
        while self.is_match_active and self.match_id == match_id and not self.is_match_paused:
            remaining = self._match_deadline - self._now()
            if remaining <= 0:
                await self._finish_match(match_id)
                return
            await asyncio.sleep(min(remaining, CLOCK_SYNC_INTERVAL))
            if self.is_match_active and self.match_id == match_id and not self.is_match_paused and self._remaining() > 0.5:
                await self.broadcast_to_all({
                    "type": "match_clock",
                    "matchId": match_id,
                    "remaining": round(self._remaining(), 2),
                })

    async def _finish_match(self, match_id: int) -> None:
        """경기 시간 종료: 서버 집계 점수로 승패를 판정해 모든 클라이언트에 한 번만 방송"""
        if not self.is_match_active or self.match_id != match_id:
            return
        self.is_match_active = False
        self.is_match_paused = False
        self._match_task = None # 방송 도중 새 경기가 시작돼도 이 종료 방송은 취소되지 않도록 분리
        self.target_points.clear()
        self._clear_ready()

        winner = "DRAW"
        if self.p1_score > self.p2_score:
            winner = "P1"
        elif self.p2_score > self.p1_score:
            winner = "P2"
        logger.info(f"Match {match_id} over: P1 {self.p1_score} vs P2 {self.p2_score} ({winner})")
        await self.broadcast_to_all({
            "type": "match_over_broadcast",
            "matchId": match_id,
            "p1Score": self.p1_score,
            "p2Score": self.p2_score,
            "winner": winner,
        })
        await self.broadcast_room_state()

    # 레거시 하드웨어 (Pico / Virtual Pad) 메서드 호환 유지
    async def connect_pico(self, websocket: WebSocket):
        await websocket.accept()
        self.pico_clients.add(websocket)
        logger.info(f"Pico connected. Total: {len(self.pico_clients)}")

    def disconnect_pico(self, websocket: WebSocket):
        self.pico_clients.discard(websocket)

    async def connect_virtual(self, websocket: WebSocket):
        await websocket.accept()
        self.virtual_clients.add(websocket)

    def disconnect_virtual(self, websocket: WebSocket):
        self.virtual_clients.discard(websocket)

    async def broadcast_input(self, data: dict, source: str = "pico"):
        self.last_pico_packet = data
        self.last_source = source
        await self.broadcast_to_all(data)

manager = ConnectionManager()
