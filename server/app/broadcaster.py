import asyncio
import json
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket

logger = logging.getLogger("broadcaster")

class ConnectionManager:
    def __init__(self):
        # 연결된 클라이언트 풀
        self.player_clients: Dict[int, WebSocket] = {} # 1: P1 (Cyan), 2: P2 (Magenta)
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

    async def connect_game(self, websocket: WebSocket, requested_role: Optional[str] = None):
        await websocket.accept()
        self.game_clients.add(websocket)

        assigned_role = "SPECTATOR"
        player_id = None

        if requested_role == "spectator":
            self.spectator_clients.add(websocket)
            assigned_role = "SPECTATOR"
        else:
            # 플레이어 슬롯 배정
            if 1 not in self.player_clients:
                self.player_clients[1] = websocket
                assigned_role = "P1"
                player_id = 1
            elif 2 not in self.player_clients:
                self.player_clients[2] = websocket
                assigned_role = "P2"
                player_id = 2
            else:
                self.spectator_clients.add(websocket)
                assigned_role = "SPECTATOR"

        logger.info(f"Client connected as {assigned_role} (PlayerId: {player_id}). Spectators: {len(self.spectator_clients)}")

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
                break

        if disconnected_player:
            logger.info(f"Player {disconnected_player} disconnected.")
        else:
            logger.info(f"Spectator disconnected. Remaining spectators: {len(self.spectator_clients)}")

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
