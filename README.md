# 🎯 Smart VR Game (Cyber Strike VR Arena v1.3)

> **IoT 무선 하드웨어(Wii Nunchuk + Raspberry Pi Pico 2 W)와 Meta Quest 2/3 WebXR 기반의 1:1 3D 사이버 사격 배틀 아레나**

[![Next.js](https://img.shields.io/badge/Next.js-16_Turbopack-black?style=flat&logo=next.js)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r186-049EF4?style=flat&logo=three.js)](https://threejs.org/)
[![WebXR](https://img.shields.io/badge/WebXR-6DoF_Immersive-FF5722?style=flat)](https://www.w3.org/TR/webxr/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![CircuitPython](https://img.shields.io/badge/CircuitPython-9.x-brightgreen?style=flat)](https://circuitpython.org/)

---

## 📖 프로젝트 소개

본 프로젝트는 학생들이 IoT 임베디드 하드웨어 제어, 웹 기반 3D 그래픽스(Three.js), 몰입형 가상현실(WebXR), 실시간 웹소켓(WebSocket) 네트워킹을 유기적으로 연계하여 학습하고 함께 개발할 수 있는 **스마트 VR 체감형 사격 게임** 플랫폼입니다.

- **4가지 다중 입력 장치 지원**:
  1. **Meta Quest 2/3 순정 6DoF 모션 컨트롤러** (헤드셋만으로 단독 플레이 가능)
  2. **Nintendo Wii 눈차크 + Raspberry Pi Pico 2 W** (무선 체감형 IoT 건 컨트롤러)
  3. **스마트폰/모바일 가상 터치 웹패드**
  4. **PC 키보드 & 마우스** (개발 및 테스트 모드)
- **1:1 실시간 네트워크 대결 & Cyber AI Rival**: 1P vs 2P 점수 쟁탈전 및 2P 부재 시 3D 물리 레이캐스트 기반 AI 라이벌 자동 참전
- **e-스포츠 4대 전문 중계 방송 관람 모드 (Observer Broadcast)**: 스마트 TV, 프로젝터, PC 화면으로 4개 카메라 앵글 실시간 생중계
- **한국어 오퍼레이터 음성 & 3종 사운드 프리셋 & Top 10 순위표**

---

## 📂 프로젝트 구조

```text
smart-vr-game/
├── docs/                      # 📖 공식 설치 및 사용 매뉴얼
│   ├── index.html             # 종합 가이드북 (동적 IP 입력기, FAQ, 조작표 포함)
│   └── manual.html            # 웹 호환 매뉴얼 사본
├── firmware/                  # 🔌 Raspberry Pi Pico 2 W CircuitPython 펌웨어
│   ├── code.py                # Wii 눈차크 I2C 읽기 및 50Hz Wi-Fi WebSocket 전송
│   ├── settings.toml          # Wi-Fi SSID 및 서버 IP 설정 템플릿
│   └── README.md              # 펌웨어 배포 및 핀맵 안내
├── frontend/                  # 🎮 Next.js 16 + Three.js 3D WebXR 웹 클라이언트
│   ├── src/
│   │   ├── app/               # Next.js App Router (메인 페이지 및 레이아웃)
│   │   ├── components/ui/     # HUD, 모달(메뉴, 설정, 랭킹, 관람 툴바)
│   │   └── core/              # 3D 엔진(Three.js, WebXR, 타겟, AI, 오디오, 네트워크)
│   └── public/                # 오디오 에셋 및 정적 리소스
├── server/                    # ⚡ FastAPI WebSocket 실시간 중계 서버
│   ├── app/
│   │   ├── main.py            # FastAPI 앱, WebSocket 엔드포인트 및 REST API
│   │   └── broadcaster.py     # 6DoF 자세, 피격 검증, 룸 상태 브로드캐스터
│   ├── requirements.txt       # Python 의존성 목록
│   └── run.py                 # 서버 구동 스크립트 (Port 8000)
├── Nunchuk_VR_Shooting_Arena_PRD_v1.3.md # 📋 상세 기획 및 요구사항 정의서 (PRD)
└── README.md                  # 프로젝트 안내 문서 (본 문서)
```

---

## 🚀 빠른 시작 (학생 개발 가이드)

### 1. 필수 사전 준비
- **Node.js**: v18.17.0 이상 권장
- **Python**: v3.10 이상 권장
- **네트워크**: 개발 PC와 Meta Quest 2 헤드셋이 **동일한 Wi-Fi 공유기**에 연결되어 있어야 합니다.

### 2. 백엔드 중계 서버 실행 (Terminal 1)
```bash
# 서버 디렉토리 이동
cd server

# 의존성 패키지 설치
pip install -r requirements.txt

# 서버 실행 (기본 포트: 8000)
python run.py
```
> 서버 구동 확인: 브라우저에서 `http://localhost:8000/api/status` 접속 시 상태 JSON 반환

### 3. 프론트엔드 웹 게임 실행 (Terminal 2)
```bash
# 프론트엔드 디렉토리 이동
cd frontend

# npm 의존성 패키지 설치
npm install

# 개발 서버 실행 (기본 포트: 3000)
npm run dev
```
> PC 브라우저에서 `http://localhost:3000` 접속하여 메인 화면 확인

### 4. Meta Quest 2 접속 (WebXR)
1. Quest 2 헤드셋에서 **Meta Quest 브라우저** 실행
2. 주소창에 `chrome://flags` 입력 후 이동
3. `Insecure origins treated as secure` 검색 &rarr; 개발 PC IP 등록 (예: `http://192.168.1.150:3000,http://192.168.1.150:8000`) &rarr; **Enabled** 변경 후 **Relaunch**
4. 브라우저에서 `http://<개발_PC_IP>:3000` 접속 후 **[ENTER VR]** 탭!
5. 가상공간에서 **오른손 컨트롤러 방아쇠(Trigger)를 1회 당기면 즉시 게임 시작!**

---

## 🎮 조작법 요약

| 동작 (Action) | Quest 2 6DoF 모션 | Wii 눈차크 + Pico 2 W | 스마트폰 가상 패드 | PC 키보드 & 마우스 |
|---|---|---|---|---|
| **조준 (Aim)** | 손으로 직접 겨냥 | 아날로그 조이스틱 | 가상 조이스틱 드래그 | WASD / 마우스 이동 |
| **사격 (Fire)** | 검지 방아쇠 (Trigger) | C 버튼 | C 버튼 터치 | Space / C / 마우스 좌클릭 |
| **재장전 (Reload)**| 중지 그립 / A·X 버튼 | Z 버튼 | Z 버튼 터치 | R / Z / 마우스 우클릭 |
| **시작 (Start)** | VR 공간에서 방아쇠 1회 | C 버튼 클릭 | C 버튼 터치 | Space / 화면 클릭 |

---

## 📺 e-스포츠 관람 모드 (Observer)

별도의 VR 기기 없이 PC나 스마트 TV 대형 화면에서 경기를 4가지 전문 방송 시점으로 중계 관람할 수 있습니다.
- **접속 방법**: 브라우저에서 `http://<개발_PC_IP>:3000/?role=spectator` 접속
- **카메라 시점 전환 단축키**:
  - `1`: 스타디움 풀샷 (전체 조망)
  - `2`: 1P 숄더뷰 (1번 플레이어 시점 추적)
  - `3`: 2P 숄더뷰 (2번 플레이어 / AI Rival 시점 추적)
  - `4`: 시네마틱 궤도캠 (경기장 중심 360도 공전)

---

## 📚 상세 매뉴얼

더 자세한 설정, 하드웨어 핀맵, WebXR 트러블슈팅, API 규격은 [docs/index.html](docs/index.html) 파일을 브라우저로 열어 확인하세요.
동적 IP 자동 계산기 및 검색 기능이 내장되어 있습니다.

---

## 🤝 기여 및 협업 가이드

학생들과 협업 시 다음 규칙을 권장합니다:
1. 기능 추가나 버그 수정 시 새로운 브랜치를 생성하세요 (`git checkout -b feature/새기능이름`).
2. 의미 있는 단위로 커밋 메시지를 작성하세요.
3. 작업 완료 후 GitHub 풀 리퀘스트(PR)를 작성하여 코드 리뷰를 거친 뒤 `main` 브랜치에 병합합니다.

---

## 📄 라이선스

This project is licensed under the MIT License.
