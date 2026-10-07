import asyncio
import json
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger("broadcaster")

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

        # 매치 상태
        self.is_match_active = False
        self.difficulty = "normal"
        self.p1_score = 0
        self.p2_score = 0
        self.destroyed_targets: Set[str] = set()
        self.last_pico_packet = None
        self.last_source = None

    def clean_dead_sockets(self):
        """죽은 소켓이나 비정상 종료된 연결을 슬롯에서 자동 청소"""
        # 1. 플레이어 슬롯 검사
        for pid, ws in list(self.player_clients.items()):
            is_alive = getattr(ws, "client_state", None) == WebSocketState.CONNECTED
            if not is_alive:
                logger.info(f"Auto-cleaned dead socket for Player {pid}")
                self.game_clients.discard(ws)
                del self.player_clients[pid]
                old_sid = self.player_sessions.pop(pid, None)
                if old_sid:
                    self.session_to_player.pop(old_sid, None)

        # 2. 관람객 슬롯 검사
        for ws in list(self.spectator_clients):
            is_alive = getattr(ws, "client_state", None) == WebSocketState.CONNECTED
            if not is_alive:
                self.spectator_clients.discard(ws)
                self.game_clients.discard(ws)

    async def connect_game(self, websocket: WebSocket, requested_role: Optional[str] = None, session_id: Optional[str] = None):
        await websocket.accept()
        self.clean_dead_sockets()
        self.game_clients.add(websocket)

        assigned_role = "SPECTATOR"
        player_id = None

        if requested_role == "spectator":
            self.spectator_clients.add(websocket)
            assigned_role = "SPECTATOR"
        else:
            # 1. 동일한 브라우저 세션 ID가 이미 슬롯을 가지고 있는 경우 (새로고침 / 재연결 시)
            # 기존 소켓을 새 소켓으로 안전 교체하여 '한 탭이 P1, P2 슬롯 둘 다 먹는 버그' 원천 차단
            if session_id and session_id in self.session_to_player:
                player_id = self.session_to_player[session_id]
                old_ws = self.player_clients.get(player_id)
                if old_ws and old_ws != websocket:
                    self.game_clients.discard(old_ws)
                    try:
                        await old_ws.close()
                    except Exception:
                        pass
                self.player_clients[player_id] = websocket
                assigned_role = f"P{player_id}"
            # 2. 1번 플레이어 슬롯이 비어있으면 1번 배정
            elif 1 not in self.player_clients:
                self.player_clients[1] = websocket
                if session_id:
                    self.player_sessions[1] = session_id
                    self.session_to_player[session_id] = 1
                assigned_role = "P1"
                player_id = 1
            # 3. 2번 플레이어 슬롯이 비어있으면 2번 배정
            elif 2 not in self.player_clients:
                self.player_clients[2] = websocket
                if session_id:
                    self.player_sessions[2] = session_id
                    self.session_to_player[session_id] = 2
                assigned_role = "P2"
                player_id = 2
            # 4. 1번과 2번이 모두 실제로 살아있는 플레이어로 꽉 찬 경우에만 관람자 배정
            else:
                self.spectator_clients.add(websocket)
                assigned_role = "SPECTATOR"
                player_id = None

        logger.info(f"Client connected as {assigned_role} (PlayerId: {player_id}, Session: {session_id}). Active Players: {list(self.player_clients.keys())}, Spectators: {len(self.spectator_clients)}")

        # 1. 클라이언트에게 역할 안내
        mode = "VERSUS_PVP" if (1 in self.player_clients and 2 in self.player_clients) else "VERSUS_AI"
        await websocket.send_json({
            "type": "client_assigned",
            "role": assigned_role,
            "playerId": player_id,
            "p1Connected": 1 in self.player_clients,
            "p2Connected": 2 in self.player_clients,
            "spectatorCount": len(self.spectator_clients),
            "mode": mode,
            "difficulty": self.difficulty,
            "p1Score": self.p1_score,
            "p2Score": self.p2_score,
            "isMatchActive": self.is_match_active
        })

        # 2. 모든 클라이언트에 방 상태 브로드캐스트
        await self.broadcast_room_state()

    def disconnect_game(self, websocket: WebSocket):
        self.game_clients.discard(websocket)
        self.spectator_clients.discard(websocket)

        disconnected_player = None
        for pid, ws in list(self.player_clients.items()):
            if ws == websocket:
                disconnected_player = pid
                del self.player_clients[pid]
                old_sid = self.player_sessions.pop(pid, None)
                if old_sid:
                    self.session_to_player.pop(old_sid, None)
                break

        if disconnected_player:
            logger.info(f"Player {disconnected_player} disconnected. Remaining players: {list(self.player_clients.keys())}")
        else:
            logger.info(f"Spectator disconnected. Remaining spectators: {len(self.spectator_clients)}")

        self.clean_dead_sockets()
        asyncio.create_task(self.broadcast_room_state())

    async def broadcast_room_state(self):
        mode = "VERSUS_PVP" if (1 in self.player_clients and 2 in self.player_clients) else "VERSUS_AI"
        msg = {
            "type": "room_state",
            "p1Connected": 1 in self.player_clients,
            "p2Connected": 2 in self.player_clients,
            "spectatorCount": len(self.spectator_clients),
            "mode": mode,
            "difficulty": self.difficulty,
            "isMatchActive": self.is_match_active,
            "p1Score": self.p1_score,
            "p2Score": self.p2_score
        }
        await self.broadcast_to_all(msg)

    async def broadcast_to_all(self, message: dict):
        if not self.game_clients:
            return
        dead_sockets = set()
        for client in list(self.game_clients):
            try:
                await client.send_json(message)
            except Exception:
                dead_sockets.add(client)
        for dead in dead_sockets:
            self.disconnect_game(dead)

    async def relay_to_others(self, sender_ws: WebSocket, message: dict):
        dead_sockets = set()
        for client in list(self.game_clients):
            if client != sender_ws:
                try:
                    await client.send_json(message)
                except Exception:
                    dead_sockets.add(client)
        for dead in dead_sockets:
            self.disconnect_game(dead)

    async def handle_game_message(self, websocket: WebSocket, data: dict):
        msg_type = data.get("type")

        if msg_type == "player_pose":
            # 6DoF HMD 및 블래스터 위치 동기화 중계
            await self.relay_to_others(websocket, data)

        elif msg_type == "fire_event":
            # 총구 화염 및 발사음 동기화 중계
            await self.relay_to_others(websocket, data)

        elif msg_type == "target_spawn":
            # 타겟 생성 동기화 (P1 Host -> P2 및 관람객)
            await self.relay_to_others(websocket, data)

        elif msg_type == "hit_request":
            target_id = data.get("targetId")
            hit_by = data.get("hitBy", 1)
            added_score = data.get("addedScore", 100)

            # 선착순 검증 (이미 파괴된 타겟인지 체크)
            if target_id and target_id not in self.destroyed_targets:
                self.destroyed_targets.add(target_id)
                if hit_by == 1:
                    self.p1_score += added_score
                else:
                    self.p2_score += added_score

                confirm_msg = {
                    "type": "target_hit_confirmed",
                    "targetId": target_id,
                    "hitBy": hit_by,
                    "hitPoint": data.get("hitPoint", [0, 0, 0]),
                    "addedScore": added_score,
                    "p1Score": self.p1_score,
                    "p2Score": self.p2_score,
                    "combo": data.get("combo", 1)
                }
                await self.broadcast_to_all(confirm_msg)

        elif msg_type == "match_start":
            self.is_match_active = True
            self.p1_score = 0
            self.p2_score = 0
            self.destroyed_targets.clear()
            if "difficulty" in data:
                self.difficulty = data["difficulty"]
            await self.broadcast_to_all({
                "type": "match_started",
                "duration": data.get("duration", 60),
                "difficulty": self.difficulty
            })

        elif msg_type == "set_difficulty":
            self.difficulty = data.get("difficulty", "normal")
            await self.broadcast_room_state()

        elif msg_type == "match_over":
            self.is_match_active = False
            self.p1_score = data.get("p1Score", self.p1_score)
            self.p2_score = data.get("p2Score", self.p2_score)
            winner = "DRAW"
            if self.p1_score > self.p2_score:
                winner = "P1"
            elif self.p2_score > self.p1_score:
                winner = "P2"
            await self.broadcast_to_all({
                "type": "match_over_broadcast",
                "p1Score": self.p1_score,
                "p2Score": self.p2_score,
                "winner": winner
            })

        elif msg_type == "match_abort":
            self.is_match_active = False
            abort_msg = data.get("message", "경기가 관리자 또는 플레이어에 의해 중단되었습니다.")
            logger.info(f"Match aborted: {abort_msg}")
            await self.broadcast_to_all({
                "type": "match_aborted",
                "message": abort_msg
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
