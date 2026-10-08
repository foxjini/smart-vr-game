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
  Square,
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
  onAbortGame?: () => void;
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
  onAbortGame,
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
      {/* 1. 상단 글로벌 HUD 텔레메트리 바 (정밀 전술 계측기 스타일) */}
      {/* =================================================================== */}
      <header className="flex justify-between items-start w-full gap-4">
        {/* 좌측: 타이틀, 통신 및 역할 상태 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <h1 className="cyber-title text-xl text-cyan-400 font-extrabold tracking-widest drop-shadow-[0_0_12px_rgba(0,240,255,0.4)]">
              CYBER STRIKE
            </h1>
            <span className="text-[10px] px-2.5 py-0.5 border border-cyan-400/40 text-cyan-300 font-mono tracking-wider bg-cyan-950/30 backdrop-blur-md rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
              1:1 실시간 VR 대결
            </span>
          </div>

          <div className="flex items-center gap-2 hud-interactive">
            {/* 서버 상태 */}
            <div className="cyber-glass px-3 py-1 flex items-center gap-2 rounded-full text-xs">
              <span className={`indicator-dot ${isWsConnected ? 'dot-green' : 'dot-red'}`} />
              <span className="text-gray-400 font-mono text-[11px]">서버:</span>
              <span className={isWsConnected ? 'text-green-400 font-bold font-mono text-[11px]' : 'text-red-400 font-bold font-mono text-[11px]'}>
                {isWsConnected ? '정상 연결' : '오프라인'}
              </span>
            </div>

            {/* 역할 배지 */}
            <div className={`px-3.5 py-1 flex items-center gap-2 rounded-full text-xs transition-all ${
              clientRole === 'P1'
                ? 'cyber-glass-p1'
                : clientRole === 'P2'
                ? 'cyber-glass-p2'
                : 'cyber-glass-spec'
            }`}>
              <span className="text-gray-400 font-mono text-[11px]">내 기기:</span>
              <span
                className={`font-bold font-mono text-[11px] ${
                  clientRole === 'P1'
                    ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]'
                    : clientRole === 'P2'
                    ? 'text-pink-300 drop-shadow-[0_0_8px_rgba(255,0,85,0.6)]'
                    : 'text-amber-300 drop-shadow-[0_0_8px_rgba(255,170,0,0.6)]'
                }`}
              >
                {clientRole === 'P1'
                  ? '선수 1 (시안)'
                  : clientRole === 'P2'
                  ? '선수 2 (마젠타)'
                  : '관람 중계석'}
              </span>
            </div>

            {/* 관람객 카운트 */}
            {systemStatus.spectator_count !== undefined && systemStatus.spectator_count > 0 && (
              <div className="cyber-glass px-3 py-1 flex items-center gap-1.5 rounded-full text-xs border-purple-500/30">
                <Eye className="w-3 h-3 text-purple-400" strokeWidth={1.75} />
                <span className="text-purple-300 font-mono text-[11px]">관람객:</span>
                <span className="text-purple-300 font-bold font-mono text-[11px]">[{systemStatus.spectator_count}명]</span>
              </div>
            )}
          </div>
        </div>

        {/* 중앙: 실시간 점수 줄다리기 (Tug-of-War) & 정밀 전술 계측 게이지 */}
        {isPlaying && (
          <div className="cyber-glass obsidian-card hud-bracket-box-all bracket-cyan px-6 py-2.5 flex flex-col items-center gap-1.5 min-w-[390px] animate-fadeIn border-cyan-500/40 relative overflow-hidden hologram-dots">
            <div className="flex justify-between items-center w-full text-xs font-mono">
              <span className="text-cyan-300 font-bold flex items-center gap-1 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block shadow-[0_0_6px_rgba(0,240,255,0.8)]" />
                1P: {p1Score.toLocaleString()}
              </span>
              <span className="text-[10px] px-2.5 py-0.5 border border-amber-400/40 bg-amber-950/40 text-amber-300 font-bold tracking-wider rounded-sm backdrop-blur-md shadow-[0_0_10px_rgba(255,170,0,0.25)]">
                {leadText}
              </span>
              <span className="text-pink-400 font-bold flex items-center gap-1 drop-shadow-[0_0_8px_rgba(255,0,85,0.4)]">
                {versusStats?.mode === 'VERSUS_PVP' ? (
                  <>2P: {p2Score.toLocaleString()}<span className="w-2 h-2 rounded-full bg-pink-500 inline-block shadow-[0_0_6px_rgba(255,0,85,0.8)]" /></>
                ) : (
                  <>AI [{getDifficultyKorean(difficulty)}]: {p2Score.toLocaleString()}<span className="w-2 h-2 rounded-full bg-pink-500 inline-block shadow-[0_0_6px_rgba(255,0,85,0.8)]" /></>
                )}
              </span>
            </div>

            {/* 정밀 줄다리기 게이지 바 (중앙 기준선 & 분할 눈금 마커) */}
            <div className="w-full relative">
              <div className="w-full h-2.5 bg-slate-950/90 rounded-sm overflow-hidden flex border border-cyan-500/40 p-0.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.9)] relative">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-200 shadow-[0_0_12px_rgba(0,240,255,0.8)]"
                  style={{ width: `${p1Ratio}%` }}
                />
                <div
                  className="h-full bg-gradient-to-l from-pink-500 to-pink-400 transition-all duration-200 shadow-[0_0_12px_rgba(255,0,85,0.8)]"
                  style={{ width: `${100 - p1Ratio}%` }}
                />
                {/* 50% 센터라인 눈금선 */}
                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/70 pointer-events-none z-10 shadow-[0_0_4px_#fff]" />
              </div>
              {/* 하단 미세 눈금 (0% | 25% | 50% | 75% | 100%) */}
              <div className="flex justify-between w-full text-[8px] font-mono text-gray-500 pt-0.5 px-0.5 select-none">
                <span>0%</span>
                <span>25%</span>
                <span className="text-cyan-400 font-bold">▲ 50% ▲</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="flex justify-between w-full text-[10px] font-mono text-gray-300 pt-0.5 border-t border-cyan-500/15">
              <span>명중: <b className="text-white">{stats.hits}</b></span>
              <span className={`font-extrabold ${stats.timeRemaining <= 10 ? 'text-red-400 animate-pulse drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]' : 'text-cyan-200'}`}>
                남은 시간: {String(stats.timeRemaining).padStart(2, '0')}초
              </span>
              <span>콤보: <b className="text-yellow-400">{stats.combo > 0 ? `${stats.combo}x` : '0x'}</b></span>
            </div>
          </div>
        )}

        {/* 우측: 메뉴 및 진입 버튼 (스프링 물리 & 인스턴트 글리치 호버) */}
        <div className="flex items-center gap-2 hud-interactive">
          <a
            id="btn-manual"
            href="/manual.html"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-btn spring-btn py-1.5 px-3 text-xs text-purple-300 border-purple-500/40 hover:border-purple-400"
          >
            <BookOpen className="w-3.5 h-3.5 text-purple-300" strokeWidth={1.5} />
            <span>매뉴얼</span>
          </a>

          <button
            id="btn-leaderboard"
            onClick={onOpenLeaderboard}
            className="glass-btn spring-btn py-1.5 px-3 text-xs text-amber-400 border-amber-500/40 hover:border-amber-400"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.5} />
            <span>순위표</span>
          </button>

          <button
            id="btn-enter-vr"
            onClick={onEnterVR}
            className="glass-btn spring-btn glitch-hover py-1.5 px-3.5 text-xs text-cyan-300 border-cyan-400 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-pink-500/20 shadow-[0_0_15px_rgba(0,240,255,0.25)]"
            title={isVRSupported ? 'Quest 2 WebXR 모드 진입' : 'WebXR (Quest 2 VR 모드)'}
          >
            <Headset className="w-3.5 h-3.5 text-cyan-300" strokeWidth={1.75} />
            <span>VR 출격</span>
          </button>

          <button
            id="btn-settings"
            onClick={onOpenSettings}
            className="glass-btn spring-btn py-1.5 px-3 text-xs text-cyan-300"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.5} />
            <span>설정</span>
          </button>

          {isPlaying ? (
            <>
              <button
                id="btn-pause"
                onClick={onPauseGame}
                className="glass-btn spring-btn py-1.5 px-3 text-xs border-pink-500/40 hover:border-pink-400 text-pink-300 font-bold"
              >
                <Pause className="w-3.5 h-3.5 text-pink-400" strokeWidth={2} />
                <span>일시정지</span>
              </button>
              {onAbortGame && (
                <button
                  id="btn-abort"
                  onClick={onAbortGame}
                  className="glass-btn spring-btn border-red-500/60 bg-red-950/40 hover:bg-red-900/60 text-red-300 py-1.5 px-3 text-xs font-bold shadow-[0_0_15px_rgba(255,0,0,0.3)]"
                  title="경기를 즉시 강제 종료하고 메인 화면으로 리셋합니다 (단축키: ESC)"
                >
                  <Square className="w-3.5 h-3.5 text-red-400" strokeWidth={2} />
                  <span>중단 (ESC)</span>
                </button>
              )}
            </>
          ) : (
            <button
              id="btn-start"
              onClick={onStartGame}
              className="glass-btn spring-btn glitch-hover py-1.5 px-4 text-xs font-bold text-white border-cyan-400 bg-cyan-500/25 hover:bg-cyan-500/40 shadow-[0_0_18px_rgba(0,240,255,0.35)]"
            >
              <Play className="w-3.5 h-3.5 text-cyan-300" strokeWidth={2} />
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
          // [옵저버 모드] 다각도 방송 중계 카메라 전환 툴바 (4-Corner Brackets & Spring Physics)
          <div className="cyber-glass-spec obsidian-card hud-bracket-box-all bracket-amber px-6 py-2.5 flex items-center gap-2.5 hud-interactive mx-auto rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
            <span className="text-[10px] text-amber-400 font-bold font-mono mr-2 tracking-wider flex items-center gap-1.5 drop-shadow-[0_0_8px_rgba(255,170,0,0.5)]">
              <Tv className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
              <span>중계 시점:</span>
            </span>
            {(['STADIUM', 'P1_VIEW', 'P2_VIEW', 'ORBIT'] as SpectatorCameraMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onSelectSpectatorCamera && onSelectSpectatorCamera(mode)}
                className={`py-1.5 px-3 rounded-full text-[11px] font-mono transition-all cursor-pointer backdrop-blur-md spring-btn glitch-hover ${
                  spectatorCameraMode === mode
                    ? 'border border-amber-400 bg-amber-500/25 text-amber-200 font-extrabold shadow-[0_0_12px_rgba(255,170,0,0.4)]'
                    : 'border border-slate-700/60 bg-slate-900/40 text-gray-400 hover:border-amber-400/50 hover:text-white'
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
          // [플레이어 모드] 조작 가이드 및 탄약 게이지 (4-Corner Brackets)
          <>
            <div className="cyber-glass obsidian-card hud-bracket-box-all bracket-dim px-4 py-2.5 text-[10px] text-gray-300 font-mono flex flex-col gap-1 border-slate-700/50">
              <div className="text-cyan-400 font-bold mb-0.5 tracking-wider flex items-center gap-1.5 drop-shadow-[0_0_6px_rgba(0,240,255,0.4)]">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.5} />
                <span>조작 가이드 (6DoF)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>발사: 트리거 / 스페이스바</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span>재장전: 손잡이(그립) / R 키</span>
              </div>
            </div>

            <div className="cyber-glass obsidian-card hud-bracket-box-all bracket-cyan px-6 py-3 flex items-center gap-6 border-cyan-500/35">
              <div className="text-right">
                <div className="text-[10px] text-gray-400 font-mono">사격 명중률</div>
                <div className="text-xl font-extrabold font-mono text-cyan-300 leading-tight drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                  {stats.accuracy}%
                </div>
              </div>

              <div className="w-px h-8 bg-cyan-500/20" />

              <div className="flex flex-col items-end gap-1.5">
                <div className="flex justify-between w-full text-[11px] font-mono gap-4">
                  <span className="text-gray-300 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3 text-cyan-400" strokeWidth={1.5} />
                    <span>펄스 탄약</span>
                  </span>
                  <span className={stats.isReloading ? 'text-amber-400 font-extrabold animate-pulse' : stats.ammo <= 2 ? 'text-red-400 font-extrabold drop-shadow-[0_0_8px_rgba(255,0,0,0.6)]' : 'text-cyan-400 font-bold'}>
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
