'use client';

import React from 'react';
import { GameStats, SystemStatus, VersusMatchStats, ClientRole, SpectatorCameraMode, Difficulty } from '@/types';
import {
  Activity,
  Sliders,
  Play,
  Pause,
  Headset,
  Trophy,
  BookOpen,
  Eye,
  Tv,
  Crosshair,
  RotateCcw,
} from 'lucide-react';

interface GameHUDProps {
  stats: GameStats;
  systemStatus: SystemStatus;
  versusStats?: VersusMatchStats;
  clientRole: ClientRole;
  difficulty?: Difficulty;
  isWsConnected: boolean;
  isPlaying: boolean;
  onStartGame: () => void;
  onPauseGame: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
  onEnterVR: () => void;
  isVRSupported: boolean;
  spectatorCameraMode?: SpectatorCameraMode;
  onSelectSpectatorCamera?: (mode: SpectatorCameraMode) => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  stats,
  systemStatus,
  versusStats,
  clientRole,
  difficulty = 'normal',
  isWsConnected,
  isPlaying,
  onStartGame,
  onPauseGame,
  onOpenSettings,
  onOpenLeaderboard,
  onEnterVR,
  isVRSupported,
  spectatorCameraMode = 'STADIUM',
  onSelectSpectatorCamera,
}) => {
  const p1Score = versusStats ? versusStats.p1Score : stats.score;
  const p2Score = versusStats ? versusStats.p2Score : 0;
  const totalScore = p1Score + p2Score;
  const p1Ratio = totalScore > 0 ? (p1Score / totalScore) * 100 : 50;

  const scoreDiff = p1Score - p2Score;
  let leadText = '동점';
  if (scoreDiff > 0) leadText = `P1 +${scoreDiff.toLocaleString()} 앞섬`;
  else if (scoreDiff < 0) leadText = `P2 +${Math.abs(scoreDiff).toLocaleString()} 앞섬`;

  const getDifficultyKorean = (diff: Difficulty) => {
    switch (diff) {
      case 'easy': return '초보자';
      case 'normal': return '표준';
      case 'hard': return '프로';
      default: return diff;
    }
  };

  return (
    <div className="hud-layer">
      {/* =================================================================== */}
      {/* 1. 상단 글로벌 HUD 텔레메트리 바 */}
      {/* =================================================================== */}
      <header className="flex justify-between items-start w-full gap-4">
        {/* 좌측: 타이틀, 통신 및 역할 상태 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="cyber-title text-xl text-cyan-400 font-bold tracking-widest">
              CYBER STRIKE
            </h1>
            <span className="text-[10px] px-2 py-0.5 border border-cyan-500/40 text-cyan-300 font-mono tracking-wider bg-cyan-950/20 rounded-sm">
              1:1 실시간 대결
            </span>
          </div>

          <div className="flex items-center gap-2 hud-interactive">
            {/* 서버 상태 */}
            <div className="status-pill">
              <span className={`indicator-dot ${isWsConnected ? 'dot-green' : 'dot-red'}`} />
              <span className="text-gray-400">서버:</span>
              <span className={isWsConnected ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {isWsConnected ? '정상 연결' : '오프라인'}
              </span>
            </div>

            {/* 역할 배지 */}
            <div className="status-pill">
              <span className="text-gray-400">역할:</span>
              <span
                className={`font-bold ${
                  clientRole === 'P1'
                    ? 'text-cyan-400'
                    : clientRole === 'P2'
                    ? 'text-pink-400'
                    : 'text-amber-400'
                }`}
              >
                {clientRole === 'P1'
                  ? '플레이어 1 (시안)'
                  : clientRole === 'P2'
                  ? '플레이어 2 (마젠타)'
                  : '관람 중계자'}
              </span>
            </div>

            {/* 관람객 카운트 */}
            {systemStatus.spectator_count !== undefined && systemStatus.spectator_count > 0 && (
              <div className="status-pill gap-1.5">
                <Eye className="w-3 h-3 text-purple-400" strokeWidth={1.75} />
                <span className="text-purple-300">관람자:</span>
                <span className="text-purple-400 font-bold font-mono">[{systemStatus.spectator_count}명]</span>
              </div>
            )}
          </div>
        </div>

        {/* 중앙: 실시간 점수 줄다리기 (Tug-of-War) & 1:1 스코어보드 */}
        {isPlaying && (
          <div className="hud-panel px-5 py-2 flex flex-col items-center gap-1 border-cyan-500/30 min-w-[320px]">
            <div className="flex justify-between items-center w-full text-xs font-mono">
              <span className="text-cyan-300 font-bold">
                1P (시안): {p1Score.toLocaleString()}
              </span>
              <span className="text-[10px] px-2 py-0.2 border border-slate-700 bg-slate-950/60 text-amber-300 font-bold tracking-wider">
                {leadText}
              </span>
              <span className="text-pink-400 font-bold">
                {versusStats?.mode === 'VERSUS_PVP' ? (
                  `2P (마젠타): ${p2Score.toLocaleString()}`
                ) : (
                  <>AI [{getDifficultyKorean(difficulty)}]: {p2Score.toLocaleString()}</>
                )}
              </span>
            </div>

            {/* 실시간 줄다리기 게이지 바 */}
            <div className="w-full h-1.5 bg-slate-900 rounded-none overflow-hidden flex border border-slate-800">
              <div
                className="h-full bg-cyan-400 transition-all duration-200"
                style={{ width: `${p1Ratio}%` }}
              />
              <div
                className="h-full bg-pink-500 transition-all duration-200"
                style={{ width: `${100 - p1Ratio}%` }}
              />
            </div>

            <div className="flex justify-between w-full text-[10px] font-mono text-gray-400 pt-0.5">
              <span>명중: {stats.hits}</span>
              <span className={`font-bold ${stats.timeRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-slate-200'}`}>
                남은 시간: {String(stats.timeRemaining).padStart(2, '0')}초
              </span>
              <span>연속 콤보: {stats.combo > 0 ? `${stats.combo}x` : '0x'}</span>
            </div>
          </div>
        )}

        {/* 우측: 메뉴 및 진입 버튼 */}
        <div className="flex items-center gap-2 hud-interactive">
          <a
            id="btn-manual"
            href="/manual.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hud-btn py-1.5 px-2.5 text-xs text-purple-300 border-purple-500/30 hover:border-purple-400 gap-1"
          >
            <BookOpen className="w-3 h-3 text-purple-300" strokeWidth={1.5} />
            <span>매뉴얼</span>
          </a>

          <button
            id="btn-leaderboard"
            onClick={onOpenLeaderboard}
            className="hud-btn py-1.5 px-2.5 text-xs text-amber-400 border-amber-500/30 hover:border-amber-400 gap-1"
          >
            <Trophy className="w-3 h-3 text-amber-400" strokeWidth={1.5} />
            <span>순위표</span>
          </button>

          <button
            id="btn-enter-vr"
            onClick={onEnterVR}
            className="hud-btn hud-btn-vr py-1.5 px-3 text-xs gap-1.5"
            title={isVRSupported ? 'Quest 2 WebXR 모드 진입' : 'WebXR (Quest 2 VR 모드)'}
          >
            <Headset className="w-3.5 h-3.5 text-cyan-300" strokeWidth={1.75} />
            <span>VR 모드</span>
          </button>

          <button
            id="btn-settings"
            onClick={onOpenSettings}
            className="hud-btn py-1.5 px-2.5 text-xs gap-1"
          >
            <Sliders className="w-3 h-3 text-cyan-400" strokeWidth={1.5} />
            <span>설정</span>
          </button>

          {isPlaying ? (
            <button
              id="btn-pause"
              onClick={onPauseGame}
              className="hud-btn hud-btn-magenta py-1.5 px-3 text-xs font-bold gap-1"
            >
              <Pause className="w-3 h-3 text-white" strokeWidth={2} />
              <span>일시정지</span>
            </button>
          ) : (
            <button
              id="btn-start"
              onClick={onStartGame}
              className="hud-btn hud-btn-primary py-1.5 px-3 text-xs font-bold gap-1"
            >
              <Play className="w-3 h-3" strokeWidth={2} />
              <span>사격 시작</span>
            </button>
          )}
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. 하단 HUD 바 (옵저버 카메라 툴바 또는 플레이어 탄약 게이지) */}
      {/* =================================================================== */}
      <footer className="flex justify-between items-end w-full">
        {clientRole === 'SPECTATOR' ? (
          // [옵저버 모드] 다각도 방송 중계 카메라 전환 툴바
          <div className="hud-panel px-5 py-2.5 flex items-center gap-2 border-amber-500/30 hud-interactive mx-auto">
            <span className="text-[10px] text-amber-400 font-bold font-mono mr-2 tracking-wider flex items-center gap-1">
              <Tv className="w-3 h-3 text-amber-400" strokeWidth={1.5} />
              <span>중계 시점:</span>
            </span>
            {(['STADIUM', 'P1_VIEW', 'P2_VIEW', 'ORBIT'] as SpectatorCameraMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onSelectSpectatorCamera && onSelectSpectatorCamera(mode)}
                className={`py-1 px-2.5 rounded-sm text-[11px] font-mono transition-all cursor-pointer ${
                  spectatorCameraMode === mode
                    ? 'border border-amber-400 bg-amber-950/40 text-amber-300 font-bold'
                    : 'border border-slate-800 bg-slate-950/40 text-gray-400 hover:border-slate-600 hover:text-gray-200'
                }`}
              >
                {mode === 'STADIUM'
                  ? '[1] 스타디움 풀샷'
                  : mode === 'P1_VIEW'
                  ? '[2] 1P 숄더뷰'
                  : mode === 'P2_VIEW'
                  ? '[3] 2P 숄더뷰'
                  : '[4] 시네마틱 궤도캠'}
              </button>
            ))}
          </div>
        ) : (
          // [플레이어 모드] 조작 가이드 및 탄약 게이지
          <>
            <div className="hud-panel px-3.5 py-2 text-[10px] text-gray-400 font-mono flex flex-col gap-0.5 border-slate-800/80">
              <div className="text-cyan-400 font-bold mb-0.5 tracking-wider flex items-center gap-1">
                <Crosshair className="w-3 h-3 text-cyan-400" strokeWidth={1.5} />
                <span>조작 가이드</span>
              </div>
              <div>QUEST 2: 6DoF 모션 컨트롤러</div>
              <div>발사: 트리거 / 스페이스바</div>
              <div>재장전: 그립 / R 키</div>
            </div>

            <div className="hud-panel px-5 py-2.5 flex items-center gap-5 border-cyan-500/25">
              <div className="text-right">
                <div className="text-[9px] text-gray-400 font-mono">사격 명중률</div>
                <div className="text-lg font-bold font-mono text-cyan-300 leading-tight">
                  {stats.accuracy}%
                </div>
              </div>

              <div className="w-px h-6 bg-slate-800" />

              <div className="flex flex-col items-end gap-1">
                <div className="flex justify-between w-full text-[10px] font-mono gap-3">
                  <span className="text-gray-400 flex items-center gap-1">
                    <RotateCcw className="w-2.5 h-2.5 text-cyan-400" strokeWidth={1.5} />
                    <span>펄스 탄약</span>
                  </span>
                  <span className={stats.isReloading ? 'text-amber-400 font-bold animate-pulse' : stats.ammo <= 2 ? 'text-red-400 font-bold' : 'text-cyan-400'}>
                    {stats.isReloading ? '재장전 중...' : `${stats.ammo} / ${stats.maxAmmo}`}
                  </span>
                </div>

                <div className="ammo-indicator">
                  {Array.from({ length: stats.maxAmmo }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`ammo-pip ${idx < stats.ammo ? 'loaded' : 'empty'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </footer>
    </div>
  );
};
