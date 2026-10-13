'use client';

import React, { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { ShootingArenaEngine } from '@/components/arena/ShootingArenaEngine';
import { InputManager } from '@/core/input/InputManager';
import { SoundManager } from '@/core/audio/SoundManager';
import { VoiceManager } from '@/core/audio/VoiceManager';
import { getAudioStatus, installAudioUnlock, probeAutoplay, subscribeAudioStatus, unlockedRecently } from '@/core/audio/audioUnlock';
import { GameHUD } from '@/components/ui/GameHUD';
import { SettingsModal } from '@/components/ui/SettingsModal';
import { GameOverModal } from '@/components/ui/GameOverModal';
import { MainMenuModal } from '@/components/ui/MainMenuModal';
import { LeaderboardModal } from '@/components/ui/LeaderboardModal';
import { AimReticle } from '@/components/ui/hud/AimReticle';
import { ReadyBanner } from '@/components/ui/hud/ReadyBanner';
import type { TvSoundState } from '@/components/ui/hud/OperatorControls';
import { MatchResultSummary, NO_READY, ReadyInfo, aiSlotOf, normalizeWinner } from '@/components/ui/matchInfo';
import {
  ThemeType,
  TargetShape,
  Difficulty,
  GameStats,
  SystemStatus,
  SoundPresetType,
  ClientRole,
  SpectatorCameraMode,
  VersusMatchStats,
  ConnectionIssue,
} from '@/types';

interface NavigatorWithXR {
  xr?: {
    isSessionSupported?: (mode: string) => Promise<boolean>;
    requestSession?: (mode: string, options?: Record<string, unknown>) => Promise<XRSession>;
  };
}

const DEFAULT_SOUND_PRESET: SoundPresetType = 'laser';
const DEFAULT_SOUND_VOLUME = 0.8;
const DEFAULT_VOICE_VOLUME = 0.9;

/** URL 파라미터(role 또는 mode)로 지정한 역할 (없으면 null) */
function readUrlRole(): ClientRole | null {
  const urlParams = new URLSearchParams(window.location.search);
  const r = (urlParams.get('role') || urlParams.get('mode') || '').toLowerCase();
  if (r === 'spectator' || r === 'observer' || r === 'spec') return 'SPECTATOR';
  if (r === 'p2' || r === 'player2' || r === '2') return 'P2';
  if (r === 'p1' || r === 'player1' || r === '1') return 'P1';
  return null;
}

/** 시작 역할: URL 파라미터 → 이 기기에 저장된 고정 역할 → 1P */
function readInitialRole(): ClientRole {
  const fromUrl = readUrlRole();
  if (fromUrl) return fromUrl;
  const saved = localStorage.getItem('cyber_strike_fixed_role');
  if (saved === 'P1' || saved === 'P2' || saved === 'SPECTATOR') return saved;
  return 'P1';
}

// 표적당 1~2점 배점으로 바뀌어 이전 점수 체계의 최고 기록과 분리 (순위표 저장 키와 같은 이유)
const HIGH_SCORE_KEY = 'cyber_strike_vr_high_score_v2';

function readSavedHighScore(): number {
  const saved = localStorage.getItem(HIGH_SCORE_KEY);
  const value = saved ? parseInt(saved, 10) : 0;
  return Number.isFinite(value) ? value : 0;
}

/** 관전 대기 화면에 보여 줄 최근 경기 (이 기기에서 본 경기, 최대 5개) */
const RECENT_MATCHES_KEY = 'cyber_strike_recent_matches_v1';

function readRecentMatches(): MatchResultSummary[] {
  try {
    const raw = localStorage.getItem(RECENT_MATCHES_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    // 형식이 다른 옛 기록은 건너뜀
    return list
      .filter(
        (m): m is MatchResultSummary =>
          m && typeof m === 'object' && typeof m.p1Score === 'number' && typeof m.p2Score === 'number' && typeof m.endedAt === 'number' && typeof m.winner === 'string'
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

/** 경기장 테마는 기기마다 저장 (서버로 맞추지 않음, 처음에는 모든 기기가 사이버) */
const THEME_KEY = 'cyber_strike_theme_v1';

function readSavedTheme(): ThemeType {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'cyber' || saved === 'space' || saved === 'city') return saved;
  } catch {
    // 저장소를 쓸 수 없으면 기본 테마
  }
  return 'cyber';
}

/** 소리 설정도 기기마다 저장 (관전 TV는 TV대로, 선수 PC는 선수 PC대로) */
const AUDIO_KEY = 'cyber_strike_audio_v1';
const SOUND_PRESETS: SoundPresetType[] = ['laser', 'kinetic', 'retro'];

interface SavedAudio {
  preset: SoundPresetType;
  sfxVolume: number;
  voiceEnabled: boolean;
  voiceVolume: number;
  /** 관전 TV 소리 끔 (관전 화면일 때만 적용) */
  tvMuted: boolean;
}

const DEFAULT_AUDIO: SavedAudio = {
  preset: DEFAULT_SOUND_PRESET,
  sfxVolume: DEFAULT_SOUND_VOLUME,
  voiceEnabled: true,
  voiceVolume: DEFAULT_VOICE_VOLUME,
  tvMuted: false,
};

function readSavedAudio(): SavedAudio {
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (!saved || typeof saved !== 'object') return DEFAULT_AUDIO;
    const o = saved as Record<string, unknown>;
    // 형식이 다르거나 범위를 벗어난 값은 기본값으로
    const volume = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
    return {
      preset: SOUND_PRESETS.includes(o.preset as SoundPresetType) ? (o.preset as SoundPresetType) : DEFAULT_AUDIO.preset,
      sfxVolume: volume(o.sfxVolume, DEFAULT_AUDIO.sfxVolume),
      voiceEnabled: typeof o.voiceEnabled === 'boolean' ? o.voiceEnabled : DEFAULT_AUDIO.voiceEnabled,
      voiceVolume: volume(o.voiceVolume, DEFAULT_AUDIO.voiceVolume),
      tvMuted: o.tvMuted === true,
    };
  } catch {
    return DEFAULT_AUDIO;
  }
}

/** 관전 화면: 실제 경기 결과를 보여 주는 시간 / 시연이 끝난 뒤 다음 시연까지 쉬는 시간 */
const SPECTATOR_RESULT_MS = 20000;
const DEMO_RESTART_MS = 5000;

// page.tsx에서 브라우저 전용(ssr: false)으로 불러오므로 초기값에 window·localStorage를 바로 사용할 수 있음
export default function ShootingArenaApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ShootingArenaEngine | null>(null);

  // 시스템 및 통신 상태
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [connectionIssue, setConnectionIssue] = useState<ConnectionIssue | null>(null);
  const [clientRole, setClientRole] = useState<ClientRole>(readInitialRole);
  const [spectatorCameraMode, setSpectatorCameraMode] = useState<SpectatorCameraMode>('STADIUM');
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    pico_connected: false,
    virtual_connected: false,
    game_clients_count: 0,
    spectator_count: 0,
  });
  const [serverHost, setServerHost] = useState<string>(() => window.location.hostname || 'localhost');
  const [isP1Connected, setIsP1Connected] = useState<boolean>(false);
  const [isP2Connected, setIsP2Connected] = useState<boolean>(false);
  /** 경기 전 준비 상태 (친구 대결은 두 선수가 모두 준비되면 시작, 한 명만 준비하면 잠시 뒤 자동 시작) */
  const [readyInfo, setReadyInfo] = useState<ReadyInfo>(NO_READY);
  const [sensitivity, setSensitivity] = useState<number>(1.0);
  const [isVRSupported, setIsVRSupported] = useState<boolean>(false);

  // 게임 설정 및 상태
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeType>(readSavedTheme);
  const [currentShape, setCurrentShape] = useState<TargetShape>('drone');
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>('normal');
  const [savedAudio] = useState<SavedAudio>(readSavedAudio);
  const [soundPreset, setSoundPreset] = useState<SoundPresetType>(savedAudio.preset);
  const [soundVolume, setSoundVolume] = useState<number>(savedAudio.sfxVolume);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(savedAudio.voiceEnabled);
  const [voiceVolume, setVoiceVolume] = useState<number>(savedAudio.voiceVolume);
  const [tvMuted, setTvMuted] = useState<boolean>(savedAudio.tvMuted);
  /** 브라우저가 소리를 허락했는지 (관전 TV는 막혀 있으면 "한 번 클릭" 안내) */
  const audioStatus = useSyncExternalStore(subscribeAudioStatus, getAudioStatus, () => 'unknown' as const);

  const [stats, setStats] = useState<GameStats>({
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
  });

  const [versusStats, setVersusStats] = useState<VersusMatchStats>({
    mode: 'VERSUS_AI',
    timeRemaining: 60,
    p1Score: 0,
    p1Hits: 0,
    p1Combo: 0,
    p1Accuracy: 100,
    p2Score: 0,
    p2Hits: 0,
    p2Combo: 0,
    p2Accuracy: 100,
    p1Shots: 0,
    p2Shots: 0,
    spectatorCount: 0,
  });

  const [highScore, setHighScore] = useState<number>(readSavedHighScore);

  // 경기 결과 (플레이어 결과창 · 관전 결과 화면이 같은 요약을 씀)
  const [lastResult, setLastResult] = useState<MatchResultSummary | null>(null);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [spectatorResult, setSpectatorResult] = useState<MatchResultSummary | null>(null);
  const [spectatorResultUntil, setSpectatorResultUntil] = useState<number>(0);
  const [recentMatches, setRecentMatches] = useState<MatchResultSummary[]>(readRecentMatches);

  // 모달 상태
  // 관전 역할(주소의 ?role=spectator 또는 이 기기에 고정한 역할)이면 메인 메뉴 없이 바로 중계 화면
  const [isMainMenuOpen, setIsMainMenuOpen] = useState<boolean>(() => readInitialRole() !== 'SPECTATOR');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isGameOverOpen, setIsGameOverOpen] = useState<boolean>(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [highlightEntryId, setHighlightEntryId] = useState<string | undefined>();

  // 1. WebXR 지원 여부 체크
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const navXR = (navigator as unknown as NavigatorWithXR).xr;
      if (navXR && navXR.isSessionSupported) {
        navXR.isSessionSupported('immersive-vr').then((supported: boolean) => {
          setIsVRSupported(supported);
        }).catch(() => {
          setIsVRSupported(false);
        });
      }
    }
  }, []);

  // 2. Three.js 사격장 엔진 마운트 & InputManager 연동
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new ShootingArenaEngine(containerRef.current, readSavedTheme());
    engineRef.current = engine;

    engine.onStatsUpdate = (newStats) => {
      setStats(newStats);
    };

    engine.onVersusStatsUpdate = (vsStats) => {
      setVersusStats(vsStats);
    };

    engine.onPauseChange = (paused) => {
      setIsPaused(paused);
    };

    // 서버 경기는 시작한 쪽의 난이도로 모든 화면이 맞춰짐
    engine.onDifficultySync = (diff) => {
      setCurrentDifficulty(diff);
    };

    engine.onGameStarted = () => {
      // 경기가 시작되면 준비는 끝남 (InputManager도 match_started에서 지움)
      setReadyInfo((prev) => (prev.p1 || prev.p2 || prev.deadlineAt ? { ...prev, p1: false, p2: false, deadlineAt: 0 } : prev));
      setIsPlaying(true);
      setIsDemo(engine.isDemoRunning);
      setIsMainMenuOpen(false);
      setIsGameOverOpen(false);
      setIsLeaderboardOpen(false);
      setSpectatorResult(null);
    };

    engine.onGameOver = (finalStats, result) => {
      setIsPlaying(false);
      setIsDemo(false);
      if (result.aborted) {
        // 중단된 경기는 결과 등록 없이 정리 (플레이어는 메인 메뉴로, 관람 화면은 중계 화면 유지)
        setIsGameOverOpen(false);
        if (engine.clientRole !== 'SPECTATOR') {
          setIsMainMenuOpen(true);
        }
        return;
      }
      // 관전 시연은 결과 없이 대기 화면으로 (잠시 뒤 다시 시연)
      if (result.demo) return;

      const im = InputManager.getInstance();
      const v = result.versus;
      const summary: MatchResultSummary = {
        winner: normalizeWinner(result.winner, v.p1Score, v.p2Score),
        p1Score: v.p1Score,
        p2Score: v.p2Score,
        p1Hits: v.p1Hits,
        p2Hits: v.p2Hits,
        p1Accuracy: v.p1Accuracy,
        p2Accuracy: v.p2Accuracy,
        p1MaxCombo: v.p1MaxCombo ?? 0,
        p2MaxCombo: v.p2MaxCombo ?? 0,
        p1Shots: v.p1Shots,
        p2Shots: v.p2Shots,
        aiSlot: aiSlotOf(v.mode, im.isP1Connected, im.isP2Connected, engine.clientRole),
        endedAt: Date.now(),
      };
      setLastResult(summary);
      setRecentMatches((prev) => {
        const next = [summary, ...prev].slice(0, 5);
        try {
          localStorage.setItem(RECENT_MATCHES_KEY, JSON.stringify(next));
        } catch {
          // 저장 공간이 없으면 이번 화면에서만 보여 줌
        }
        return next;
      });

      if (engine.clientRole === 'SPECTATOR') {
        // 관전 화면은 기록 등록 없이 중계용 결과 화면
        setSpectatorResult(summary);
        setSpectatorResultUntil(Date.now() + SPECTATOR_RESULT_MS);
        return;
      }
      setIsGameOverOpen(true);
      setHighScore((prev) => {
        const best = Math.max(prev, finalStats.score);
        localStorage.setItem(HIGH_SCORE_KEY, best.toString());
        return best;
      });
    };

    const inputMgr = InputManager.getInstance();
    const syncReady = () => {
      const next: ReadyInfo = {
        supported: inputMgr.readySupported,
        p1: inputMgr.p1Ready,
        p2: inputMgr.p2Ready,
        deadlineAt: inputMgr.readyDeadlineAt,
      };
      setReadyInfo((prev) =>
        prev.supported === next.supported && prev.p1 === next.p1 && prev.p2 === next.p2 && prev.deadlineAt === next.deadlineAt ? prev : next
      );
    };
    inputMgr.onStatusChange = (status, wsConnected) => {
      setSystemStatus(status);
      setIsWsConnected(wsConnected);
      setConnectionIssue(inputMgr.connectionIssue);
      setIsP1Connected(inputMgr.isP1Connected);
      setIsP2Connected(inputMgr.isP2Connected);
      syncReady();
    };

    // 엔진이 등록한 핸들러(역할별 배치 등)를 유지한 채 화면 상태만 추가로 갱신
    const engineOnClientAssigned = inputMgr.onClientAssigned;
    inputMgr.onClientAssigned = (role, playerId) => {
      if (engineOnClientAssigned) engineOnClientAssigned(role, playerId);
      setClientRole(role);
      setIsP1Connected(inputMgr.isP1Connected);
      setIsP2Connected(inputMgr.isP2Connected);
    };

    const engineOnRoomStateChange = inputMgr.onRoomStateChange;
    inputMgr.onRoomStateChange = (state) => {
      if (engineOnRoomStateChange) engineOnRoomStateChange(state);
      setIsP1Connected(Boolean(state.p1Connected));
      setIsP2Connected(Boolean(state.p2Connected));
    };

    // URL 쿼리 또는 저장된 역할에 따라 자동 역할 배정 및 소켓 연결
    const initRole = readInitialRole();
    engine.setRole(initRole);
    inputMgr.connect(undefined, initRole);

    let demoTimer: ReturnType<typeof setTimeout> | undefined;
    if (initRole === 'SPECTATOR') {
      engine.setSpectatorCameraMode('STADIUM');
      // 진행 중인 경기가 없으면 관람 화면에서 AI 시연을 보여줌 (서버 경기에는 영향 없음, 실제 경기가 시작되면 자동 전환)
      demoTimer = setTimeout(() => {
        if (!engine.isPlaying) {
          engine.startLocalDemo();
        }
      }, 400);
    }

    return () => {
      if (demoTimer) clearTimeout(demoTimer);
      // 엔진이 등록한 입력 콜백은 engine.dispose()가 비움. 소켓은 앱 전체가 함께 쓰므로 그대로 둠
      engine.dispose();
      inputMgr.onStatusChange = undefined;
      engineRef.current = null;
    };
  }, []);

  const handleSelectSpectatorCamera = useCallback((mode: SpectatorCameraMode) => {
    setSpectatorCameraMode(mode);
    if (engineRef.current) {
      engineRef.current.setSpectatorCameraMode(mode);
    }
  }, []);

  // 관전 화면 순환: 실제 경기 결과(20초) 또는 시연 종료 → 대기 화면 → 잠시 뒤 AI 시연 다시 시작
  useEffect(() => {
    if (clientRole !== 'SPECTATOR' || isPlaying || isMainMenuOpen) return;
    const delay = spectatorResult ? Math.max(0, spectatorResultUntil - Date.now()) : DEMO_RESTART_MS;
    const timer = setTimeout(() => {
      setSpectatorResult(null);
      const engine = engineRef.current;
      if (engine && !engine.isPlaying) engine.startLocalDemo();
    }, delay);
    return () => clearTimeout(timer);
  }, [clientRole, isPlaying, isMainMenuOpen, spectatorResult, spectatorResultUntil]);

  // 소리 설정을 소리 관리자에 반영하고 이 기기에 저장 (소리를 내거나 AudioContext를 만들지 않음)
  useEffect(() => {
    const sound = SoundManager.getInstance();
    const voice = VoiceManager.getInstance();
    // TV 소리 끔은 관전 화면일 때만 (같은 기기를 선수로 바꾸면 소리가 남)
    const muted = tvMuted && clientRole === 'SPECTATOR';
    sound.setPreset(soundPreset);
    sound.setMasterVolume(soundVolume);
    sound.setMuted(muted);
    voice.setEnabled(voiceEnabled);
    voice.setVolume(voiceVolume);
    voice.setMuted(muted);
    try {
      const saved: SavedAudio = { preset: soundPreset, sfxVolume: soundVolume, voiceEnabled, voiceVolume, tvMuted };
      localStorage.setItem(AUDIO_KEY, JSON.stringify(saved));
    } catch {
      // 저장소를 쓸 수 없으면 이번 화면에서만 씀
    }
  }, [soundPreset, soundVolume, voiceEnabled, voiceVolume, tvMuted, clientRole]);

  // 브라우저가 클릭 없이도 소리를 허락하는지 확인하고, 첫 클릭·키 입력에서 소리를 켬
  useEffect(() => {
    void probeAutoplay();
    return installAudioUnlock(() => {
      SoundManager.getInstance().unlock();
      VoiceManager.getInstance().unlock();
    });
  }, []);

  /** 관전 TV 소리 켜기·끄기 (오른쪽 위 버튼·M 키). 같은 클릭·키로 방금 소리가 풀렸으면 끄지 않고 켜 둠 */
  const handleToggleTvSound = useCallback(() => {
    if (unlockedRecently()) setTvMuted(false);
    else setTvMuted((muted) => !muted);
  }, []);

  // 관람 카메라 단축키 바인딩 (1, 2, 3, 4) + TV 소리 켜기·끄기 (M)
  useEffect(() => {
    const handleCamKey = (e: KeyboardEvent) => {
      if (clientRole !== 'SPECTATOR') return;
      // 설정 창에서 서버 주소(숫자)를 입력하는 중에는 카메라를 바꾸지 않음
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select')) return;
      if (e.key === '1') handleSelectSpectatorCamera('STADIUM');
      if (e.key === '2') handleSelectSpectatorCamera('P1_VIEW');
      if (e.key === '3') handleSelectSpectatorCamera('P2_VIEW');
      if (e.key === '4') handleSelectSpectatorCamera('ORBIT');
      // 한글 입력 상태에서는 e.key가 'ㅡ'라서 자판 위치(e.code)로 봄
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) handleToggleTvSound();
    };
    window.addEventListener('keydown', handleCamKey);
    return () => window.removeEventListener('keydown', handleCamKey);
  }, [clientRole, handleSelectSpectatorCamera, handleToggleTvSound]);

  // 게임 제어 함수들
  const handleStartGame = useCallback(() => {
    if (engineRef.current) {
      setIsMainMenuOpen(false);
      setIsGameOverOpen(false);
      setIsLeaderboardOpen(false);
      // 실제 시작 상태는 엔진의 onGameStarted에서 반영 (서버 경기는 서버 신호에 맞춰 모두 함께 시작)
      engineRef.current.startGame();
    }
  }, []);

  const handlePauseGame = useCallback(() => {
    if (engineRef.current) {
      if (engineRef.current.isPaused) {
        engineRef.current.resumeGame();
      } else {
        engineRef.current.pauseGame();
      }
    }
  }, []);

  const handleAbortGame = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.abortGame('관리자 또는 사용자에 의한 경기 강제 중단');
    }
    setIsPlaying(false);
    setIsGameOverOpen(false);
    // 관전 화면은 메뉴 대신 중계 화면(대기 화면)을 유지
    if (!engine || engine.clientRole !== 'SPECTATOR') {
      setIsMainMenuOpen(true);
    }
  }, []);

  // ESC 키로 경기 즉시 중단, 열린 모달 닫기 또는 경기 전 준비 취소
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPlaying) {
          handleAbortGame();
        } else if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (isLeaderboardOpen) {
          setIsLeaderboardOpen(false);
        } else if (engineRef.current?.isLocalReady()) {
          engineRef.current.cancelReady();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isSettingsOpen, isLeaderboardOpen, handleAbortGame]);

  const handleSelectRole = useCallback((role: ClientRole) => {
    const engine = engineRef.current;
    const wasSpectator = engine?.clientRole === 'SPECTATOR';
    setClientRole(role);
    InputManager.getInstance().setRequestedRole(role);
    if (engine) {
      engine.setRole(role, true);
      if (role === 'SPECTATOR') {
        engine.setSpectatorCameraMode('STADIUM');
      }
    }
    if (wasSpectator && role !== 'SPECTATOR') {
      // 관전 화면이던 기기를 플레이어로 바꾸면 로비(메인 메뉴)로
      setSpectatorResult(null);
      setIsMainMenuOpen(true);
    }
  }, []);

  const handleJoinAsSpectator = useCallback(() => {
    handleSelectRole('SPECTATOR');
    if (engineRef.current && !engineRef.current.isPlaying) {
      // 진행 중인 경기가 없으면 관람 화면 AI 시연 (서버 경기에는 영향 없음)
      engineRef.current.startLocalDemo();
    }
    setSpectatorCameraMode('STADIUM');
    setIsMainMenuOpen(false);
  }, [handleSelectRole]);

  const handleSelectTheme = useCallback((theme: ThemeType) => {
    setCurrentTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 저장하지 못해도 이번 접속에서는 적용됨
    }
    if (engineRef.current) {
      engineRef.current.setTheme(theme);
    }
  }, []);

  const handleSelectShape = useCallback((shape: TargetShape) => {
    setCurrentShape(shape);
    if (engineRef.current) {
      engineRef.current.setTargetShape(shape);
    }
  }, []);

  const handleSelectDifficulty = useCallback((diff: Difficulty) => {
    setCurrentDifficulty(diff);
    if (engineRef.current) {
      engineRef.current.setDifficulty(diff);
    }
  }, []);

  // 소리 설정은 위의 효과가 소리 관리자에 반영하고 저장함
  const handleSelectSoundPreset = useCallback((preset: SoundPresetType) => {
    setSoundPreset(preset);
    // 고른 종류를 바로 들려줌 (시연 중이어도 원래 크기)
    const sound = SoundManager.getInstance();
    sound.setPreset(preset);
    sound.previewFire();
  }, []);

  const handleUpdateSoundVolume = useCallback((vol: number) => setSoundVolume(vol), []);
  const handleToggleVoice = useCallback((enabled: boolean) => setVoiceEnabled(enabled), []);
  const handleUpdateVoiceVolume = useCallback((vol: number) => setVoiceVolume(vol), []);

  const handleOpenLeaderboard = useCallback((id?: string) => {
    setHighlightEntryId(id);
    setIsLeaderboardOpen(true);
  }, []);

  const handleUpdateServerHost = useCallback((host: string) => {
    setServerHost(host);
    InputManager.getInstance().setServerHost(host);
  }, []);

  const handleUpdateSensitivity = useCallback((val: number) => {
    setSensitivity(val);
    InputManager.getInstance().sensitivity = val;
  }, []);

  // Quest 2 WebXR 세션 진입.
  // VR에 실제로 들어간 순간(sessionstart) 엔진이 경기를 시작(친구 대결은 '준비 완료')하므로 여기서는 메뉴만 닫음.
  // 권한 창을 기다리는 사이 상대가 준비해 경기가 먼저 시작되지 않게, 준비는 VR에 들어간 뒤에 보냄.
  // VR을 지원하지 않는 기기(PC 브라우저)는 예전처럼 PC 경기로 시작
  const handleEnterVR = useCallback(async () => {
    if (!engineRef.current) return;
    const renderer = engineRef.current.getRenderer();

    if (!isVRSupported || renderer.xr.isPresenting || renderer.xr.getSession()) {
      handleStartGame();
      return;
    }

    const closeMenus = () => {
      setIsMainMenuOpen(false);
      setIsGameOverOpen(false);
      setIsLeaderboardOpen(false);
    };

    const threeVRBtn = document.getElementById('three-vr-button');
    if (threeVRBtn) {
      closeMenus();
      threeVRBtn.click();
      return;
    }

    const navXR = (navigator as unknown as NavigatorWithXR).xr;
    if (navXR && navXR.requestSession) {
      try {
        const session = await navXR.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor'],
        });
        // 허가 창을 기다리는 사이 엔진이 다시 만들어졌을 수 있으므로 지금 살아 있는 렌더러에 붙임
        const liveRenderer = engineRef.current?.getRenderer();
        if (!liveRenderer) {
          await session.end();
          return;
        }
        closeMenus();
        await liveRenderer.xr.setSession(session);
      } catch (err) {
        console.error('Failed to enter WebXR:', err);
        handleStartGame();
      }
    } else {
      handleStartGame();
    }
  }, [handleStartGame, isVRSupported]);

  const handleCancelReady = useCallback(() => {
    engineRef.current?.cancelReady();
  }, []);

  // 플레이어가 PC로 경기 중이면 마우스 화살표 대신 실제 조준점(AimReticle)만 보이게 함
  const isAiming = isPlaying && clientRole !== 'SPECTATOR';

  // 관전 TV 소리 상태: 꺼 둠이 먼저, 그다음 브라우저가 막음(화면을 한 번 눌러야 함)
  const tvSound: TvSoundState = tvMuted ? 'muted' : audioStatus === 'allowed' ? 'on' : audioStatus;

  // 친구 대결 준비 띠: 경기 전에 나나 상대가 준비했을 때 (선수 화면만)
  const mySlot: 1 | 2 | null = clientRole === 'P1' ? 1 : clientRole === 'P2' ? 2 : null;
  const meReady = mySlot === 1 ? readyInfo.p1 : mySlot === 2 ? readyInfo.p2 : false;
  const rivalReady = mySlot === 1 ? readyInfo.p2 : mySlot === 2 ? readyInfo.p1 : false;
  const showReadyBanner =
    mySlot !== null && !isPlaying && isWsConnected && readyInfo.supported && isP1Connected && isP2Connected && (meReady || rivalReady);
  // 메뉴·결과 창이 열려 있으면 창 안쪽 맨 위에 넣어 창 머리글을 가리지 않게 함
  const readyBanner = (inline: boolean) =>
    mySlot !== null ? (
      <ReadyBanner
        inline={inline}
        mySlot={mySlot}
        meReady={meReady}
        rivalReady={rivalReady}
        deadlineAt={readyInfo.deadlineAt}
        isVRSupported={isVRSupported}
        onEnterVR={handleEnterVR}
        onStartPC={handleStartGame}
        onCancel={handleCancelReady}
      />
    ) : null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* 1. Three.js 3D WebGL 렌더링 컨테이너 */}
      <div id="canvas-container" ref={containerRef} className={isAiming && !isPaused ? 'cursor-none' : undefined} />

      {/* 2. 플레이어 HUD 또는 관전 중계 화면 (메인 메뉴 닫힘 시 활성화) */}
      {!isMainMenuOpen && (
        <GameHUD
          stats={stats}
          versusStats={versusStats}
          clientRole={clientRole}
          difficulty={currentDifficulty}
          systemStatus={systemStatus}
          isWsConnected={isWsConnected}
          connectionIssue={connectionIssue}
          isPlaying={isPlaying}
          isPaused={isPaused}
          onStartGame={handleStartGame}
          onPauseGame={handlePauseGame}
          onAbortGame={handleAbortGame}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenLeaderboard={() => handleOpenLeaderboard()}
          onEnterVR={handleEnterVR}
          isVRSupported={isVRSupported}
          spectatorCameraMode={spectatorCameraMode}
          onSelectSpectatorCamera={handleSelectSpectatorCamera}
          isP1Connected={isP1Connected}
          isP2Connected={isP2Connected}
          isDemo={isDemo}
          spectatorResult={spectatorResult}
          spectatorResultUntil={spectatorResultUntil}
          recentMatches={recentMatches}
          readyInfo={readyInfo}
          hideStartHint={showReadyBanner}
          tvSound={tvSound}
          onToggleTvSound={handleToggleTvSound}
        />
      )}

      {/* 2.4 친구 대결 준비 띠 (메뉴·결과 창이 없을 때는 화면 위쪽 가운데에 띄움) */}
      {showReadyBanner && !isMainMenuOpen && !isGameOverOpen && readyBanner(false)}

      {/* 2.5 PC 조준점 (실제로 겨누는 곳을 따라감) */}
      {isAiming && (
        <AimReticle engineRef={engineRef} hits={stats.hits} slot={clientRole === 'P2' ? 2 : 1} dimmed={isPaused} />
      )}

      {/* 3. 메인 메뉴 모달 */}
      <MainMenuModal
        isOpen={isMainMenuOpen}
        onStart={handleStartGame}
        onEnterVR={handleEnterVR}
        onJoinAsSpectator={handleJoinAsSpectator}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLeaderboard={() => handleOpenLeaderboard()}
        currentTheme={currentTheme}
        currentShape={currentShape}
        currentDifficulty={currentDifficulty}
        onSelectDifficulty={handleSelectDifficulty}
        highScore={highScore}
        clientRole={clientRole}
        versusMode={versusStats.mode}
        isP1Connected={isP1Connected}
        isP2Connected={isP2Connected}
        connectionIssue={connectionIssue}
        notice={showReadyBanner ? readyBanner(true) : undefined}
      />

      {/* 4. 사격장 설정 모달 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={currentTheme}
        currentShape={currentShape}
        currentDifficulty={currentDifficulty}
        onSelectTheme={handleSelectTheme}
        onSelectShape={handleSelectShape}
        onSelectDifficulty={handleSelectDifficulty}
        serverHost={serverHost}
        onUpdateServerHost={handleUpdateServerHost}
        sensitivity={sensitivity}
        onUpdateSensitivity={handleUpdateSensitivity}
        soundPreset={soundPreset}
        onSelectSoundPreset={handleSelectSoundPreset}
        soundVolume={soundVolume}
        onUpdateSoundVolume={handleUpdateSoundVolume}
        voiceEnabled={voiceEnabled}
        onToggleVoice={handleToggleVoice}
        voiceVolume={voiceVolume}
        onUpdateVoiceVolume={handleUpdateVoiceVolume}
        clientRole={clientRole}
        onSelectRole={handleSelectRole}
        soundMuted={tvMuted && clientRole === 'SPECTATOR'}
      />

      {/* 5. 플레이어 결과창 (관전 화면은 중계 화면 안의 결과 화면) - 열릴 때마다 새로 마운트해 기록 등록 상태 초기화 */}
      {isGameOverOpen && lastResult && clientRole !== 'SPECTATOR' && (
        <GameOverModal
          stats={stats}
          result={lastResult}
          clientRole={clientRole}
          highScore={highScore}
          difficulty={currentDifficulty}
          theme={currentTheme}
          onRestart={handleStartGame}
          notice={showReadyBanner ? readyBanner(true) : undefined}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onViewLeaderboard={(id) => handleOpenLeaderboard(id)}
          onGoToMainMenu={() => {
            setIsGameOverOpen(false);
            setIsMainMenuOpen(true);
          }}
        />
      )}

      {/* 6. Top 10 순위표 모달 */}
      <LeaderboardModal
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        highlightId={highlightEntryId}
      />
    </main>
  );
}
