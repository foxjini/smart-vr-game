'use client';

import React, { useState } from 'react';
import { LeaderboardManager } from '@/core/leaderboard/LeaderboardManager';
import {
  Trophy,
  X,
  RotateCcw,
  Award,
  Medal,
} from 'lucide-react';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlightId?: string;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  highlightId,
}) => {
  const [, setResetTick] = useState(0);
  const entries = typeof window !== 'undefined' ? LeaderboardManager.getInstance().getTopScores(10) : [];

  if (!isOpen) return null;

  const handleReset = () => {
    if (window.confirm('리더보드 기록을 기본 초기 데이터로 복원하시겠습니까?')) {
      LeaderboardManager.getInstance().resetToDefault();
      setResetTick((t) => t + 1);
    }
  };

  const getDifficultyKorean = (diff: string) => {
    switch (diff) {
      case 'easy': return '초보자';
      case 'normal': return '표준';
      case 'hard': return '프로';
      default: return diff;
    }
  };

  const getThemeKorean = (t: string) => {
    switch (t) {
      case 'cyber': return '사이버';
      case 'space': return '심우주';
      case 'city': return '네온 시티';
      default: return t;
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="hud-panel hud-corners p-5 md:p-6 w-full max-w-2xl flex flex-col gap-4 border-amber-500/30 max-h-[90vh] overflow-hidden font-mono">
        {/* 헤더 */}
        <div className="flex justify-between items-center border-b border-amber-500/20 pb-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-amber-400 tracking-widest flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
              <span>// 글로벌 사격 랭킹 매트릭스</span>
            </span>
            <h2 className="cyber-title text-xl text-white">명예의 전당 (TOP 10)</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-amber-400 transition-colors p-1"
            title="닫기"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* 랭킹 테이블 */}
        <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-gray-400 text-[10px] tracking-wider uppercase">
                <th className="py-2 px-2 text-center w-12">순위</th>
                <th className="py-2 px-3">에이전트 (호출부호)</th>
                <th className="py-2 px-3 text-right">점수</th>
                <th className="py-2 px-2 text-center">명중률</th>
                <th className="py-2 px-2 text-center">콤보</th>
                <th className="py-2 px-2 text-center">난이도</th>
                <th className="py-2 px-2 text-right">기록일시</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {entries.map((entry, index) => {
                const rank = index + 1;
                const isHighlighted = entry.id === highlightId;
                let rowBg = 'hover:bg-slate-900/30';
                if (isHighlighted) {
                  rowBg = 'bg-amber-950/20 border-l-2 border-amber-400';
                }

                return (
                  <tr
                    key={entry.id || index}
                    className={`transition-colors ${rowBg}`}
                  >
                    <td className="py-2.5 px-2 text-center font-bold">
                      <span className={rank === 1 ? 'text-amber-400 font-extrabold flex items-center justify-center gap-0.5' : rank <= 3 ? 'text-slate-200' : 'text-gray-500'}>
                        {rank === 1 && <Medal className="w-3.5 h-3.5 text-amber-400 inline" strokeWidth={2} />}
                        #{String(rank).padStart(2, '0')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        {entry.playerName}
                        {isHighlighted && (
                          <span className="text-[9px] bg-amber-400 text-black px-1 py-0.2 font-extrabold uppercase">
                            나의 기록
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-gray-500">
                        테마: {getThemeKorean(entry.theme)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                      {entry.score.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center text-green-400">
                      {entry.accuracy}%
                    </td>
                    <td className="py-2.5 px-2 text-center text-pink-400 font-bold">
                      {entry.maxCombo}x
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`px-1 py-0.2 text-[9px] font-bold border ${
                          entry.difficulty === 'hard'
                            ? 'border-pink-800 text-pink-400 bg-pink-950/20'
                            : entry.difficulty === 'normal'
                            ? 'border-cyan-800 text-cyan-400 bg-cyan-950/20'
                            : 'border-green-800 text-green-400 bg-green-950/20'
                        }`}
                      >
                        {getDifficultyKorean(entry.difficulty)}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-gray-400 text-[10px]">
                      {entry.date}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    등록된 순위 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 하단 버튼 및 액션 */}
        <div className="flex justify-between items-center border-t border-slate-800 pt-3">
          <button
            onClick={handleReset}
            className="text-[11px] text-gray-500 hover:text-gray-300 underline transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
            <span>기본 기록으로 복원</span>
          </button>
          <button
            onClick={onClose}
            className="hud-btn text-xs py-1.5 px-5"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
