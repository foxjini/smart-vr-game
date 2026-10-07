'use client';

import React, { useState } from 'react';
import { GameStats, Difficulty, ThemeType, VersusMatchStats, ClientRole } from '@/types';
import { LeaderboardManager } from '@/core/leaderboard/LeaderboardManager';
import {
  Trophy,
  RotateCcw,
  Sliders,
  Award,
  Check,
  Home,
} from 'lucide-react';

interface GameOverModalProps {
  isOpen: boolean;
  stats: GameStats;
  versusStats?: VersusMatchStats;
  clientRole?: ClientRole;
  highScore: number;
  difficulty: Difficulty;
  theme: ThemeType;
  onRestart: () => void;
  onOpenSettings: () => void;
  onViewLeaderboard: (highlightId?: string) => void;
  onGoToMainMenu?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  stats,
  versusStats,
  clientRole = 'P1',
  highScore,
  difficulty,
  theme,
  onRestart,
  onOpenSettings,
  onViewLeaderboard,
  onGoToMainMenu,
}) => {
  const [playerName, setPlayerName] = useState(clientRole === 'P2' ? '플레이어_02' : '플레이어_01');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState<string | undefined>();

  if (!isOpen) return null;

  const isNewRecord = stats.score > 0 && stats.score >= highScore;
  const isTopTen = stats.score > 0 && LeaderboardManager.getInstance().isTopTen(stats.score);

  const p1Score = versusStats ? versusStats.p1Score : stats.score;
  const p2Score = versusStats ? versusStats.p2Score : 0;
  const winner = versusStats?.winner || (p1Score > p2Score ? 'P1' : p2Score > p1Score ? 'P2' : 'DRAW');

  const amWinner =
    (clientRole === 'P1' && winner === 'P1') ||
    (clientRole === 'P2' && winner === 'P2');

  const handleSubmitScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || isSubmitted) return;

    const newEntry = LeaderboardManager.getInstance().addEntry({
      playerName: playerName.trim(),
      score: stats.score,
      accuracy: stats.accuracy,
      maxCombo: stats.maxCombo,
      difficulty,
      theme,
    });

    setIsSubmitted(true);
    setSavedEntryId(newEntry.id);
  };

  const getDifficultyKorean = (diff: Difficulty) => {
    switch (diff) {
      case 'easy': return '초보자';
      case 'normal': return '표준';
      case 'hard': return '프로';
      default: return diff;
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="hud-panel hud-corners p-6 w-full max-w-lg flex flex-col gap-4 items-center text-center border-cyan-500/40 max-h-[95vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex flex-col gap-1 w-full border-b border-cyan-500/20 pb-3">
          <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono">
            {'// 경기 결과 분석 // 1:1 대결 종합 평가'}
          </div>
          <h2 className="cyber-title text-2xl text-white">교전 결과 브리핑</h2>
          
          {/* 승패 배너 */}
          <div
            className={`text-xs font-mono font-bold tracking-wider mt-1 px-3 py-1 border inline-flex items-center gap-1.5 justify-center ${
              amWinner
                ? 'bg-cyan-950/40 text-cyan-300 border-cyan-400'
                : winner === 'DRAW'
                ? 'bg-amber-950/40 text-amber-300 border-amber-400'
                : 'bg-pink-950/40 text-pink-400 border-pink-500'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>
              {winner === 'P1'
                ? '[ 승리 ] 플레이어 1 (시안) 승리!'
                : winner === 'P2'
                ? '[ 승리 ] 플레이어 2 (마젠타) 승리!'
                : '[ 무승부 ] 치열한 접전 무승부'}
            </span>
          </div>
        </div>

        {/* 1:1 대결 스탯 비교 카드 */}
        <div className="grid grid-cols-2 gap-3 w-full font-mono text-left">
          {/* P1 스탯 */}
          <div className="bg-slate-950/30 border border-cyan-500/30 p-3 flex flex-col gap-1">
            <div className="text-[10px] text-cyan-400 font-bold flex justify-between">
              <span>플레이어 1 [시안]</span>
              {winner === 'P1' && <span className="text-yellow-400 font-bold">승자</span>}
            </div>
            <div className="text-2xl font-extrabold text-cyan-300">
              {p1Score.toLocaleString()} <span className="text-xs font-normal text-slate-400">PTS</span>
            </div>
            <div className="text-[10px] text-gray-400 flex flex-col gap-0.5 pt-1 border-t border-slate-800">
              <div>명중 횟수: {versusStats ? versusStats.p1Hits : stats.hits}회</div>
              <div>최대 콤보: {versusStats ? versusStats.p1Combo : stats.maxCombo}x</div>
              <div>명중률: {versusStats ? versusStats.p1Accuracy : stats.accuracy}%</div>
            </div>
          </div>

          {/* P2 / AI 스탯 */}
          <div className="bg-slate-950/30 border border-pink-500/30 p-3 flex flex-col gap-1">
            <div className="text-[10px] text-pink-400 font-bold flex justify-between">
              <span>
                {versusStats?.mode === 'VERSUS_PVP'
                  ? '플레이어 2 [마젠타]'
                  : `AI 봇 [${getDifficultyKorean(difficulty)}]`}
              </span>
              {winner === 'P2' && <span className="text-yellow-400 font-bold">승자</span>}
            </div>
            <div className="text-2xl font-extrabold text-pink-300">
              {p2Score.toLocaleString()} <span className="text-xs font-normal text-slate-400">PTS</span>
            </div>
            <div className="text-[10px] text-gray-400 flex flex-col gap-0.5 pt-1 border-t border-slate-800">
              <div>명중 횟수: {versusStats ? versusStats.p2Hits : 0}회</div>
              <div>최대 콤보: {versusStats ? versusStats.p2Combo : 0}x</div>
              <div>명중률: {versusStats ? versusStats.p2Accuracy : 0}%</div>
            </div>
          </div>
        </div>

        {/* 랭킹 등록 폼 */}
        <div className="w-full bg-slate-950/30 border border-cyan-500/20 p-3 flex flex-col gap-2 font-mono">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-cyan-300 font-bold flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.5} />
              <span>{'// 텔레메트리 로그: 순위표 기록 등록'}</span>
            </span>
            <div className="flex items-center gap-1.5">
              {isNewRecord && (
                <span className="text-[9px] bg-cyan-400 text-black px-1.5 py-0.2 font-bold">
                  최고 기록 경신
                </span>
              )}
              {isTopTen && (
                <span className="text-[9px] bg-amber-400 text-black px-1.5 py-0.2 font-bold">
                  TOP 10 진입 가능
                </span>
              )}
            </div>
          </div>

          {!isSubmitted ? (
            <form onSubmit={handleSubmitScore} className="flex gap-2">
              <input
                type="text"
                maxLength={15}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="호출 부호 입력 (최대 15자)"
                className="flex-1 bg-slate-950/60 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400 rounded-sm"
              />
              <button
                type="submit"
                className="hud-btn hud-btn-primary text-xs py-1.5 px-3"
              >
                기록 등록
              </button>
            </form>
          ) : (
            <div className="flex justify-between items-center bg-cyan-950/20 p-1.5 border border-cyan-500/30 text-xs text-cyan-200">
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-cyan-400" strokeWidth={2} />
                <span>[ 정상 등록 완료 ]</span>
              </span>
              <button
                type="button"
                onClick={() => onViewLeaderboard(savedEntryId)}
                className="text-amber-400 hover:text-amber-300 underline font-bold"
              >
                순위표 확인 &rarr;
              </button>
            </div>
          )}
        </div>

        {/* 하단 액션 버튼 */}
        <div className="flex gap-2 w-full pt-1 border-t border-slate-800">
          {onGoToMainMenu && (
            <button
              onClick={onGoToMainMenu}
              className="hud-btn flex-1 py-2 text-xs gap-1.5 border-cyan-500/40 hover:border-cyan-400 bg-cyan-950/20 text-cyan-300 hover:text-white"
            >
              <Home className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.5} />
              <span>메인 메뉴</span>
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className="hud-btn flex-1 py-2 text-xs gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.5} />
            <span>환경 설정</span>
          </button>
          <button
            onClick={onRestart}
            className="hud-btn hud-btn-primary flex-1 py-2 text-xs font-bold gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
            <span>재경기 시작 &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
};
