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
import { PALETTE, teamColor, cssColor, cssRgba } from './visual/palette';
import { configureRenderer, requestTargetFrameRate, asCanvasTexture } from './visual/renderSetup';
import { FONT_UI, FONT_NUM, loadCanvasFonts } from './visual/fonts';
import { DroneFactory, targetGlowColor } from './visual/DroneFactory';
import { HitProxyFactory } from './visual/hitProxies';
import { EffectsSystem } from './visual/EffectsSystem';
import { TargetLabels } from './visual/TargetLabels';
import { Haptics, HapticPattern } from './visual/Haptics';
import { ArenaEnvironment } from './visual/ArenaEnvironment';
import { detectQuality, QualitySettings } from './visual/quality';

export const TARGET_KEYWORDS: TargetKeyword[] = ['정보', '통신', '제어', '회로', '인공', '전자'];

/** 키워드 배점: 정보·통신 2점, 나머지 1점 */
const keywordPoints = (keyword: TargetKeyword): number => (keyword === '정보' || keyword === '통신' ? 2 : 1);

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
/** 빗나간 사격의 빔 길이(m) */
const MISS_BEAM_LENGTH = 55;

export interface TargetObject extends TargetObjectRef {
  id: string;
  mesh: THREE.Group;
  shape: TargetShape;
  keyword: TargetKeyword;
  points: number; // 정보/통신: 2점, 나머지: 1점
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
  group: THREE.Group;
  displayMesh: THREE.Mesh;
  displayTexture: THREE.CanvasTexture;
  displayCanvas: HTMLCanvasElement;
  displayCtx: CanvasRenderingContext2D;
  laserBeam: THREE.Line;
  laserDot: THREE.Mesh;
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
  private clock: THREE.Clock;

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

  // 표적·효과 (모양·재질·텍스처를 한 번만 만들어 모든 표적이 공유: Quest 2 VRAM 누수 방지)
  private labels!: TargetLabels;
  private drones!: DroneFactory;
  private effects!: EffectsSystem;
  private haptics = new Haptics();
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

  constructor(container: HTMLElement, initialTheme: ThemeType = 'cyber') {
    this.container = container;
    this.currentTheme = initialTheme;
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();

    // 1. 카메라 설정
    this.camera = new THREE.PerspectiveCamera(
      75,
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

    this.renderer.xr.addEventListener('sessionstart', () => {
      requestTargetFrameRate(this.renderer.xr.getSession());
      this.startGame();
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      if (this.isPlaying) {
        this.abortGame('플레이어 VR 세션 종료');
      }
    });

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

    // 7. Three.js 공식 WebXR VRButton: 화면에는 숨기고 메뉴·HUD의 'VR 시작' 버튼이 대신 눌러 줌
    //    (VR 세션 요청과 Quest 브라우저의 자동 VR 제안(offerSession)은 그대로 동작)
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

    if (PerfPanel.isEnabled()) {
      this.perfPanel = new PerfPanel(this.renderer);
    }

    // 8. 렌더 루프 시작. 첫 화면·접속 처리를 막지 않도록 잠시 뒤 셰이더를 미리 컴파일
    this.renderer.setAnimationLoop(this.animate);
    this.scheduleWarmUp(800);
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
      const head = slot === 1 ? this.p1Head : this.p2Head;
      const blaster = slot === 1 ? this.p1Blaster : this.p2Blaster;
      head.position.set(...pose.headPos);
      head.quaternion.set(...pose.headQuat);
      blaster.group.position.set(...pose.blasterPos);
      blaster.group.quaternion.set(...pose.blasterQuat);
      if (blaster.recoilOffset > 0) {
        blaster.group.rotateX(-blaster.recoilOffset);
      }
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
        this.soundManager.playHit();
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
    this.playerRig.position.set(local === 1 ? -SLOT_OFFSET_X : local === 2 ? SLOT_OFFSET_X : 0, 0, 0);
    if (local !== null) {
      // 관람 카메라가 옮겨 둔 시점을 플레이어 1인칭 시점으로 되돌림
      this.camera.position.set(0, 1.6, 0);
      this.camera.rotation.set(0, 0, 0);
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
    const weaponBodyMat = new THREE.MeshStandardMaterial({
      color: 0x151b26,
      roughness: 0.3,
      metalness: 0.8,
    });
    const neonMat = new THREE.MeshBasicMaterial({ color: primaryColor });

    // 메인 바디
    const bodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.35);
    const body = new THREE.Mesh(bodyGeo, weaponBodyMat);
    body.position.set(0, 0, -0.1);
    group.add(body);

    // 총열
    const barrelGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.25, 16);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, weaponBodyMat);
    barrel.position.set(0, 0.02, -0.35);
    group.add(barrel);

    // 총구 팁
    const tipGeo = new THREE.TorusGeometry(0.032, 0.008, 8, 24);
    const tip = new THREE.Mesh(tipGeo, neonMat);
    tip.position.set(0, 0.02, -0.48);
    group.add(tip);

    // 에너지 코어
    const coreGeo = new THREE.BoxGeometry(0.06, 0.04, 0.16);
    const core = new THREE.Mesh(coreGeo, neonMat);
    core.position.set(0, 0.07, -0.12);
    group.add(core);

    // 손잡이
    const gripGeo = new THREE.BoxGeometry(0.06, 0.16, 0.08);
    gripGeo.rotateX(-0.3);
    const grip = new THREE.Mesh(gripGeo, weaponBodyMat);
    grip.position.set(0, -0.1, 0.0);
    group.add(grip);

    // 실시간 레이저 조준선
    const points = [new THREE.Vector3(0, 0.02, -0.48), new THREE.Vector3(0, 0.02, -40)];
    const beamGeo = new THREE.BufferGeometry().setFromPoints(points);
    const beamMat = new THREE.LineBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.65,
      linewidth: 2,
    });
    const laserBeam = new THREE.Line(beamGeo, beamMat);
    group.add(laserBeam);

    // 착탄점 레이저 도트
    const dotGeo = new THREE.RingGeometry(0.08, 0.12, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const laserDot = new THREE.Mesh(dotGeo, dotMat);
    laserDot.position.set(0, 0, -40);
    this.scene.add(laserDot);

    // 블래스터 상단 스마트 OLED 디스플레이
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const texture = asCanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(0.1, 0.05);
    // 화면 글자는 그린 색 그대로 보이도록 tone mapping 제외
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const displayMesh = new THREE.Mesh(geo, mat);
    displayMesh.position.set(0, 0.09, -0.04);
    displayMesh.rotation.set(-0.35, 0, 0); // Y축 반전 없이 앞면 정렬
    group.add(displayMesh);

    return {
      group,
      displayMesh,
      displayTexture: texture,
      displayCanvas: canvas,
      displayCtx: ctx,
      laserBeam,
      laserDot,
      recoilOffset: 0,
      primaryColor,
      nameTag,
      displayKey: '',
    };
  }

  /** 원격 플레이어용 3D VR 바이저 헤드 아바타 구축 */
  private buildVRHeadAvatars() {
    this.p1Head = this.createVRHeadMesh(teamColor(1), 'P1: CYAN');
    this.p1Head.position.set(-0.35, 1.6, 0);
    this.p1Head.visible = this.clientRole === 'SPECTATOR';
    this.scene.add(this.p1Head);

    this.p2Head = this.createVRHeadMesh(teamColor(2), 'P2: MAGENTA');
    this.p2Head.position.set(0.35, 1.6, 0);
    this.p2Head.visible = true;
    this.scene.add(this.p2Head);
  }

  private createVRHeadMesh(neonColor: number, _label: string): THREE.Group {
    const headGroup = new THREE.Group();

    // 헬멧 베이스
    const helmetGeo = new THREE.BoxGeometry(0.24, 0.2, 0.24);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x111622,
      roughness: 0.4,
      metalness: 0.8,
    });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    headGroup.add(helmet);

    // 전면 네온 바이저
    const visorGeo = new THREE.BoxGeometry(0.22, 0.09, 0.06);
    const visorMat = new THREE.MeshBasicMaterial({ color: neonColor });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.01, -0.11);
    headGroup.add(visor);

    return headGroup;
  }

  /** VR 공간 3D 안내 및 결과(Debrief) 홀로그램 패널 */
  private buildVRPrompt() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    const ctx = canvas.getContext('2d')!;

    this.drawPromptContent(ctx, canvas.width, canvas.height, false);

    const texture = asCanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(2.6, 1.62);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    this.vrPromptMesh = new THREE.Mesh(geo, mat);
    this.vrPromptMesh.position.set(0, 1.6, -2.5);
    this.vrPromptMesh.visible = false; // 메뉴 UI와의 중복 겹침 방지 (게임 종료 시 결과판으로만 활성화)
    this.playerRig.add(this.vrPromptMesh); // 내 정면에 보이도록 리그 기준으로 배치
  }

  private drawPromptContent(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    isGameOver: boolean,
    winner?: string
  ) {
    ctx.clearRect(0, 0, w, h);

    if (isGameOver) {
      // 1. 라운드 종료 1:1 대결 결과판
      // roundRect는 현재 경로에 누적되므로 도형마다 beginPath()로 새 경로를 시작
      ctx.fillStyle = 'rgba(7, 10, 20, 0.94)';
      ctx.beginPath();
      ctx.roundRect(10, 10, w - 20, h - 20, 28);
      ctx.fill();
      ctx.strokeStyle = cssColor(PALETTE.p1);
      ctx.lineWidth = 6;
      ctx.stroke();

      // 상단 타이틀
      ctx.fillStyle = cssColor(PALETTE.gold);
      ctx.font = `700 34px ${FONT_NUM}`;
      ctx.textAlign = 'center';
      ctx.fillText('1:1 VERSUS ARENA DEBRIEF', w / 2, 65);

      // 승자 발표 배너
      let winText = '🤝 DRAW MATCH!';
      if (winner === 'ABORT') {
        winText = '🛑 MATCH ABORTED (경기 중단)';
      } else if (winner === 'REPLACED') {
        winText = '🔌 연결 해제: 같은 역할로 새로 접속됨';
      } else if (winner === 'SLOT_BUSY') {
        winText = '⏳ 내 자리를 다른 기기가 사용 중';
      } else if (winner === 'P1') {
        winText = '🏆 PLAYER 1 (CYAN) WINS!';
      } else if (winner === 'P2') {
        winText = '🏆 PLAYER 2 (MAGENTA) WINS!';
      }
      const winColor = ABORT_REASONS.includes(winner ?? '')
        ? PALETTE.danger
        : winner === 'P1'
          ? PALETTE.p1
          : winner === 'P2'
            ? PALETTE.p2
            : PALETTE.fg;
      ctx.fillStyle = cssColor(winColor);
      ctx.font = `800 46px ${FONT_UI}`;
      ctx.fillText(winText, w / 2, 130);

      // 좌측 P1 스탯 박스
      ctx.fillStyle = cssRgba(PALETTE.p1, 0.12);
      ctx.beginPath();
      ctx.roundRect(40, 160, 440, 380, 20);
      ctx.fill();
      ctx.strokeStyle = cssColor(PALETTE.p1);
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = cssColor(PALETTE.p1);
      ctx.font = `800 36px ${FONT_UI}`;
      ctx.fillText('플레이어 1 (시안)', 260, 215);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 56px ${FONT_NUM}`;
      ctx.fillText(`${this.stats.score.toLocaleString()} PTS`, 260, 285);

      ctx.font = `500 24px ${FONT_UI}`;
      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.fillText(`명중: ${this.stats.hits}회 / 명중률: ${this.stats.accuracy}%`, 260, 360);
      ctx.fillText(`최대 콤보: ${this.stats.maxCombo}x`, 260, 410);

      // 우측 P2 스탯 박스
      ctx.fillStyle = cssRgba(PALETTE.p2, 0.12);
      ctx.beginPath();
      ctx.roundRect(540, 160, 440, 380, 20);
      ctx.fill();
      ctx.strokeStyle = cssColor(PALETTE.p2);
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = cssColor(PALETTE.p2);
      ctx.font = `800 36px ${FONT_UI}`;
      const p2Title = this.inputManager.isP2Connected ? '플레이어 2 (마젠타)' : '사이버 AI 라이벌';
      ctx.fillText(p2Title, 760, 215);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 56px ${FONT_NUM}`;
      ctx.fillText(`${this.p2Stats.score.toLocaleString()} PTS`, 760, 285);

      ctx.font = `500 24px ${FONT_UI}`;
      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.fillText(`명중: ${this.p2Stats.hits}회 / 명중률: ${this.p2Stats.accuracy}%`, 760, 360);
      ctx.fillText(`최대 콤보: ${this.p2Stats.maxCombo}x`, 760, 410);

      // 하단 안내: 2대 명확한 선택지 제공
      ctx.fillStyle = cssColor(PALETTE.ok);
      ctx.font = `700 24px ${FONT_UI}`;
      ctx.fillText('🔫 [트리거 방아쇠] : VR 모드 유지하고 다시 시작', w / 2, 570);

      ctx.fillStyle = cssColor(PALETTE.warn);
      ctx.font = `700 22px ${FONT_UI}`;
      ctx.fillText('🚪 [그립 / 메뉴 버튼] : VR 종료하고 웹 메인 화면 복귀', w / 2, 615);
    } else {
      // 2. 대기 상태 안내판 (1px 투명 HUD 스타일)
      ctx.fillStyle = 'rgba(4, 9, 20, 0.45)';
      ctx.beginPath();
      ctx.roundRect(10, 10, w - 20, h - 20, 4);
      ctx.fill();
      ctx.strokeStyle = cssRgba(PALETTE.p1, 0.35);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 코너 테크 마커 틱
      ctx.strokeStyle = cssColor(PALETTE.p1);
      ctx.lineWidth = 2;
      const tick = 16;
      ctx.beginPath();
      ctx.moveTo(10, 10 + tick); ctx.lineTo(10, 10); ctx.lineTo(10 + tick, 10);
      ctx.moveTo(w - 10 - tick, 10); ctx.lineTo(w - 10, 10); ctx.lineTo(w - 10, 10 + tick);
      ctx.moveTo(10, h - 10 - tick); ctx.lineTo(10, h - 10); ctx.lineTo(10 + tick, h - 10);
      ctx.moveTo(w - 10 - tick, h - 10); ctx.lineTo(w - 10, h - 10); ctx.lineTo(w - 10, h - 10 - tick);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = cssColor(PALETTE.p1);
      ctx.font = `700 26px ${FONT_UI}`;
      ctx.fillText('// 경기장 출격 대기 // 1:1 사격 매트릭스', w / 2, 90);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 52px ${FONT_NUM}`;
      ctx.fillText('CYBER STRIKE ARENA', w / 2, 170);

      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.font = `500 22px ${FONT_UI}`;
      ctx.fillText('Quest 2 터치: 트리거 [발사] | 그립 [재장전]', w / 2, 250);

      const vsModeText = this.inputManager.isP2Connected
        ? '상태: 2P 플레이어 온라인 // PVP 대결 준비 완료'
        : '상태: 2P 미접속 // AI 라이벌 봇 대결 가동';
      ctx.fillStyle = cssColor(this.inputManager.isP2Connected ? PALETTE.ok : PALETTE.p1);
      ctx.font = `700 24px ${FONT_UI}`;
      ctx.fillText(vsModeText, w / 2, 340);

      ctx.fillStyle = cssColor(PALETTE.p1);
      ctx.font = `700 26px ${FONT_UI}`;
      ctx.fillText('🔫 [트리거] : 경기 출격  |  🚪 [그립/메뉴] : VR 종료', w / 2, 470);
    }
  }

  private updateVRPrompt(isGameOver: boolean = false, winner?: string) {
    this.vrPromptState = { isGameOver, winner };
    if (!this.vrPromptMesh) return;
    const mat = this.vrPromptMesh.material as THREE.MeshBasicMaterial;
    const texture = mat.map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    this.drawPromptContent(ctx, canvas.width, canvas.height, isGameOver, winner);
    texture.needsUpdate = true;
  }

  /** 듀얼 OLED 디스플레이 업데이트 (내용이 바뀐 블래스터만 다시 그림) */
  private updateBlasterDisplays() {
    this.renderOLED(this.p1Blaster, this.stats, this.p2Stats, 1);
    this.renderOLED(this.p2Blaster, this.p2Stats, this.stats, 2);
  }

  private renderOLED(
    rig: BlasterRig,
    myStats: GameStats,
    rivalStats: GameStats,
    playerId: PlayerSlot
  ) {
    const isWarning = this.isPlaying && this.roundTimer <= 10;
    const time = String(this.stats.timeRemaining).padStart(2, '0');
    let mode: 'exit' | 'paused' | 'reload' | 'normal' = 'normal';
    if (this.vrExitHoldTimer > 0) mode = 'exit';
    else if (this.isPlaying && this.isPaused) mode = 'paused';
    else if (myStats.isReloading) mode = 'reload';
    const exitLeft = mode === 'exit' ? (1.2 - this.vrExitHoldTimer).toFixed(1) : '';

    // 보이는 내용이 그대로면 캔버스 그리기와 텍스처 업로드를 건너뜀
    const key = `${mode}|${exitLeft}|${time}|${isWarning}|${myStats.score}|${rivalStats.score}|${myStats.ammo}/${myStats.maxAmmo}`;
    if (key === rig.displayKey) return;
    rig.displayKey = key;

    const ctx = rig.displayCtx;
    const canvas = rig.displayCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const teamCss = cssColor(rig.primaryColor);
    const borderColor = isWarning ? cssColor(PALETTE.danger) : teamCss;

    // beginPath() 없이 roundRect()를 부르면 호출마다 경로가 쌓여 그리기가 점점 느려짐
    ctx.fillStyle = isWarning ? 'rgba(40, 8, 14, 0.88)' : 'rgba(7, 11, 20, 0.88)';
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 12);
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = 'center';

    if (mode === 'exit') {
      ctx.fillStyle = cssColor(PALETTE.danger);
      ctx.font = `700 46px ${FONT_NUM}`;
      ctx.fillText(`EXIT ${exitLeft}s`, canvas.width / 2, 105);
      ctx.fillStyle = cssColor(PALETTE.gold);
      ctx.font = `600 28px ${FONT_NUM}`;
      ctx.fillText('KEEP HOLDING TO QUIT', canvas.width / 2, 185);
    } else if (mode === 'paused') {
      ctx.fillStyle = cssColor(PALETTE.gold);
      ctx.font = `700 54px ${FONT_NUM}`;
      ctx.fillText('PAUSED', canvas.width / 2, 110);
      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.font = `700 38px ${FONT_NUM}`;
      ctx.fillText(`TIME ${time}s`, canvas.width / 2, 190);
    } else if (mode === 'reload') {
      ctx.fillStyle = cssColor(PALETTE.warn);
      ctx.font = `700 50px ${FONT_NUM}`;
      ctx.fillText('RELOADING', canvas.width / 2, 110);
      ctx.fillStyle = cssColor(PALETTE.fg2);
      ctx.font = `700 38px ${FONT_NUM}`;
      ctx.fillText(`TIME ${time}s`, canvas.width / 2, 190);
    } else {
      // 상단: 내 점수 vs 상대방 점수
      ctx.fillStyle = borderColor;
      ctx.font = `700 46px ${FONT_NUM}`;
      ctx.fillText(`P${playerId} ${myStats.score.toLocaleString()}`, canvas.width * 0.3, 92);

      ctx.fillStyle = cssColor(PALETTE.ai);
      ctx.font = `700 46px ${FONT_NUM}`;
      ctx.fillText(`RIVAL ${rivalStats.score.toLocaleString()}`, canvas.width * 0.72, 92);

      // 하단: 탄약 및 시간
      ctx.fillStyle = myStats.ammo <= 2 ? cssColor(PALETTE.danger) : teamCss;
      ctx.font = `700 40px ${FONT_NUM}`;
      ctx.fillText(`AMMO ${myStats.ammo}/${myStats.maxAmmo}  ·  TIME ${time}s`, canvas.width / 2, 188);
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
    };
    this.targetsGroup.add(parts.root);
    this.activeTargets.push(target);
    this.effects.spawnRing(spec.basePos, targetGlowColor(spec.points), s);
    return target;
  }

  private spawnTarget() {
    const id = 't_' + Math.random().toString(36).substring(2, 9);

    // 6가지 문구 랜덤 배정 ('정보', '통신', '제어', '회로', '인공', '전자')
    const keyword = TARGET_KEYWORDS[Math.floor(Math.random() * TARGET_KEYWORDS.length)];
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
    if (this.clientRole === 'SPECTATOR') return;

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
      this.soundManager.playHit();
      this.showHit(hit.target, hit.point, playerColor);
      this.vibrate(hit.target.points === 2 ? 'hitBonus' : 'hit');
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

  /** 총구 섬광 + 히트스캔 빔 (총구 끝에서 맞은 곳, 빗나가면 먼 곳까지) */
  private showShot(blaster: BlasterRig, forward: THREE.Vector3, color: number, hitPoint: THREE.Vector3 | null) {
    blaster.group.localToWorld(this._muzzle.copy(MUZZLE_LOCAL));
    if (hitPoint) this._beamEnd.copy(hitPoint);
    else this._beamEnd.copy(this._muzzle).addScaledVector(forward, MISS_BEAM_LENGTH);
    this.effects.muzzle(this._muzzle, color);
    this.effects.beam(this._muzzle, this._beamEnd, color);
  }

  /** 명중 효과: 폭발(2점은 금색) + 점수 팝업 */
  private showHit(target: TargetObject, point: THREE.Vector3, color: number) {
    const s = this.difficultyConfigs[this.currentDifficulty].scale;
    this.effects.burst(point, color, target.points, s);
    this.effects.popup(point, target.keyword, target.points, this.camera);
    // 명중 지점 아래 바닥에 물결 (2점은 금색으로 더 진하게)
    this.arena.ripple(point, target.points === 2 ? PALETTE.gold : color, target.points === 2 ? 1 : 0.75);
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
    if (this.clientRole === 'SPECTATOR') return;
    if (!this.isPlaying) {
      // 대기/게임오버 상태에서 그립을 쥐면 VR 모드 종료 후 브라우저 복귀
      this.exitVR();
      return;
    }
    const myStats = this.clientRole === 'P2' ? this.p2Stats : this.stats;
    if (this.isPaused || myStats.isReloading) return;
    if (myStats.ammo === myStats.maxAmmo) return;

    myStats.isReloading = true;
    this.reloadTimer = 1.2;
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
      p2Score: this.p2Stats.score,
      p2Hits: this.p2Stats.hits,
      p2Combo: this.p2Stats.combo,
      p2Accuracy: this.p2Stats.accuracy,
      p2MaxCombo: this.p2Stats.maxCombo,
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

  /** 명중 기록 (combo를 주면 그 값을 사용: 원격 선수는 서버가 전달한 콤보) */
  private recordHit(slot: PlayerSlot, points: number, combo?: number) {
    const s = this.statsFor(slot);
    s.hits += 1;
    s.combo = combo ?? s.combo + 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.score += points;
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
    if (this.isPlaying || this.pendingStartTimer) return;
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
    const scale = this.difficultyConfigs[this.currentDifficulty].scale;
    for (const t of this.activeTargets) {
      if (!t.isHit && t.despawn < 0) {
        t.despawn = 0;
        t.labelSprite.visible = false;
        this.effects.poof(t.mesh.position, targetGlowColor(t.points), scale);
      }
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
      this.soundManager.playHit();
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
    const delta = Math.min(this.clock.getDelta(), 0.1);

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

    // 4. 반동 회복
    [this.p1Blaster, this.p2Blaster].forEach((b) => {
      if (b.recoilOffset > 0) {
        b.recoilOffset = Math.max(0, b.recoilOffset - delta * 0.4);
      }

      // 착탄점 레이저 도트 추적 (임시 벡터 재사용)
      b.group.getWorldPosition(this._tempVec1);
      b.group.getWorldQuaternion(this._tempQuat1);
      this._tempVec2.set(0, 0, -1).applyQuaternion(this._tempQuat1).normalize();
      b.laserDot.position.copy(this._tempVec1).addScaledVector(this._tempVec2, 30);
      b.laserDot.lookAt(this._tempVec1);
    });

    // 5. 표적 이동 및 애니메이션 (일시정지 중에는 표적·프로펠러가 멈춤)
    const frozen = this.isPlaying && this.isPaused;
    const targetDt = frozen ? 0 : delta;
    if (!frozen) this.drones.update(delta);
    this.camera.getWorldPosition(this._camWorld);
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
        // 경기가 끝나 사라지는 중 (맞힌 것으로 치지 않음)
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

    // 7. 렌더
    this.renderer.render(this.scene, this.camera);
    this.perfPanel?.update();
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

    // 5. 블래스터 텍스처 및 지오메트리 해제
    [this.p1Blaster, this.p2Blaster].forEach((b) => {
      if (b) {
        b.displayTexture.dispose();
        b.group.traverse((c) => {
          if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
            c.geometry.dispose();
            if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
            else c.material.dispose();
          }
        });
        // 착탄점 도트는 블래스터가 아니라 장면에 붙어 있어 따로 정리
        this.scene.remove(b.laserDot);
        b.laserDot.geometry.dispose();
        (b.laserDot.material as THREE.Material).dispose();
      }
    });

    // 6. 결과판 텍스처와 환경맵 해제
    if (this.vrPromptMesh) {
      const promptMat = this.vrPromptMesh.material as THREE.MeshBasicMaterial;
      promptMat.map?.dispose();
      promptMat.dispose();
      this.vrPromptMesh.geometry.dispose();
    }
    this.arena.dispose();

    if (this.vrButtonElement && this.vrButtonElement.parentNode) {
      this.vrButtonElement.parentNode.removeChild(this.vrButtonElement);
    }
    this.perfPanel?.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}

/** 살짝 지나쳤다 돌아오는 등장 곡선 (0→1) */
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
