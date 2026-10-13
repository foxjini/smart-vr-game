'use client';

import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { ConnectionIssue, Difficulty, GameStats, SpectatorCameraMode, VersusMatchStats } from '@/types';
import { CAMERA_NAME, CAMERA_ORDER } from '@/constants/labels';
import { Pill, cx } from '@/components/ui/kit';
import { MatchResultSummary, NO_READY, ReadyInfo, aiSlotOf } from '@/components/ui/matchInfo';
import { useIdle, useStageScale } from './hooks';
import { OperatorControls } from './OperatorControls';
import { connectionText } from './PlayerHUD';
import { AttractScreen } from './broadcast/AttractScreen';
import { LiveBroadcast } from './broadcast/LiveBroadcast';
import { BroadcastResult } from './broadcast/BroadcastResult';
import { ReadyStrip } from './broadcast/ReadyStrip';

export interface BroadcastOverlayProps {
  stats: GameStats;
  versusStats?: VersusMatchStats;
  difficulty: Difficulty;
  isWsConnected: boolean;
  connectionIssue: ConnectionIssue | null;
  isPlaying: boolean;
  isPaused: boolean;
  /** 대기용 AI 시연 중 (실제 경기 아님) */
  isDemo: boolean;
  isP1Connected: boolean;
  isP2Connected: boolean;
  spectatorCameraMode: SpectatorCameraMode;
  onSelectSpectatorCamera?: (mode: SpectatorCameraMode) => void;
  result: MatchResultSummary | null;
  resultUntil: number;
  recentMatches: MatchResultSummary[];
  /** 경기 전 준비 상태 (친구 대결 준비 띠·대기 화면 자리 표시) */
  readyInfo?: ReadyInfo;
  onStartGame: () => void;
  onPauseGame: () => void;
  onAbortGame?: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
}

const EMPTY_VERSUS: VersusMatchStats = {
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
};

/**
 * 관전 모니터(TV) 중계 화면.
 * 그래픽은 1920×1080 무대에 배치한 뒤 화면 크기에 맞춰 통째로 확대·축소하고,
 * 운영 버튼은 오른쪽 위에 실제 크기로 두어 마우스를 움직이지 않으면 3초 뒤 사라짐
 */
export function BroadcastOverlay({
  stats,
  versusStats = EMPTY_VERSUS,
  difficulty,
  isWsConnected,
  connectionIssue,
  isPlaying,
  isPaused,
  isDemo,
  isP1Connected,
  isP2Connected,
  spectatorCameraMode,
  onSelectSpectatorCamera,
  result,
  resultUntil,
  recentMatches,
  readyInfo = NO_READY,
  onStartGame,
  onPauseGame,
  onAbortGame,
  onOpenSettings,
  onOpenLeaderboard,
}: BroadcastOverlayProps) {
  const scale = useStageScale();
  const idle = useIdle(3000);
  const live = isPlaying && !isDemo;
  const aiSlot = aiSlotOf(versusStats.mode, isP1Connected, isP2Connected, 'SPECTATOR');
  const conn = connectionText(isWsConnected, connectionIssue);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 h-[1080px] w-[1920px] origin-center"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {live ? (
          <LiveBroadcast
            versusStats={versusStats}
            timeRemaining={stats.timeRemaining}
            isPaused={isPaused}
            aiSlot={aiSlot}
            difficulty={difficulty}
            cameraMode={spectatorCameraMode}
          />
        ) : result ? (
          <BroadcastResult key={result.endedAt} result={result} until={resultUntil} difficulty={difficulty} />
        ) : (
          <AttractScreen
            isDemo={isDemo && isPlaying}
            isP1Connected={isP1Connected}
            isP2Connected={isP2Connected}
            difficulty={difficulty}
            recentMatches={recentMatches}
            readyInfo={readyInfo}
          />
        )}
        {/* 친구 대결 준비 띠 (대기·결과 화면 위쪽 가운데) */}
        {!live && <ReadyStrip readyInfo={readyInfo} isP1Connected={isP1Connected} isP2Connected={isP2Connected} />}
      </div>

      {/* 운영 버튼 (마우스를 움직이면 나타남) */}
      <div
        className={cx(
          'absolute right-5 top-5 flex flex-col items-end gap-2 transition-[opacity,visibility] duration-500',
          idle ? 'invisible opacity-0' : 'visible opacity-100'
        )}
      >
        <OperatorControls
          mode="spectator"
          matchRunning={live}
          isPaused={isPaused}
          canStart={!live && (isP1Connected || isP2Connected)}
          isVRSupported={false}
          onStartGame={onStartGame}
          onPauseGame={onPauseGame}
          onAbortGame={onAbortGame}
          onOpenSettings={onOpenSettings}
          onOpenLeaderboard={onOpenLeaderboard}
          className="rounded-xl border border-line bg-panel/90 p-1.5 shadow-panel backdrop-blur-md"
        />
        <div
          className="hud-interactive flex items-center gap-1 rounded-xl border border-line bg-panel/90 p-1.5 shadow-panel backdrop-blur-md"
          role="group"
          aria-label="중계 카메라 (숫자 키 1~4)"
        >
          {CAMERA_ORDER.map((mode, i) => (
            <button
              key={mode}
              type="button"
              aria-pressed={spectatorCameraMode === mode}
              onClick={(e) => {
                onSelectSpectatorCamera?.(mode);
                if (e.detail > 0) e.currentTarget.blur();
              }}
              className={cx(
                'flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold transition-colors',
                spectatorCameraMode === mode ? 'bg-raised text-fg ring-1 ring-p1/70' : 'text-fg-2 hover:bg-white/6 hover:text-fg'
              )}
            >
              <span className="font-num text-[15px] font-bold text-fg-3">{i + 1}</span>
              {CAMERA_NAME[mode]}
            </button>
          ))}
        </div>
        {conn.tone !== 'ok' && (
          <Pill tone={conn.tone} icon={TriangleAlert} size="lg">
            {conn.text}
          </Pill>
        )}
      </div>
    </div>
  );
}
