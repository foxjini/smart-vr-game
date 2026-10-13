import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import {
  ThemeType,
  TargetShape,
  Difficulty,
  GameStats,
  DifficultyConfig,
  SoundPresetType,
  ClientRole,
  SpectatorCameraMode,
  PlayerPose,
  VersusMatchStats,
  TargetSpawnPacket,
  TargetKeyword,
  MatchInfo,
} from '@/types';
import { SoundManager } from '@/core/audio/SoundManager';
import { VoiceManager } from '@/core/audio/VoiceManager';
import { LeaderboardManager } from '@/core/leaderboard/LeaderboardManager';
import { InputManager } from '@/core/input/InputManager';
import { CyberAIRival, TargetObjectRef } from '@/core/ai/CyberAIRival';
import { SpectatorCameraController } from '@/core/spectator/SpectatorCameraController';
import { PerfPanel } from './visual/debug/PerfPanel';
import { PALETTE, teamColor, cssColor } from './visual/palette';
import { configureRenderer, requestTargetFrameRate } from './visual/renderSetup';
import { FONT_UI, FONT_NUM, loadCanvasFonts } from './visual/fonts';
import { DroneFactory, targetGlowColor } from './visual/DroneFactory';
import { HitProxyFactory } from './visual/hitProxies';
import { EffectsSystem } from './visual/EffectsSystem';
import { TargetLabels } from './visual/TargetLabels';
import { Haptics, HapticPattern } from './visual/Haptics';
import { ArenaEnvironment } from './visual/ArenaEnvironment';
import { detectQuality, QualitySettings } from './visual/quality';
import { BlasterFactory, BlasterVisual } from './visual/BlasterModel';
import { AimProbe } from './visual/AimProbe';
import { AvatarFactory, AvatarVisual } from './visual/AvatarModel';
import { PoseSmoother } from './visual/PoseSmoother';
import { HoloTextFactory } from './visual/text/HoloText';
import type { Text } from 'troika-three-text';
import { VR_TEXT } from './visual/text/vrStrings';
import { HoloScoreboard } from './visual/HoloScoreboard';
import { ResultPanel, ResultPlayer } from './visual/ResultPanel';
import { aiSlotOf, formatClock, normalizeWinner, slotName, winnerHeadline } from '@/components/ui/matchInfo';
import { KEYWORDS_1PT, KEYWORDS_2PT, KEYWORDS_MINUS, keywordPoints } from '@/constants/labels';

/** 표적 문구 8가지 (배점은 constants/labels의 keywordPoints: 2점·1점, 기계·전기는 -1점) */
export const TARGET_KEYWORDS: TargetKeyword[] = [...KEYWORDS_2PT, ...KEYWORDS_1PT, ...KEYWORDS_MINUS];
/** 점수를 주는 표적 문구 (감점 표적이 최대 수만큼 있을 때 이 중에서 고름) */
const SCORING_KEYWORDS: TargetKeyword[] = [...KEYWORDS_2PT, ...KEYWORDS_1PT];

/** 경기 시간(초) */
const MATCH_DURATION = 60;
/** 플레이어 슬롯별 월드 X 위치 (두 플레이어가 같은 원점에 겹치지 않도록 좌우로 배치) */
const SLOT_OFFSET_X = 0.75;
/** 서버에 경기 시작을 요청한 뒤 응답이 없을 때 로컬 경기로 대체하기까지 기다리는 시간(ms) */
const START_REQUEST_TIMEOUT_MS = 1500;
/** 로컬 타이머가 끝난 뒤 서버의 종료 판정을 기다리는 최대 시간(초) */
const SERVER_END_GRACE = 2.0;
/** 호스트의 표적이 이 시간(초) 동안 오지 않고 화면에 표적이 없으면 다른 플레이어가 대신 생성 */
const HOST_SILENCE_BEFORE_BACKUP = 3.0;

type PlayerSlot = 1 | 2;

/** 결과 없이 끝나는 경기 종료 사유 (경기 중단, 같은 역할 새 접속, 내 자리를 다른 기기가 사용 중) */
const ABORT_REASONS = ['ABORT', 'REPLACED', 'SLOT_BUSY'];

/** 블래스터 기준 총구 끝 위치 (빔·섬광이 나가는 곳, 사격 판정 광선은 블래스터 원점에서 나감) */
const MUZZLE_LOCAL = new THREE.Vector3(0, 0.02, -0.5);
/** 표적 등장 연출 시간(초) / 경기 종료 후 남은 표적이 사라지는 시간(초) */
const TARGET_SPAWN_TIME = 0.35;
const TARGET_DESPAWN_TIME = 0.4;
/**
 * 감점 표적(기계·전기)이 스스로 사라지기까지의 시간(초).
 * 표적은 맞히기 전까지 남아 있는데, 감점 표적은 아무도 쏘지 않으므로 계속 쌓이지 않게 함.
 * 경기 시계로 재므로 화면이 느린 기기(관전 PC 등)에서도 모든 화면에서 같은 때에 사라짐
 */
const MINUS_TARGET_LIFETIME = 8;
/** 경기장에 함께 있을 수 있는 감점 표적 수 (최대 표적 수 4·6·8개 중 점수 표적이 나올 자리를 남김) */
const MINUS_TARGET_MAX: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
/** 빗나간 사격의 빔 길이(m) */
const MISS_BEAM_LENGTH = 55;
/** 재장전 시간(초) */
const RELOAD_TIME = 1.2;
/** 선수 PC 화면 시야각 (관전 화면은 SpectatorCameraController가 60으로 바꿈) */
const PLAYER_FOV = 75;

export interface TargetObject extends TargetObjectRef {
  id: string;
  mesh: THREE.Group;
  shape: TargetShape;
  keyword: TargetKeyword;
  points: number; // 정보·통신 2점, 제어·회로·인공·전자 1점, 기계·전기 -1점
  basePos: THREE.Vector3;
  velocity: THREE.Vector3;
  frequency: number;
  amplitude: number;
  timeAlive: number;
  isHit: boolean;
  hitProgress: number;
  /** 사격 판정 메시 (예전 표적 모양 그대로, 보이지 않음) */
  hitMeshes: THREE.Mesh[];
  /** 예전처럼 회전하는 판정 메시 */
  spinners: THREE.Object3D[];
  /** 판정 메시 회전을 따라가는 장식 (spinners와 같은 순서) */
  visualSpinners: Array<THREE.Object3D | null>;
  /** 겉모습 (판정에 영향 없음) */
  visual: THREE.Group;
  labelSprite: THREE.Sprite;
  labelBase: THREE.Vector2;
  labelTop: number;
  banks: boolean;
  /** 등장 연출 진행 시간(초) */
  spawnAge: number;
  /** 경기가 끝나 사라지는 중이면 0→1, 아니면 -1 */
  despawn: number;
  /** 감점 표적이 사라질 때의 남은 경기 시간(초), 점수 표적은 null */
  expireAt: number | null;
}

/** PC 조준점 화면 위치 (CSS 픽셀, 화면 왼쪽 위 기준) */
export interface AimScreenPoint {
  x: number;
  y: number;
  /** 조준선이 표적 위에 있음 */
  locked: boolean;
  /** 겨누는 표적의 점수 (없으면 0) */
  points: number;
}

/** 경기가 끝났을 때 전달하는 결과 */
export interface MatchEndResult {
  winner: string;
  aborted: boolean;
  /** 관전 화면 대기용 AI 시연이 끝난 것 (결과창 없음) */
  demo: boolean;
  /** 두 선수 최종 기록 */
  versus: VersusMatchStats;
}

interface BlasterRig {
  /** 사격 광선의 출발점·방향 (겉모습은 visual.root로 이 그룹의 자식) */
  group: THREE.Group;
  /** 겉모습·탄약 칸·OLED·조준선·조준점 (사격 판정에는 쓰이지 않음) */
  visual: BlasterVisual;
  displayMesh: THREE.Mesh;
  displayTexture: THREE.CanvasTexture;
  displayCanvas: HTMLCanvasElement;
  displayCtx: CanvasRenderingContext2D;
  recoilOffset: number;
  primaryColor: number;
  nameTag: string;
  /** 마지막으로 그린 OLED 내용 (같으면 다시 그리지 않음) */
  displayKey: string;
}

export class ShootingArenaEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  /**
   * 프레임 시간. connect(document)는 쓰지 않음: 몰입 VR 중 문서가 hidden으로 보고되면
   * 시간이 멈춰 게임이 정지할 수 있음 (긴 공백은 animate에서 0.1초로 자름)
   */
  private timer = new THREE.Timer();

  // 게임 매니저 참조
  private soundManager = SoundManager.getInstance();
  private voiceManager = VoiceManager.getInstance();
  private leaderboardManager = LeaderboardManager.getInstance();
  private inputManager = InputManager.getInstance();
  private hasWarned10s: boolean = false;

  // 게임 설정 & 상태
  public currentTheme: ThemeType = 'cyber';
  public currentShape: TargetShape = 'drone';
  public currentDifficulty: Difficulty = 'normal';
  public isPlaying: boolean = false;
  public isPaused: boolean = false;
  public clientRole: ClientRole = 'P1';
  public vrExitHoldTimer: number = 0;

  // AI 및 관람 카메라
  public cyberAI = new CyberAIRival('normal');
  public spectatorCam: SpectatorCameraController;

  // 1P 및 2P 통계
  public stats: GameStats = {
    score: 0,
    hits: 0,
    misses: 0,
    shotsFired: 0,
    accuracy: 100,
    combo: 0,
    maxCombo: 0,
    timeRemaining: 60,
    ammo: 10,
    maxAmmo: 10,
    isReloading: false,
  };

  public p2Stats: GameStats = {
    score: 0,
    hits: 0,
    misses: 0,
    shotsFired: 0,
    accuracy: 100,
    combo: 0,
    maxCombo: 0,
    timeRemaining: 60,
    ammo: 10,
    maxAmmo: 10,
    isReloading: false,
  };

  // 콜백
  public onStatsUpdate?: (stats: GameStats) => void;
  public onVersusStatsUpdate?: (stats: VersusMatchStats) => void;
  public onGameOver?: (finalStats: GameStats, result: MatchEndResult) => void;
  public onGameStarted?: () => void;
  public onPauseChange?: (paused: boolean) => void;
  /** 서버 경기의 난이도가 로컬 설정과 달라 동기화했을 때 */
  public onDifficultySync?: (difficulty: Difficulty) => void;

  // 서버 경기 상태 (null = 오프라인·관람 데모·서버 무응답 대체 등 로컬 경기)
  private matchId: number | null = null;
  private lastEndedMatchId: number | null = null;
  private pendingStartTimer: ReturnType<typeof setTimeout> | null = null;
  private matchEndWaitTimer: number = 0;
  private timeSinceRemoteSpawn: number = 0;
  /** 서버 경기 종료 예정 시각 (performance.now 기준, 일시정지·로컬 경기는 null) */
  private matchClockEndsAt: number | null = null;
  /** 관전 화면 대기용 AI 시연 중 (소리 끔, 결과창 없음) */
  private demoActive = false;

  // 3D 오브젝트들
  /** 내 카메라·VR 컨트롤러·안내판을 담는 리그 (슬롯 위치로 이동) */
  private playerRig: THREE.Group;
  /** 경기장 배경 (하늘·바닥·플랫폼·기둥·게이트·조명·안개·반사 환경맵) */
  private arena!: ArenaEnvironment;
  private quality!: QualitySettings;
  private targetsGroup: THREE.Group;
  private p1Blaster!: BlasterRig;
  private p2Blaster!: BlasterRig;
  private p1Head!: THREE.Group;
  private p2Head!: THREE.Group;
  private vrPromptMesh!: THREE.Mesh;
  private activeTargets: TargetObject[] = [];
  private vrButtonElement?: HTMLElement;
  private vrButtonTimer: ReturnType<typeof setTimeout> | null = null;

  // 표적·효과 (모양·재질·텍스처를 한 번만 만들어 모든 표적이 공유: Quest 2 VRAM 누수 방지)
  private labels!: TargetLabels;
  private drones!: DroneFactory;
  private effects!: EffectsSystem;
  private haptics = new Haptics();
  private blasterFactory = new BlasterFactory();
  private aimProbe = new AimProbe();
  /** VR 안 글자 (이름표·점수판·결과판) */
  private texts = new HoloTextFactory();
  private avatars!: AvatarFactory;
  /** 게이트 안 홀로그램 점수판과 시작·종료 연출 */
  private scoreboard!: HoloScoreboard;
  /** VR 결과판 (vrPromptMesh가 이 결과판의 뒤판) */
  private resultPanel!: ResultPanel;
  private p1Avatar!: AvatarVisual;
  private p2Avatar!: AvatarVisual;
  /** 상대 선수 자세를 부드럽게 따라가기 (슬롯별 머리·블래스터) */
  private poseSmooth: Record<PlayerSlot, { head: PoseSmoother; blaster: PoseSmoother }> = {
    1: { head: new PoseSmoother(), blaster: new PoseSmoother() },
    2: { head: new PoseSmoother(), blaster: new PoseSmoother() },
  };
  private _aimPoint = new THREE.Vector3();
  private _aimDir = new THREE.Vector3();
  private _camQuat = new THREE.Quaternion();
  /** 결과판에 마지막으로 그린 상태 (폰트를 불러온 뒤 같은 내용으로 다시 그리기 위함) */
  private vrPromptState: { isGameOver: boolean; winner?: string } = { isGameOver: false };
  private disposed = false;
  private warmUpTimer: ReturnType<typeof setTimeout> | null = null;

  // 성능 최적화 타이머 (초당 수십회 불필요한 GPU 업로드 & React 리렌더링 방지)
  private oledUpdateTimer: number = 0;
  private statsNotifyTimer: number = 0;
  private lastReportedSecond: number = -1;

  // 가비지 컬렉터(GC) 스터터 방지를 위한 재사용 임시 수학 객체 풀
  private _tempVec1 = new THREE.Vector3();
  private _tempVec2 = new THREE.Vector3();
  private _tempVec3 = new THREE.Vector3();
  private _tempQuat1 = new THREE.Quaternion();
  private _tempQuat2 = new THREE.Quaternion();
  private _muzzle = new THREE.Vector3();
  private _beamEnd = new THREE.Vector3();
  private _camWorld = new THREE.Vector3();
  private _targetWorld = new THREE.Vector3();
  private raycastHits: THREE.Intersection[] = [];

  // WebXR 컨트롤러 (Quest 2 터치 컨트롤러)
  private controller0!: THREE.XRTargetRaySpace;
  private controller1!: THREE.XRTargetRaySpace;
  private activeController?: THREE.XRTargetRaySpace;
  public isVRControllerActive: boolean = false;

  // 조준 각도 (PC 마우스/키보드용)
  private aimPitch: number = 0;
  private aimYaw: number = 0;
  private mouseNormX: number = 0;
  private mouseNormY: number = 0;

  // 난이도별 프리셋
  private difficultyConfigs: Record<Difficulty, DifficultyConfig> = {
    easy: { speed: 1.5, scale: 1.4, spawnInterval: 2.8, maxTargets: 4, scoreMultiplier: 1 },
    normal: { speed: 2.8, scale: 1.0, spawnInterval: 1.8, maxTargets: 6, scoreMultiplier: 1.5 },
    hard: { speed: 4.5, scale: 0.75, spawnInterval: 1.1, maxTargets: 8, scoreMultiplier: 2.5 },
  };

  private spawnTimer: number = 0;
  private roundTimer: number = 60;
  private reloadTimer: number = 0;
  private poseSendTimer: number = 0;
  private lastFireTime: number = 0;
  private raycaster = new THREE.Raycaster();
  // PC 조준점 계산용 (매 프레임 호출되므로 객체를 재사용)
  private aimRaycaster = new THREE.Raycaster();
  private aimOrigin = new THREE.Vector3();
  private aimDir = new THREE.Vector3();
  private aimQuat = new THREE.Quaternion();
  private aimPoint = new THREE.Vector3();
  private aimHits: THREE.Intersection[] = [];
  /** 개발용 성능 표시 (?debug=perf일 때만) */
  private perfPanel?: PerfPanel;
  /** VR 안 성능 표시: 총을 들지 않은 손 컨트롤러 옆 (?debug=perf일 때만) */
  private perfText?: Text;
  private perfSample = -1;

  constructor(container: HTMLElement, initialTheme: ThemeType = 'cyber') {
    this.container = container;
    this.currentTheme = initialTheme;
    this.scene = new THREE.Scene();

    // 1. 카메라 설정
    this.camera = new THREE.PerspectiveCamera(
      PLAYER_FOV,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.6, 0);
    this.spectatorCam = new SpectatorCameraController(this.camera);

    // WebXR 카메라와 컨트롤러는 리그 기준으로 추적되므로, 리그를 옮기면 플레이어 위치가 바뀜
    this.playerRig = new THREE.Group();
    this.playerRig.add(this.camera);
    this.scene.add(this.playerRig);

    // 2. 렌더러 설정 (WebXR 활성화)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    configureRenderer(this.renderer);
    this.renderer.xr.enabled = true;

    this.renderer.xr.addEventListener('sessionstart', this.onXRSessionStart);
    this.renderer.xr.addEventListener('sessionend', this.onXRSessionEnd);

    container.appendChild(this.renderer.domElement);

    // 경기장 배경 (조명·안개·금속 반사 환경맵 포함). Quest·소프트웨어 렌더러는 별 수 등을 줄임
    this.quality = detectQuality(this.renderer);
    this.arena = new ArenaEnvironment(this.renderer, this.scene, this.quality);
    this.scene.add(this.arena.root);

    // 3. 그룹 초기화
    this.targetsGroup = new THREE.Group();
    this.scene.add(this.targetsGroup);

    // 표적 겉모습·라벨·사격 효과
    this.labels = new TargetLabels();
    this.labels.preload(TARGET_KEYWORDS.map((k) => [k, keywordPoints(k)] as const));
    this.drones = new DroneFactory(this.labels);
    this.effects = new EffectsSystem(this.labels);
    this.scene.add(this.effects.root);

    // 4. 컴포넌트 빌드
    this.arena.setTheme(this.currentTheme);
    this.scoreboard = new HoloScoreboard(this.texts);
    this.scene.add(this.scoreboard.root);
    // VR 글자에 쓰는 글리프를 미리 만듦 (경기 중 처음 나오는 글자 때문에 멈칫하지 않게)
    this.texts.preload();
    this.buildDualBlasters();
    this.buildVRHeadAvatars();
    this.buildVRPrompt();
    this.initVRControllers();
    this.initNetworkListeners();
    this.applyRoleLayout();

    // 캔버스 글자는 웹 폰트를 불러온 뒤 다시 그림 (불러오기 전에는 기본 글꼴로 그려짐)
    loadCanvasFonts().then(() => {
      if (!this.disposed) this.refreshCanvasTextures();
    });

    // 5. 입력 바인딩
    this.inputManager.onFireCallback = () => this.handleFire();
    this.inputManager.onReloadCallback = () => this.handleReload();

    // 6. 리사이즈 및 마우스 조준/발사 핸들러
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onCanvasPointerDown);

    // 7. Three.js 공식 WebXR VRButton (한 틱 뒤에 만듦).
    //    개발 모드(StrictMode)는 엔진을 만들었다 바로 버리고 다시 만들므로, 살아남은 엔진만 버튼을 만들게 함
    //    (버린 엔진의 버튼이 Quest 브라우저의 VR 제안(offerSession)을 버린 렌더러에 묶어 두지 않도록)
    this.vrButtonTimer = setTimeout(() => {
      this.vrButtonTimer = null;
      if (!this.disposed) this.attachVRButton();
    }, 0);

    if (PerfPanel.isEnabled()) {
      this.perfPanel = new PerfPanel(this.renderer);
      this.perfText = this.texts.create({ text: '', font: 'num', size: 0.022, color: 0x9fe8ff, anchorX: 'left', lineHeight: 1.2 });
      this.perfText.rotation.set(-0.9, 0, 0);
      this.perfText.visible = false;
    }

    // 8. 렌더 루프 시작. 첫 화면·접속 처리를 막지 않도록 잠시 뒤 셰이더를 미리 컴파일
    this.renderer.setAnimationLoop(this.animate);
    this.scheduleWarmUp(800);
  }

  /** VR 세션이 시작되면 72Hz를 요청하고 경기 시작 */
  private onXRSessionStart = () => {
    requestTargetFrameRate(this.renderer.xr.getSession());
    this.startGame();
  };

  private onXRSessionEnd = () => {
    if (this.isPlaying) {
      this.abortGame('플레이어 VR 세션 종료');
    }
  };

  /**
   * Three.js 공식 WebXR VRButton: 화면에는 숨기고 메뉴·HUD의 'VR 시작' 버튼이 대신 눌러 줌
   * (VR 세션 요청과 Quest 브라우저의 자동 VR 제안(offerSession)은 그대로 동작)
   */
  private attachVRButton() {
    try {
      const vrBtn = VRButton.createButton(this.renderer);
      vrBtn.id = 'three-vr-button';
      vrBtn.style.visibility = 'hidden';
      vrBtn.style.pointerEvents = 'none';
      vrBtn.setAttribute('aria-hidden', 'true');
      vrBtn.tabIndex = -1;
      document.body.appendChild(vrBtn);
      this.vrButtonElement = vrBtn;
    } catch (e) {
      console.warn('WebXR VRButton attach warning:', e);
    }
  }

  /** 잠시 뒤 셰이더 예열 (이미 예약돼 있으면 새로 예약) */
  private scheduleWarmUp(delayMs: number) {
    if (this.warmUpTimer) clearTimeout(this.warmUpTimer);
    this.warmUpTimer = setTimeout(() => this.warmUpShaders(), delayMs);
  }

  /**
   * 첫 표적·첫 명중 때 화면이 멈칫하지 않도록 아직 그려 본 적 없는 재질을 미리 컴파일
   * (표적 4종 × 1·2점 견본, 평소에는 숨어 있는 빔·점수 팝업, 표적 라벨 텍스처)
   */
  private warmUpShaders() {
    this.warmUpTimer = null;
    if (this.disposed) return;
    const samples = this.drones.createSamples(this.difficultyConfigs[this.currentDifficulty].scale);
    this.renderer.compileAsync(samples, this.camera, this.scene).catch(() => {
      // 미리 컴파일하지 못해도 처음 그릴 때 컴파일됨
    });
    this.renderer.compileAsync(this.effects.root, this.camera, this.scene).catch(() => {});
    // 표적 라벨·점수 팝업 텍스처도 미리 GPU에 올림
    this.labels.textures().forEach((t) => this.renderer.initTexture(t));
  }

  // ==========================================
  // 네트워크 동기화 리스너 등록
  // ==========================================
  private initNetworkListeners() {
    this.inputManager.onClientAssigned = (role) => {
      this.setRole(role);
    };

    this.inputManager.onRoomStateChange = () => {
      this.notifyVersusStats();
    };

    this.inputManager.onRemotePose = (pose: PlayerPose) => {
      const slot: PlayerSlot = pose.playerId === 2 ? 2 : 1;
      if (slot === this.localSlot) return;
      // 로컬 AI가 조종 중인 슬롯은 원격 포즈로 덮어쓰지 않음
      if (this.isPlaying && this.ownsAIRival() && slot === this.aiSlot) return;
      // 초당 20번 오는 자세를 목표로 두고, 매 프레임 부드럽게 따라감 (animate)
      this.poseSmooth[slot].head.set(pose.headPos, pose.headQuat);
      this.poseSmooth[slot].blaster.set(pose.blasterPos, pose.blasterQuat);
    };

    this.inputManager.onRemoteFire = (data) => {
      const shooter: PlayerSlot = data.playerId === 2 ? 2 : 1;
      if (shooter === this.localSlot) return;
      const blaster = shooter === 1 ? this.p1Blaster : this.p2Blaster;
      blaster.recoilOffset = 0.08;
      this.soundManager.playFire();

      const muzzlePos = new THREE.Vector3();
      const muzzleQuat = new THREE.Quaternion();
      blaster.group.getWorldPosition(muzzlePos);
      blaster.group.getWorldQuaternion(muzzleQuat);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(muzzleQuat).normalize();
      // 빔 끝은 이 화면에 보이는 표적까지 (명중·점수는 서버 확정으로만 처리)
      const seen = this.raycastTargets(muzzlePos, forward);
      this.showShot(blaster, forward, teamColor(shooter), seen ? seen.point : null);

      // 상대 선수의 발사 수를 세어 명중률 계산 (결과 비교 카드용)
      if (this.isPlaying && this.matchId !== null) {
        this.recordShot(shooter);
      }
    };

    this.inputManager.onRemoteTargetSpawn = (data) => {
      // 현재 서버 경기의 표적만 받음 (호스트 표적, 또는 호스트가 멈췄을 때 다른 플레이어의 대체 표적)
      if (!this.isPlaying || this.matchId === null) return;
      if (data.matchId !== undefined && data.matchId !== this.matchId) return;
      this.timeSinceRemoteSpawn = 0;
      this.spawnTargetFromPacket(data);
    };

    this.inputManager.onTargetHitConfirmed = (data) => {
      if (!this.isPlaying || this.matchId === null || data.matchId !== this.matchId) return;
      const slot: PlayerSlot = data.hitBy === 2 ? 2 : 1;
      const targetObj = this.activeTargets.find((t) => t.id === data.targetId);
      if (targetObj && !targetObj.isHit) {
        targetObj.isHit = true;
        this.showHit(targetObj, new THREE.Vector3(...data.hitPoint), teamColor(slot));
        this.playHitSound(data.addedScore);
      }

      // 내 사격과 내가 돌리는 AI는 로컬 콤보를 이어가고, 원격 선수는 서버가 전달한 콤보를 사용
      const simulatedHere = slot === this.localSlot || (this.ownsAIRival() && slot === this.aiSlot);
      this.recordHit(slot, data.addedScore, simulatedHere ? undefined : data.combo);
      this.stats.score = data.p1Score;
      this.p2Stats.score = data.p2Score;
      if (slot === this.localSlot) {
        this.announceLocalHit(slot, data.addedScore);
      }
      this.notifyStats();
      this.notifyVersusStats();
    };

    this.inputManager.onMatchStarted = (info) => {
      if (this.isPlaying && this.matchId === info.matchId) {
        this.syncMatchClock(info);
        return;
      }
      // 대기 중이거나 로컬 경기(관람 데모 등) 중이면 서버 경기로 전환
      this.startGameLocal(info);
    };

    this.inputManager.onMatchState = (info) => {
      if (info.isMatchActive) {
        if (this.isPlaying && this.matchId === info.matchId) {
          this.syncMatchClock(info);
        } else if (info.matchId !== this.lastEndedMatchId) {
          // 진행 중인 경기에 도중 합류 (재접속, 나중에 켠 관람 화면 등)
          this.startGameLocal(info);
        }
      } else if (this.isPlaying && this.matchId === info.matchId) {
        // 종료 방송을 놓친 경우 서버 집계로 마무리
        this.finishWithScores(info.p1Score, info.p2Score);
      }
    };

    this.inputManager.onMatchOverBroadcast = (data) => {
      if (!this.isPlaying || this.matchId === null || data.matchId !== this.matchId) return;
      this.finishWithScores(data.p1Score, data.p2Score, data.winner);
    };

    this.inputManager.onMatchAborted = (data) => {
      if (!this.isPlaying || this.matchId === null || data.matchId !== this.matchId) return;
      this.stopGameLocal('ABORT');
    };

    this.inputManager.onMatchPaused = (data) => {
      if (this.isPlaying && data.matchId === this.matchId) this.setPausedLocal(true, data.remaining);
    };

    this.inputManager.onMatchResumed = (data) => {
      if (this.isPlaying && data.matchId === this.matchId) this.setPausedLocal(false, data.remaining);
    };

    // 서버 시계로 주기 보정 (첫 화면을 그리느라 늦게 처리한 메시지 등으로 생긴 오차 제거)
    this.inputManager.onMatchClock = (data) => {
      if (this.isPlaying && !this.isPaused && data.matchId === this.matchId) {
        this.roundTimer = data.remaining;
        this.matchClockEndsAt = performance.now() + data.remaining * 1000;
      }
    };

    // 내 역할 자리를 쓸 수 없게 되면 진행 중이던 서버 경기를 이 화면에서 정리 (VR 결과판에도 안내)
    this.inputManager.onConnectionIssue = (issue) => {
      if (this.isPlaying && this.matchId !== null) {
        this.stopGameLocal(issue === 'replaced' ? 'REPLACED' : 'SLOT_BUSY');
      }
    };
  }

  /** Quest 2 터치 컨트롤러 (6DoF 모션 추적 및 트리거/그립 연동) */
  private initVRControllers() {
    this.controller0 = this.renderer.xr.getController(0);
    this.controller1 = this.renderer.xr.getController(1);

    const onFire = (e: THREE.Event) => {
      if (e && e.target) {
        this.attachBlasterToController(e.target as THREE.XRTargetRaySpace);
      }
      this.handleFire();
    };

    const onReload = (e: THREE.Event) => {
      if (e && e.target) {
        this.attachBlasterToController(e.target as THREE.XRTargetRaySpace);
      }
      this.handleReload();
    };

    const handleConnected = (event: THREE.Event & { data?: XRInputSource }) => {
      const controller = event.target as THREE.XRTargetRaySpace;
      const data = event.data;
      this.isVRControllerActive = true;
      // 진동을 보낼 컨트롤러 입력 장치 기억
      controller.userData.inputSource = data;

      if (data && (data.handedness === 'right' || !this.activeController)) {
        this.attachBlasterToController(controller);
      }
    };

    const handleDisconnected = (event: THREE.Event) => {
      (event.target as THREE.XRTargetRaySpace).userData.inputSource = undefined;
      if (this.activeController === event.target) {
        this.activeController = undefined;
        this.resetLocalBlasterToDefault();
      }
    };

    this.controller0.addEventListener('connected', handleConnected);
    this.controller1.addEventListener('connected', handleConnected);
    this.controller0.addEventListener('disconnected', handleDisconnected);
    this.controller1.addEventListener('disconnected', handleDisconnected);

    this.controller0.addEventListener('selectstart', onFire);
    this.controller1.addEventListener('selectstart', onFire);
    this.controller0.addEventListener('squeezestart', onReload);
    this.controller1.addEventListener('squeezestart', onReload);

    this.playerRig.add(this.controller0);
    this.playerRig.add(this.controller1);
  }

  private getLocalBlaster(): BlasterRig {
    return this.clientRole === 'P2' ? this.p2Blaster : this.p1Blaster;
  }

  /** 내 플레이어 슬롯 (관람자는 null) */
  private get localSlot(): PlayerSlot | null {
    return this.clientRole === 'P1' ? 1 : this.clientRole === 'P2' ? 2 : null;
  }

  /** 로컬 AI 라이벌이 맡는 슬롯 (2P로 접속하면 1P 자리, 그 외에는 2P 자리) */
  private get aiSlot(): PlayerSlot {
    return this.clientRole === 'P2' ? 1 : 2;
  }

  private statsFor(slot: PlayerSlot): GameStats {
    return slot === 1 ? this.stats : this.p2Stats;
  }

  /** 역할에 맞춰 리그(내 위치)·헬멧·블래스터를 배치 */
  private applyRoleLayout() {
    const local = this.localSlot;
    // 배치를 새로 하므로 이전 자세로 끌려가지 않게 (다음 자세는 바로 옮김)
    this.poseSmooth[1].head.reset();
    this.poseSmooth[1].blaster.reset();
    this.poseSmooth[2].head.reset();
    this.poseSmooth[2].blaster.reset();
    this.playerRig.position.set(local === 1 ? -SLOT_OFFSET_X : local === 2 ? SLOT_OFFSET_X : 0, 0, 0);
    if (local !== null) {
      // 관람 카메라가 옮겨 둔 시점·시야각을 플레이어 1인칭 시점으로 되돌림
      this.camera.position.set(0, 1.6, 0);
      this.camera.rotation.set(0, 0, 0);
      if (this.camera.fov !== PLAYER_FOV) {
        this.camera.fov = PLAYER_FOV;
        this.camera.updateProjectionMatrix();
      }
    }

    ([1, 2] as PlayerSlot[]).forEach((slot) => {
      const head = slot === 1 ? this.p1Head : this.p2Head;
      const blaster = slot === 1 ? this.p1Blaster : this.p2Blaster;
      if (slot === local) {
        head.visible = false;
        return;
      }
      // 상대(원격 선수 또는 AI) 장비는 월드 기준 슬롯 기본 위치에 둠 (원격 포즈가 오면 덮어씀)
      const slotX = slot === 1 ? -SLOT_OFFSET_X : SLOT_OFFSET_X;
      head.visible = true;
      head.position.set(slotX, 1.6, 0);
      head.rotation.set(0, 0, 0);
      if (blaster.group.parent !== this.scene) {
        this.scene.add(blaster.group);
      }
      blaster.group.position.set(slotX + (slot === 1 ? -0.35 : 0.35), 1.35, -0.45);
      blaster.group.rotation.set(0, 0, 0);
    });

    if (local !== null) {
      if (this.activeController) {
        this.attachBlasterToController(this.activeController);
      } else {
        this.resetLocalBlasterToDefault();
      }
    }
  }

  private attachBlasterToController(controller: THREE.XRTargetRaySpace) {
    if (!controller || this.clientRole === 'SPECTATOR') return;
    this.activeController = controller;
    this.isVRControllerActive = true;

    const blaster = this.getLocalBlaster();
    if (blaster.group.parent !== controller) {
      if (blaster.group.parent) {
        blaster.group.parent.remove(blaster.group);
      }
      controller.add(blaster.group);
      blaster.group.position.set(0, -0.04, -0.15);
      blaster.group.rotation.set(-0.25, 0, 0);
    }
  }

  private resetLocalBlasterToDefault() {
    if (this.clientRole === 'SPECTATOR') return;
    const blaster = this.getLocalBlaster();
    if (blaster.group.parent !== this.playerRig) {
      this.playerRig.add(blaster.group);
    }
    const defaultX = this.clientRole === 'P2' ? 0.35 : -0.35;
    blaster.group.position.set(defaultX, 1.35, -0.45);
    blaster.group.rotation.set(0, 0, 0);
  }

  // ==========================================
  // 1. 가상 무기 (Dual Blaster) 구축 (조명은 ArenaEnvironment)
  // ==========================================
  /** 1P(Cyan) 및 2P(Magenta) 듀얼 블래스터 절차적 구축 */
  private buildDualBlasters() {
    this.p1Blaster = this.createBlasterRig(teamColor(1), 'PLAYER 1 (CYAN)');
    this.p1Blaster.group.position.set(-0.35, 1.35, -0.45);
    this.scene.add(this.p1Blaster.group);

    this.p2Blaster = this.createBlasterRig(teamColor(2), 'PLAYER 2 / AI (MAGENTA)');
    this.p2Blaster.group.position.set(0.35, 1.35, -0.45);
    this.scene.add(this.p2Blaster.group);
  }

  private createBlasterRig(primaryColor: number, nameTag: string): BlasterRig {
    const group = new THREE.Group();
    const visual = this.blasterFactory.create(primaryColor);
    group.add(visual.root);
    // 조준선·조준점은 월드 좌표로 그리므로 장면에 바로 붙임
    this.scene.add(visual.aimBeam, visual.aimDot, visual.lockRing);
    return {
      group,
      visual,
      displayMesh: visual.displayMesh,
      displayTexture: visual.displayTexture,
      displayCanvas: visual.displayCanvas,
      displayCtx: visual.displayCtx,
      recoilOffset: 0,
      primaryColor,
      nameTag,
      displayKey: '',
    };
  }

  /** ?debug=perf: VR에서 총을 들지 않은 손 컨트롤러 위에 fps·draw call(양 눈 합계) 표시 */
  private updateVRPerfText(inVR: boolean) {
    const t = this.perfText;
    if (!t || !this.perfPanel) return;
    const free = this.activeController === this.controller0 ? this.controller1 : this.controller0;
    t.visible = inVR && Boolean(free);
    if (!t.visible) return;
    if (t.parent !== free) {
      free.add(t);
      t.position.set(-0.03, 0.04, -0.06);
    }
    const p = this.perfPanel.last;
    if (p.sample !== this.perfSample) {
      this.perfSample = p.sample;
      HoloTextFactory.set(t, `FPS ${p.fps}\nDRAW ${p.calls}/${p.maxCalls}`);
    }
  }

  /** 상대 선수(또는 AI)의 바이저 헬멧과 이름표. 머리 그룹은 위치·회전만 맡고 겉모습은 자식으로 붙음 */
  private buildVRHeadAvatars() {
    this.avatars = new AvatarFactory(this.texts);
    this.p1Avatar = this.avatars.create(teamColor(1), VR_TEXT.p1);
    this.p2Avatar = this.avatars.create(teamColor(2), VR_TEXT.p2);

    this.p1Head = new THREE.Group();
    this.p1Head.add(this.p1Avatar.root);
    this.p1Head.position.set(-0.35, 1.6, 0);
    this.p1Head.visible = this.clientRole === 'SPECTATOR';
    this.scene.add(this.p1Head);

    this.p2Head = new THREE.Group();
    this.p2Head.add(this.p2Avatar.root);
    this.p2Head.position.set(0.35, 1.6, 0);
    this.p2Head.visible = true;
    this.scene.add(this.p2Head);
  }

  /** 이름표 글자 (AI가 맡은 자리는 'AI')와 보는 사람 쪽 회전 */
  private updateAvatarTags(ai: PlayerSlot | null) {
    ([1, 2] as PlayerSlot[]).forEach((slot) => {
      const head = slot === 1 ? this.p1Head : this.p2Head;
      if (!head.visible) return;
      const v = slot === 1 ? this.p1Avatar : this.p2Avatar;
      HoloTextFactory.set(v.nameTag, slot === ai ? VR_TEXT.ai : slot === 1 ? VR_TEXT.p1 : VR_TEXT.p2);
      AvatarFactory.faceCamera(v, head.quaternion, this._camQuat);
    });
  }

  /** VR 결과판: 경기가 끝나면 선수 정면(리그 기준 0, 1.6, -2.5)에 보임 */
  private buildVRPrompt() {
    this.resultPanel = new ResultPanel(this.texts);
    this.vrPromptMesh = this.resultPanel.mesh;
    this.vrPromptMesh.position.set(0, 1.6, -2.5);
    this.vrPromptMesh.visible = false; // 메뉴 UI와 겹치지 않게 경기가 끝났을 때만 보임
    this.playerRig.add(this.vrPromptMesh); // 내 정면에 보이도록 리그 기준으로 배치
  }

  /** AI가 맡은 자리 (2D 화면과 같은 규칙, 친구 대결이면 null) */
  private aiSeat(): PlayerSlot | null {
    const im = this.inputManager;
    return aiSlotOf(im.versusMode, im.isP1Connected, im.isP2Connected, this.clientRole);
  }

  /** 결과판 내용 (승자 문구는 2D 결과창과 같은 함수로 만듦) */
  private updateVRPrompt(isGameOver: boolean = false, winner?: string) {
    this.vrPromptState = { isGameOver, winner };
    if (!this.resultPanel || !isGameOver) return;
    const ai = this.aiSeat();
    let headline: string;
    let headlineColor: number;
    let winSlot: PlayerSlot | null = null;
    if (winner === 'ABORT') {
      headline = VR_TEXT.aborted;
      headlineColor = PALETTE.danger;
    } else if (winner === 'REPLACED') {
      headline = VR_TEXT.replaced;
      headlineColor = PALETTE.danger;
    } else if (winner === 'SLOT_BUSY') {
      headline = VR_TEXT.slotBusy;
      headlineColor = PALETTE.danger;
    } else {
      const w = normalizeWinner(winner, this.stats.score, this.p2Stats.score);
      headline = winnerHeadline(w, ai);
      winSlot = w === 'P1' ? 1 : w === 'P2' ? 2 : null;
      headlineColor = winSlot === 1 ? PALETTE.p1 : winSlot === 2 ? PALETTE.p2 : PALETTE.gold;
    }
    const player = (slot: PlayerSlot): ResultPlayer => {
      const st = this.statsFor(slot);
      return { name: slotName(slot, ai), score: st.score, hits: st.hits, accuracy: st.accuracy, shots: st.shotsFired, maxCombo: st.maxCombo };
    };
    this.resultPanel.show({ headline, headlineColor, winSlot, mySlot: this.localSlot, p1: player(1), p2: player(2) });
  }

  /** 듀얼 OLED 디스플레이 업데이트 (내용이 바뀐 블래스터만 다시 그림) */
  private updateBlasterDisplays() {
    this.renderOLED(this.p1Blaster, this.stats, this.p2Stats);
    this.renderOLED(this.p2Blaster, this.p2Stats, this.stats);
  }

  /**
   * 총 위 OLED: 남은 시간·내 점수·상대 점수·탄약 칸 (Half-Life: Alyx처럼 큰 숫자 위주).
   * 재장전·일시정지·VR 종료 길게 누르기일 때는 그 상태를 크게 보여 줌
   */
  private renderOLED(rig: BlasterRig, myStats: GameStats, rivalStats: GameStats) {
    const isWarning = this.isPlaying && this.roundTimer <= 10;
    const time = formatClock(this.stats.timeRemaining);
    let mode: 'exit' | 'paused' | 'reload' | 'normal' = 'normal';
    if (this.vrExitHoldTimer > 0) mode = 'exit';
    else if (this.isPlaying && this.isPaused) mode = 'paused';
    else if (myStats.isReloading) mode = 'reload';
    const exitLeft = mode === 'exit' ? (1.2 - this.vrExitHoldTimer).toFixed(1) : '';
    const reloadStep = mode === 'reload' ? Math.round(THREE.MathUtils.clamp(1 - this.reloadTimer / RELOAD_TIME, 0, 1) * 10) : 0;

    // 보이는 내용이 그대로면 캔버스 그리기와 텍스처 업로드를 건너뜀
    const key = `${mode}|${exitLeft}|${time}|${isWarning}|${myStats.score}|${rivalStats.score}|${myStats.ammo}/${myStats.maxAmmo}|${reloadStep}`;
    if (key === rig.displayKey) return;
    rig.displayKey = key;

    const ctx = rig.displayCtx;
    const { width: w, height: h } = rig.displayCanvas;
    ctx.clearRect(0, 0, w, h);

    const teamCss = cssColor(rig.primaryColor);
    const accent = isWarning ? cssColor(PALETTE.danger) : teamCss;

    // beginPath() 없이 roundRect()를 부르면 호출마다 경로가 쌓여 그리기가 점점 느려짐
    ctx.fillStyle = isWarning ? 'rgba(36, 6, 12, 0.95)' : 'rgba(5, 8, 15, 0.95)';
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, 22);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.textBaseline = 'alphabetic';

    // 아래쪽 칸 막대 (탄약 또는 재장전 진행)
    const drawCells = (lit: number, color: string) => {
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i < lit ? color : 'rgba(159, 176, 200, 0.18)';
        ctx.beginPath();
        ctx.roundRect(40 + i * 29, 200, 22, 26, 5);
        ctx.fill();
      }
    };

    if (mode === 'exit') {
      ctx.textAlign = 'center';
      ctx.fillStyle = cssColor(PALETTE.danger);
      ctx.font = `800 64px ${FONT_UI}`;
      ctx.fillText(`VR 종료 ${exitLeft}초`, w / 2, 112);
      ctx.fillStyle = cssColor(PALETTE.gold);
      ctx.font = `700 34px ${FONT_UI}`;
      ctx.fillText('버튼을 계속 누르고 있기', w / 2, 184);
    } else if (mode === 'paused') {
      ctx.textAlign = 'center';
      ctx.fillStyle = cssColor(PALETTE.gold);
      ctx.font = `800 72px ${FONT_UI}`;
      ctx.fillText('일시정지', w / 2, 116);
      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.font = `700 52px ${FONT_NUM}`;
      ctx.fillText(time, w / 2, 192);
    } else if (mode === 'reload') {
      ctx.textAlign = 'center';
      ctx.fillStyle = cssColor(PALETTE.warn);
      ctx.font = `800 72px ${FONT_UI}`;
      ctx.fillText('재장전', w / 2, 116);
      drawCells(reloadStep, '#dff6ff');
    } else {
      // 왼쪽: 남은 시간 (10초 이하이면 빨강)
      ctx.textAlign = 'left';
      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.font = `700 28px ${FONT_UI}`;
      ctx.fillText('남은 시간', 40, 56);
      ctx.fillStyle = isWarning ? cssColor(PALETTE.danger) : '#ffffff';
      ctx.font = `700 112px ${FONT_NUM}`;
      ctx.fillText(time, 34, 166);

      // 오른쪽: 내 점수(팀 색) · 상대 점수
      ctx.textAlign = 'right';
      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.font = `700 28px ${FONT_UI}`;
      ctx.fillText('내 점수', w - 40, 56);
      ctx.fillStyle = teamCss;
      ctx.font = `700 96px ${FONT_NUM}`;
      ctx.fillText(String(myStats.score), w - 40, 150);
      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.font = `700 30px ${FONT_UI}`;
      ctx.fillText(`상대 ${rivalStats.score}`, w - 40, 222);

      // 아래 왼쪽: 탄약 칸 (3발 이하이면 경고색)
      drawCells(myStats.ammo, myStats.ammo <= 3 ? cssColor(PALETTE.warn) : teamCss);
    }

    rig.displayTexture.needsUpdate = true;
  }

  // ==========================================
  // 2. 가상 공간 테마 빌드
  // ==========================================
  public setTheme(theme: ThemeType) {
    this.currentTheme = theme;
    this.arena.setTheme(theme);
    // 조명 구성과 안개 종류는 테마마다 같아 표적·효과 셰이더는 그대로지만, 혹시 바뀐 것이 있으면 미리 컴파일
    this.scheduleWarmUp(300);
  }

  // ==========================================
  // 3. 3D 표적 메쉬 생성
  // ==========================================
  public setTargetShape(shape: TargetShape) {
    this.currentShape = shape;
    this.clearAllTargets();
  }

  public setDifficulty(diff: Difficulty) {
    this.currentDifficulty = diff;
    this.cyberAI.setDifficulty(diff);
  }

  /** 웹 폰트를 불러온 뒤 캔버스 글자(표적 라벨·점수 팝업·OLED·결과판)를 다시 그림 */
  private refreshCanvasTextures() {
    this.labels.refresh();
    [this.p1Blaster, this.p2Blaster].forEach((b) => {
      if (b) b.displayKey = '';
    });
    this.updateBlasterDisplays();
    this.updateVRPrompt(this.vrPromptState.isGameOver, this.vrPromptState.winner);
  }

  /** 표적을 만들어 장면에 추가 (겉모습은 공유 지오메트리, 사격 판정은 예전 모양 그대로) */
  private addTarget(spec: {
    id: string;
    shape: TargetShape;
    keyword: TargetKeyword;
    points: number;
    basePos: THREE.Vector3;
    velocity: THREE.Vector3;
    frequency: number;
    amplitude: number;
  }): TargetObject {
    const s = this.difficultyConfigs[this.currentDifficulty].scale;
    const parts = this.drones.create(spec.shape, spec.points, spec.keyword, s);
    parts.root.position.copy(spec.basePos);
    // 등장 연출: 겉모습만 작게 시작 (판정 메시는 처음부터 원래 크기라 맞는 범위는 그대로)
    parts.visual.scale.setScalar(0.001);
    parts.label.visible = false;

    const target: TargetObject = {
      id: spec.id,
      mesh: parts.root,
      shape: spec.shape,
      keyword: spec.keyword,
      points: spec.points,
      basePos: spec.basePos,
      velocity: spec.velocity,
      frequency: spec.frequency,
      amplitude: spec.amplitude,
      timeAlive: 0,
      isHit: false,
      hitProgress: 0,
      hitMeshes: parts.hitMeshes,
      spinners: parts.spinners,
      visualSpinners: parts.visualSpinners,
      visual: parts.visual,
      labelSprite: parts.label,
      labelBase: parts.labelBase,
      labelTop: parts.labelTop,
      banks: parts.banks,
      spawnAge: 0,
      despawn: -1,
      expireAt: spec.points < 0 ? this.roundTimer - MINUS_TARGET_LIFETIME : null,
    };
    this.targetsGroup.add(parts.root);
    this.activeTargets.push(target);
    this.effects.spawnRing(spec.basePos, targetGlowColor(spec.points), s);
    return target;
  }

  private spawnTarget() {
    const id = 't_' + Math.random().toString(36).substring(2, 9);

    // 8가지 문구 중 하나를 고름. 감점 표적이 이미 최대 수만큼 있으면 점수 표적 중에서만 고름
    const minusOnField = this.activeTargets.filter((t) => t.points < 0 && !t.isHit && t.despawn < 0).length;
    const pool = minusOnField < MINUS_TARGET_MAX[this.currentDifficulty] ? TARGET_KEYWORDS : SCORING_KEYWORDS;
    const keyword = pool[Math.floor(Math.random() * pool.length)];
    const points = keywordPoints(keyword);

    const cfg = this.difficultyConfigs[this.currentDifficulty];
    const x = (Math.random() - 0.5) * 16;
    const y = 1.2 + Math.random() * 3.5;
    const z = -12 - Math.random() * 15;
    const basePos = new THREE.Vector3(x, y, z);

    const vx = (Math.random() > 0.5 ? 1 : -1) * (cfg.speed * (0.6 + Math.random() * 0.8));
    const vy = (Math.random() - 0.5) * cfg.speed * 0.5;
    const velocity = new THREE.Vector3(vx, vy, 0);
    const frequency = 1.5 + Math.random() * 2.0;
    const amplitude = 0.8 + Math.random() * 1.2;

    this.addTarget({ id, shape: this.currentShape, keyword, points, basePos, velocity, frequency, amplitude });

    // 서버 경기면 다른 선수·관람 화면에 키워드와 점수를 포함해 스폰 정보를 보냄 (로컬 경기는 공유하지 않음)
    if (this.matchId !== null) {
      this.inputManager.sendTargetSpawn({
        id,
        shape: this.currentShape,
        basePos: [x, y, z],
        velocity: [vx, vy, 0],
        frequency,
        amplitude,
        keyword,
        points,
        matchId: this.matchId,
      });
    }
  }

  private spawnTargetFromPacket(data: TargetSpawnPacket) {
    if (this.activeTargets.some((t) => t.id === data.id)) return;

    const keyword = data.keyword || TARGET_KEYWORDS[Math.floor(Math.random() * TARGET_KEYWORDS.length)];
    const points = data.points || keywordPoints(keyword);

    this.addTarget({
      id: data.id,
      shape: data.shape || this.currentShape,
      keyword,
      points,
      basePos: new THREE.Vector3(...data.basePos),
      velocity: new THREE.Vector3(...data.velocity),
      frequency: data.frequency,
      amplitude: data.amplitude,
    });
  }

  /** 표적 제거 (지오메트리·재질·텍스처는 모든 표적이 공유하므로 여기서 해제하지 않음) */
  private disposeTarget(t: TargetObject) {
    this.targetsGroup.remove(t.mesh);
  }

  private clearAllTargets() {
    this.activeTargets.forEach((t) => {
      this.disposeTarget(t);
    });
    this.activeTargets = [];
  }

  // ==========================================
  // 4. 사격, 명중 판정, 폭발 파티클
  // ==========================================
  public handleFire() {
    if (this.disposed || this.clientRole === 'SPECTATOR') return;

    if (!this.isPlaying) {
      this.startGame();
      return;
    }
    // 일시정지 중이거나 시간이 끝나 서버 판정을 기다리는 동안은 사격 불가
    if (this.isPaused || this.roundTimer <= 0) return;

    const now = performance.now();
    if (now - this.lastFireTime < 120) return;
    this.lastFireTime = now;

    const slot = this.localSlot as PlayerSlot;
    const localBlaster = this.getLocalBlaster();
    const myStats = this.statsFor(slot);

    if (myStats.isReloading) return;
    if (myStats.ammo <= 0) {
      this.soundManager.playEmpty();
      this.voiceManager.speak('AMMO_EMPTY');
      this.vibrate('empty');
      return;
    }

    myStats.ammo -= 1;
    this.recordShot(slot);
    this.soundManager.playFire();
    localBlaster.recoilOffset = 0.05;

    this.inputManager.sendFireEvent(slot);

    // 사격 판정 광선은 블래스터 원점에서 앞(-Z)으로 (예전과 같음)
    const muzzleWorldPos = new THREE.Vector3();
    const muzzleWorldQuat = new THREE.Quaternion();
    localBlaster.group.getWorldPosition(muzzleWorldPos);
    localBlaster.group.getWorldQuaternion(muzzleWorldQuat);
    const muzzleForward = new THREE.Vector3(0, 0, -1).applyQuaternion(muzzleWorldQuat).normalize();

    const playerColor = teamColor(slot);
    const hit = this.raycastTargets(muzzleWorldPos, muzzleForward);
    // 빔은 총구 끝에서 맞은 곳까지 바로 이어지고, 폭발도 같은 순간에 보임
    this.showShot(localBlaster, muzzleForward, playerColor, hit ? hit.point : null);

    if (hit) {
      // 폭발·효과음은 바로 보여주고, 점수와 명중 기록은 서버 확정(서버 경기) 또는 즉시(로컬 경기) 반영
      hit.target.isHit = true;
      this.playHitSound(hit.target.points);
      this.showHit(hit.target, hit.point, playerColor);
      this.vibrate(hit.target.points < 0 ? 'minus' : hit.target.points === 2 ? 'hitBonus' : 'hit');
      this.applyHitResult(slot, hit.target, hit.point);
    } else {
      this.vibrate('fire');
      this.recordMiss(slot);
    }

    this.notifyStats();
    this.notifyVersusStats();
  }

  /** 총구 광선과 처음 만나는 (아직 맞지 않은) 표적 - 판정 메시(예전 모양)만 검사 */
  private raycastTargets(
    origin: THREE.Vector3,
    direction: THREE.Vector3
  ): { target: TargetObject; point: THREE.Vector3; distance: number } | null {
    this.raycaster.set(origin, direction);

    let best: TargetObject | null = null;
    let bestHit: THREE.Intersection | null = null;
    for (const t of this.activeTargets) {
      if (t.isHit || t.despawn >= 0) continue;
      this.raycastHits.length = 0;
      this.raycaster.intersectObjects(t.hitMeshes, false, this.raycastHits);
      const h = this.raycastHits[0];
      if (h && (!bestHit || h.distance < bestHit.distance)) {
        best = t;
        bestHit = h;
      }
    }
    this.raycastHits.length = 0;
    if (!best || !bestHit) return null;
    return { target: best, point: bestHit.point, distance: bestHit.distance };
  }

  /**
   * 조준선(총구 → 조준 지점)과 조준점·고정 링.
   * PC 화면에서 내 총의 조준점은 2D 조준점(AimReticle)이 보여 주므로 3D 점·링은 숨김
   */
  private updateAimVisual(b: BlasterRig, isMine: boolean, inVR: boolean) {
    const v = b.visual;
    b.group.getWorldPosition(this._tempVec1);
    b.group.getWorldQuaternion(this._tempQuat1);
    this._aimDir.set(0, 0, -1).applyQuaternion(this._tempQuat1);
    const locked = this.aimProbe.probe(this._tempVec1, this._aimDir, this.activeTargets, this._aimPoint);
    b.group.localToWorld(this._muzzle.copy(MUZZLE_LOCAL));
    const u = v.aimMaterial.uniforms;
    (u.uStart.value as THREE.Vector3).copy(this._muzzle);
    (u.uEnd.value as THREE.Vector3).copy(this._aimPoint);

    const showDot = inVR || !isMine;
    v.aimDot.visible = showDot;
    v.lockRing.visible = showDot && locked;
    if (!showDot) return;
    // 거리와 상관없이 비슷한 크기로 보이게 (점 약 0.35도, 링 약 1.3도)
    const dist = Math.max(0.5, this._aimPoint.distanceTo(this._camWorld));
    v.aimDot.position.copy(this._aimPoint);
    v.aimDot.quaternion.copy(this._camQuat);
    v.aimDot.scale.setScalar(dist * (locked ? 0.004 : 0.006));
    if (locked) {
      v.lockRing.position.copy(this._aimPoint);
      v.lockRing.quaternion.copy(this._camQuat);
      v.lockRing.scale.setScalar(dist * 0.022 * (1 + 0.08 * Math.sin(this.timer.getElapsed() * 9)));
    }
  }

  /** 총구 섬광 + 히트스캔 빔 (총구 끝에서 맞은 곳, 빗나가면 먼 곳까지) */
  private showShot(blaster: BlasterRig, forward: THREE.Vector3, color: number, hitPoint: THREE.Vector3 | null) {
    blaster.group.localToWorld(this._muzzle.copy(MUZZLE_LOCAL));
    if (hitPoint) this._beamEnd.copy(hitPoint);
    else this._beamEnd.copy(this._muzzle).addScaledVector(forward, MISS_BEAM_LENGTH);
    this.effects.muzzle(this._muzzle, color);
    this.effects.beam(this._muzzle, this._beamEnd, color);
  }

  /** 명중 효과: 폭발(2점은 금색, 감점은 빨강) + 점수 팝업 */
  private showHit(target: TargetObject, point: THREE.Vector3, color: number) {
    const s = this.difficultyConfigs[this.currentDifficulty].scale;
    this.effects.burst(point, color, target.points, s);
    this.effects.popup(point, target.keyword, target.points, this.camera);
    // 명중 지점 아래 바닥에 물결 (2점은 금색으로 더 진하게, 감점은 빨강)
    const rippleColor = target.points === 2 ? PALETTE.gold : target.points < 0 ? PALETTE.danger : color;
    this.arena.ripple(point, rippleColor, target.points === 2 ? 1 : 0.75);
  }

  /** 명중음 (감점 표적은 낮은 경고음) */
  private playHitSound(points: number) {
    if (points < 0) this.soundManager.playMinus();
    else this.soundManager.playHit();
  }

  /** 총을 든 손 컨트롤러 진동 (VR 중일 때만) */
  private vibrate(pattern: HapticPattern) {
    if (!this.renderer.xr.isPresenting || !this.activeController) return;
    this.haptics.play(this.activeController.userData.inputSource as XRInputSource | undefined, pattern);
  }

  /** 명중 반영: 서버 경기는 서버 확정을 요청하고, 로컬 경기(또는 전송 실패)는 바로 기록 */
  private applyHitResult(slot: PlayerSlot, target: TargetObject, hitPoint: THREE.Vector3) {
    if (this.matchId !== null) {
      const sent = this.inputManager.sendHitRequest(
        target.id,
        slot,
        [hitPoint.x, hitPoint.y, hitPoint.z],
        this.statsFor(slot).combo + 1,
        this.matchId
      );
      if (sent) return;
    }
    this.recordHit(slot, target.points);
    if (slot === this.localSlot) {
      this.announceLocalHit(slot, target.points);
    }
  }

  public handleReload() {
    if (this.disposed || this.clientRole === 'SPECTATOR') return;
    if (!this.isPlaying) {
      // 대기/게임오버 상태에서 그립을 쥐면 VR 모드 종료 후 브라우저 복귀
      this.exitVR();
      return;
    }
    const myStats = this.clientRole === 'P2' ? this.p2Stats : this.stats;
    if (this.isPaused || myStats.isReloading) return;
    if (myStats.ammo === myStats.maxAmmo) return;

    myStats.isReloading = true;
    this.reloadTimer = RELOAD_TIME;
    this.soundManager.playReload();
    this.notifyStats();
  }

  /** 이 클라이언트가 표적 생성 권한을 가졌는지 (서버 경기: 1P 우선, 1P가 없으면 2P / 로컬 경기: 항상) */
  private isSpawnHost(): boolean {
    if (this.matchId === null) return true;
    if (this.clientRole === 'P1') return true;
    return this.clientRole === 'P2' && !this.inputManager.isP1Connected;
  }

  /** 이 클라이언트가 AI 라이벌을 직접 구동하는지 (로컬 경기, 또는 상대 슬롯이 빈 서버 경기의 플레이어) */
  private ownsAIRival(): boolean {
    if (this.matchId === null) return true;
    if (this.clientRole === 'P1') return !this.inputManager.isP2Connected;
    if (this.clientRole === 'P2') return !this.inputManager.isP1Connected;
    return false;
  }

  private isClockRunning(): boolean {
    return this.isPlaying && !this.isPaused && this.roundTimer > 0;
  }

  /** 로컬 클라이언트에서 표적을 자체 스폰해야 하는지 판정 (호스트만 생성 → 모든 화면이 같은 표적 공유) */
  public canSpawnTargetsLocally(): boolean {
    return this.isClockRunning() && this.isSpawnHost();
  }

  /** 호스트 화면이 멈춰(헤드셋 절전 등) 표적이 오지 않을 때 다른 플레이어가 대신 생성 (모든 화면에 공유됨) */
  private shouldSpawnAsBackup(): boolean {
    return (
      this.isClockRunning() &&
      this.matchId !== null &&
      this.localSlot !== null &&
      this.activeTargets.length === 0 &&
      this.timeSinceRemoteSpawn >= HOST_SILENCE_BEFORE_BACKUP
    );
  }

  /** 로컬 클라이언트에서 AI Rival 연산을 구동해야 하는지 판정 */
  public shouldRunAILocally(): boolean {
    return this.isClockRunning() && this.ownsAIRival();
  }

  // ==========================================
  // 5. 게임 루프 & 애니메이션
  // ==========================================
  private notifyStats() {
    if (this.onStatsUpdate) {
      const myStats = this.clientRole === 'P2' ? this.p2Stats : this.stats;
      this.onStatsUpdate({ ...myStats });
    }
  }

  private buildVersusStats(): VersusMatchStats {
    return {
      mode: this.inputManager.versusMode,
      timeRemaining: this.stats.timeRemaining,
      p1Score: this.stats.score,
      p1Hits: this.stats.hits,
      p1Combo: this.stats.combo,
      p1Accuracy: this.stats.accuracy,
      p1MaxCombo: this.stats.maxCombo,
      p1Shots: this.stats.shotsFired,
      p2Score: this.p2Stats.score,
      p2Hits: this.p2Stats.hits,
      p2Combo: this.p2Stats.combo,
      p2Accuracy: this.p2Stats.accuracy,
      p2MaxCombo: this.p2Stats.maxCombo,
      p2Shots: this.p2Stats.shotsFired,
      spectatorCount: this.inputManager.spectatorCount,
    };
  }

  private notifyVersusStats() {
    if (this.onVersusStatsUpdate) {
      this.onVersusStatsUpdate(this.buildVersusStats());
    }
  }

  private updateAccuracy(s: GameStats) {
    s.accuracy = s.shotsFired > 0 ? Math.min(100, Math.round((s.hits / s.shotsFired) * 100)) : 100;
  }

  private recordShot(slot: PlayerSlot) {
    const s = this.statsFor(slot);
    s.shotsFired += 1;
    this.updateAccuracy(s);
  }

  private recordMiss(slot: PlayerSlot) {
    const s = this.statsFor(slot);
    s.misses += 1;
    s.combo = 0;
    this.updateAccuracy(s);
  }

  /**
   * 명중 기록 (combo를 주면 그 값을 사용: 원격 선수는 서버가 전달한 콤보).
   * 감점 표적은 점수를 깎고 연속 명중을 끊으며, 명중 수에 넣지 않음 (그만큼 명중률도 내려감)
   */
  private recordHit(slot: PlayerSlot, points: number, combo?: number) {
    const s = this.statsFor(slot);
    s.score += points;
    if (points < 0) {
      s.combo = 0;
    } else {
      s.hits += 1;
      s.combo = combo ?? s.combo + 1;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
    }
    this.updateAccuracy(s);
  }

  private announceLocalHit(slot: PlayerSlot, points: number) {
    const combo = this.statsFor(slot).combo;
    if (points === 2 || (combo >= 5 && combo % 5 === 0)) {
      this.voiceManager.speak('COMBO_STREAK');
    }
  }

  private freshStats(): GameStats {
    return {
      score: 0,
      hits: 0,
      misses: 0,
      shotsFired: 0,
      accuracy: 100,
      combo: 0,
      maxCombo: 0,
      timeRemaining: MATCH_DURATION,
      ammo: 10,
      maxAmmo: 10,
      isReloading: false,
    };
  }

  /** 서버 경기로 진행할지: 서버에 연결돼 있고, 플레이어이거나 (관람 운영자는) 접속한 플레이어가 있을 때 */
  private shouldUseServerMatch(): boolean {
    const im = this.inputManager;
    if (!im.isConnectedToServer) return false;
    if (this.clientRole !== 'SPECTATOR') return true;
    return im.isP1Connected || im.isP2Connected;
  }

  /** 경기 시작 요청 (방아쇠, 시작 버튼, VR 진입). 서버 경기면 서버의 시작 신호에 맞춰 모두 함께 시작 */
  public startGame() {
    if (this.disposed) return;
    // 관전 화면 운영자가 시연 중에 경기를 시작하면 시연을 조용히 끝내고 실제 경기를 요청
    if (this.isPlaying && this.demoActive && this.shouldUseServerMatch()) {
      this.stopDemo();
    }
    if (this.isPlaying || this.pendingStartTimer) return;
    // 내 역할 자리를 다른 기기가 쓰는 중이면 혼자만 보이는 로컬 경기를 시작하지 않음
    if (this.inputManager.connectionIssue) return;
    if (this.shouldUseServerMatch() && this.inputManager.sendMatchStart(MATCH_DURATION, this.currentDifficulty)) {
      // 서버 응답이 없으면 로컬 경기로 대체
      this.pendingStartTimer = setTimeout(() => {
        this.pendingStartTimer = null;
        if (!this.isPlaying) this.startGameLocal(null);
      }, START_REQUEST_TIMEOUT_MS);
      return;
    }
    this.startGameLocal(null);
  }

  /**
   * 관람 화면 대기용 AI 시연 (서버 경기에 영향 없음, 실제 경기가 시작되면 자동 전환).
   * 몇 시간씩 반복되므로 소리를 내지 않음
   */
  public startLocalDemo() {
    if (this.disposed || this.isPlaying || this.pendingStartTimer) return;
    this.startGameLocal(null, true);
  }

  /** 대기용 시연을 조용히 끝냄 (결과창·소리 없음) */
  public stopDemo() {
    if (this.isPlaying && this.demoActive) {
      this.stopGameLocal('ABORT');
    }
  }

  /** 대기용 시연이 진행 중인지 */
  public get isDemoRunning(): boolean {
    return this.isPlaying && this.demoActive;
  }

  private setDemoActive(active: boolean) {
    this.demoActive = active;
    this.soundManager.setSuppressed(active);
    this.voiceManager.setSuppressed(active);
  }

  /** 경기 시작 (info가 있으면 서버 경기의 남은 시간·난이도·점수에 맞춰 합류) */
  private startGameLocal(info: MatchInfo | null, demo: boolean = false) {
    if (this.pendingStartTimer) {
      clearTimeout(this.pendingStartTimer);
      this.pendingStartTimer = null;
    }
    this.setDemoActive(demo && info === null);
    this.matchId = info ? info.matchId : null;
    if (info?.difficulty && info.difficulty !== this.currentDifficulty) {
      this.setDifficulty(info.difficulty);
      if (this.onDifficultySync) this.onDifficultySync(info.difficulty);
    }

    this.isPlaying = true;
    this.isPaused = Boolean(info?.isPaused);
    this.roundTimer = info ? info.remaining : MATCH_DURATION;
    this.matchClockEndsAt = info && !info.isPaused ? performance.now() + info.remaining * 1000 : null;
    this.matchEndWaitTimer = 0;
    this.timeSinceRemoteSpawn = 0;
    this.lastReportedSecond = -1;
    this.hasWarned10s = false;
    if (this.vrPromptMesh) {
      this.vrPromptMesh.visible = false;
    }
    this.stats = this.freshStats();
    this.p2Stats = this.freshStats();
    if (info) {
      // 도중 합류 시 지금까지의 점수 반영
      this.stats.score = info.p1Score;
      this.p2Stats.score = info.p2Score;
    }
    this.cyberAI.reset();
    this.cyberAI.setDifficulty(this.currentDifficulty);
    this.clearAllTargets();
    this.spawnTimer = 0;

    // 게임 시작 즉시 초기 표적 3개 생성 (표적 생성 권한이 있는 호스트만)
    if (this.isSpawnHost()) {
      const initialCount = Math.min(3, this.difficultyConfigs[this.currentDifficulty].maxTargets);
      for (let i = 0; i < initialCount; i++) {
        this.spawnTarget();
      }
    }

    this.notifyStats();
    this.notifyVersusStats();
    if (this.onPauseChange) this.onPauseChange(this.isPaused);
    this.scoreboard.cue('go');
    this.voiceManager.speak('GAME_START');
    if (this.onGameStarted) {
      this.onGameStarted();
    }
  }

  /** 서버의 남은 시간·일시정지 상태로 로컬 시계 보정 */
  private syncMatchClock(info: MatchInfo) {
    if (info.isPaused !== this.isPaused) {
      this.setPausedLocal(info.isPaused, info.remaining);
      return;
    }
    this.roundTimer = info.remaining;
    this.matchClockEndsAt = info.isPaused ? null : performance.now() + info.remaining * 1000;
  }

  private setPausedLocal(paused: boolean, remaining?: number) {
    this.isPaused = paused;
    if (remaining !== undefined) {
      this.roundTimer = remaining;
    }
    // 서버 경기 시계는 실제 시각 기준 (일시정지 중에는 멈춤)
    this.matchClockEndsAt = !paused && this.matchId !== null ? performance.now() + this.roundTimer * 1000 : null;
    if (this.onPauseChange) this.onPauseChange(paused);
  }

  public pauseGame() {
    if (!this.isPlaying || this.isPaused) return;
    // 서버 경기는 모든 화면이 함께 멈추도록 서버를 거침 (match_paused 수신 시 정지)
    if (this.matchId !== null && this.inputManager.sendMatchPause(this.matchId)) return;
    this.setPausedLocal(true);
  }

  public resumeGame() {
    if (!this.isPlaying || !this.isPaused) return;
    if (this.matchId !== null && this.inputManager.sendMatchResume(this.matchId)) return;
    this.setPausedLocal(false);
  }

  public abortGame(reason: string = '경기가 중단되었습니다.') {
    if (this.pendingStartTimer) {
      clearTimeout(this.pendingStartTimer);
      this.pendingStartTimer = null;
    }
    if (!this.isPlaying) return;
    if (this.matchId !== null) {
      this.inputManager.sendMatchAbort(reason, this.matchId);
    }
    this.stopGameLocal('ABORT');
  }

  public exitVR() {
    const session = this.renderer.xr.getSession();
    if (session) {
      session.end();
    }
  }

  private winnerFromScores(): 'P1' | 'P2' | 'DRAW' {
    if (this.stats.score > this.p2Stats.score) return 'P1';
    if (this.p2Stats.score > this.stats.score) return 'P2';
    return 'DRAW';
  }

  private finishWithScores(p1Score: number, p2Score: number, winner?: string) {
    this.stats.score = p1Score;
    this.p2Stats.score = p2Score;
    this.stopGameLocal(winner ?? this.winnerFromScores());
  }

  private stopGameLocal(winner: string = 'DRAW') {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.matchId !== null) {
      this.lastEndedMatchId = this.matchId;
    }
    this.matchEndWaitTimer = 0;
    this.matchClockEndsAt = null;
    this.vrExitHoldTimer = 0;
    // 남은 표적은 0.4초 동안 사라짐 (결과 화면에서 경기장이 깔끔하게)
    for (const t of this.activeTargets) {
      if (!t.isHit && t.despawn < 0) this.beginDespawn(t);
    }
    this.updateVRPrompt(true, winner);
    if (this.vrPromptMesh) {
      // VR 플레이어 정면에 결과판 표시 (다시 시작 / VR 종료 안내)
      this.vrPromptMesh.position.set(0, 1.6, -2.5);
      this.vrPromptMesh.visible = this.renderer.xr.isPresenting && this.localSlot !== null;
    }
    this.soundManager.playGameOver();

    const amWinner =
      (this.clientRole === 'P1' && winner === 'P1') ||
      (this.clientRole === 'P2' && winner === 'P2');
    const aborted = ABORT_REASONS.includes(winner);
    if (!aborted) this.scoreboard.cue('timeUp');
    if (aborted) {
      this.voiceManager.speak('GAME_OVER');
    } else if (amWinner) {
      this.voiceManager.speak('VICTORY');
      this.vibrate('victory');
    } else if (winner !== 'DRAW') {
      this.voiceManager.speak('DEFEAT');
    } else {
      this.voiceManager.speak('GAME_OVER');
    }

    this.notifyStats();
    this.notifyVersusStats();
    if (this.onPauseChange) this.onPauseChange(false);
    // 시연 중에는 위의 종료음·음성도 꺼져 있었음. 이제 다음 경기를 위해 소리를 되살림
    const wasDemo = this.demoActive;
    if (wasDemo) this.setDemoActive(false);
    if (this.onGameOver) {
      const myFinalStats = this.clientRole === 'P2' ? this.p2Stats : this.stats;
      this.onGameOver({ ...myFinalStats }, { winner, aborted, demo: wasDemo, versus: this.buildVersusStats() });
    }
  }

  /** 표적이 0.4초 동안 작아지며 사라지기 시작 (맞힌 것으로 치지 않음, 사격 판정에서도 빠짐) */
  private beginDespawn(t: TargetObject) {
    t.despawn = 0;
    t.labelSprite.visible = false;
    this.effects.poof(t.mesh.position, targetGlowColor(t.points), this.difficultyConfigs[this.currentDifficulty].scale);
  }

  /** AI 라이벌: 조준·사격하고 실제 레이캐스트로 명중 판정 (AI가 맡은 슬롯의 기록으로 집계) */
  private updateAIRival(delta: number) {
    const aiSlot = this.aiSlot;
    const rivalBlaster = aiSlot === 1 ? this.p1Blaster : this.p2Blaster;
    const rivalHead = aiSlot === 1 ? this.p1Head : this.p2Head;
    const aiAction = this.cyberAI.update(delta, this.activeTargets, rivalBlaster.group);
    // AI 헬멧 회전 동기화 (블래스터 조준 방향을 자연스럽게 추종)
    rivalHead.quaternion.slerp(rivalBlaster.group.quaternion, Math.min(1.0, delta * 12));
    if (!aiAction.fire) return;

    rivalBlaster.recoilOffset = 0.08;
    this.soundManager.playFire();
    this.recordShot(aiSlot);
    if (this.matchId !== null) {
      this.inputManager.sendFireEvent(aiSlot);
    }

    // [물리 3D 레이캐스트 판정] AI 총구 위치 및 실제 정렬 각도로 레이 발사하여 실제 교차 여부 검증
    const aiMuzzlePos = new THREE.Vector3();
    const aiMuzzleQuat = new THREE.Quaternion();
    rivalBlaster.group.getWorldPosition(aiMuzzlePos);
    rivalBlaster.group.getWorldQuaternion(aiMuzzleQuat);
    const aiForward = new THREE.Vector3(0, 0, -1).applyQuaternion(aiMuzzleQuat).normalize();
    const aiColor = teamColor(aiSlot);
    const hit = this.raycastTargets(aiMuzzlePos, aiForward);
    this.showShot(rivalBlaster, aiForward, aiColor, hit ? hit.point : null);

    if (hit) {
      hit.target.isHit = true;
      this.showHit(hit.target, hit.point, aiColor);
      this.playHitSound(hit.target.points);
      this.cyberAI.recordHit(hit.target.points);
      this.applyHitResult(aiSlot, hit.target, hit.point);
    } else {
      // 사격 조준이 표적과 일치하지 않아 빗맞힘 처리 (치팅 방지)
      this.cyberAI.recordMiss();
      this.recordMiss(aiSlot);
    }
    this.notifyVersusStats();
  }

  private animate = () => {
    this.timer.update();
    const delta = Math.min(Math.max(this.timer.getDelta(), 0), 0.1);

    // 1. 게임 타이머 관리
    if (this.isPlaying && !this.isPaused) {
      if (this.matchClockEndsAt !== null) {
        // 서버 경기: 실제 시각 기준 (프레임이 느리거나 헤드셋을 벗어 화면 갱신이 멈췄다 돌아와도 모든 화면이 같은 시간)
        this.roundTimer = (this.matchClockEndsAt - performance.now()) / 1000;
      } else {
        this.roundTimer -= delta;
      }
      const currentSec = Math.max(0, Math.ceil(this.roundTimer));
      const secondChanged = currentSec !== this.lastReportedSecond;
      this.stats.timeRemaining = currentSec;
      this.p2Stats.timeRemaining = currentSec;

      // 로컬 플레이어 재장전 카운트다운
      const myStats = this.clientRole === 'P2' ? this.p2Stats : this.stats;
      if (myStats.isReloading) {
        this.reloadTimer -= delta;
        if (this.reloadTimer <= 0) {
          myStats.isReloading = false;
          myStats.ammo = myStats.maxAmmo;
          this.voiceManager.speak('RELOAD_DONE');
          this.vibrate('reloadDone');
          this.notifyStats();
        }
      }

      // 10초 긴급 사이렌
      if (this.roundTimer <= 10 && !this.hasWarned10s && this.roundTimer > 0.5) {
        this.hasWarned10s = true;
        this.soundManager.play10sWarningSiren();
        this.voiceManager.speak('TIME_WARN_10S');
        this.vibrate('warning');
      }

      if (this.roundTimer <= 0) {
        if (this.matchId === null || !this.inputManager.isConnectedToServer) {
          // 로컬 경기: 내 집계로 판정
          this.stopGameLocal(this.winnerFromScores());
        } else {
          // 서버 경기: 서버의 종료 판정을 기다리고, 응답이 없으면 로컬 집계로 마무리
          this.matchEndWaitTimer += delta;
          if (this.matchEndWaitTimer >= SERVER_END_GRACE) {
            this.stopGameLocal(this.winnerFromScores());
          }
        }
      }

      // React 상태 업데이트 지능형 스로틀링 (초 단위 변경 또는 최대 4Hz 주기)
      // 초당 90회의 폭풍 리렌더링 및 가비지 수집(GC) 정지 현상 95% 감소
      this.statsNotifyTimer += delta;
      if (secondChanged || this.statsNotifyTimer >= 0.25) {
        this.statsNotifyTimer = 0;
        this.lastReportedSecond = currentSec;
        this.notifyStats();
        this.notifyVersusStats();
      }

      // 표적 스폰 (호스트 주도, 호스트 화면이 멈췄으면 다른 플레이어가 대신)
      this.timeSinceRemoteSpawn += delta;
      if (this.canSpawnTargetsLocally() || this.shouldSpawnAsBackup()) {
        const cfg = this.difficultyConfigs[this.currentDifficulty];
        this.spawnTimer += delta;
        if (this.spawnTimer >= cfg.spawnInterval && this.activeTargets.length < cfg.maxTargets) {
          this.spawnTimer = 0;
          this.spawnTarget();
        }
      }

      // AI Rival 봇 연산 (상대 슬롯이 비어 있을 때 자동 실행)
      if (this.shouldRunAILocally()) {
        this.updateAIRival(delta);
      }
    }

    // 2. 듀얼 OLED 디스플레이 업데이트 (10Hz 스로틀링: GPU 텍스처 업로드 대역폭 87% 절감)
    this.oledUpdateTimer += delta;
    if (this.oledUpdateTimer >= 0.1) {
      this.oledUpdateTimer = 0;
      this.updateBlasterDisplays();
    }

    // 3. 로컬 6DoF 조준 제어
    const inVR = this.renderer.xr.isPresenting;
    const localBlaster = this.getLocalBlaster();

    if (this.clientRole !== 'SPECTATOR') {
      if (inVR && this.activeController) {
        localBlaster.group.position.set(0, -0.04, -0.15);
        localBlaster.group.rotation.set(-0.25 + localBlaster.recoilOffset, 0, 0);

        // Quest 2 게임패드 버튼 폴링 (메뉴/보조 버튼 긴급 탈출 감지)
        const session = this.renderer.xr.getSession();
        if (session) {
          let exitPressed = false;
          for (const source of session.inputSources) {
            if (source.gamepad) {
              const btn4 = source.gamepad.buttons[4]?.pressed; // X (왼손) / A (오른손)
              const btn5 = source.gamepad.buttons[5]?.pressed; // Y (왼손) / B (오른손)
              if (btn4 || btn5) {
                exitPressed = true;
                break;
              }
            }
          }

          if (exitPressed) {
            if (this.isPlaying) {
              this.vrExitHoldTimer += delta;
              if (this.vrExitHoldTimer >= 1.2) {
                this.vrExitHoldTimer = 0;
                this.abortGame('플레이어 컨트롤러 긴급 탈출');
                this.exitVR();
              }
            } else {
              this.exitVR();
            }
          } else {
            this.vrExitHoldTimer = 0;
          }
        }
      } else {
        // PC 마우스 및 키보드 통합 조준 (화면 마우스 이동을 실시간으로 추종)
        const stick = this.inputManager.getStick();
        const targetPitch = this.mouseNormY * 0.45 + stick.y * 0.25;
        const targetYaw = -this.mouseNormX * 0.65 - stick.x * 0.35;
        // 보간 계수가 1을 넘으면(18fps 미만) 조준이 목표를 지나쳐 진동하므로 1로 제한
        const aimLerp = Math.min(1, delta * 18);
        this.aimPitch = THREE.MathUtils.lerp(this.aimPitch, targetPitch, aimLerp);
        this.aimYaw = THREE.MathUtils.lerp(this.aimYaw, targetYaw, aimLerp);

        if (localBlaster.group.parent !== this.playerRig) {
          // VR 종료·역할 변경 후에도 블래스터가 내 리그를 따라오도록 복귀
          this.resetLocalBlasterToDefault();
        }
        const defaultX = this.clientRole === 'P2' ? 0.35 : -0.35;
        localBlaster.group.position.set(defaultX, 1.35, -0.45);
        localBlaster.group.rotation.set(this.aimPitch + localBlaster.recoilOffset, this.aimYaw, 0);
      }

      // 6DoF 자세 20Hz 네트워크 전송 (임시 Vector3/Quaternion 재사용으로 GC 가비지 0화)
      this.poseSendTimer += delta;
      if (this.poseSendTimer >= 0.05) {
        this.poseSendTimer = 0;
        this.camera.getWorldPosition(this._tempVec1);
        this.camera.getWorldQuaternion(this._tempQuat1);

        localBlaster.group.getWorldPosition(this._tempVec2);
        localBlaster.group.getWorldQuaternion(this._tempQuat2);

        const playerId = this.clientRole === 'P2' ? 2 : 1;
        this.inputManager.sendPose({
          playerId,
          headPos: [this._tempVec1.x, this._tempVec1.y, this._tempVec1.z],
          headQuat: [this._tempQuat1.x, this._tempQuat1.y, this._tempQuat1.z, this._tempQuat1.w],
          blasterPos: [this._tempVec2.x, this._tempVec2.y, this._tempVec2.z],
          blasterQuat: [this._tempQuat2.x, this._tempQuat2.y, this._tempQuat2.z, this._tempQuat2.w],
        });

        // AI 라이벌 모드: AI를 돌리는 플레이어가 AI의 헬멧·블래스터 자세도 다른 화면에 전송
        if (this.isPlaying && this.matchId !== null && this.ownsAIRival()) {
          const aiSlot = this.aiSlot;
          const aiHead = aiSlot === 1 ? this.p1Head : this.p2Head;
          const aiBlaster = aiSlot === 1 ? this.p1Blaster : this.p2Blaster;
          aiHead.getWorldPosition(this._tempVec1);
          aiHead.getWorldQuaternion(this._tempQuat1);

          aiBlaster.group.getWorldPosition(this._tempVec2);
          aiBlaster.group.getWorldQuaternion(this._tempQuat2);

          this.inputManager.sendPose({
            playerId: aiSlot,
            headPos: [this._tempVec1.x, this._tempVec1.y, this._tempVec1.z],
            headQuat: [this._tempQuat1.x, this._tempQuat1.y, this._tempQuat1.z, this._tempQuat1.w],
            blasterPos: [this._tempVec2.x, this._tempVec2.y, this._tempVec2.z],
            blasterQuat: [this._tempQuat2.x, this._tempQuat2.y, this._tempQuat2.z, this._tempQuat2.w],
          });
        }
      }
    } else {
      // 옵저버 카메라 동작
      this.p1Head.getWorldPosition(this._tempVec1);
      this.p2Head.getWorldPosition(this._tempVec2);
      this.spectatorCam.update(delta, this._tempVec1, this._tempVec2);
    }

    // 4. 반동 회복, 탄약 칸, 조준선·조준점 (사격과 같은 광선·판정 메시로 실제 조준 지점을 계산)
    this.camera.getWorldPosition(this._camWorld);
    this.camera.getWorldQuaternion(this._camQuat);
    const mySlot = this.localSlot;
    // 상대 선수 자세는 받은 자세를 부드럽게 따라감 (이 화면의 AI가 움직이는 자리는 제외)
    ([1, 2] as PlayerSlot[]).forEach((slot) => {
      if (slot === mySlot) return;
      if (this.isPlaying && this.ownsAIRival() && slot === this.aiSlot) return;
      this.poseSmooth[slot].head.update(slot === 1 ? this.p1Head : this.p2Head, delta);
      this.poseSmooth[slot].blaster.update((slot === 1 ? this.p1Blaster : this.p2Blaster).group, delta);
    });
    const aiSeat = this.aiSeat();
    this.updateAvatarTags(aiSeat);
    ([1, 2] as PlayerSlot[]).forEach((slot) => {
      const b = slot === 1 ? this.p1Blaster : this.p2Blaster;
      if (b.recoilOffset > 0) {
        b.recoilOffset = Math.max(0, b.recoilOffset - delta * 0.4);
      }
      const isMine = slot === mySlot;
      // 내 총은 조준 각도에 반동이 들어 있고, 상대 총은 겉모습만 튀어 오름
      b.visual.root.rotation.x = isMine ? 0 : b.recoilOffset;
      const s = this.statsFor(slot);
      // 다른 선수의 탄약은 화면끼리 주고받지 않으므로 내 총만 실제 탄약을 보여 줌
      const reloadProgress = isMine && s.isReloading ? THREE.MathUtils.clamp(1 - this.reloadTimer / RELOAD_TIME, 0, 1) : null;
      BlasterFactory.setAmmo(b.visual, b.primaryColor, isMine ? s.ammo : s.maxAmmo, reloadProgress);
      this.updateAimVisual(b, isMine, inVR);
    });

    // 5. 표적 이동 및 애니메이션 (일시정지 중에는 표적·프로펠러가 멈춤)
    const frozen = this.isPlaying && this.isPaused;
    const targetDt = frozen ? 0 : delta;
    if (!frozen) this.drones.update(delta);
    for (let i = this.activeTargets.length - 1; i >= 0; i--) {
      const t = this.activeTargets[i];

      if (t.isHit) {
        t.hitProgress += delta * 4;
        const scale = Math.max(0, 1 - t.hitProgress);
        t.mesh.scale.set(scale, scale, scale);
        if (t.hitProgress >= 1) {
          this.disposeTarget(t);
          this.activeTargets.splice(i, 1);
        }
        continue;
      }

      if (t.despawn >= 0) {
        // 경기가 끝났거나 감점 표적의 시간이 다 되어 사라지는 중 (맞힌 것으로 치지 않음)
        t.despawn += delta / TARGET_DESPAWN_TIME;
        const k = Math.max(0, 1 - t.despawn);
        t.visual.scale.setScalar(Math.max(0.001, k * k));
        t.visual.rotation.y += delta * 9;
        if (t.despawn >= 1) {
          this.disposeTarget(t);
          this.activeTargets.splice(i, 1);
        }
        continue;
      }

      if (targetDt > 0) {
        // 이동·회전 계산은 예전과 같음 (모든 화면에서 같은 위치)
        t.timeAlive += targetDt;
        if (t.expireAt !== null && this.roundTimer <= t.expireAt) {
          this.beginDespawn(t);
          continue;
        }
        t.mesh.position.x = t.basePos.x + Math.sin(t.timeAlive * t.frequency) * t.amplitude;
        t.mesh.position.y = t.basePos.y + Math.cos(t.timeAlive * (t.frequency * 0.8)) * 0.4;
        if (Math.abs(t.basePos.x) > 9) {
          t.velocity.x *= -1;
        }
        t.basePos.x += t.velocity.x * targetDt;
        HitProxyFactory.spin(t.spinners, targetDt);

        // 등장 연출 (겉모습만)
        if (t.spawnAge < TARGET_SPAWN_TIME) {
          t.spawnAge = Math.min(TARGET_SPAWN_TIME, t.spawnAge + targetDt);
          t.visual.scale.setScalar(Math.max(0.001, easeOutBack(t.spawnAge / TARGET_SPAWN_TIME)));
        }
        // 드론은 옆으로 움직이는 방향으로 살짝 기울어짐
        if (t.banks) {
          const vx = t.velocity.x + t.amplitude * t.frequency * Math.cos(t.timeAlive * t.frequency);
          const bank = THREE.MathUtils.clamp(-vx * 0.05, -0.32, 0.32);
          t.visual.rotation.z += (bank - t.visual.rotation.z) * Math.min(1, targetDt * 6);
        }
      }

      // 판정 메시 회전을 따라가는 장식 (큐브·원반·구체 고리)
      for (let k = 0; k < t.visualSpinners.length; k++) {
        const v = t.visualSpinners[k];
        if (v) v.quaternion.copy(t.spinners[k].quaternion);
      }

      // 라벨: 멀리 있는 표적일수록 조금 크게 (먼 표적의 키워드도 읽히게)
      const grow = THREE.MathUtils.clamp(t.mesh.position.distanceTo(this._camWorld) / 16, 0.9, 1.7);
      const appear = t.spawnAge / TARGET_SPAWN_TIME;
      const k = grow * appear;
      t.labelSprite.visible = k > 0.05;
      t.labelSprite.scale.set(t.labelBase.x * k, t.labelBase.y * k, 1);
      t.labelSprite.position.y = t.labelTop + (t.labelBase.y * k) / 2 + 0.04;
    }

    // 6. 사격·명중 효과(빔·불꽃·파편·점수 팝업)와 경기장 배경(별 반짝임·게이트 회전·바닥 물결)
    this.effects.update(delta, this.camera);
    this.arena.update(delta);
    this.scoreboard.update(
      {
        mode: !this.isPlaying ? 'idle' : this.isPaused ? 'paused' : 'playing',
        seconds: this.roundTimer,
        p1: this.stats.score,
        p2: this.p2Stats.score,
        warning: this.isPlaying && this.roundTimer <= 10,
        label1: aiSeat === 1 ? VR_TEXT.ai : VR_TEXT.p1,
        label2: aiSeat === 2 ? VR_TEXT.ai : VR_TEXT.p2,
      },
      this.timer.getElapsed()
    );
    this.scoreboard.tick(delta);

    // 7. 렌더
    this.renderer.render(this.scene, this.camera);
    this.perfPanel?.update();
    this.updateVRPerfText(inVR);
  };

  private onPointerMove = (e: PointerEvent) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = (e.clientX / w) * 2 - 1;
    const y = -(e.clientY / h) * 2 + 1;
    this.mouseNormX = THREE.MathUtils.clamp(x, -1, 1);
    this.mouseNormY = THREE.MathUtils.clamp(y, -1, 1);
  };

  private onCanvasPointerDown = (e: PointerEvent) => {
    if (e.button === 0) {
      this.handleFire();
    } else if (e.button === 2) {
      this.handleReload();
    }
  };

  private onWindowResize = () => {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  public setSoundPreset(preset: SoundPresetType) {
    this.soundManager.setPreset(preset);
  }

  public setMasterVolume(vol: number) {
    this.soundManager.setMasterVolume(vol);
  }

  public setSpectatorCameraMode(mode: SpectatorCameraMode) {
    this.spectatorCam.setMode(mode);
  }

  public setRole(role: ClientRole, notifyServer: boolean = false) {
    const changed = role !== this.clientRole;
    // 관전 시연 중에 플레이어로 바뀌면 시연을 끝냄 (시연 AI와 섞이지 않게)
    if (changed && this.demoActive) this.stopDemo();
    this.clientRole = role;
    if (notifyServer) {
      this.inputManager.setRequestedRole(role);
    }
    if (changed) {
      this.applyRoleLayout();
    }
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * PC 조준점의 화면 위치: 총구 광선이 처음 닿는 표적(없으면 30m 앞)을 화면 좌표로 바꿈.
   * 사격 판정(handleFire)과 같은 광선·같은 표적 메시를 써서 보이는 곳 = 맞는 곳.
   * 관전 화면이거나 VR 중이면 false
   */
  public getAimScreenPoint(out: AimScreenPoint): boolean {
    if (this.localSlot === null || this.renderer.xr.isPresenting) return false;
    const blaster = this.getLocalBlaster();
    blaster.group.getWorldPosition(this.aimOrigin);
    blaster.group.getWorldQuaternion(this.aimQuat);
    this.aimDir.set(0, 0, -1).applyQuaternion(this.aimQuat).normalize();
    this.aimRaycaster.set(this.aimOrigin, this.aimDir);

    let best: TargetObject | null = null;
    let bestDistance = Infinity;
    for (const t of this.activeTargets) {
      if (t.isHit || t.despawn >= 0) continue;
      this.aimHits.length = 0;
      this.aimRaycaster.intersectObjects(t.hitMeshes, false, this.aimHits);
      const hit = this.aimHits[0];
      if (hit && hit.distance < bestDistance) {
        bestDistance = hit.distance;
        best = t;
        this.aimPoint.copy(hit.point);
      }
    }
    this.aimHits.length = 0;
    if (!best) {
      this.aimPoint.copy(this.aimOrigin).addScaledVector(this.aimDir, 30);
    }

    this.aimPoint.project(this.camera);
    if (this.aimPoint.z > 1) return false;
    out.x = (this.aimPoint.x + 1) * 0.5 * this.container.clientWidth;
    out.y = (1 - this.aimPoint.y) * 0.5 * this.container.clientHeight;
    out.locked = best !== null;
    out.points = best ? best.points : 0;
    return true;
  }

  public dispose() {
    this.disposed = true;
    // VR: 엔진 리스너를 먼저 떼고(세션 종료가 경기 중단을 보내지 않게) 진행 중인 세션을 끝냄
    // (three의 WebXRManager.dispose는 세션을 끝내지 않음)
    this.renderer.xr.removeEventListener('sessionstart', this.onXRSessionStart);
    this.renderer.xr.removeEventListener('sessionend', this.onXRSessionEnd);
    this.renderer.xr.getSession()?.end().catch(() => {});
    if (this.vrButtonTimer) {
      clearTimeout(this.vrButtonTimer);
      this.vrButtonTimer = null;
    }
    this.detachCallbacks();
    if (this.warmUpTimer) clearTimeout(this.warmUpTimer);
    // 소리 관리자는 앱 전체가 함께 쓰므로 시연 중 꺼 둔 소리를 되살려 둠
    this.setDemoActive(false);
    if (this.pendingStartTimer) {
      clearTimeout(this.pendingStartTimer);
      this.pendingStartTimer = null;
    }
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    if (this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('pointerdown', this.onCanvasPointerDown);
    }

    // 1~4. 표적·효과와 공유 지오메트리·재질·라벨 텍스처 해제
    this.clearAllTargets();
    this.effects.dispose();
    this.drones.dispose();
    this.labels.dispose();
    this.haptics.dispose();

    // 5. 블래스터 (겉모습·OLED·조준 표시의 지오메트리·재질·텍스처는 공장이 한꺼번에 해제)
    [this.p1Blaster, this.p2Blaster].forEach((b) => {
      if (!b) return;
      b.group.removeFromParent();
      b.visual.aimBeam.removeFromParent();
      b.visual.aimDot.removeFromParent();
      b.visual.lockRing.removeFromParent();
    });
    this.blasterFactory.dispose();
    this.avatars.dispose();

    // 6. 결과판·점수판과 경기장 배경 해제
    this.resultPanel.dispose();
    this.scoreboard.dispose();
    this.arena.dispose();
    this.texts.dispose();

    if (this.vrButtonElement && this.vrButtonElement.parentNode) {
      this.vrButtonElement.parentNode.removeChild(this.vrButtonElement);
    }
    this.perfPanel?.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
    // 가비지 수집을 기다리지 않고 WebGL 메모리(화면 크기 버퍼 포함)를 바로 돌려줌
    this.renderer.forceContextLoss();
    this.timer.dispose();
  }

  /**
   * 버린 엔진이 화면·서버를 움직이지 않도록 등록한 콜백을 비움.
   * 소켓은 끊지 않음: InputManager는 앱 전체가 함께 쓰는 싱글턴이고, 개발 모드에서 엔진을 다시 만들 때도 연결 하나를 그대로 씀
   */
  private detachCallbacks() {
    const im = this.inputManager;
    im.onFireCallback = undefined;
    im.onReloadCallback = undefined;
    im.onClientAssigned = undefined;
    im.onRoomStateChange = undefined;
    im.onRemotePose = undefined;
    im.onRemoteFire = undefined;
    im.onRemoteTargetSpawn = undefined;
    im.onTargetHitConfirmed = undefined;
    im.onMatchStarted = undefined;
    im.onMatchState = undefined;
    im.onMatchOverBroadcast = undefined;
    im.onMatchAborted = undefined;
    im.onMatchPaused = undefined;
    im.onMatchResumed = undefined;
    im.onMatchClock = undefined;
    im.onConnectionIssue = undefined;
    this.onStatsUpdate = undefined;
    this.onVersusStatsUpdate = undefined;
    this.onGameOver = undefined;
    this.onGameStarted = undefined;
    this.onPauseChange = undefined;
    this.onDifficultySync = undefined;
  }
}

/** 살짝 지나쳤다 돌아오는 등장 곡선 (0→1) */
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
