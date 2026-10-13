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
- **1:1 실시간 네트워크 대결 & AI 라이벌**: 1P vs 2P 점수 쟁탈전, 2P가 없으면 AI 라이벌이 자동 참전
- **e-스포츠 중계 화면 (관전 모니터)**: TV·프로젝터·PC 화면에 대기 화면 → 실시간 중계(카메라 4종) → 경기 결과를 자동으로 보여 줌
- **한국어 음성 안내 & 3종 효과음 & Top 10 순위표**
- **인터넷 없이 동작**: 화면 글꼴(Pretendard·Rajdhani)을 프로젝트에 내장해, 처음 `npm install` 뒤에는 인터넷 없는 전시장에서도 그대로 보입니다.

---

## 📂 프로젝트 구조

```text
smart-vr-game/
├── docs/                      # 📖 공식 설치 및 사용 매뉴얼
│   ├── index.html             # 종합 가이드북 (동적 IP 입력기, FAQ, 조작표 포함)
│   └── manual.html            # 같은 내용의 사본
├── firmware/                  # 🔌 Raspberry Pi Pico 2 W CircuitPython 펌웨어
│   ├── code.py                # Wii 눈차크 I2C 읽기 및 50Hz Wi-Fi WebSocket 전송
│   ├── settings.toml          # Wi-Fi SSID 및 서버 IP 설정 템플릿
│   └── README.md              # 펌웨어 배포 및 핀맵 안내
├── frontend/                  # 🎮 Next.js 16 + Three.js 3D WebXR 웹 클라이언트 (자세한 구조는 frontend/README.md)
│   ├── src/
│   │   ├── app/               # Next.js App Router (메인 페이지, 레이아웃, 글꼴·색 설정 globals.css)
│   │   ├── components/arena/  # 3D 엔진(ShootingArenaEngine)과 경기장·표적·효과·총·점수판 모듈(visual/)
│   │   ├── components/ui/     # 메뉴·결과·순위표·설정 창, 선수 HUD와 관전 중계 화면(hud/), 공용 부품(kit/)
│   │   └── core/              # 입력·네트워크(InputManager), AI 라이벌, 관전 카메라, 소리, 순위표
│   └── public/
│       ├── fonts/             # 내장 글꼴 (Pretendard, Rajdhani) + OFL 라이선스 파일
│       ├── audio/             # 음성 안내 파일
│       ├── manual.html        # 게임 안의 "도움말"·"매뉴얼" 버튼이 여는 설명서 (docs/index.html과 같은 내용)
│       └── 대결모드 설정 및 사용방법.html  # 전시 부스 운영 안내
├── server/                    # ⚡ FastAPI WebSocket 실시간 중계 서버
│   ├── app/
│   │   ├── main.py            # FastAPI 앱, WebSocket 엔드포인트 및 REST API
│   │   └── broadcaster.py     # 6DoF 자세, 피격 검증, 룸 상태 브로드캐스터
│   ├── requirements.txt       # Python 의존성 목록
│   └── run.py                 # 서버 구동 스크립트 (Port 8000)
├── manual.html                # 설명서 사본 (docs/index.html과 같은 내용)
├── 대결모드 설정 및 사용방법.html  # 전시 부스 운영 안내 사본
├── Nunchuk_VR_Shooting_Arena_PRD_v1.3.md # 📋 상세 기획 및 요구사항 정의서 (PRD)
└── README.md                  # 프로젝트 안내 문서 (본 문서)
```

---

## 🚀 빠른 시작 (학생 개발 가이드)

### 1. 필수 사전 준비
- **Node.js**: v20.9 이상 (Next.js 16 필수 조건, v22 LTS 권장)
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

> ⚠️ **코드를 새로 받았다면 `npm install`을 한 번 더 실행하세요.** VR 안 글자를 그리는 `troika-three-text` 패키지가 추가되어, 예전 `node_modules`로는 `Module not found: troika-three-text` 오류가 납니다. 인터넷이 되는 곳에서 한 번만 하면 이후에는 인터넷 없이도 실행됩니다.

### 4. Meta Quest 2 접속 (WebXR)
1. Quest 2 헤드셋에서 **Meta Quest 브라우저** 실행
2. 주소창에 `chrome://flags` 입력 후 이동
3. `Insecure origins treated as secure` 검색 &rarr; 개발 PC IP 등록 (예: `http://192.168.1.150:3000,http://192.168.1.150:8000`) &rarr; **Enabled** 변경 후 **Relaunch**
4. 브라우저에서 `http://<개발_PC_IP>:3000/?role=p1` (2P 헤드셋은 `?role=p2`) 접속 후 메인 메뉴의 **[VR 배틀 시작]** (또는 오른쪽 위 **[VR 시작]**) 탭!
5. VR에 들어가면 경기가 시작됩니다.
   - **친구 대결(1P·2P 모두 접속)** 은 VR에 들어간 순간이 "준비 완료"이고, **두 선수가 모두 준비되면 바로 시작**합니다. 한 명만 준비하면 **15초 뒤 자동으로 시작**하고, 늦은 선수는 PC 화면으로 경기에 들어가 있다가 오른쪽 위 **[VR로 이어서]** 를 누르면 됩니다.
   - 상대 헤드셋은 그 기기에서 직접 버튼을 눌러야 VR에 들어갈 수 있습니다(브라우저 보안 규칙). 그래서 먼저 준비한 쪽이 상대를 기다려 주고, 기다리는 동안 상대 화면 위쪽에 "1P가 준비했어요!"와 시작 버튼, 남은 초가 나옵니다.
   - AI 대결(한 명만 접속)은 기다리지 않고 바로 시작합니다.
   - 관전 화면에는 [경기 시작]이 없습니다. 경기는 선수가 준비해야 시작하고, 관전 PC는 보기 · 일시정지 · 중단만 합니다.
   - 경기가 끝난 뒤에는 **3초 동안 결과판을 보여 주고**, 그다음 **방아쇠(Trigger)를 당기면 다시 준비**합니다(친구 대결은 다시 두 선수 모두 준비하면 시작). 준비 취소는 VR 나가기(A·B 버튼), PC 화면의 [준비 취소] 또는 ESC입니다.

---

## 🎮 조작법 요약

| 동작 (Action) | Quest 2 6DoF 모션 | Wii 눈차크 + Pico 2 W | 스마트폰 가상 패드 | PC 키보드 & 마우스 |
|---|---|---|---|---|
| **조준 (Aim)** | 손으로 직접 겨냥 | 아날로그 조이스틱 | 가상 조이스틱 드래그 | 마우스 이동 / WASD·방향키 |
| **사격 (Fire)** | 검지 방아쇠 (Trigger) | C 버튼 | C 버튼 터치 | 마우스 좌클릭 / Space / C |
| **재장전 (Reload)**| 중지 그립 (옆면 버튼) | Z 버튼 | Z 버튼 터치 | 마우스 우클릭 / R / Z |
| **시작 (Start)** | VR에 들어가면 준비 완료 · 경기 후 3초 뒤 방아쇠 (친구 대결은 둘 다 준비하면 시작) | C 버튼 클릭 | C 버튼 터치 | 화면 클릭 / Space / [경기 시작] |
| **VR 나가기** | A·B·X·Y 버튼 (경기 중에는 1초 넘게 길게), 경기 후에는 그립도 가능 | - | - | - |
| **경기 중단** | (VR 나가기와 같음) | - | - | ESC (설정·순위표 창이 열려 있으면 창만 닫음) / [경기 중단] |

- 표적 점수: **정보 · 통신 2점**, 제어 · 회로 · 인공 · 전자 1점, **기계 · 전기는 맞히면 1점 감점**입니다(라벨에 빨간 "-1점"). 감점 표적을 맞히면 연속 명중이 끊기고 명중 수에 들어가지 않으며, 점수는 0보다 작아질 수 있습니다. 감점 표적은 맞히지 않으면 8초 뒤 사라지고, 한 번에 난이도별 1 · 2 · 3개까지만 나옵니다. AI 라이벌도 감점 표적을 피합니다.
- 탄창은 10발입니다. 총 위 화면(OLED)에 **남은 시간 · 내 점수 · 상대 점수 · 탄약 10칸**이 보이고, 10초 이하가 되면 빨갛게 바뀝니다.
- 경기장 게이트 위 점수판에 **1P 점수 | 남은 시간 | 2P 점수**와 줄다리기 막대가 보입니다. 시작할 때 "GO!", 끝날 때 "TIME UP"이 뜨고, 끝나면 눈앞에 결과판이 나옵니다. 한 발도 쏘지 않은 선수의 명중률은 "-"로 표시됩니다.
- 팀 색은 **1P 시안, 2P 마젠타**입니다.

---

## 📺 관전 중계 화면 (관전 모니터)

별도의 VR 기기 없이 PC나 스마트 TV 대형 화면에서 경기를 중계 화면으로 볼 수 있습니다.
- **접속 방법**: 브라우저에서 `http://<개발_PC_IP>:3000/?role=spectator` 접속 후 `F11`(전체 화면)
- **화면 흐름** (자동):
  1. **대기 화면**: 경기가 없을 때 AI 시연(사격·명중 효과음만 작게)을 배경으로 게임 소개 · 표적 점수 · 다음 도전자 · 최근 경기를 보여 줌
  2. **실시간 중계**: 위쪽 점수판, 아래쪽 선수 카드, "LIVE"와 카메라 이름 표시
  3. **경기 결과**: 승자와 기록 비교를 20초 동안 보여 준 뒤 대기 화면으로 돌아감
- **운영 버튼** (오른쪽 위, 마우스를 움직이면 나타나고 잠시 뒤 숨음): 경기 중 [일시정지] · [경기 중단](ESC), 언제나 [소리] · [순위표] · [설정] · [매뉴얼]
  - 관전 화면에는 **[경기 시작]이 없습니다**. 경기는 선수가 준비해야 시작합니다(위 4번).
  - 관전 화면의 설정 창에는 **경기 설정(모든 화면 공통) · 소리 · 이 기기(역할 · 서버 주소)** 만 있습니다.
- **카메라 전환**: 숫자 키 또는 오른쪽 위 버튼
  - `1` 스타디움: 선수 뒤쪽 위에서 경기장 전체
  - `2` 1P 시점: 1P 어깨 뒤
  - `3` 2P 시점: 2P(또는 AI 라이벌) 어깨 뒤
  - `4` 궤도 회전: 선수 뒤쪽 반원을 좌우로 천천히 오가는 시네마틱 시점
- **소리**: 실제 경기는 사격·명중·안내 음성·10초 경고·종료음을 원래 크기로, 대기 화면의 AI 시연은 사격·명중 효과음만 효과음 크기의 30%로 냅니다.
  - 브라우저 정책상 화면을 한 번도 클릭하지 않은 페이지는 소리가 막힙니다. 이때 TV 오른쪽 위에 **"화면을 한 번 클릭하면 소리가 나요"** 가 뜨고, 화면을 클릭하거나 아무 키나 누르면 소리가 켜집니다(`F11`·`Esc`는 브라우저가 조작으로 치지 않음).
  - **TV 소리 켜기·끄기**: 오른쪽 위 **[소리 끄기]/[소리 켜기]** 버튼 또는 `M` 키. 꺼 두면 오른쪽 위에 "소리 꺼짐"이 표시됩니다.
  - 소리 설정(효과음 종류·크기, 음성 안내, TV 소리 끔)은 **기기마다 저장**되어 새로고침해도 유지됩니다.
  - **클릭 없이 소리 내기(전시용 PC 권장)**: 크롬(엣지도 같음) 바로가기를 만들고, 속성 → 대상 끝에 아래 옵션을 붙여 실행합니다. `--user-data-dir`은 크롬이 이미 켜져 있어도 옵션이 적용되게 하고, `--kiosk`는 전체 화면으로 엽니다(닫을 때는 `Alt`+`F4`).
    ```
    --autoplay-policy=no-user-gesture-required --user-data-dir=C:\booth-tv --kiosk http://<개발_PC_IP>:3000/?role=spectator
    ```

---

## 🔧 주소 옵션 (URL 파라미터)

| 옵션 | 뜻 |
|---|---|
| `?role=p1` / `?role=p2` / `?role=spectator` | 이 기기의 역할 (1P · 2P · 관전 모니터) |
| `?quality=low` / `?quality=high` | 그래픽 품질 (별·건물 수 등). 지정하지 않으면 Quest와 소프트웨어 렌더링 PC는 자동으로 `low` |
| `?debug=perf` | 성능 표시 (fps, draw call). VR에서는 총을 들지 않은 손 옆에 작게 보임 |

여러 옵션은 `&`로 이어 씁니다. 예: `http://<개발_PC_IP>:3000/?role=p1&debug=perf`

- **경기 설정**(경기장 테마 사이버 아레나 · 딥 스페이스 · 네온 시티, 표적 모양, 난이도)은 **모든 화면(1P · 2P · 관전) 공통**입니다.
  - 어느 기기의 환경설정(또는 메뉴의 난이도)에서 바꿔도 모든 화면이 함께 바뀝니다. 경기 중에는 바꿀 수 없습니다.
  - 서버가 기억하므로 서버를 다시 켜면 기본값(사이버 아레나 · 드론 · 보통)으로 돌아갑니다.
  - 테마를 바꾸면 경기장을 새로 지어 화면이 잠깐 멈춥니다. 선수가 헤드셋을 쓰기 전에 바꾸세요.
- **코드를 업데이트한 뒤에는 모든 화면(Quest 2대 · 관전 TV)을 새로고침하세요.** 예전 화면이 남아 있으면 그 화면만 예전처럼 동작합니다.

---

## 📚 상세 매뉴얼

더 자세한 설정, 하드웨어 핀맵, WebXR 트러블슈팅, API 규격은 [docs/index.html](docs/index.html) 파일을 브라우저로 열어 확인하세요.
게임 화면의 **[도움말]**(메인 메뉴) · **[매뉴얼]**(관전 화면 오른쪽 위) 버튼으로도 열 수 있으며, 동적 IP 자동 계산기 및 검색 기능이 내장되어 있습니다.
전시 부스(서버 PC 1대 + Quest 2대 + 관전 모니터) 운영 순서는 `대결모드 설정 및 사용방법.html`을 참고하세요.

---

## 🤝 기여 및 협업 가이드

학생들과 협업 시 다음 규칙을 권장합니다:
1. 기능 추가나 버그 수정 시 새로운 브랜치를 생성하세요 (`git checkout -b feature/새기능이름`).
2. 의미 있는 단위로 커밋 메시지를 작성하세요.
3. 작업 완료 후 GitHub 풀 리퀘스트(PR)를 작성하여 코드 리뷰를 거친 뒤 `main` 브랜치에 병합합니다.

---

## 📄 라이선스

This project is licensed under the MIT License.
내장 글꼴 Pretendard와 Rajdhani는 SIL Open Font License 1.1을 따르며, 라이선스 전문은 `frontend/public/fonts/`에 함께 있습니다.
