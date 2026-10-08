'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShootingArenaEngine } from '@/components/arena/ShootingArenaEngine';
import { InputManager } from '@/core/input/InputManager';
import { SoundManager } from '@/core/audio/SoundManager';
import { VoiceManager } from '@/core/audio/VoiceManager';
import { GameHUD } from '@/components/ui/GameHUD';
import { SettingsModal } from '@/components/ui/SettingsModal';
import { GameOverModal } from '@/components/ui/GameOverModal';
import { MainMenuModal } from '@/components/ui/MainMenuModal';
import { LeaderboardModal } from '@/components/ui/LeaderboardModal';
import { CyberCrosshair } from '@/components/ui/CyberCrosshair';
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
  const [isP2Connected, setIsP2Connected] = useState<boolean>(false);
  const [sensitivity, setSensitivity] = useState<number>(1.0);
  const [isVRSupported, setIsVRSupported] = useState<boolean>(false);

  // 게임 설정 및 상태
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('cyber');
  const [currentShape, setCurrentShape] = useState<TargetShape>('drone');
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>('normal');
  const [soundPreset, setSoundPreset] = useState<SoundPresetType>(DEFAULT_SOUND_PRESET);
  const [soundVolume, setSoundVolume] = useState<number>(DEFAULT_SOUND_VOLUME);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [voiceVolume, setVoiceVolume] = useState<number>(DEFAULT_VOICE_VOLUME);

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
    spectatorCount: 0,
  });

  const [highScore, setHighScore] = useState<number>(readSavedHighScore);

  // 모달 상태
  // 관람 중계 주소(?role=spectator)로 열면 메인 메뉴 없이 바로 중계 화면
  const [isMainMenuOpen, setIsMainMenuOpen] = useState<boolean>(() => readUrlRole() !== 'SPECTATOR');
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

    const engine = new ShootingArenaEngine(containerRef.current);
    engineRef.current = engine;

    engine.setSoundPreset(DEFAULT_SOUND_PRESET);
    engine.setMasterVolume(DEFAULT_SOUND_VOLUME);
    VoiceManager.getInstance().setEnabled(true);
    VoiceManager.getInstance().setVolume(DEFAULT_VOICE_VOLUME);

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
      setIsPlaying(true);
      setIsMainMenuOpen(false);
      setIsGameOverOpen(false);
      setIsLeaderboardOpen(false);
    };

    engine.onGameOver = (finalStats, result) => {
      setIsPlaying(false);
      if (result.aborted) {
        // 중단된 경기는 결과 등록 없이 정리 (플레이어는 메인 메뉴로, 관람 화면은 중계 화면 유지)
        setIsGameOverOpen(false);
        if (engine.clientRole !== 'SPECTATOR') {
          setIsMainMenuOpen(true);
        }
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
    inputMgr.onStatusChange = (status, wsConnected) => {
      setSystemStatus(status);
      setIsWsConnected(wsConnected);
      setConnectionIssue(inputMgr.connectionIssue);
      setIsP2Connected(inputMgr.isP2Connected);
    };

    // 엔진이 등록한 핸들러(역할별 배치 등)를 유지한 채 화면 상태만 추가로 갱신
    const engineOnClientAssigned = inputMgr.onClientAssigned;
    inputMgr.onClientAssigned = (role, playerId) => {
      if (engineOnClientAssigned) engineOnClientAssigned(role, playerId);
      setClientRole(role);
      setIsP2Connected(inputMgr.isP2Connected);
    };

    const engineOnRoomStateChange = inputMgr.onRoomStateChange;
    inputMgr.onRoomStateChange = (state) => {
      if (engineOnRoomStateChange) engineOnRoomStateChange(state);
      setIsP2Connected(Boolean(state.p2Connected));
    };

    // URL 쿼리 또는 저장된 역할에 따라 자동 역할 배정 및 소켓 연결
    const initRole = readInitialRole();
    engine.setRole(initRole);
    inputMgr.connect(undefined, initRole);

    let demoTimer: ReturnType<typeof setTimeout> | undefined;
    if (initRole === 'SPECTATOR') {
      engine.setSpectatorCameraMode('STADIUM');
      // 1P가 아직 없으면 관람 화면에서 AI 시연을 보여줌 (서버 경기에는 영향 없음, 실제 경기가 시작되면 자동 전환)
      demoTimer = setTimeout(() => {
        if (!inputMgr.isP1Connected && !engine.isPlaying) {
          engine.startLocalDemo();
        }
      }, 400);
    }

    return () => {
      if (demoTimer) clearTimeout(demoTimer);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleSelectSpectatorCamera = useCallback((mode: SpectatorCameraMode) => {
    setSpectatorCameraMode(mode);
    if (engineRef.current) {
      engineRef.current.setSpectatorCameraMode(mode);
    }
  }, []);

  // 관람 카메라 단축키 바인딩 (1, 2, 3, 4)
  useEffect(() => {
    const handleCamKey = (e: KeyboardEvent) => {
      if (clientRole !== 'SPECTATOR') return;
      if (e.key === '1') handleSelectSpectatorCamera('STADIUM');
      if (e.key === '2') handleSelectSpectatorCamera('P1_VIEW');
      if (e.key === '3') handleSelectSpectatorCamera('P2_VIEW');
      if (e.key === '4') handleSelectSpectatorCamera('ORBIT');
    };
    window.addEventListener('keydown', handleCamKey);
    return () => window.removeEventListener('keydown', handleCamKey);
  }, [clientRole, handleSelectSpectatorCamera]);

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
    if (engineRef.current) {
      engineRef.current.abortGame('관리자 또는 사용자에 의한 경기 강제 중단');
    }
    setIsPlaying(false);
    setIsGameOverOpen(false);
    setIsMainMenuOpen(true);
  }, []);

  // ESC 키로 경기 즉시 중단 또는 열린 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPlaying) {
          handleAbortGame();
        } else if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (isLeaderboardOpen) {
          setIsLeaderboardOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isSettingsOpen, isLeaderboardOpen, handleAbortGame]);

  const handleSelectRole = useCallback((role: ClientRole) => {
    setClientRole(role);
    InputManager.getInstance().setRequestedRole(role);
    if (engineRef.current) {
      engineRef.current.setRole(role, true);
      if (role === 'SPECTATOR') {
        engineRef.current.setSpectatorCameraMode('STADIUM');
      }
    }
  }, []);

  const handleJoinAsSpectator = useCallback(() => {
    handleSelectRole('SPECTATOR');
    if (engineRef.current && !InputManager.getInstance().isP1Connected && !engineRef.current.isPlaying) {
      // 1P가 없으면 관람 화면 AI 시연 (서버 경기에는 영향 없음)
      engineRef.current.startLocalDemo();
    }
    setSpectatorCameraMode('STADIUM');
    setIsMainMenuOpen(false);
  }, [handleSelectRole]);

  const handleSelectTheme = useCallback((theme: ThemeType) => {
    setCurrentTheme(theme);
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

  const handleSelectSoundPreset = useCallback((preset: SoundPresetType) => {
    setSoundPreset(preset);
    if (engineRef.current) {
      engineRef.current.setSoundPreset(preset);
    } else {
      SoundManager.getInstance().setPreset(preset);
    }
  }, []);

  const handleUpdateSoundVolume = useCallback((vol: number) => {
    setSoundVolume(vol);
    if (engineRef.current) {
      engineRef.current.setMasterVolume(vol);
    } else {
      SoundManager.getInstance().setMasterVolume(vol);
    }
  }, []);

  const handleToggleVoice = useCallback((enabled: boolean) => {
    setVoiceEnabled(enabled);
    VoiceManager.getInstance().setEnabled(enabled);
  }, []);

  const handleUpdateVoiceVolume = useCallback((vol: number) => {
    setVoiceVolume(vol);
    VoiceManager.getInstance().setVolume(vol);
  }, []);

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

  // Quest 2 WebXR 세션 진입
  const handleEnterVR = useCallback(async () => {
    if (!engineRef.current) return;
    const renderer = engineRef.current.getRenderer();

    if (renderer.xr.isPresenting || renderer.xr.getSession()) {
      handleStartGame();
      return;
    }

    const threeVRBtn = document.getElementById('three-vr-button');
    if (threeVRBtn) {
      threeVRBtn.click();
      handleStartGame();
      return;
    }

    const navXR = (navigator as unknown as NavigatorWithXR).xr;
    if (navXR && navXR.requestSession) {
      try {
        const session = await navXR.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor'],
        });
        await renderer.xr.setSession(session);
        handleStartGame();
      } catch (err) {
        console.error('Failed to enter WebXR:', err);
        handleStartGame();
      }
    } else {
      handleStartGame();
    }
  }, [handleStartGame]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* 1. Three.js 3D WebGL 렌더링 컨테이너 */}
      <div id="canvas-container" ref={containerRef} />

      {/* 2. 1:1 대결 & 옵저버 HUD 오버레이 (메인 메뉴 닫힘 시 활성화) */}
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
        />
      )}

      {/* 2.5 인게임 정밀 HUD 조준선 */}
      {isPlaying && clientRole !== 'SPECTATOR' && (
        <CyberCrosshair opacity={0.45} />
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
        isP2Connected={isP2Connected}
        connectionIssue={connectionIssue}
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
      />

      {/* 5. 게임오버 결과 모달 (1:1 스탯 비교) - 열릴 때마다 새로 마운트해 기록 등록 상태 초기화 */}
      {isGameOverOpen && (
        <GameOverModal
          isOpen={isGameOverOpen}
          stats={stats}
          versusStats={versusStats}
          clientRole={clientRole}
          highScore={highScore}
          difficulty={currentDifficulty}
          theme={currentTheme}
          onRestart={handleStartGame}
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
