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
} from '@/types';

interface NavigatorWithXR {
  xr?: {
    isSessionSupported?: (mode: string) => Promise<boolean>;
    requestSession?: (mode: string, options?: Record<string, unknown>) => Promise<XRSession>;
  };
}

export default function ShootingArenaPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ShootingArenaEngine | null>(null);

  // 시스템 및 통신 상태
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [clientRole, setClientRole] = useState<ClientRole>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('mode') === 'observer' || urlParams.get('role') === 'spectator') {
        return 'SPECTATOR';
      }
    }
    return 'P1';
  });
  const [spectatorCameraMode, setSpectatorCameraMode] = useState<SpectatorCameraMode>('STADIUM');
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    pico_connected: false,
    virtual_connected: false,
    game_clients_count: 0,
    spectator_count: 0,
  });
  const [serverHost, setServerHost] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hostname) {
      return window.location.hostname;
    }
    return 'localhost';
  });
  const [isP2Connected, setIsP2Connected] = useState<boolean>(false);
  const [sensitivity, setSensitivity] = useState<number>(1.0);
  const [isVRSupported, setIsVRSupported] = useState<boolean>(false);

  // 게임 설정 및 상태
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('cyber');
  const [currentShape, setCurrentShape] = useState<TargetShape>('drone');
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>('normal');
  const [soundPreset, setSoundPreset] = useState<SoundPresetType>('laser');
  const [soundVolume, setSoundVolume] = useState<number>(0.8);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [voiceVolume, setVoiceVolume] = useState<number>(0.9);

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

  const [highScore, setHighScore] = useState<number>(0);

  // 모달 상태
  const [isMainMenuOpen, setIsMainMenuOpen] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isGameOverOpen, setIsGameOverOpen] = useState<boolean>(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [highlightEntryId, setHighlightEntryId] = useState<string | undefined>();

  // 클라이언트 로컬 스토리지 & URL 파라미터 동기화 (SSR Hydration mismatch 방지)
  useEffect(() => {
    const savedScore =
      localStorage.getItem('cyber_strike_vr_high_score') ||
      localStorage.getItem('nunchuk_vr_high_score');
    if (savedScore) {
      setHighScore(parseInt(savedScore, 10));
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'observer' || urlParams.get('role') === 'spectator') {
      setIsMainMenuOpen(false);
    }
  }, []);

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

    engine.setSoundPreset(soundPreset);
    engine.setMasterVolume(soundVolume);
    VoiceManager.getInstance().setEnabled(voiceEnabled);
    VoiceManager.getInstance().setVolume(voiceVolume);

    engine.onStatsUpdate = (newStats) => {
      setStats(newStats);
    };

    engine.onVersusStatsUpdate = (vsStats) => {
      setVersusStats(vsStats);
    };

    engine.onGameStarted = () => {
      setIsPlaying(true);
      setIsMainMenuOpen(false);
      setIsGameOverOpen(false);
      setIsLeaderboardOpen(false);
    };

    engine.onGameOver = (finalStats) => {
      setIsPlaying(false);
      setIsGameOverOpen(true);
      setHighScore((prev) => {
        const best = Math.max(prev, finalStats.score);
        localStorage.setItem('cyber_strike_vr_high_score', best.toString());
        return best;
      });
    };

    const inputMgr = InputManager.getInstance();
    inputMgr.onStatusChange = (status, wsConnected) => {
      setSystemStatus(status);
      setIsWsConnected(wsConnected);
      setIsP2Connected(inputMgr.isP2Connected);
    };

    inputMgr.onClientAssigned = (role) => {
      setClientRole(role);
      engine.clientRole = role;
      setIsP2Connected(inputMgr.isP2Connected);
    };

    const origRoomStateChange = inputMgr.onRoomStateChange;
    inputMgr.onRoomStateChange = (state) => {
      if (origRoomStateChange) origRoomStateChange(state);
      setIsP2Connected(Boolean(state.p2Connected));
    };

    // URL 쿼리에 ?mode=observer 또는 ?role=spectator가 있는 경우 자동 관람 모드
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('mode') === 'observer' || urlParams.get('role') === 'spectator') {
        engine.setRole('SPECTATOR');
        engine.setSpectatorCameraMode('STADIUM');
        setTimeout(() => {
          if (!inputMgr.isP1Connected && engineRef.current && !engineRef.current.isPlaying) {
            engineRef.current.startGame();
          }
        }, 400);
      } else {
        inputMgr.connect();
      }
    }

    return () => {
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
  }, [isPlaying, isSettingsOpen, isLeaderboardOpen]);

  // 게임 제어 함수들
  const handleStartGame = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.startGame();
      setIsPlaying(true);
      setIsMainMenuOpen(false);
      setIsGameOverOpen(false);
      setIsLeaderboardOpen(false);
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

  const handleJoinAsSpectator = useCallback(() => {
    setClientRole('SPECTATOR');
    if (engineRef.current) {
      engineRef.current.setRole('SPECTATOR');
      engineRef.current.setSpectatorCameraMode('STADIUM');
      if (!InputManager.getInstance().isP1Connected && !engineRef.current.isPlaying) {
        engineRef.current.startGame();
      }
    } else {
      InputManager.getInstance().setRequestedRole('SPECTATOR');
    }
    setSpectatorCameraMode('STADIUM');
    setIsMainMenuOpen(false);
  }, []);

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
          isPlaying={isPlaying}
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
      />

      {/* 5. 게임오버 결과 모달 (1:1 스탯 비교) */}
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

      {/* 6. Top 10 순위표 모달 */}
      <LeaderboardModal
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        highlightId={highlightEntryId}
      />
    </main>
  );
}
