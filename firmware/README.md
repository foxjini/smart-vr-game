# Raspberry Pi Pico 2 W + Wii Nunchuk 펌웨어 가이드

## 1. 하드웨어 핀 결선 (Pinout)

닌텐도 Wii 눈차크 케이블/어댑터와 Raspberry Pi Pico 2 W를 아래와 같이 연결합니다.

| 눈차크 핀 | 눈차크 전선 색상(일반) | Pico 2 W 핀 번호 | Pico 2 W 신호명 |
|---|---|---|---|
| **VCC** | 빨간색 (Red) | Pin 36 | **3V3(OUT)** |
| **GND** | 흰색 (White) | Pin 38 | **GND** |
| **SDA** | 녹색 (Green) | Pin 6 | **GP4 (I2C0 SDA)** |
| **SCL** | 노란색 (Yellow) | Pin 7 | **GP5 (I2C0 SCL)** |

> [!NOTE]
> 서드파티 눈차크의 경우 내부 배선 색상이 다를 수 있으므로, 눈차크 플러그의 핀 위치(상단 노치가 위를 향할 때 좌측/우측 핀)를 멀티미터로 확인하는 것을 권장합니다.

```text
       [Wii Nunchuk Plug]
          +---------+
          |  [---]  |  <- 상단 노치
          | 1  2  3 |
          | 4  5  6 |
          +---------+
    1: GND      (White)  -> Pico Pin 38 (GND)
    2: VCC 3.3V (Red)    -> Pico Pin 36 (3V3)
    3: SCL      (Yellow) -> Pico Pin 7  (GP5)
    4: NC
    5: NC
    6: SDA      (Green)  -> Pico Pin 6  (GP4)
```

---

## 2. CircuitPython 설치 및 실행

1. **CircuitPython 다운로드**: [circuitpython.org](https://circuitpython.org/board/raspberry_pi_pico2_w/)에서 Pico 2 W용 `.uf2` 최신 펌웨어(9.x)를 다운로드합니다.
2. **부트로더 진입**: Pico 2 W의 `BOOTSEL` 버튼을 누른 상태로 PC에 USB를 연결하면 `RPI-RP2` 드라이브가 나타납니다.
3. **UF2 복사**: 다운로드한 `.uf2` 파일을 `RPI-RP2` 드라이브에 드래그&드롭합니다.
4. **파일 복사**:
   - `CIRCUITPY` 드라이브가 마운트되면, 본 폴더의 `code.py`와 `settings.toml`을 복사합니다.
5. **Wi-Fi 및 서버 IP 설정**:
   - `settings.toml`을 열어 공유기 Wi-Fi 정보 및 개발 PC의 IP 주소(예: `192.168.0.xxx`)를 입력합니다.
6. **동작 확인**: 시리얼 터미널(Mu Editor, PuTTY, VS Code 등)을 115200 baud로 열어 `[OK] Connected!` 메시지를 확인합니다.
