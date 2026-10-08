import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os

from app.broadcaster import manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("server")

app = FastAPI(title="Nunchuk VR Shooting Arena Relay Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 서빙 (가상 컨트롤러 UI)
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def root():
    return {
        "service": "Nunchuk VR Shooting Arena Relay Server",
        "status": "online",
        "virtual_pad_url": "/static/virtual_pad.html",
        "endpoints": {
            "pico_ws": "/ws/pico",
            "game_ws": "/ws/game",
            "virtual_ws": "/ws/virtual"
        }
    }

@app.get("/virtual")
async def get_virtual_pad():
    pad_file = os.path.join(static_dir, "virtual_pad.html")
    if os.path.exists(pad_file):
        return FileResponse(pad_file)
    return HTMLResponse("<h1>Virtual Pad not found</h1>", status_code=404)

@app.get("/api/status")
async def get_status():
    return {
        "pico_connected": len(manager.pico_clients) > 0,
        "pico_clients_count": len(manager.pico_clients),
        "virtual_connected": len(manager.virtual_clients) > 0,
        "virtual_clients_count": len(manager.virtual_clients),
        "game_clients_count": len(manager.game_clients),
        "last_source": manager.last_source,
        "last_packet": manager.last_pico_packet
    }

# 1. Pico 2 W 하드웨어 연결용 WebSocket
@app.websocket("/ws/pico")
async def websocket_pico_endpoint(websocket: WebSocket):
    await manager.connect_pico(websocket)
    try:
        while True:
            text_data = await websocket.receive_text()
            try:
                data = json.loads(text_data)
                # 입력 데이터 검증 및 브로드캐스트
                await manager.broadcast_input(data, source="pico")
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from Pico: {text_data}")
    except WebSocketDisconnect:
        manager.disconnect_pico(websocket)
    except Exception as e:
        logger.error(f"Error in Pico WebSocket: {e}")
        manager.disconnect_pico(websocket)

# 2. 웹 브라우저 가상 눈차크(Virtual Pad) 연결용 WebSocket
@app.websocket("/ws/virtual")
async def websocket_virtual_endpoint(websocket: WebSocket):
    await manager.connect_virtual(websocket)
    try:
        while True:
            text_data = await websocket.receive_text()
            try:
                data = json.loads(text_data)
                # 가상 패드 입력 브로드캐스트
                await manager.broadcast_input(data, source="virtual_pad")
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from Virtual Pad: {text_data}")
    except WebSocketDisconnect:
        manager.disconnect_virtual(websocket)
    except Exception as e:
        logger.error(f"Error in Virtual Pad WebSocket: {e}")
        manager.disconnect_virtual(websocket)

# 3. Next.js 3D VR 웹 게임 연결용 WebSocket
@app.websocket("/ws/game")
async def websocket_game_endpoint(websocket: WebSocket):
    role = websocket.query_params.get("role")
    session_id = websocket.query_params.get("sessionId") or websocket.query_params.get("session_id")
    if not await manager.connect_game(websocket, requested_role=role, session_id=session_id):
        return  # 요청한 자리를 다른 기기가 사용 중 (연결 종료됨)
    try:
        while True:
            text_data = await websocket.receive_text()
            try:
                data = json.loads(text_data)
            except json.JSONDecodeError:
                continue
            try:
                await manager.handle_game_message(websocket, data)
            except Exception:
                # 잘못된 메시지 하나 때문에 연결 전체가 끊기지 않도록 기록만 하고 계속 수신
                logger.exception("Failed to handle game message")
    except WebSocketDisconnect:
        manager.disconnect_game(websocket)
    except Exception as e:
        logger.error(f"Error in Game WebSocket: {e}")
        manager.disconnect_game(websocket)
