export type ThemeType = 'cyber' | 'space' | 'city';
export type TargetShape = 'drone' | 'sphere' | 'cube' | 'disc';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameState = 'READY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
export type SoundPresetType = 'laser' | 'kinetic' | 'retro';

export type ClientRole = 'P1' | 'P2' | 'SPECTATOR';
/** replaced: 이 연결이 대체됨(자동 재접속 안 함) / slot_busy: 요청한 자리를 다른 기기가 사용 중(자리가 비면 자동 접속) */
export type ConnectionIssue = 'replaced' | 'slot_busy';
export type SpectatorCameraMode = 'STADIUM' | 'P1_VIEW' | 'P2_VIEW' | 'ORBIT';

export type VoiceEventType = 
  | 'GAME_START'
  | 'AMMO_EMPTY'
  | 'RELOAD_DONE'
  | 'COMBO_STREAK'
  | 'TIME_WARN_10S'
  | 'GAME_OVER'
  | 'HIGH_SCORE'
  | 'CHALLENGER_JOINED'
  | 'P1_LEAD'
  | 'P2_LEAD'
  | 'VICTORY'
  | 'DEFEAT';

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  difficulty: Difficulty;
  theme: ThemeType;
  date: string;
}

export interface StickData {
  x: number; // -1.0 ~ 1.0
  y: number; // -1.0 ~ 1.0
}

export interface AccelData {
  x: number;
  y: number;
  z: number;
}

export interface ButtonData {
  c: boolean; // Fire
  z: boolean; // Reload
}

export interface NunchukInputState {
  type: string;
  source: 'pico_w' | 'virtual_pad' | 'keyboard_mouse';
  stick: StickData;
  accel: AccelData;
  buttons: ButtonData;
  timestamp: number;
}

export interface SystemStatus {
  pico_connected: boolean;
  virtual_connected: boolean;
  game_clients_count: number;
  spectator_count?: number;
}

export interface GameStats {
  score: number;
  hits: number;
  misses: number;
  shotsFired: number;
  accuracy: number;
  combo: number;
  maxCombo: number;
  timeRemaining: number;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
}

export interface PlayerPose {
  playerId: number;
  headPos: [number, number, number];
  headQuat: [number, number, number, number];
  blasterPos: [number, number, number];
  blasterQuat: [number, number, number, number];
}

export type TargetKeyword = '정보' | '통신' | '제어' | '회로' | '인공' | '전자';

export interface TargetSpawnPacket {
  id: string;
  shape: TargetShape;
  basePos: [number, number, number];
  velocity: [number, number, number];
  frequency: number;
  amplitude: number;
  keyword?: TargetKeyword;
  points?: number;
  matchId?: number;
}

/** 서버가 알려주는 경기 상태 (match_started / client_assigned / room_state) */
export interface MatchInfo {
  matchId: number;
  isMatchActive: boolean;
  isPaused: boolean;
  duration: number;
  remaining: number;
  difficulty?: Difficulty;
  p1Score: number;
  p2Score: number;
}

export interface VersusMatchStats {
  mode: 'VERSUS_PVP' | 'VERSUS_AI';
  timeRemaining: number;
  p1Score: number;
  p1Hits: number;
  p1Combo: number;
  p1Accuracy: number;
  p2Score: number;
  p2Hits: number;
  p2Combo: number;
  p2Accuracy: number;
  spectatorCount: number;
  winner?: 'P1' | 'P2' | 'DRAW';
}

export interface DifficultyConfig {
  speed: number;
  scale: number;
  spawnInterval: number;
  maxTargets: number;
  scoreMultiplier: number;
}
