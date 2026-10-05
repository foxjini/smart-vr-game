# Nunchuk VR Shooting Arena v1.2
## 프로젝트 요구사항 정의서 (PRD - Product Requirement Document)

- **개발 플랫폼**: Next.js 16 (App Router, TypeScript) + Three.js
- **VR 기기**: Meta Quest 2 / Quest 3 (WebXR)
- **입력 하드웨어**:
  1. Nintendo Wii Nunchuk + Raspberry Pi Pico 2 W (주 입력기)
  2. Meta Quest 2 Touch Controller (순정 6DoF 모션 컨트롤러 - 단독 구동 지원)
  3. 스마트폰/PC 가상 웹패드 (Virtual Pad)
  4. PC 키보드 & 마우스 (개발 및 폴백 모드)
- **문서 버전**: v1.2 (사용자 등록, 리더보드, 3종 효과음 프리셋, 한국어 음성 안내 전면 구현)
- **최종 갱신일**: 2026-09-30

---

## 1. 프로젝트 개요

### 1.1 프로젝트 목적
닌텐도 눈차크(Wii Nunchuk)와 Raspberry Pi Pico 2 W를 무선 컨트롤러로 활용하여 Meta Quest 2 웹 브라우저에서 가상 표적을 조준하고 사격하는 3D WebXR 슈팅 게임을 제작한다.  
하드웨어가 없는 환경에서도 **Quest 2 순정 터치 컨트롤러(6DoF)** 및 **웹 가상 컨트롤러**를 지원하여, 사용자가 언제 어디서나 즉시 몰입형 VR 사격 게임을 체험할 수 있도록 한다.  
v1.2에서는 **사용자 등록 & Top 10 순위표**, **3종 효과음 프리셋 및 볼륨 조절**, **한국어 오퍼레이터 음성 안내**를 추가하여 아케이드 게임으로서의 완성도와 몰입도를 극대화한다.

### 1.2 핵심 특징 (v1.2 업데이트 반영)
- **하이브리드 다중 입력 시스템**: 눈차크(아날로그 스틱 + C/Z 버튼)와 Quest 2 터치 컨트롤러(6DoF 손동작 + 트리거/그립)를 모두 지원하며, 런타임에 자동 전환.
- **Pull Trigger to Start (방아쇠 당겨 즉시 시작)**: VR 진입 후 복잡한 2D UI 클릭 없이 방아쇠(트리거)를 당기면 3D 홀로그램 배너가 사라지며 게임이 시작되는 오락실 아케이드 건슈팅 UX.
- **사용자 등록 & Top 10 순위표 (글로벌 리더보드)**: 브라우저 영구 저장소(`localStorage`) 기반으로 닉네임, 점수, 명중률, 최대 콤보, 난이도, 테마를 기록하고 명예의 전당 Top 10 순위표 제공.
- **3종 사운드 프리셋 & 마스터 볼륨**: Web Audio API 기반의 SF 레이저(`laser`), 실탄 총기(`kinetic`), 8비트 레트로(`retro`) 테마 선택 및 볼륨(0~100%) 제어.
- **한국어 오퍼레이터 음성 안내 (Voice Briefing)**: SF 무전기 통신 비프음(Radio Chirp)과 브라우저 음성 합성(Web Speech API)을 결합하여 작전 개시, 탄약 소진, 재장전, 콤보, 10초 경고, 신기록 안내 브리핑 지원.
- **100% 자립형 3D & Web Audio**: 외부 무거운 모델 파일이나 음원 에셋 없이 Three.js 절차적 네온 지오메트리와 Web Audio API 신디사이저로 구현되어 Quest 2에서 무지연 90fps 고성능 보장.

### 1.3 기술 스택

| 영역 | 기술 | 상세 설명 |
|---|---|---|
| **웹 프론트엔드** | Next.js 16 (App Router), TypeScript, Vanilla CSS | 글래스모피즘 사이버 테마 HUD 및 모달 UI |
| **3D 그래픽스** | Three.js | 절차적 3D 지오메트리, PBR 머티리얼, 파티클 폭발 시스템 |
| **VR / WebXR** | WebXR Device API, Three.js VRButton | Quest 2 브라우저 몰입형 360도 VR 및 6DoF 모션 추적 |
| **오디오 엔진** | Web Audio API | 3종 테마(Laser / Kinetic / Retro) 실시간 사운드 신디사이징 (0ms 반응속도) |
| **음성 시스템** | Web Speech API (`SpeechSynthesis`) + Web Audio | 한국어(`ko-KR`) 오퍼레이터 브리핑 및 무전기 비프음(Radio Chirp) |
| **데이터 저장소** | Web LocalStorage API | 플레이어 닉네임, Top 10 순위표, 개인 최고 기록 영구 보존 |
| **IoT 하드웨어** | Nintendo Wii Nunchuk, Raspberry Pi Pico 2 W | I2C 센서 수집 및 2.4GHz Wi-Fi 무선 전송 |
| **하드웨어 펌웨어** | CircuitPython 9.x | I2C 드라이버 및 초경량 WebSocket 송신기 (50Hz) |
| **통신 중계 서버** | FastAPI, Uvicorn, WebSockets | Pico / Virtual Pad / Game Client 간 실시간 중계 |

---

## 2. 조작 및 입력 체계 상세 (Multi-Input Architecture)

본 시스템은 4가지 입력 모드를 지원하며, 연결 상태에 따라 자동으로 최적의 방식으로 동작합니다.

| 게임 동작 | 1. Quest 2 컨트롤러 (눈차크 미사용 시) | 2. Wii 눈차크 (Pico 2 W 연동 시) | 3. 모바일 가상 패드 (Virtual Pad) | 4. PC 단독 모드 (Standalone) |
|---|---|---|---|---|
| **조준 (Aiming)** | **오른손 손동작 6DoF 모션 추적** (손을 겨누어 조준) + 썸스틱 보조 | **아날로그 조이스틱** (상하좌우 총구 각도 회전) | 가상 터치 조이스틱 드래그 | 키보드 WASD / 방향키 / 마우스 |
| **사격 (Fire)** | **검지 방아쇠 (Trigger)** | **C 버튼** | **C 버튼 터치** | Space / C 키 / 마우스 좌클릭 |
| **재장전 (Reload)** | **중지 그립 (Grip) 또는 A/X 버튼** | **Z 버튼** | **Z 버튼 터치** | R / Z 키 / 마우스 우클릭 |
| **게임 시작/재시작** | **VR 공간에서 방아쇠 1회 당김** | **C 버튼 1회 클릭** | C 버튼 터치 | Space / 화면 클릭 |

---

## 3. 핵심 게임 시스템 요구사항

### 3.1 사격 및 탄약 시스템
- **가상 블래스터 3D 모델**: 손잡이, 총열, 발광 에너지 셀, 총구 화염(Muzzle Flash), 발사 반동(Recoil) 애니메이션 탑재.
- **실시간 레이저 조준선**: 총구에서 발사 지점까지 이어지는 시각적 레이저 포인터 빔 및 착탄 목표 도트(`laserTargetDot`) 제공.
- **정밀 Raycasting 판정**: 블래스터의 실제 3차원 월드 변환(`getWorldPosition`, `getWorldQuaternion`)을 기반으로 사격 궤적을 실시간 투사하여 손동작 방향과 100% 일치.
- **10발 탄창 룰**: 기본 10발 탄약. 0발 소진 시 사격 불가 및 공이치기 사운드 + 음성 경고 발생. 재장전 입력 시 1.2초 쿨타임 후 10발 완충.

### 3.2 3D 가상 공간 테마 (3종)
1. **사이버 아레나 (Cyber Arena - 기본)**: 네온 블루/마젠타 그리드 바닥, 디지털 헥사곤 터널 링, 발광 펄스 기둥.
2. **딥 스페이스 (Deep Space)**: 1,500개의 성운 별빛 파티클, 부유하는 크리스탈 소행성 및 우주 안개.
3. **네온 시티 (Neon City)**: 사이버펑크 고층 마천루 빌딩 실루엣, 펄스 네온 라이트 및 디지털 레인 파티클.

### 3.3 3D 표적 시스템 (4종)
1. **드론형 (Drone Target - 기본)**: 4개의 회전 프로펠러 로터와 발광 센서 카메라 아이를 장착한 하이테크 비행체.
2. **구체형 (Sphere Target)**: 펄스 발광 코어와 외곽 와이어프레임 쉘.
3. **큐브형 (Cube Target)**: 자체 회전하는 사이버 메탈릭 큐브.
4. **원반형 (Disc Target)**: 빠른 수평 횡단 궤도를 비행하는 하이테크 디스크.

### 3.4 난이도 프리셋
| 난이도 | 이동 속도 | 표적 크기 | 스폰 주기 | 최대 표적 수 | 점수 배율 |
|---|---|---|---|---|---|
| **쉬움 (Easy)** | 1.5 m/s | 1.4배 | 2.8초 | 4개 | 1.0x |
| **보통 (Normal)** | 2.8 m/s | 1.0배 (기본) | 1.8초 | 6개 | 1.5x |
| **어려움 (Hard)** | 4.5 m/s (급변) | 0.75배 | 1.1초 | 8개 | 2.5x |

### 3.5 점수 및 결과 판정
- 기본 점수: 100점 $\times$ 난이도 배율 $\times$ 콤보 연속 명중 가산.
- 라운드 제한시간: 60초.
- 통계 지표: 최종 점수, 명중 수, 빗맞힘 수, 명중률(%), 최대 콤보, 개인 최고 기록.
- 피격 연출: 표적 명중 시 20개 이상의 스파크 폭발 파티클(Explosion Particles) 확산 및 표적 소멸 애니메이션.

### 3.6 효과음 3종 프리셋 및 볼륨 조절 [v1.2 신규]
Web Audio API 신디사이저로 구현된 3가지 효과음 스타일을 제공하며, 설정 모달에서 선택 즉시 사운드 프리뷰를 제공합니다.
1. **SF LASER (플라즈마 광선총 - 기본)**:
   - 발사: 880Hz $\rightarrow$ 110Hz 지수 하강 톱니파(Sawtooth) 펄스 에너지 빔.
   - 명중: 로우패스 백색 노이즈 펀치 + 1760Hz 맑은 챠임 벨소리.
2. **KINETIC GUN (실탄 화약 총기)**:
   - 발사: 80Hz 저주파 사인파의 강력한 폭발 펀치 + 고주파 화약 버스트 노이즈 + 0.15초 후 탄피 배출(Brass Eject) 금속성 핑 사운드.
   - 명중: 묵직한 둔탁한 타격음 (60Hz 삼각파 + 메탈릭 임팩트).
3. **8-BIT RETRO (고전 아케이드 칩튠)**:
   - 발사: 1200Hz $\rightarrow$ 300Hz의 거친 사각파(Square Wave) 피치 슬라이드.
   - 명중: 레트로 폭발 노이즈 버스트.
- **마스터 볼륨**: 0% ~ 100% 무단계 조절 게인 노드(`masterGain`) 탑재.

### 3.7 한국어 오퍼레이터 음성 안내 (Voice Briefing) [v1.2 신규]
게임 주요 상황에서 SF 군사 무전기 통신음(Radio Chirp: 2400Hz/1800Hz/2800Hz 3단 비프)과 Web Speech API 한국어 음성 멘트를 동기화하여 출력합니다.
- **이벤트별 안내 멘트**:
  - `GAME_START`: *"작전 개시! 표적을 사격하세요."*
  - `AMMO_EMPTY`: *"탄약 소진! 재장전하세요."*
  - `RELOAD_DONE`: *"재장전 완료."*
  - `COMBO_STREAK`: *"연속 명중! 콤보 보너스!"* (5, 10, 15... 연속 명중 시)
  - `TIME_WARN_10S`: *"작전 종료 10초 전!"*
  - `GAME_OVER`: *"작전 종료! 결과를 확인하세요."*
  - `HIGH_SCORE`: *"축하합니다! 새로운 최고 기록 달성!"* (Top 10 랭킹 진입 시)
- **사용자 제어**: 설정 모달에서 음성 안내 **`ON / OFF`** 토글 스위치, 음성 볼륨(0~100%) 슬라이더 및 **`[🔊 테스트]`** 버튼 지원.

### 3.8 사용자 등록 및 Top 10 순위표 (글로벌 리더보드) [v1.2 신규]
- **데이터 구조 (`LeaderboardEntry`)**:
  - `id`: 고유 식별자
  - `playerName`: 플레이어 닉네임 (최대 15자)
  - `score`: 최종 획득 점수
  - `accuracy`: 명중률 (%)
  - `maxCombo`: 최대 연속 명중 콤보 수
  - `difficulty`: 플레이 난이도 (`easy` | `normal` | `hard`)
  - `theme`: 플레이 배경 테마 (`cyber` | `space` | `city`)
  - `date`: 기록 일자 (YYYY-MM-DD)
- **저장소 및 정렬**:
  - 브라우저 `localStorage`(`nunchuk_vr_leaderboard`)에 점수 내림차순 정렬로 상위 10개 레코드를 유지.
  - 신규 접속 시 기본 랭커 데이터(`CYBER_GUNNER`, `NUNCHUK_MASTER` 등)가 제공되어 즉시 랭킹 경쟁 체험 가능.
- **결과 등록 플로우**:
  - 게임 종료 시 `GameOverModal`에서 플레이어 닉네임 입력 후 **`[기록 등록]`** 클릭.
  - 등록 완료 시 **`순위 확인 →`** 링크를 통해 순위표 모달로 즉시 전환되며, 본인의 순위 행에 **`YOU`** 뱃지와 하이라이팅 표시.
- **모달 및 상단 접근**:
  - 상단 HUD 우측에 **`🏆 RANKING`** 버튼 및 메인 메뉴 모달에 **`순위표 (TOP 10) →`** 링크가 배치되어 게임 중이든 대기 중이든 언제든 열람 가능.
  - 1위 🥇, 2위 🥈, 3위 🥉 전용 메달 뱃지 적용.
  - 필요 시 초기 기본값으로 복원할 수 있는 **`초기 랭킹으로 복원`** 옵션 제공.

---

## 4. UI/UX 화면 구성 요구사항

1. **상단 HUD ([GameHUD.tsx](file:///d:/work/iot-3d-shooting/frontend/src/components/ui/GameHUD.tsx))**:
   - 좌측: 타이틀(v1.2) 및 서버/Pico 2 W 연결 상태 표시등.
   - 중앙: 60초 타이머(10초 이하 시 레드 펄스), 점수, 콤보 배율.
   - 우측: `🏆 RANKING`, `🥽 ENTER VR`, `⚙️ SETTINGS`, `START / PAUSE` 버튼 그룹.
   - 하단: 조작 가이드 안내문 및 10발 탄약 쉘 인디케이터, 명중률(%).
2. **메인 메뉴 모달 ([MainMenuModal.tsx](file:///d:/work/iot-3d-shooting/frontend/src/components/ui/MainMenuModal.tsx))**:
   - 게임 브리핑, 조작 방법 안내, 현재 설정 요약.
   - 최고 점수 디스플레이 및 `순위표 (TOP 10) →` 링크.
   - 원클릭 `🥽 ENTER VR` 대형 버튼 및 `🚀 PC 모드로 시작` 버튼.
3. **설정 모달 ([SettingsModal.tsx](file:///d:/work/iot-3d-shooting/frontend/src/components/ui/SettingsModal.tsx))**:
   - 1. 아레나 테마 (3종 카드)
   - 2. 3D 표적 형태 (4종 카드)
   - 3. **효과음 SFX 프리셋 (Laser / Kinetic / Retro) 및 볼륨 슬라이더** [v1.2]
   - 4. **한국어 음성 안내 (ON/OFF, 볼륨 슬라이더, 🔊 테스트 버튼)** [v1.2]
   - 5. 난이도 프리셋 (Easy / Normal / Hard)
   - 6. 조준 감도 슬라이더 (0.5x ~ 2.5x) 및 FastAPI 중계 서버 IP 설정
4. **게임 종료 모달 ([GameOverModal.tsx](file:///d:/work/iot-3d-shooting/frontend/src/components/ui/GameOverModal.tsx))**:
   - 최종 점수, 신기록 달성 팡파르 배너.
   - **사용자 등록 폼 (닉네임 입력 + [기록 등록] 버튼 + TOP 10 진입 뱃지)** [v1.2].
   - 명중률, 최대 콤보, 명중 수, 총 발사 수 그리드 통계.
   - `🏆 TOP 10 리더보드`, `⚙️ 설정`, `🔄 다시 시작` 버튼.
5. **순위표 모달 ([LeaderboardModal.tsx](file:///d:/work/iot-3d-shooting/frontend/src/components/ui/LeaderboardModal.tsx)) [v1.2]**:
   - 명예의 전당 Top 10 순위 테이블 (순위, 닉네임, 점수, 명중률, 콤보, 난이도, 날짜).
   - 메달 뱃지(🥇, 🥈, 🥉) 및 본인 기록(`YOU`) 하이라이트.
   - 초기 랭킹 복원 및 닫기 버튼.

---

## 5. 하드웨어 및 통신 사양

### 5.1 하드웨어 결선 (Nintendo Wii Nunchuk ↔ Pico 2 W)
눈차크 I2C 인터페이스(기본 주소 `0x52`)를 Pico 2 W와 아래와 같이 연결:

```text
       [Wii Nunchuk Plug]
          +---------+
          |  [---]  |  <- 상단 노치
          | 1  2  3 |
          | 4  5  6 |
          +---------+
    1: GND      (White)  -> Pico 2 W Pin 38 (GND)
    2: VCC 3.3V (Red)    -> Pico 2 W Pin 36 (3V3 OUT)
    3: SCL      (Yellow) -> Pico 2 W Pin 7  (GP5 / I2C0 SCL)
    4: NC
    5: NC
    6: SDA      (Green)  -> Pico 2 W Pin 6  (GP4 / I2C0 SDA)
```

### 5.2 통신 메시지 규격 (JSON WebSocket)
```json
{
  "type": "nunchuk_input",
  "source": "pico_w",
  "stick": { "x": 0.0, "y": 0.0 },       // -1.0 ~ 1.0 (중앙 0.0 정규화 및 데드존 필터링)
  "accel": { "x": 512, "y": 512, "z": 512 }, // 10비트 가속도 센서 원시값
  "buttons": {
    "c": false,                            // true: 사격
    "z": false                             // true: 재장전
  },
  "timestamp": 1727670000000
}
```

### 5.3 서버 엔드포인트
- `ws://<HOST>:8000/ws/pico`: Raspberry Pi Pico 2 W 송신 전용 WebSocket
- `ws://<HOST>:8000/ws/virtual`: 모바일 가상 패드 송신 전용 WebSocket
- `ws://<HOST>:8000/ws/game`: 웹 게임 클라이언트 수신 전용 WebSocket
- `http://<HOST>:8000/static/virtual_pad.html`: 브라우저 기반 가상 눈차크 터치 컨트롤러 UI

---

## 6. WebXR 및 브라우저 환경 보안 요구사항

### 6.1 WebXR 보안 규정 (Secure Context)
Quest 2 브라우저(Chromium 기반)는 W3C WebXR 명세에 따라 사설 IP 접속 시 안전한 출처(Secure Context)를 요구함.
- **해결 방안 (공식 권장)**:
  Quest 2 브라우저 주소창에 `chrome://flags` 접속 $\rightarrow$ `Insecure origins treated as secure` 검색 $\rightarrow$ 개발 PC 사설 IP(`http://<PC_IP>:3000`)를 등록하고 `Enabled`로 설정 후 브라우저 재시작.
  이를 통해 인증서 경고 없이 HTTP 환경에서도 360도 Immersive-VR 모드 100% 정상 구동.

### 6.2 Next.js 개발 서버 크로스 오리진 설정
- `next.config.ts`의 `allowedDevOrigins`에 로컬 서브넷 IP(`192.168.137.x`, `10.x.x.x`)를 등록하여 헤드셋 접속 시 HMR 및 리소스 차단을 방지.

---

## 7. 프로젝트 디렉토리 산출물 구조

```text
iot-3d-shooting/
├── Nunchuk_VR_Shooting_Arena_PRD_v1.0.md   # 초기 v1.0 PRD
├── Nunchuk_VR_Shooting_Arena_PRD_v1.1.md   # v1.1 PRD (Quest 2 6DoF 모션 추적 추가)
├── Nunchuk_VR_Shooting_Arena_PRD_v1.2.md   # [본 문서] 최신 개정 PRD (리더보드/사운드/음성)
│
├── frontend/                               # Next.js 16 + Three.js + WebXR 웹 게임
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                    # 메인 뷰, 사운드/음성/리더보드 상태 바인딩
│   │   │   ├── layout.tsx                  # SEO 메타데이터 및 뷰포트 설정
│   │   │   └── globals.css                 # 사이버 네온 글래스모피즘 디자인 시스템
│   │   ├── components/
│   │   │   ├── arena/
│   │   │   │   └── ShootingArenaEngine.ts  # Three.js 코어 엔진, 가상 블래스터, 6DoF 모션 추적, 보이스 트리거
│   │   │   └── ui/
│   │   │       ├── GameHUD.tsx             # 실시간 HUD (점수, 10발 탄약, 타이머, 랭킹 버튼)
│   │   │       ├── MainMenuModal.tsx       # 브리핑, 조작 안내, ENTER VR, 순위표 링크
│   │   │       ├── SettingsModal.tsx       # 테마/표적/난이도/3종 SFX/한국어 음성 설정 모달
│   │   │       ├── GameOverModal.tsx       # 60초 결과 디브리핑 & 사용자 닉네임 등록 모달
│   │   │       └── LeaderboardModal.tsx    # Top 10 글로벌 명예의 전당 순위표 모달
│   │   ├── core/
│   │   │   ├── audio/
│   │   │   │   ├── SoundManager.ts         # 3종 프리셋(Laser/Kinetic/Retro) Web Audio 합성기
│   │   │   │   └── VoiceManager.ts         # Radio Chirp 비프음 + 한국어 음성 브리핑 시스템
│   │   │   ├── leaderboard/
│   │   │   │   └── LeaderboardManager.ts   # localStorage 기반 Top 10 순위 및 기록 관리자
│   │   │   └── input/
│   │   │       └── InputManager.ts         # WebSocket 및 PC 키보드/마우스 입력 추상화
│   │   └── types/index.ts                  # 공통 타입 (LeaderboardEntry, SoundPresetType, VoiceEventType 등)
│   ├── next.config.ts                      # 서브넷 IP 허용 설정
│   └── package.json
│
├── server/                                 # FastAPI WebSocket 중계 서버
│   ├── app/
│   │   ├── main.py                         # FastAPI 엔트리포인트 및 엔드포인트 라우팅
│   │   ├── broadcaster.py                  # 실시간 입력 브로드캐스터
│   │   └── static/virtual_pad.html         # 모바일용 가상 눈차크 터치 컨트롤러 UI
│   ├── run.py                              # 서버 실행 스크립트
│   └── requirements.txt
│
└── firmware/                               # Raspberry Pi Pico 2 W 펌웨어
    ├── code.py                             # CircuitPython 눈차크 I2C 리더 및 WebSocket 송신기
    ├── settings.toml                       # Wi-Fi 및 서버 접속 환경 설정
    └── README.md                           # 상세 회로 결선도 및 플래싱 가이드
```

---

## 8. 버전 변경 이력 (Revision History)

| 버전 | 일자 | 주요 변경 내용 |
|---|---|---|
| **v1.0** | 2026-09-30 | 초안 작성. 눈차크 + Pico 2 W 기반 기본 사격 시스템 명세 수립 |
| **v1.1** | 2026-09-30 | • Quest 2 순정 터치 컨트롤러(6DoF 모션 추적) 정식 지원 추가 (눈차크 없이도 플레이 가능)<br>• "Pull Trigger to Start" 건슈팅 UX 도입 (VR 내부에서 방아쇠 1회 당김으로 게임 시작)<br>• 블래스터 3D 월드 변환 기반 정밀 Raycasting 사격 엔진 고도화<br>• Three.js 공식 `VRButton` 통합 및 메인 모달 대형 `[ENTER VR]` 버튼 추가<br>• 사설 IP WebXR 보안 플래그(`chrome://flags`) 및 `allowedDevOrigins` 명세 추가 |
| **v1.2** | 2026-09-30 | • **사용자 등록 & Top 10 순위표 (리더보드)** 전면 구현: 닉네임 입력, 점수/명중률/콤보 저장, `LeaderboardModal` 명예의 전당 UI 추가<br>• **효과음 3종 프리셋 & 마스터 볼륨 조절** 구현: SF 레이저(`laser`), 실탄 총기(`kinetic`), 8비트 레트로(`retro`) 테마 및 0~100% 볼륨 슬라이더<br>• **한국어 오퍼레이터 음성 안내 (Voice Briefing)** 구현: SF 무전기 비프음(Radio Chirp) + `SpeechSynthesis` 한국어 멘트 7종 연동, ON/OFF 스위치 및 볼륨 조절 지원<br>• GameHUD 및 MainMenuModal에 실시간 랭킹 확인 버튼 연동 |
