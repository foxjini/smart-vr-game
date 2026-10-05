"""
Nunchuk VR Shooting Arena - Pico 2 W Firmware
Nintendo Wii Nunchuk (I2C) -> Raspberry Pi Pico 2 W -> Wi-Fi WebSocket -> FastAPI Server

Requirements:
- CircuitPython 9.x on Raspberry Pi Pico 2 W
- settings.toml with Wi-Fi credentials and FASTAPI_SERVER_IP
"""

import time
import os
import board
import busio
import wifi
import socketpool
import binascii
import json

# 1. 핀 설정 (I2C)
# Pico 2 W Pinout: GP4 = SDA (Pin 6), GP5 = SCL (Pin 7)
I2C_SDA = board.GP4
I2C_SCL = board.GP5
NUNCHUK_ADDR = 0x52

# 2. Wi-Fi 및 서버 설정 읽기 (settings.toml)
WIFI_SSID = os.getenv("CIRCUITPY_WIFI_SSID", "YOUR_WIFI_SSID")
WIFI_PASSWORD = os.getenv("CIRCUITPY_WIFI_PASSWORD", "YOUR_WIFI_PASSWORD")
SERVER_IP = os.getenv("FASTAPI_SERVER_IP", "192.168.0.100")
SERVER_PORT = int(os.getenv("FASTAPI_SERVER_PORT", "8000"))
WS_PATH = "/ws/pico"

print("====================================")
print("  Nunchuk VR Controller - Pico 2 W  ")
print("====================================")

# 3. I2C 및 눈차크 초기화
i2c = busio.I2C(scl=I2C_SCL, sda=I2C_SDA, frequency=100000)

while not i2c.try_lock():
    pass

def init_nunchuk():
    """닌텐도 눈차크 암호화 해제 초기화 시퀀스"""
    try:
        # 암호화 비활성화 시퀀스 (0xF0, 0x55 -> 0xFB, 0x00)
        i2c.writeto(NUNCHUK_ADDR, bytes([0xF0, 0x55]))
        time.sleep(0.01)
        i2c.writeto(NUNCHUK_ADDR, bytes([0xFB, 0x00]))
        time.sleep(0.01)
        print("[OK] Nunchuk initialized.")
        return True
    except Exception as e:
        print("[WARN] Nunchuk init failed:", e)
        return False

# 눈차크 연결 대기
nunchuk_ready = False
for _ in range(5):
    if init_nunchuk():
        nunchuk_ready = True
        break
    time.sleep(0.5)

# 4. Wi-Fi 연결
print(f"Connecting to Wi-Fi: {WIFI_SSID}...")
try:
    wifi.radio.connect(WIFI_SSID, WIFI_PASSWORD)
    print(f"[OK] Connected! IP: {wifi.radio.ipv4_address}")
except Exception as e:
    print(f"[ERROR] Wi-Fi connection failed: {e}")

pool = socketpool.SocketPool(wifi.radio)

# 5. 초경량 WebSocket 클라이언트 구현 (외부 라이브러리 없이 자체 핸드셰이크)
class SimpleWSClient:
    def __init__(self, pool, host, port, path):
        self.pool = pool
        self.host = host
        self.port = port
        self.path = path
        self.sock = None
        self.connected = False

    def connect(self):
        try:
            print(f"Connecting WebSocket: ws://{self.host}:{self.port}{self.path}")
            self.sock = self.pool.socket()
            addr = self.pool.getaddrinfo(self.host, self.port)[0][-1]
            self.sock.connect(addr)
            
            # WebSocket HTTP Upgrade 핸드셰이크 요청
            key = binascii.b2a_base64(bytes([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])).strip().decode()
            req = (
                f"GET {self.path} HTTP/1.1\r\n"
                f"Host: {self.host}:{self.port}\r\n"
                f"Upgrade: websocket\r\n"
                f"Connection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {key}\r\n"
                f"Sec-WebSocket-Version: 13\r\n\r\n"
            )
            self.sock.send(req.encode())
            
            # 응답 헤더 수신 (101 Switching Protocols 확인)
            buf = bytearray(512)
            n = self.sock.recv_into(buf)
            resp = buf[:n].decode()
            if "101 Switching Protocols" in resp or "101" in resp:
                print("[OK] WebSocket handshake successful!")
                self.connected = True
                return True
            else:
                print("[WARN] Handshake failed:", resp[:100])
                self.close()
                return False
        except Exception as e:
            print("[ERROR] WS connect error:", e)
            self.close()
            return False

    def send_text(self, text):
        if not self.connected or not self.sock:
            return False
        try:
            payload = text.encode("utf-8")
            length = len(payload)
            
            # WebSocket 마스크 프레임 구성 (클라이언트 -> 서버는 반드시 Masking 처리)
            frame = bytearray()
            frame.append(0x81)  # FIN + Text opcode (0x1)
            
            mask_key = bytes([0x12, 0x34, 0x56, 0x78])
            if length < 126:
                frame.append(0x80 | length)
            else:
                frame.append(0x80 | 126)
                frame.append((length >> 8) & 0xFF)
                frame.append(length & 0xFF)
                
            frame.extend(mask_key)
            
            # 마스킹 적용
            masked_payload = bytearray(length)
            for i in range(length):
                masked_payload[i] = payload[i] ^ mask_key[i % 4]
                
            frame.extend(masked_payload)
            self.sock.send(frame)
            return True
        except Exception as e:
            print("[WARN] Send error:", e)
            self.close()
            return False

    def close(self):
        self.connected = False
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
            self.sock = None

ws_client = SimpleWSClient(pool, SERVER_IP, SERVER_PORT, WS_PATH)

# 6. 눈차크 데이터 파싱 함수
buf6 = bytearray(6)
def read_nunchuk_data():
    try:
        # 데이터 갱신 요청 (0x00 전송)
        i2c.writeto(NUNCHUK_ADDR, bytes([0x00]))
        time.sleep(0.001)
        i2c.readfrom_into(NUNCHUK_ADDR, buf6)
        
        # 바이트 해석
        joy_x_raw = buf6[0]
        joy_y_raw = buf6[1]
        acc_x_raw = (buf6[2] << 2) | ((buf6[5] >> 2) & 0x03)
        acc_y_raw = (buf6[3] << 2) | ((buf6[5] >> 4) & 0x03)
        acc_z_raw = (buf6[4] << 2) | ((buf6[5] >> 6) & 0x03)
        
        # 버튼 (0이 눌림, 1이 뗌)
        btn_z = not bool(buf6[5] & 0x01)
        btn_c = not bool(buf6[5] & 0x02)
        
        # 스틱 값 정규화 (-1.0 ~ 1.0, 중심 ~128)
        norm_x = round((joy_x_raw - 128.0) / 128.0, 2)
        norm_y = round((joy_y_raw - 128.0) / 128.0, 2)
        
        # 데드존 필터 (5%)
        if abs(norm_x) < 0.05: norm_x = 0.0
        if abs(norm_y) < 0.05: norm_y = 0.0
        
        # 클램핑
        norm_x = max(-1.0, min(1.0, norm_x))
        norm_y = max(-1.0, min(1.0, norm_y))
        
        return {
            "type": "nunchuk_input",
            "source": "pico_w",
            "stick": { "x": norm_x, "y": norm_y },
            "accel": { "x": acc_x_raw, "y": acc_y_raw, "z": acc_z_raw },
            "buttons": { "c": btn_c, "z": btn_z },
            "timestamp": time.monotonic_ns() // 1000000
        }
    except Exception as e:
        return None

# 7. 메인 루프 (50Hz = 20ms 주기)
print("Starting main loop (50Hz)...")
while True:
    if not ws_client.connected:
        print("Reconnecting to server...")
        ws_client.connect()
        time.sleep(1.0)
        continue
        
    data = read_nunchuk_data()
    if data:
        json_str = json.dumps(data)
        success = ws_client.send_text(json_str)
        if not success:
            print("Failed to send packet, will reconnect.")
            
    time.sleep(0.02)  # 50Hz
