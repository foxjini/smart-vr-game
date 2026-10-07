import { SystemStatus, StickData, ClientRole, PlayerPose, TargetSpawnPacket, Difficulty } from '@/types';

export type InputMode = 'HYBRID' | 'STANDALONE' | 'WEBSOCKET_ONLY';

export class InputManager {
  private static instance: InputManager;
  private ws: WebSocket | null = null;
  private serverHost: string = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  private serverPort: string = '8000';
  private requestedRole?: ClientRole;

  public mode: InputMode = 'HYBRID';
  public isConnectedToServer: boolean = false;
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
    targetId: string;
    hitBy: number;
    hitPoint: [number, number, number];
    addedScore: number;
    p1Score: number;
    p2Score: number;
    combo: number;
  }) => void;
  public onMatchStarted?: (duration: number) => void;
  public onMatchOverBroadcast?: (data: { p1Score: number; p2Score: number; winner: string }) => void;

  // 감도 및 설정
  public sensitivity: number = 1.0;
  public deadzone: number = 0.08;

  private constructor() {
    if (typeof window !== 'undefined') {
      if (window.location.hostname) {
        this.serverHost = window.location.hostname;
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
    this.reconnect();
  }

  public connect(url?: string, role?: ClientRole) {
    if (role !== undefined) this.requestedRole = role;

    let targetUrl = url;
    if (!targetUrl) {
      const queryRole = this.requestedRole === 'SPECTATOR' ? '?role=spectator' : '';
      targetUrl = `ws://${this.serverHost}:${this.serverPort}/ws/game${queryRole}`;
    }

    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        this.isConnectedToServer = true;
        this.notifyStatus();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch {
          // invalid json
        }
      };

      this.ws.onclose = () => {
        this.isConnectedToServer = false;
        this.notifyStatus();
        setTimeout(() => {
          if (!this.isConnectedToServer) this.connect();
        }, 3000);
      };

      this.ws.onerror = () => {
        this.isConnectedToServer = false;
        this.notifyStatus();
      };
    } catch {
      this.isConnectedToServer = false;
      this.notifyStatus();
    }
  }

  public reconnect() {
    this.connect();
  }

  private handleServerMessage(data: Record<string, unknown>) {
    const type = data.type;

    if (type === 'client_assigned') {
      this.clientRole = data.role as ClientRole;
      this.requestedRole = this.clientRole;
      this.playerId = (data.playerId as number | null) ?? null;
      this.isP1Connected = Boolean(data.p1Connected);
      this.isP2Connected = Boolean(data.p2Connected);
      this.spectatorCount = Number(data.spectatorCount || 0);
      this.versusMode = (data.mode as 'VERSUS_PVP' | 'VERSUS_AI') || 'VERSUS_AI';
      if (this.onClientAssigned) {
        this.onClientAssigned(this.clientRole, this.playerId);
      }
      if (data.isMatchActive && this.clientRole === 'SPECTATOR' && this.onMatchStarted) {
        this.onMatchStarted(60);
      }
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
      if (data.isMatchActive && this.clientRole === 'SPECTATOR' && this.onMatchStarted) {
        this.onMatchStarted(60);
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
        this.onMatchStarted(Number(data.duration || 60));
      }
      return;
    }

    if (type === 'match_over_broadcast') {
      if (this.onMatchOverBroadcast) {
        this.onMatchOverBroadcast(data as unknown as { p1Score: number; p2Score: number; winner: string });
      }
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

  // --- 송신 메서드 ---
  public sendPose(pose: PlayerPose) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'player_pose', ...pose }));
    }
  }

  public sendFireEvent(playerId: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'fire_event', playerId, timestamp: Date.now() }));
    }
  }

  public sendTargetSpawn(spawnData: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'target_spawn', ...spawnData }));
    }
  }

  public sendHitRequest(
    targetId: string,
    hitBy: number,
    hitPoint: [number, number, number],
    addedScore: number,
    combo: number
  ) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'hit_request',
          targetId,
          hitBy,
          hitPoint,
          addedScore,
          combo,
        })
      );
    }
  }

  public sendMatchStart(duration: number = 60) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'match_start', duration }));
    }
  }

  public sendMatchOver(p1Score: number, p2Score: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'match_over', p1Score, p2Score }));
    }
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
