# Cyber Strike 웹 클라이언트 (frontend)

Next.js 16(App Router, Turbopack) + React 19 + Tailwind CSS v4 + three.js(WebXR)로 만든 게임 화면입니다.
설치·전시 운영 전체 안내는 저장소 루트의 `README.md`를 보세요.

## 실행

Node.js 20.9 이상이 필요합니다.

```bash
npm install      # 처음 한 번, 그리고 코드를 새로 받을 때마다 한 번
npm run dev      # 개발 서버 http://localhost:3000 (전시장에서도 이 명령으로 띄움)
npm run lint     # ESLint
npx tsc --noEmit # 타입 검사
npm run build    # 운영 빌드 (npm run start로 실행)
```

- 게임 서버(`server/`, 포트 8000)가 켜져 있어야 1P·2P·관전 화면이 서로 연결됩니다.
- 개발 모드는 React StrictMode라서 화면을 열 때 3D 엔진을 한 번 만들었다 버리고 다시 만듭니다. 엔진의 `dispose()`가 WebGL 컨텍스트, VR 세션, 입력 콜백까지 정리하므로, 엔진에 무언가를 추가하면 `dispose()`에서 함께 정리하세요.

## 폴더 지도

```text
src/
├── app/                      # page.tsx, layout.tsx, globals.css(글꼴 @font-face, 색·글자 토큰)
├── components/
│   ├── ShootingArenaApp.tsx  # 화면 상태(메뉴·결과·설정)와 3D 엔진을 잇는 최상위 컴포넌트
│   ├── arena/
│   │   ├── ShootingArenaEngine.ts  # 3D 엔진: 경기 진행, 사격·명중 판정, VR, 네트워크 동기화
│   │   └── visual/                 # 겉모습 모듈 (경기 규칙과 판정은 엔진에 있음)
│   │       ├── arena/              # 경기장: 하늘, 격자 바닥, 플랫폼·기둥·게이트, 테마별 색(themes.ts)
│   │       ├── text/               # VR 안 글자(troika): HoloText, 3D 문구 모음 vrStrings.ts
│   │       ├── debug/PerfPanel.ts  # ?debug=perf 성능 표시
│   │       ├── DroneFactory.ts · hitProxies.ts · TargetLabels.ts   # 표적 드론, 보이지 않는 판정 도형, 표적 글자
│   │       ├── EffectsSystem.ts · beamShader.ts · Haptics.ts       # 명중 효과·레이저, 컨트롤러 진동
│   │       ├── BlasterModel.ts · AimProbe.ts                       # 블래스터(총 화면·탄약 칸), 조준점 계산
│   │       ├── AvatarModel.ts · PoseSmoother.ts                    # 상대 헬멧·이름표, 상대 움직임 보간
│   │       ├── HoloScoreboard.ts · ResultPanel.ts                  # 게이트 위 점수판·GO!/TIME UP, VR 결과판
│   │       └── palette.ts · quality.ts · renderSetup.ts · fonts.ts # 공용 색, 품질 단계, 렌더러 설정, 캔버스 글꼴
│   └── ui/
│       ├── kit/              # 공용 부품(Button, Panel, Segmented, ModalShell …)
│       ├── hud/              # 선수 HUD(PlayerHUD), 관전 중계(BroadcastOverlay, broadcast/), 점수판(ScoreBug)
│       └── *Modal.tsx        # 메인 메뉴·결과·순위표·설정 창
├── constants/labels.ts       # 화면에 쓰는 이름(1P/2P/관전, 난이도, 테마, 카메라) 한곳에 모음
├── core/                     # input(InputManager: 키보드·마우스·소켓), ai, audio, spectator(관전 카메라), leaderboard
└── types/                    # 공용 타입, troika-three-text 타입 선언
```

## 주소 옵션

| 옵션 | 뜻 |
|---|---|
| `?role=p1` · `?role=p2` · `?role=spectator` | 기기 역할 |
| `?quality=low` · `?quality=high` | 그래픽 품질 강제 (기본: Quest·소프트웨어 렌더링은 low) |
| `?debug=perf` | fps·draw call 표시 (VR에서는 총을 들지 않은 손 옆) |

## 글꼴

- 2D 화면: `public/fonts/PretendardVariable.woff2`, `rajdhani-latin-*.woff2` (`globals.css`의 `@font-face`)
- VR 안 글자(troika): `public/fonts/Pretendard-Bold.subset.woff`(KS X 1001 한글 서브셋), `rajdhani-latin-700-normal.woff`
  - troika는 woff2를 읽지 못해서 woff를 따로 둡니다.
  - 인터넷 글꼴 서버(CDN)를 쓰지 않도록 `visual/text/HoloText.ts`에서 로컬 글꼴만 지정합니다.
  - VR 문구를 바꾸거나 추가할 때는 `visual/text/vrStrings.ts`에 넣으세요. 시작할 때 그 글자들을 미리 만들어 경기 중 멈칫하지 않습니다. 이모지·★·✓처럼 글꼴에 없는 글자는 쓰지 마세요.
- 라이선스: Pretendard, Rajdhani 모두 SIL Open Font License 1.1 (`public/fonts/LICENSE-*.txt`)
