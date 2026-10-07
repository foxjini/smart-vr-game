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

export const TARGET_KEYWORDS: TargetKeyword[] = ['정보', '통신', '제어', '회로', '인공', '전자'];

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
  subMeshesToRotate?: THREE.Mesh[];
  labelSprite?: THREE.Sprite;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLife: number;
}

interface LaserBolt {
  mesh: THREE.Group;
  direction: THREE.Vector3;
  speed: number;
  distanceTraveled: number;
  maxDistance: number;
  color: number;
  targetHit?: { target: TargetObject; point: THREE.Vector3; color: number };
}

interface BlasterRig {
  group: THREE.Group;
  displayMesh: THREE.Mesh;
  displayTexture: THREE.CanvasTexture;
  displayCanvas: HTMLCanvasElement;
  displayCtx: CanvasRenderingContext2D;
  laserBeam: THREE.Line;
  laserDot: THREE.Mesh;
  muzzleFlash: THREE.PointLight;
  muzzleTimer: number;
  recoilOffset: number;
  primaryColor: number;
  nameTag: string;
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
  public onGameOver?: (finalStats: GameStats, result: { winner: string; aborted: boolean }) => void;
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

  // 3D 오브젝트들
  /** 내 카메라·VR 컨트롤러·안내판을 담는 리그 (슬롯 위치로 이동) */
  private playerRig: THREE.Group;
  private themeGroup: THREE.Group;
  private targetsGroup: THREE.Group;
  private p1Blaster!: BlasterRig;
  private p2Blaster!: BlasterRig;
  private p1Head!: THREE.Group;
  private p2Head!: THREE.Group;
  private vrPromptMesh!: THREE.Mesh;
  private particles: Particle[] = [];
  private laserBolts: LaserBolt[] = [];
  private activeTargets: TargetObject[] = [];
  private vrButtonElement?: HTMLElement;

  // WebGL 자원 최적화 캐시 & 공유 객체 (Quest 2 VRAM 누수 원천 차단)
  private targetLabelCache: Map<TargetKeyword, { texture: THREE.CanvasTexture; material: THREE.SpriteMaterial }> = new Map();
  private sharedParticleGeo = new THREE.BoxGeometry(1, 1, 1);

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

  constructor(container: HTMLElement) {
    this.container = container;
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;

    this.renderer.xr.addEventListener('sessionstart', () => {
      this.startGame();
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      if (this.isPlaying) {
        this.abortGame('플레이어 VR 세션 종료');
      }
    });

    container.appendChild(this.renderer.domElement);

    // 3. 그룹 초기화
    this.themeGroup = new THREE.Group();
    this.targetsGroup = new THREE.Group();
    this.scene.add(this.themeGroup);
    this.scene.add(this.targetsGroup);

    // 4. 컴포넌트 빌드
    this.initLights();
    this.buildTheme(this.currentTheme);
    this.buildDualBlasters();
    this.buildVRHeadAvatars();
    this.buildVRPrompt();
    this.initVRControllers();
    this.initNetworkListeners();
    this.applyRoleLayout();

    // 5. 입력 바인딩
    this.inputManager.onFireCallback = () => this.handleFire();
    this.inputManager.onReloadCallback = () => this.handleReload();

    // 6. 리사이즈 및 마우스 조준/발사 핸들러
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onCanvasPointerDown);

    // 7. Three.js 공식 WebXR VRButton 최상위 DOM 부착
    try {
      const vrBtn = VRButton.createButton(this.renderer);
      vrBtn.id = 'three-vr-button';
      vrBtn.style.zIndex = '99999';
      vrBtn.style.position = 'fixed';
      vrBtn.style.bottom = '28px';
      vrBtn.style.left = '50%';
      vrBtn.style.transform = 'translateX(-50%)';
      vrBtn.style.padding = '14px 32px';
      vrBtn.style.fontSize = '18px';
      vrBtn.style.fontWeight = 'bold';
      vrBtn.style.letterSpacing = '2px';
      vrBtn.style.borderRadius = '32px';
      vrBtn.style.border = '2px solid #00f0ff';
      vrBtn.style.background = 'rgba(8, 16, 32, 0.92)';
      vrBtn.style.color = '#00f0ff';
      vrBtn.style.cursor = 'pointer';
      vrBtn.style.boxShadow = '0 0 24px rgba(0, 240, 255, 0.4)';
      document.body.appendChild(vrBtn);
      this.vrButtonElement = vrBtn;
    } catch (e) {
      console.warn('WebXR VRButton attach warning:', e);
    }

    // 8. 렌더 루프 시작
    this.renderer.setAnimationLoop(this.animate);
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
      blaster.muzzleFlash.intensity = 15;
      blaster.muzzleTimer = 0.08;
      blaster.recoilOffset = 0.08;
      this.soundManager.playFire();

      const muzzlePos = new THREE.Vector3();
      const muzzleQuat = new THREE.Quaternion();
      blaster.group.getWorldPosition(muzzlePos);
      blaster.group.getWorldQuaternion(muzzleQuat);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(muzzleQuat).normalize();
      const color = shooter === 1 ? 0x00f0ff : 0xff0055;
      this.spawnLaserBolt(muzzlePos, forward, color, 55);

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
        const color = slot === 1 ? 0x00f0ff : 0xff0055;
        this.createExplosion(new THREE.Vector3(...data.hitPoint), color);
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

    const handleConnected = (event: THREE.Event & { data?: { handedness?: string } }) => {
      const controller = event.target as THREE.XRTargetRaySpace;
      const data = event.data;
      this.isVRControllerActive = true;

      if (data && (data.handedness === 'right' || !this.activeController)) {
        this.attachBlasterToController(controller);
      }
    };

    const handleDisconnected = (event: THREE.Event) => {
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
  // 1. 조명 및 가상 무기 (Dual Blaster) 구축
  // ==========================================
  private initLights() {
    const ambient = new THREE.AmbientLight(0x223344, 1.5);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0x00f0ff, 2.0);
    dirLight.position.set(5, 10, 5);
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xff0055, 1.5);
    backLight.position.set(-5, 5, -5);
    this.scene.add(backLight);
  }

  /** 1P(Cyan) 및 2P(Magenta) 듀얼 블래스터 절차적 구축 */
  private buildDualBlasters() {
    this.p1Blaster = this.createBlasterRig(0x00f0ff, 'PLAYER 1 (CYAN)');
    this.p1Blaster.group.position.set(-0.35, 1.35, -0.45);
    this.scene.add(this.p1Blaster.group);

    this.p2Blaster = this.createBlasterRig(0xff0055, 'PLAYER 2 / AI (MAGENTA)');
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

    // 총구 화염 포인트 라이트
    const muzzleFlash = new THREE.PointLight(primaryColor, 0, 8);
    muzzleFlash.position.set(0, 0.02, -0.5);
    group.add(muzzleFlash);

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

    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(0.1, 0.05);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
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
      muzzleFlash,
      muzzleTimer: 0,
      recoilOffset: 0,
      primaryColor,
      nameTag,
    };
  }

  /** 원격 플레이어용 3D VR 바이저 헤드 아바타 구축 */
  private buildVRHeadAvatars() {
    this.p1Head = this.createVRHeadMesh(0x00f0ff, 'P1: CYAN');
    this.p1Head.position.set(-0.35, 1.6, 0);
    this.p1Head.visible = this.clientRole === 'SPECTATOR';
    this.scene.add(this.p1Head);

    this.p2Head = this.createVRHeadMesh(0xff0055, 'P2: MAGENTA');
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

    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(2.6, 1.62);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
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
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 6;
      ctx.stroke();

      // 상단 타이틀
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('1:1 VERSUS ARENA DEBRIEF', w / 2, 65);

      // 승자 발표 배너
      let winText = '🤝 DRAW MATCH!';
      if (winner === 'ABORT') {
        winText = '🛑 MATCH ABORTED (경기 중단)';
      } else if (winner === 'P1') {
        winText = '🏆 PLAYER 1 (CYAN) WINS!';
      } else if (winner === 'P2') {
        winText = '🏆 PLAYER 2 (MAGENTA) WINS!';
      }
      ctx.fillStyle = winner === 'ABORT' ? '#ff0055' : winner === 'P1' ? '#00f0ff' : winner === 'P2' ? '#ff0055' : '#ffffff';
      ctx.font = '900 46px sans-serif';
      ctx.fillText(winText, w / 2, 130);

      // 좌측 P1 스탯 박스
      ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.beginPath();
      ctx.roundRect(40, 160, 440, 380, 20);
      ctx.fill();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#00f0ff';
      ctx.font = '900 36px monospace';
      ctx.fillText('플레이어 1 (시안)', 260, 215);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px monospace';
      ctx.fillText(`${this.stats.score.toLocaleString()} PTS`, 260, 285);

      ctx.font = '24px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`명중: ${this.stats.hits}회 / 명중률: ${this.stats.accuracy}%`, 260, 360);
      ctx.fillText(`최대 콤보: ${this.stats.maxCombo}x`, 260, 410);

      // 우측 P2 스탯 박스
      ctx.fillStyle = 'rgba(255, 0, 85, 0.12)';
      ctx.beginPath();
      ctx.roundRect(540, 160, 440, 380, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 0, 85, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ff0055';
      ctx.font = '900 36px monospace';
      const p2Title = this.inputManager.isP2Connected ? '플레이어 2 (마젠타)' : '사이버 AI 라이벌';
      ctx.fillText(p2Title, 760, 215);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px monospace';
      ctx.fillText(`${this.p2Stats.score.toLocaleString()} PTS`, 760, 285);

      ctx.font = '24px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`명중: ${this.p2Stats.hits}회 / 명중률: ${this.p2Stats.accuracy}%`, 760, 360);
      ctx.fillText(`최대 콤보: ${this.p2Stats.maxCombo}x`, 760, 410);

      // 하단 안내: 2대 명확한 선택지 제공
      ctx.fillStyle = '#00ffaa';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('🔫 [트리거 방아쇠] : VR 모드 유지하고 다시 시작', w / 2, 570);

      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('🚪 [그립 / 메뉴 버튼] : VR 종료하고 웹 메인 화면 복귀', w / 2, 615);
    } else {
      // 2. 대기 상태 안내판 (1px 투명 HUD 스타일)
      ctx.fillStyle = 'rgba(4, 9, 20, 0.45)';
      ctx.beginPath();
      ctx.roundRect(10, 10, w - 20, h - 20, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 코너 테크 마커 틱
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      const tick = 16;
      ctx.beginPath();
      ctx.moveTo(10, 10 + tick); ctx.lineTo(10, 10); ctx.lineTo(10 + tick, 10);
      ctx.moveTo(w - 10 - tick, 10); ctx.lineTo(w - 10, 10); ctx.lineTo(w - 10, 10 + tick);
      ctx.moveTo(10, h - 10 - tick); ctx.lineTo(10, h - 10); ctx.lineTo(10 + tick, h - 10);
      ctx.moveTo(w - 10 - tick, h - 10); ctx.lineTo(w - 10, h - 10); ctx.lineTo(w - 10, h - 10 - tick);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('// 경기장 출격 대기 // 1:1 사격 매트릭스', w / 2, 90);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 46px monospace';
      ctx.fillText('CYBER STRIKE ARENA', w / 2, 170);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px monospace';
      ctx.fillText('Quest 2 터치: 트리거 [발사] | 그립 [재장전]', w / 2, 250);

      const vsModeText = this.inputManager.isP2Connected
        ? '상태: 2P 플레이어 온라인 // PVP 대결 준비 완료'
        : '상태: 2P 미접속 // AI 라이벌 봇 대결 가동';
      ctx.fillStyle = this.inputManager.isP2Connected ? '#00ffaa' : '#00f0ff';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(vsModeText, w / 2, 340);

      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('🔫 [트리거] : 경기 출격  |  🚪 [그립/메뉴] : VR 종료', w / 2, 470);
    }
  }

  private updateVRPrompt(isGameOver: boolean = false, winner?: string) {
    if (!this.vrPromptMesh) return;
    const mat = this.vrPromptMesh.material as THREE.MeshBasicMaterial;
    const texture = mat.map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    this.drawPromptContent(ctx, canvas.width, canvas.height, isGameOver, winner);
    texture.needsUpdate = true;
  }

  /** 듀얼 OLED 디스플레이 업데이트 */
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
    const ctx = rig.displayCtx;
    const canvas = rig.displayCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isWarning = this.isPlaying && this.roundTimer <= 10;
    const borderColor = isWarning ? '#ff0055' : rig.primaryColor === 0x00f0ff ? '#00f0ff' : '#ff0055';

    // beginPath() 없이 roundRect()를 부르면 호출마다 경로가 쌓여 그리기가 점점 느려짐
    ctx.fillStyle = isWarning ? 'rgba(40, 5, 15, 0.85)' : 'rgba(4, 8, 18, 0.82)';
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 4);
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';

    if (this.vrExitHoldTimer > 0) {
      ctx.fillStyle = '#ff0055';
      ctx.font = '900 36px monospace';
      ctx.fillText(`EXIT: ${(1.2 - this.vrExitHoldTimer).toFixed(1)}s`, canvas.width / 2, 105);
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('KEEP HOLDING TO QUIT', canvas.width / 2, 185);
    } else if (this.isPlaying && this.isPaused) {
      ctx.fillStyle = '#ffe600';
      ctx.font = '900 44px monospace';
      ctx.fillText('PAUSED', canvas.width / 2, 105);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 32px monospace';
      ctx.fillText(`TIME: ${String(this.stats.timeRemaining).padStart(2, '0')}s`, canvas.width / 2, 185);
    } else if (myStats.isReloading) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = '900 40px monospace';
      ctx.fillText('RELOADING...', canvas.width / 2, 105);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 32px monospace';
      ctx.fillText(`TIME: ${String(this.stats.timeRemaining).padStart(2, '0')}s`, canvas.width / 2, 185);
    } else {
      // 상단: 내 점수 vs 상대방 점수
      ctx.fillStyle = borderColor;
      ctx.font = 'bold 38px monospace';
      ctx.fillText(`P${playerId}: ${myStats.score.toLocaleString()}`, canvas.width * 0.32, 90);

      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 38px monospace';
      ctx.fillText(`RIVAL: ${rivalStats.score.toLocaleString()}`, canvas.width * 0.72, 90);

      // 하단: 탄약 및 시간
      ctx.fillStyle = myStats.ammo <= 2 ? '#ff0055' : '#00f0ff';
      ctx.font = 'bold 32px monospace';
      ctx.fillText(`AMMO: ${myStats.ammo}/${myStats.maxAmmo} | TIME: ${String(this.stats.timeRemaining).padStart(2, '0')}s`, canvas.width / 2, 185);
    }

    rig.displayTexture.needsUpdate = true;
  }

  // ==========================================
  // 2. 가상 공간 테마 빌드
  // ==========================================
  public setTheme(theme: ThemeType) {
    this.currentTheme = theme;
    this.buildTheme(theme);
  }

  private clearTheme() {
    while (this.themeGroup.children.length > 0) {
      const obj = this.themeGroup.children[0];
      this.themeGroup.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        }
      });
    }
  }

  private buildTheme(theme: ThemeType) {
    this.clearTheme();

    if (theme === 'cyber') {
      this.scene.background = new THREE.Color(0x050814);
      this.scene.fog = new THREE.FogExp2(0x050814, 0.025);

      const gridHelper = new THREE.GridHelper(60, 60, 0x00f0ff, 0x112244);
      gridHelper.position.y = 0;
      this.themeGroup.add(gridHelper);

      for (let i = 0; i < 4; i++) {
        const ringGeo = new THREE.TorusGeometry(8 + i * 3.5, 0.04, 8, 48);
        const ringMat = new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x00f0ff : 0xff0055,
          transparent: true,
          opacity: 0.6,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 10, -15 - i * 8);
        this.themeGroup.add(ring);
      }
    } else if (theme === 'space') {
      this.scene.background = new THREE.Color(0x020308);
      this.scene.fog = new THREE.FogExp2(0x020308, 0.015);

      const starGeo = new THREE.BufferGeometry();
      const starCount = 1500;
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 120;
        positions[i + 1] = Math.random() * 60;
        positions[i + 2] = -Math.random() * 90;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.35, transparent: true });
      const stars = new THREE.Points(starGeo, starMat);
      this.themeGroup.add(stars);

      const platGeo = new THREE.CylinderGeometry(8, 8, 0.5, 32);
      const platMat = new THREE.MeshStandardMaterial({ color: 0x111625, roughness: 0.8 });
      const platform = new THREE.Mesh(platGeo, platMat);
      platform.position.y = -0.25;
      this.themeGroup.add(platform);
    } else if (theme === 'city') {
      this.scene.background = new THREE.Color(0x090514);
      this.scene.fog = new THREE.FogExp2(0x090514, 0.02);

      const floorGeo = new THREE.PlaneGeometry(100, 100);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.2 });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      this.themeGroup.add(floor);
    }
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

  /** 6대 키워드 표적 라벨 머티리얼을 단 1회만 생성하여 VRAM 누수 원천 차단 */
  private getOrCreateTargetLabelMaterial(keyword: TargetKeyword, points: number): THREE.SpriteMaterial {
    let cached = this.targetLabelCache.get(keyword);
    if (!cached) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      const isBonus = points === 2; // 정보, 통신

      ctx.clearRect(0, 0, 256, 128);

      // 1. 네온 뱃지 배경
      ctx.fillStyle = isBonus ? 'rgba(4, 24, 52, 0.92)' : 'rgba(15, 20, 32, 0.88)';
      ctx.beginPath();
      ctx.roundRect(10, 8, 236, 112, 18);
      ctx.fill();

      // 2. 네온 테두리
      ctx.strokeStyle = isBonus ? '#00f0ff' : '#ff0055';
      ctx.lineWidth = isBonus ? 6 : 3.5;
      ctx.stroke();

      if (isBonus) {
        // 황금빛 2점 헤더
        ctx.fillStyle = '#ffe600';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★ 2점 ★', 128, 40);

        // 형광 시안 메인 키워드 ("정보", "통신")
        ctx.fillStyle = '#00f0ff';
        ctx.font = '900 56px sans-serif';
        ctx.fillText(keyword, 128, 96);
      } else {
        // 1점 일반 헤더
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('1점', 128, 40);

        // 순백색 메인 키워드 ("제어", "회로", "인공", "전자")
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 54px sans-serif';
        ctx.fillText(keyword, 128, 96);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      cached = { texture, material: mat };
      this.targetLabelCache.set(keyword, cached);
    }
    return cached.material;
  }

  /** 표적 상단 6가지 키워드 라벨 스프라이트 생성 (공유 캐시 머티리얼 재사용) */
  private createTargetLabelSprite(keyword: TargetKeyword, points: number, scale: number = 1.0): THREE.Sprite {
    const mat = this.getOrCreateTargetLabelMaterial(keyword, points);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4 * scale, 0.7 * scale, 1.0);
    sprite.position.set(0, 0.65 * scale, 0);
    return sprite;
  }

  private createTargetMesh(shape: TargetShape, points: number = 1): { group: THREE.Group; subMeshesToRotate: THREE.Mesh[] } {
    const group = new THREE.Group();
    const subMeshesToRotate: THREE.Mesh[] = [];
    const cfg = this.difficultyConfigs[this.currentDifficulty];
    const s = cfg.scale;
    const isBonus = points === 2; // 정보/통신 (황금빛/시안 하이라이트)

    if (shape === 'drone') {
      const bodyColor = isBonus ? 0x0e2a44 : 0x1a2233;
      const bodyGeo = new THREE.SphereGeometry(0.35 * s, 16, 16);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.9, roughness: 0.2 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      group.add(body);

      const eyeColor = isBonus ? 0xffe600 : 0xff0055;
      const eyeGeo = new THREE.SphereGeometry(0.13 * s, 16, 16);
      const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0, 0, 0.3 * s);
      group.add(eye);

      const propPositions = [
        [0.45 * s, 0.15 * s, 0.45 * s],
        [-0.45 * s, 0.15 * s, 0.45 * s],
        [0.45 * s, 0.15 * s, -0.45 * s],
        [-0.45 * s, 0.15 * s, -0.45 * s],
      ];

      propPositions.forEach(([px, py, pz]) => {
        const armGeo = new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.5 * s);
        armGeo.rotateZ(Math.PI / 4);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x445566 });
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(px * 0.6, py * 0.6, pz * 0.6);
        group.add(arm);

        const propColor = isBonus ? 0xffe600 : 0x00f0ff;
        const propGeo = new THREE.BoxGeometry(0.4 * s, 0.02 * s, 0.06 * s);
        const propMat = new THREE.MeshBasicMaterial({ color: propColor });
        const prop = new THREE.Mesh(propGeo, propMat);
        prop.position.set(px, py, pz);
        group.add(prop);
        subMeshesToRotate.push(prop);
      });
    } else if (shape === 'sphere') {
      const coreColor = isBonus ? 0xffe600 : 0x00f0ff;
      const coreGeo = new THREE.SphereGeometry(0.45 * s, 24, 24);
      const coreMat = new THREE.MeshStandardMaterial({
        color: coreColor,
        emissive: isBonus ? 0xcc9900 : 0x0088cc,
        emissiveIntensity: 0.9,
        roughness: 0.1,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      const wireGeo = new THREE.IcosahedronGeometry(0.6 * s, 1);
      const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
      const wire = new THREE.Mesh(wireGeo, wireMat);
      group.add(wire);
      subMeshesToRotate.push(wire);
    } else if (shape === 'cube') {
      const cubeGeo = new THREE.BoxGeometry(0.7 * s, 0.7 * s, 0.7 * s);
      const cubeMat = new THREE.MeshStandardMaterial({
        color: isBonus ? 0x332200 : 0x221133,
        emissive: isBonus ? 0xffe600 : 0xff0055,
        emissiveIntensity: 0.8,
        metalness: 0.8,
      });
      const cube = new THREE.Mesh(cubeGeo, cubeMat);
      group.add(cube);
      subMeshesToRotate.push(cube);
    } else if (shape === 'disc') {
      const discGeo = new THREE.CylinderGeometry(0.6 * s, 0.6 * s, 0.15 * s, 24);
      const discMat = new THREE.MeshStandardMaterial({
        color: isBonus ? 0x00f0ff : 0xffe600,
        emissive: isBonus ? 0x0088cc : 0x998800,
        emissiveIntensity: 0.7,
        metalness: 0.7,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      group.add(disc);
      subMeshesToRotate.push(disc);
    }

    return { group, subMeshesToRotate };
  }

  private spawnTarget() {
    const id = 't_' + Math.random().toString(36).substring(2, 9);

    // 6가지 문구 랜덤 배정 ('정보', '통신', '제어', '회로', '인공', '전자')
    const keyword = TARGET_KEYWORDS[Math.floor(Math.random() * TARGET_KEYWORDS.length)];
    const points = (keyword === '정보' || keyword === '통신') ? 2 : 1;

    const cfg = this.difficultyConfigs[this.currentDifficulty];
    const { group, subMeshesToRotate } = this.createTargetMesh(this.currentShape, points);

    // 표적 상단에 텍스트 뱃지 스프라이트 부착
    const labelSprite = this.createTargetLabelSprite(keyword, points, cfg.scale);
    group.add(labelSprite);

    const x = (Math.random() - 0.5) * 16;
    const y = 1.2 + Math.random() * 3.5;
    const z = -12 - Math.random() * 15;
    const basePos = new THREE.Vector3(x, y, z);
    group.position.copy(basePos);

    const vx = (Math.random() > 0.5 ? 1 : -1) * (cfg.speed * (0.6 + Math.random() * 0.8));
    const vy = (Math.random() - 0.5) * cfg.speed * 0.5;
    const velocity = new THREE.Vector3(vx, vy, 0);
    const frequency = 1.5 + Math.random() * 2.0;
    const amplitude = 0.8 + Math.random() * 1.2;

    const targetObj: TargetObject = {
      id,
      mesh: group,
      shape: this.currentShape,
      keyword,
      points,
      basePos,
      velocity,
      frequency,
      amplitude,
      timeAlive: 0,
      isHit: false,
      hitProgress: 0,
      subMeshesToRotate,
      labelSprite,
    };

    this.targetsGroup.add(group);
    this.activeTargets.push(targetObj);

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
    const points = data.points || ((keyword === '정보' || keyword === '통신') ? 2 : 1);

    const cfg = this.difficultyConfigs[this.currentDifficulty];
    const { group, subMeshesToRotate } = this.createTargetMesh(data.shape || this.currentShape, points);

    // 표적 상단에 텍스트 뱃지 스프라이트 부착
    const labelSprite = this.createTargetLabelSprite(keyword, points, cfg.scale);
    group.add(labelSprite);

    const basePos = new THREE.Vector3(...data.basePos);
    group.position.copy(basePos);

    const targetObj: TargetObject = {
      id: data.id,
      mesh: group,
      shape: data.shape || this.currentShape,
      keyword,
      points,
      basePos,
      velocity: new THREE.Vector3(...data.velocity),
      frequency: data.frequency,
      amplitude: data.amplitude,
      timeAlive: 0,
      isHit: false,
      hitProgress: 0,
      subMeshesToRotate,
      labelSprite,
    };

    this.targetsGroup.add(group);
    this.activeTargets.push(targetObj);
  }

  /** 표적 제거 시 WebGL Geometry 및 Material 즉시 해제 (GPU VRAM 누수 차단) */
  private disposeTarget(t: TargetObject) {
    this.targetsGroup.remove(t.mesh);
    t.mesh.traverse((child) => {
      // 스프라이트는 캐시된 공유 머티리얼을 사용하므로 메시만 분리하고 머티리얼은 유지
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
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
      return;
    }

    myStats.ammo -= 1;
    this.recordShot(slot);
    this.soundManager.playFire();

    localBlaster.muzzleFlash.intensity = 15;
    localBlaster.muzzleTimer = 0.08;
    localBlaster.recoilOffset = 0.05;

    this.inputManager.sendFireEvent(slot);

    const muzzleWorldPos = new THREE.Vector3();
    const muzzleWorldQuat = new THREE.Quaternion();
    localBlaster.group.getWorldPosition(muzzleWorldPos);
    localBlaster.group.getWorldQuaternion(muzzleWorldQuat);
    const muzzleForward = new THREE.Vector3(0, 0, -1).applyQuaternion(muzzleWorldQuat).normalize();

    const playerColor = slot === 1 ? 0x00f0ff : 0xff0055;
    const hit = this.raycastTargets(muzzleWorldPos, muzzleForward);

    if (hit) {
      // 발사 즉시 시각적 3D 레이저 볼트 발사 (표적까지의 궤적 형성)
      this.spawnLaserBolt(muzzleWorldPos, muzzleForward, playerColor, hit.distance);

      // 폭발·효과음은 바로 보여주고, 점수와 명중 기록은 서버 확정(서버 경기) 또는 즉시(로컬 경기) 반영
      hit.target.isHit = true;
      this.soundManager.playHit();
      const hitColor = hit.target.points === 2 ? 0xffe600 : playerColor;
      this.createExplosion(hit.point, hitColor);
      this.applyHitResult(slot, hit.target, hit.point);
    } else {
      // 빗맞힌 사격: 전방 55m 깊은 공간으로 레이저 볼트 비행
      this.spawnLaserBolt(muzzleWorldPos, muzzleForward, playerColor, 55);
      this.recordMiss(slot);
    }

    this.notifyStats();
    this.notifyVersusStats();
  }

  /** 총구 광선과 처음 만나는 (아직 맞지 않은) 표적 */
  private raycastTargets(
    origin: THREE.Vector3,
    direction: THREE.Vector3
  ): { target: TargetObject; point: THREE.Vector3; distance: number } | null {
    this.raycaster.set(origin, direction);

    const targetMeshes: THREE.Object3D[] = [];
    const targetMap = new Map<THREE.Object3D, TargetObject>();
    this.activeTargets.forEach((t) => {
      if (!t.isHit) {
        t.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            targetMeshes.push(child);
            targetMap.set(child, t);
          }
        });
      }
    });

    const intersects = this.raycaster.intersectObjects(targetMeshes, false);
    if (intersects.length === 0) return null;
    const target = targetMap.get(intersects[0].object);
    if (!target) return null;
    return { target, point: intersects[0].point, distance: intersects[0].distance };
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

  private createExplosion(pos: THREE.Vector3, primaryColor: number = 0x00f0ff) {
    const particleCount = 20;
    const colors = [primaryColor, 0xffe600, 0xffffff];

    for (let i = 0; i < particleCount; i++) {
      const size = 0.04 + Math.random() * 0.08;
      // 단일 공유 BoxGeometry(1, 1, 1) 사용 및 스케일 제어 (VRAM 누수 0)
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 1,
      });
      const pMesh = new THREE.Mesh(this.sharedParticleGeo, mat);
      pMesh.scale.setScalar(size);
      pMesh.position.copy(pos);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8 + 2,
        (Math.random() - 0.5) * 8
      );

      this.scene.add(pMesh);
      this.particles.push({
        mesh: pMesh,
        velocity: vel,
        lifetime: 0,
        maxLife: 0.6 + Math.random() * 0.4,
      });
    }
  }

  /** 화려한 3D 네온 레이저 볼트 생성 */
  private spawnLaserBolt(
    startPos: THREE.Vector3,
    direction: THREE.Vector3,
    color: number,
    maxDistance: number = 60,
    targetHit?: { target: TargetObject; point: THREE.Vector3; color: number }
  ) {
    const boltGroup = new THREE.Group();

    // 1. 고휘도 화이트 코어 실린더
    const coreGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.4, 8);
    coreGeo.rotateX(Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    boltGroup.add(coreMesh);

    // 2. 외곽 가산 발광 네온 헤일로 (Cyan / Magenta)
    const haloGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.6, 8);
    haloGeo.rotateX(Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    boltGroup.add(haloMesh);

    boltGroup.position.copy(startPos);
    boltGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction.clone().normalize());

    this.scene.add(boltGroup);

    this.laserBolts.push({
      mesh: boltGroup,
      direction: direction.clone().normalize(),
      speed: 120,
      distanceTraveled: 0,
      maxDistance,
      color,
      targetHit,
    });
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

  private notifyVersusStats() {
    if (this.onVersusStatsUpdate) {
      this.onVersusStatsUpdate({
        mode: this.inputManager.versusMode,
        timeRemaining: this.stats.timeRemaining,
        p1Score: this.stats.score,
        p1Hits: this.stats.hits,
        p1Combo: this.stats.combo,
        p1Accuracy: this.stats.accuracy,
        p2Score: this.p2Stats.score,
        p2Hits: this.p2Stats.hits,
        p2Combo: this.p2Stats.combo,
        p2Accuracy: this.p2Stats.accuracy,
        spectatorCount: this.inputManager.spectatorCount,
      });
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
    if (this.isPlaying || this.pendingStartTimer) return;
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

  /** 관람 화면 대기용 AI 시연 (서버 경기에 영향 없음, 실제 경기가 시작되면 자동 전환) */
  public startLocalDemo() {
    if (this.isPlaying || this.pendingStartTimer) return;
    this.startGameLocal(null);
  }

  /** 경기 시작 (info가 있으면 서버 경기의 남은 시간·난이도·점수에 맞춰 합류) */
  private startGameLocal(info: MatchInfo | null) {
    if (this.pendingStartTimer) {
      clearTimeout(this.pendingStartTimer);
      this.pendingStartTimer = null;
    }
    this.matchId = info ? info.matchId : null;
    if (info?.difficulty && info.difficulty !== this.currentDifficulty) {
      this.setDifficulty(info.difficulty);
      if (this.onDifficultySync) this.onDifficultySync(info.difficulty);
    }

    this.isPlaying = true;
    this.isPaused = Boolean(info?.isPaused);
    this.roundTimer = info ? info.remaining : MATCH_DURATION;
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
    this.roundTimer = info.remaining;
    if (info.isPaused !== this.isPaused) {
      this.setPausedLocal(info.isPaused);
    }
  }

  private setPausedLocal(paused: boolean, remaining?: number) {
    this.isPaused = paused;
    if (remaining !== undefined) {
      this.roundTimer = remaining;
    }
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
    this.vrExitHoldTimer = 0;
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
    if (winner === 'ABORT') {
      this.voiceManager.speak('GAME_OVER');
    } else if (amWinner) {
      this.voiceManager.speak('VICTORY');
    } else if (winner !== 'DRAW') {
      this.voiceManager.speak('DEFEAT');
    } else {
      this.voiceManager.speak('GAME_OVER');
    }

    this.notifyStats();
    this.notifyVersusStats();
    if (this.onPauseChange) this.onPauseChange(false);
    if (this.onGameOver) {
      const myFinalStats = this.clientRole === 'P2' ? this.p2Stats : this.stats;
      this.onGameOver({ ...myFinalStats }, { winner, aborted: winner === 'ABORT' });
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

    rivalBlaster.muzzleFlash.intensity = 15;
    rivalBlaster.muzzleTimer = 0.08;
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
    const aiColor = aiSlot === 1 ? 0x00f0ff : 0xff0055;
    const hit = this.raycastTargets(aiMuzzlePos, aiForward);

    if (hit) {
      // AI 발사 시 레이저 볼트 발사
      this.spawnLaserBolt(aiMuzzlePos, aiForward, aiColor, hit.distance);
      hit.target.isHit = true;
      this.createExplosion(hit.point, aiColor);
      this.soundManager.playHit();
      this.cyberAI.recordHit(hit.target.points);
      this.applyHitResult(aiSlot, hit.target, hit.point);
    } else {
      // 사격 조준이 표적과 일치하지 않아 빗맞힘 처리 (치팅 방지)
      this.spawnLaserBolt(aiMuzzlePos, aiForward, aiColor, 55);
      this.cyberAI.recordMiss();
      this.recordMiss(aiSlot);
    }
    this.notifyVersusStats();
  }

  private animate = () => {
    const delta = Math.min(this.clock.getDelta(), 0.1);

    // 1. 게임 타이머 관리
    if (this.isPlaying && !this.isPaused) {
      this.roundTimer -= delta;
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
          this.notifyStats();
        }
      }

      // 10초 긴급 사이렌
      if (this.roundTimer <= 10 && !this.hasWarned10s && this.roundTimer > 0.5) {
        this.hasWarned10s = true;
        this.soundManager.play10sWarningSiren();
        this.voiceManager.speak('TIME_WARN_10S');
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

    // 4. 총구 화염 및 반동 회복
    [this.p1Blaster, this.p2Blaster].forEach((b) => {
      if (b.muzzleTimer > 0) {
        b.muzzleTimer -= delta;
        if (b.muzzleTimer <= 0) b.muzzleFlash.intensity = 0;
      }
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

    // 5. 표적 이동 및 애니메이션
    for (let i = this.activeTargets.length - 1; i >= 0; i--) {
      const t = this.activeTargets[i];
      t.timeAlive += delta;

      if (t.isHit) {
        t.hitProgress += delta * 4;
        const scale = Math.max(0, 1 - t.hitProgress);
        t.mesh.scale.set(scale, scale, scale);
        if (t.hitProgress >= 1) {
          this.disposeTarget(t);
          this.activeTargets.splice(i, 1);
          continue;
        }
      } else {
        t.mesh.position.x = t.basePos.x + Math.sin(t.timeAlive * t.frequency) * t.amplitude;
        t.mesh.position.y = t.basePos.y + Math.cos(t.timeAlive * (t.frequency * 0.8)) * 0.4;
        if (Math.abs(t.basePos.x) > 9) {
          t.velocity.x *= -1;
        }
        t.basePos.x += t.velocity.x * delta;

        if (t.subMeshesToRotate) {
          t.subMeshesToRotate.forEach((m) => {
            m.rotation.y += delta * 15;
            m.rotation.z += delta * 8;
          });
        }
      }
    }

    // 6. 폭발 파티클 업데이트 (수명 완료 시 Material 즉시 dispose)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifetime += delta;
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.velocity.y -= delta * 9.8;
      const alpha = Math.max(0, 1 - p.lifetime / p.maxLife);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = alpha;

      if (p.lifetime >= p.maxLife) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }

    // 6.5. 3D 레이저 볼트 비행 및 명중 업데이트
    for (let i = this.laserBolts.length - 1; i >= 0; i--) {
      const bolt = this.laserBolts[i];
      const step = bolt.speed * delta;
      bolt.distanceTraveled += step;
      bolt.mesh.position.addScaledVector(bolt.direction, step);

      if (bolt.distanceTraveled >= bolt.maxDistance) {
        if (bolt.targetHit && !bolt.targetHit.target.isHit) {
          bolt.targetHit.target.isHit = true;
          this.createExplosion(bolt.targetHit.point, bolt.targetHit.color);
          this.soundManager.playHit();
        }
        this.scene.remove(bolt.mesh);
        bolt.mesh.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.geometry.dispose();
            if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
            else c.material.dispose();
          }
        });
        this.laserBolts.splice(i, 1);
      }
    }

    // 7. 렌더
    this.renderer.render(this.scene, this.camera);
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

  public dispose() {
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

    // 1. 레이저 볼트 정리
    this.laserBolts.forEach((b) => {
      this.scene.remove(b.mesh);
      b.mesh.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    });
    this.laserBolts = [];

    // 2. 파티클 및 공유 지오메트리 정리
    this.particles.forEach((p) => {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    });
    this.particles = [];
    this.sharedParticleGeo.dispose();

    // 3. 표적 전체 정리 및 GPU 메모리 해제
    this.clearAllTargets();

    // 4. 캐시된 라벨 텍스처 및 머티리얼 일괄 해제
    this.targetLabelCache.forEach((item) => {
      item.material.dispose();
      item.texture.dispose();
    });
    this.targetLabelCache.clear();

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
      }
    });

    if (this.vrButtonElement && this.vrButtonElement.parentNode) {
      this.vrButtonElement.parentNode.removeChild(this.vrButtonElement);
    }
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
