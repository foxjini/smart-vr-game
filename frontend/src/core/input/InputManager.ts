import { SystemStatus, StickData, ClientRole, PlayerPose, TargetSpawnPacket, Difficulty, MatchInfo, ConnectionIssue } from '@/types';

export type InputMode = 'HYBRID' | 'STANDALONE' | 'WEBSOCKET_ONLY';

/** 같은 기기가 새 연결로 다시 접속해 이 연결이 대체됐을 때 서버가 보내는 종료 코드 */
const CLOSE_CODE_REPLACED = 4001;
/** 요청한 플레이어 자리를 다른 기기가 사용 중일 때 서버가 보내는 종료 코드 */
const CLOSE_CODE_SLOT_BUSY = 4002;
/** 자리가 빌 때까지 다시 시도하는 간격(ms) */
const SLOT_BUSY_RETRY_MS = 5000;

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function parseMatchInfo(data: Record<string, unknown>): MatchInfo {
  const difficulty = DIFFICULTIES.find((d) => d === data.difficulty);
  return {
    matchId: Number(data.matchId ?? 0),
    isMatchActive: Boolean(data.isMatchActive ?? true),
    isPaused: Boolean(data.isPaused),
    duration: Number(data.duration ?? 60),
    remaining: Number(data.remaining ?? data.duration ?? 60),
    difficulty,
    p1Score: Number(data.p1Score ?? 0),
    p2Score: Number(data.p2Score ?? 0),
  };
}

export class InputManager {
  private static instance: InputManager;
  private ws: WebSocket | null = null;
  private sessionId: string = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private serverHost: string = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  private serverPort: string = '8000';
  private requestedRole?: ClientRole;

  public mode: InputMode = 'HYBRID';
  public isConnectedToServer: boolean = false;
  /** 역할 자리 관련 연결 문제 (정상 배정되면 null) */
  public connectionIssue: ConnectionIssue | null = null;
  public clientRole: ClientRole = 'P1';
  public playerId: number | null = 1;
  public isP1Connected: boolean = false;
  public isP2Connected: boolean = false;
  public spectatorCount: number = 0;
  public versusMode: 'VERSUS_PVP' | 'VERSUS_AI' = 'VERSUS_AI';
  public currentDifficulty: Difficulty = 'normal';

  public systemStatus: SystemStatus = {
    pico_connected: false,
    virtual_connected: false,
    game_clients_count: 0,
    spectator_count: 0,
  };

  // 실시간 입력 상태 (PC 키보드/마우스 및 폴백)
  private stick: StickData = { x: 0, y: 0 };
  private buttonC: boolean = false; // Fire
  private buttonZ: boolean = false; // Reload
  private kbStick: StickData = { x: 0, y: 0 };
  private keysPressed: Record<string, boolean> = {};

  // 콜백 핸들러
  public onFireCallback?: () => void;
  public onReloadCallback?: () => void;
  public onStatusChange?: (status: SystemStatus, wsConnected: boolean) => void;
  public onDifficultyChange?: (difficulty: Difficulty) => void;

  // 멀티플레이어 / 옵저버 콜백
  public onClientAssigned?: (role: ClientRole, playerId: number | null) => void;
  public onRoomStateChange?: (state: Record<string, unknown>) => void;
  public onRemotePose?: (pose: PlayerPose) => void;
  public onRemoteFire?: (data: { playerId: number; timestamp?: number }) => void;
  public onRemoteTargetSpawn?: (data: TargetSpawnPacket) => void;
  public onTargetHitConfirmed?: (data: {
    matchId?: number;
    targetId: string;
    hitBy: number;
    hitPoint: [number, number, number];
    addedScore: number;
    p1Score: number;
    p2Score: number;
    combo: number;
  }) => void;
  /** 서버가 새 경기를 시작했거나, 시작 요청에 대해 진행 중인 경기 정보를 보냄 */
  public onMatchStarted?: (info: MatchInfo) => void;
  /** 접속·방 상태 갱신 때마다 받는 현재 경기 상태 (도중 합류 및 시간 보정용) */
  public onMatchState?: (info: MatchInfo) => void;
  public onMatchOverBroadcast?: (data: { matchId?: number; p1Score: number; p2Score: number; winner: string }) => void;
  public onMatchAborted?: (data: { matchId?: number; message?: string }) => void;
  public onMatchPaused?: (data: { matchId?: number; remaining: number }) => void;
  /** 경기 중 서버가 주기적으로 보내는 남은 시간 (화면 간 시계 보정) */
  public onMatchClock?: (data: { matchId?: number; remaining: number }) => void;
  public onMatchResumed?: (data: { matchId?: number; remaining: number }) => void;
  public onConnectionIssue?: (issue: ConnectionIssue) => void;

  // 감도 및 설정
  public sensitivity: number = 1.0;
  public deadzone: number = 0.08;

  private constructor() {
    if (typeof window !== 'undefined') {
      if (window.location.hostname) {
        this.serverHost = window.location.hostname;
      }
      let sid = sessionStorage.getItem('cyber_strike_session_id');
      if (!sid) {
        sid = 's_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
        sessionStorage.setItem('cyber_strike_session_id', sid);
      }
      this.sessionId = sid;

      // URL 파라미터 및 로컬 스토리지에서 고정 역할 감지
      const urlParams = new URLSearchParams(window.location.search);
      const r = (urlParams.get('role') || urlParams.get('mode') || '').toLowerCase();
      let detectedRole: ClientRole | undefined = undefined;
      if (r === 'spectator' || r === 'observer' || r === 'spec') {
        detectedRole = 'SPECTATOR';
      } else if (r === 'p2' || r === 'player2' || r === '2') {
        detectedRole = 'P2';
      } else if (r === 'p1' || r === 'player1' || r === '1') {
        detectedRole = 'P1';
      }

      if (!detectedRole) {
        const saved = localStorage.getItem('cyber_strike_fixed_role') as ClientRole | null;
        if (saved === 'P1' || saved === 'P2' || saved === 'SPECTATOR') {
          detectedRole = saved;
        }
      }

      if (detectedRole) {
        this.requestedRole = detectedRole;
        this.clientRole = detectedRole;
        localStorage.setItem('cyber_strike_fixed_role', detectedRole);
      }

      this.initKeyboardMouseListeners();
    }
  }

  public static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  public setServerHost(host: string, port: string = '8000') {
    this.serverHost = host;
    this.serverPort = port;
    this.reconnect();
  }

  public setRequestedRole(role?: ClientRole) {
    if (this.requestedRole === role) return;
    this.requestedRole = role;
    if (role && typeof window !== 'undefined') {
      localStorage.setItem('cyber_strike_fixed_role', role);
    }
    this.reconnect();
  }

  public connect(url?: string, role?: ClientRole) {
    if (role !== undefined) {
      this.requestedRole = role;
      if (typeof window !== 'undefined') {
        localStorage.setItem('cyber_strike_fixed_role', role);
      }
    }

    // 이미 활성 연결이 있거나 연결 중인 경우 불필요한 소켓 중복 생성 차단 (React StrictMode 이중 마운트 슬롯 오염 방지)
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    let targetUrl = url;
    if (!targetUrl) {
      const params = new URLSearchParams();
      if (this.requestedRole === 'SPECTATOR') {
        params.set('role', 'spectator');
      } else if (this.requestedRole === 'P1') {
        params.set('role', 'p1');
      } else if (this.requestedRole === 'P2') {
        params.set('role', 'p2');
      }
      if (this.sessionId) params.set('sessionId', this.sessionId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      targetUrl = `ws://${this.serverHost}:${this.serverPort}/ws/game${qs}`;
    }

    // 이전 소켓이 있다면 리스너를 완전히 끊은 후 정리
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    try {
      const socket = new WebSocket(targetUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.isConnectedToServer = true;
        this.notifyStatus();
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch {
          // invalid json
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.isConnectedToServer = false;
        this.ws = null;
        if (event.code === CLOSE_CODE_REPLACED || event.code === CLOSE_CODE_SLOT_BUSY) {
          const issue: ConnectionIssue = event.code === CLOSE_CODE_REPLACED ? 'replaced' : 'slot_busy';
          const isNewIssue = this.connectionIssue !== issue;
          this.connectionIssue = issue;
          this.notifyStatus();
          if (isNewIssue && this.onConnectionIssue) this.onConnectionIssue(issue);
          // 대체됨: 다시 접속하면 서로 밀어내므로 멈춤 / 자리 사용 중: 자리가 빌 때까지 천천히 재시도
          if (issue === 'slot_busy') this.scheduleReconnect(SLOT_BUSY_RETRY_MS);
          return;
        }
        this.notifyStatus();
        this.scheduleReconnect(3000);
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        this.isConnectedToServer = false;
        this.notifyStatus();
      };
    } catch {
      this.isConnectedToServer = false;
      this.notifyStatus();
    }
  }

  private scheduleReconnect(delayMs: number) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isConnectedToServer) this.connect();
    }, delayMs);
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.isConnectedToServer = false;
    this.notifyStatus();
  }

  public reconnect() {
    this.disconnect();
    this.connect();
  }

  private handleServerMessage(data: Record<string, unknown>) {
    const type = data.type;

    if (type === 'client_assigned') {
      this.clientRole = data.role as ClientRole;
      if (!this.requestedRole) {
        this.requestedRole = this.clientRole;
      }
      this.playerId = (data.playerId as number | null) ?? null;
      this.isP1Connected = Boolean(data.p1Connected);
      this.isP2Connected = Boolean(data.p2Connected);
      this.spectatorCount = Number(data.spectatorCount || 0);
      this.versusMode = (data.mode as 'VERSUS_PVP' | 'VERSUS_AI') || 'VERSUS_AI';
      this.connectionIssue = null;
      if (this.onClientAssigned) {
        this.onClientAssigned(this.clientRole, this.playerId);
      }
      if (this.onMatchState) {
        this.onMatchState(parseMatchInfo(data));
      }
      this.notifyStatus();
      return;
    }

    if (type === 'room_state') {
      this.isP1Connected = Boolean(data.p1Connected);
      this.isP2Connected = Boolean(data.p2Connected);
      this.spectatorCount = Number(data.spectatorCount || 0);
      this.versusMode = (data.mode as 'VERSUS_PVP' | 'VERSUS_AI') || 'VERSUS_AI';
      this.systemStatus.spectator_count = this.spectatorCount;
      if (this.onRoomStateChange) {
        this.onRoomStateChange(data);
      }
      if (this.onMatchState) {
        this.onMatchState(parseMatchInfo(data));
      }
      this.notifyStatus();
      return;
    }

    if (type === 'player_pose') {
      if (this.onRemotePose) {
        this.onRemotePose(data as unknown as PlayerPose);
      }
      return;
    }

    if (type === 'fire_event') {
      if (this.onRemoteFire) {
        this.onRemoteFire(data as unknown as { playerId: number; timestamp?: number });
      }
      return;
    }

    if (type === 'target_spawn') {
      if (this.onRemoteTargetSpawn) {
        this.onRemoteTargetSpawn(data as unknown as TargetSpawnPacket);
      }
      return;
    }

    if (type === 'target_hit_confirmed') {
      if (this.onTargetHitConfirmed) {
        this.onTargetHitConfirmed(data as unknown as {
          matchId?: number;
          targetId: string;
          hitBy: number;
          hitPoint: [number, number, number];
          addedScore: number;
          p1Score: number;
          p2Score: number;
          combo: number;
        });
      }
      return;
    }

    if (type === 'match_started') {
      if (this.onMatchStarted) {
        this.onMatchStarted(parseMatchInfo(data));
      }
      return;
    }

    if (type === 'match_over_broadcast') {
      if (this.onMatchOverBroadcast) {
        this.onMatchOverBroadcast(data as unknown as { matchId?: number; p1Score: number; p2Score: number; winner: string });
      }
      return;
    }

    if (type === 'match_aborted') {
      if (this.onMatchAborted) {
        this.onMatchAborted(data as unknown as { matchId?: number; message?: string });
      }
      return;
    }

    if (type === 'match_clock') {
      if (this.onMatchClock) {
        this.onMatchClock({ matchId: data.matchId as number | undefined, remaining: Number(data.remaining ?? 0) });
      }
      return;
    }

    if (type === 'match_paused' || type === 'match_resumed') {
      const payload = { matchId: data.matchId as number | undefined, remaining: Number(data.remaining ?? 0) };
      const handler = type === 'match_paused' ? this.onMatchPaused : this.onMatchResumed;
      if (handler) handler(payload);
      return;
    }

    if (type === 'system_status') {
      this.systemStatus = {
        pico_connected: Boolean(data.pico_connected),
        virtual_connected: Boolean(data.virtual_connected),
        game_clients_count: Number(data.game_clients_count || 0),
        spectator_count: this.spectatorCount,
      };
      this.notifyStatus();
      return;
    }
  }

  // --- 송신 메서드 (전송 성공 여부 반환) ---
  private send(payload: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  public sendPose(pose: PlayerPose) {
    return this.send({ type: 'player_pose', ...pose });
  }

  public sendFireEvent(playerId: number) {
    return this.send({ type: 'fire_event', playerId, timestamp: Date.now() });
  }

  public sendTargetSpawn(spawnData: TargetSpawnPacket) {
    return this.send({ type: 'target_spawn', ...spawnData });
  }

  /** 명중 확정 요청 (배점은 서버가 표적 생성 기록으로 판정) */
  public sendHitRequest(
    targetId: string,
    hitBy: number,
    hitPoint: [number, number, number],
    combo: number,
    matchId: number
  ) {
    return this.send({ type: 'hit_request', targetId, hitBy, hitPoint, combo, matchId });
  }

  public sendMatchStart(duration: number = 60, difficulty?: Difficulty) {
    return this.send({ type: 'match_start', duration, difficulty });
  }

  public sendMatchPause(matchId: number) {
    return this.send({ type: 'match_pause', matchId });
  }

  public sendMatchResume(matchId: number) {
    return this.send({ type: 'match_resume', matchId });
  }

  public sendMatchAbort(message: string, matchId: number) {
    return this.send({ type: 'match_abort', message, matchId });
  }

  private notifyStatus() {
    if (this.onStatusChange) {
      this.onStatusChange(this.systemStatus, this.isConnectedToServer);
    }
  }

  /** PC 단독 테스트를 위한 키보드 및 마우스 리스너 */
  private initKeyboardMouseListeners() {
    window.addEventListener('keydown', (e) => {
      this.keysPressed[e.code] = true;
      this.updateKeyboardStick();

      if (e.code === 'Space' || e.code === 'KeyC') {
        if (!e.repeat && this.onFireCallback) this.onFireCallback();
      }
      if (e.code === 'KeyR' || e.code === 'KeyZ') {
        if (!e.repeat && this.onReloadCallback) this.onReloadCallback();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;
      this.updateKeyboardStick();
    });

    window.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, input, select, .modal-backdrop, .hud-interactive')) {
        return;
      }
      if (e.button === 0) {
        if (this.onFireCallback) this.onFireCallback();
      } else if (e.button === 2) {
        if (this.onReloadCallback) this.onReloadCallback();
      }
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private updateKeyboardStick() {
    let kx = 0;
    let ky = 0;
    if (this.keysPressed['ArrowLeft'] || this.keysPressed['KeyA']) kx -= 1;
    if (this.keysPressed['ArrowRight'] || this.keysPressed['KeyD']) kx += 1;
    if (this.keysPressed['ArrowUp'] || this.keysPressed['KeyW']) ky += 1;
    if (this.keysPressed['ArrowDown'] || this.keysPressed['KeyS']) ky -= 1;
    this.kbStick = { x: kx, y: ky };
  }

  public getStick(): StickData {
    return this.kbStick;
  }
}
