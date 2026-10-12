'use client';

import React from 'react';
import { GameStats, SystemStatus, VersusMatchStats, ClientRole, SpectatorCameraMode, Difficulty, ConnectionIssue } from '@/types';
import { MatchResultSummary } from '@/components/ui/matchInfo';
import { PlayerHUD } from '@/components/ui/hud/PlayerHUD';
import { BroadcastOverlay } from '@/components/ui/hud/BroadcastOverlay';

interface GameHUDProps {
  stats: GameStats;
  systemStatus: SystemStatus;
  versusStats?: VersusMatchStats;
  clientRole: ClientRole;
  difficulty?: Difficulty;
  isWsConnected: boolean;
  /** 역할 자리 관련 연결 문제 (다른 기기가 사용 중 등) */
  connectionIssue?: ConnectionIssue | null;
  isPlaying: boolean;
  isPaused?: boolean;
  onStartGame: () => void;
  onPauseGame: () => void;
  onAbortGame?: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
  onEnterVR: () => void;
  isVRSupported: boolean;
  spectatorCameraMode?: SpectatorCameraMode;
  onSelectSpectatorCamera?: (mode: SpectatorCameraMode) => void;
  isP1Connected?: boolean;
  isP2Connected?: boolean;
  /** 관전 화면: 대기용 AI 시연 중 */
  isDemo?: boolean;
  /** 관전 화면: 방금 끝난 경기 결과 (없으면 대기 화면) */
  spectatorResult?: MatchResultSummary | null;
  /** 관전 화면: 결과를 보여 주는 마지막 시각 (ms) */
  spectatorResultUntil?: number;
  /** 관전 화면 대기 화면의 최근 경기 */
  recentMatches?: MatchResultSummary[];
}

/** 역할에 따라 관전 중계 화면 또는 플레이어 HUD를 보여 줌 */
export const GameHUD: React.FC<GameHUDProps> = ({
  stats,
  systemStatus,
  versusStats,
  clientRole,
  difficulty = 'normal',
  isWsConnected,
  connectionIssue = null,
  isPlaying,
  isPaused = false,
  onStartGame,
  onPauseGame,
  onAbortGame,
  onOpenSettings,
  onOpenLeaderboard,
  onEnterVR,
  isVRSupported,
  spectatorCameraMode = 'STADIUM',
  onSelectSpectatorCamera,
  isP1Connected = false,
  isP2Connected = false,
  isDemo = false,
  spectatorResult = null,
  spectatorResultUntil = 0,
  recentMatches = [],
}) => {
  if (clientRole === 'SPECTATOR') {
    return (
      <BroadcastOverlay
        stats={stats}
        versusStats={versusStats}
        difficulty={difficulty}
        isWsConnected={isWsConnected}
        connectionIssue={connectionIssue}
        isPlaying={isPlaying}
        isPaused={isPaused}
        isDemo={isDemo}
        isP1Connected={isP1Connected}
        isP2Connected={isP2Connected}
        spectatorCameraMode={spectatorCameraMode}
        onSelectSpectatorCamera={onSelectSpectatorCamera}
        result={spectatorResult}
        resultUntil={spectatorResultUntil}
        recentMatches={recentMatches}
        onStartGame={onStartGame}
        onPauseGame={onPauseGame}
        onAbortGame={onAbortGame}
        onOpenSettings={onOpenSettings}
        onOpenLeaderboard={onOpenLeaderboard}
      />
    );
  }

  return (
    <PlayerHUD
      stats={stats}
      systemStatus={systemStatus}
      versusStats={versusStats}
      clientRole={clientRole}
      difficulty={difficulty}
      isWsConnected={isWsConnected}
      connectionIssue={connectionIssue}
      isPlaying={isPlaying}
      isPaused={isPaused}
      isP1Connected={isP1Connected}
      isP2Connected={isP2Connected}
      isVRSupported={isVRSupported}
      onStartGame={onStartGame}
      onPauseGame={onPauseGame}
      onAbortGame={onAbortGame}
      onOpenSettings={onOpenSettings}
      onOpenLeaderboard={onOpenLeaderboard}
      onEnterVR={onEnterVR}
    />
  );
};
