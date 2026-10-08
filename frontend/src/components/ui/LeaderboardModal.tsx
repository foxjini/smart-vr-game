'use client';

import React, { useState, useEffect } from 'react';
import { LeaderboardManager } from '@/core/leaderboard/LeaderboardManager';
import { LeaderboardEntry } from '@/types';
import { useParallaxTilt } from '@/hooks/useParallaxTilt';
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
  const [resetTick, setResetTick] = useState(0);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      setEntries(LeaderboardManager.getInstance().getTopScores(10));
    }
  }, [isOpen, resetTick]);

  const { ref: tiltRef, tiltStyle, onMouseMove, onMouseLeave } = useParallaxTilt<HTMLDivElement>({
    maxTilt: 3.0,
    perspective: 1400,
    scale: 1.005,
  });

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
    <div className="modal-backdrop glass-scanlines">
      <div
        ref={tiltRef}
        style={tiltStyle}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className="cyber-glass obsidian-card hud-bracket-box-all bracket-amber boot-frame hologram-scanlines p-5 md:p-6 w-full max-w-2xl flex flex-col gap-4 border border-amber-400/40 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(255,170,0,0.2)] max-h-[90vh] overflow-hidden font-mono backdrop-blur-2xl"
      >
        {/* 헤더 */}
        <div className="flex justify-between items-center border-b border-amber-400/20 pb-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-amber-400 tracking-widest flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
              <span>// 글로벌 사격 랭킹 매트릭스 // TOP 10 HALL OF FAME</span>
              <span className="hud-data-stamp">MATRIX: <b>v2.0</b></span>
            </span>
            <h2 className="cyber-title text-xl text-white drop-shadow-[0_0_10px_rgba(255,170,0,0.35)]">명예의 전당 (TOP 10)</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-amber-300 transition-colors p-1.5 rounded-sm hover:bg-white/[0.05] spring-btn cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* 랭킹 테이블 */}
        <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-[10px] tracking-wider uppercase bg-white/[0.02]">
                <th className="py-2.5 px-2 text-center w-12">순위</th>
                <th className="py-2.5 px-3">에이전트 (호출부호)</th>
                <th className="py-2.5 px-3 text-right">점수</th>
                <th className="py-2.5 px-2 text-center">명중률</th>
                <th className="py-2.5 px-2 text-center">콤보</th>
                <th className="py-2.5 px-2 text-center">난이도</th>
                <th className="py-2.5 px-2 text-right">기록일시</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((entry, index) => {
                const rank = index + 1;
                const isHighlighted = entry.id === highlightId;
                let rowBg = 'hover:bg-white/[0.04]';
                if (isHighlighted) {
                  rowBg = 'bg-amber-950/40 border-l-2 border-amber-400 shadow-[inset_0_0_15px_rgba(255,170,0,0.15)]';
                }

                return (
                  <tr
                    key={entry.id || index}
                    className={`transition-colors ${rowBg}`}
                  >
                    <td className="py-2.5 px-2 text-center font-bold">
                      <span className={rank === 1 ? 'text-amber-400 font-extrabold flex items-center justify-center gap-0.5 drop-shadow-[0_0_6px_rgba(255,170,0,0.5)]' : rank <= 3 ? 'text-slate-200' : 'text-gray-500'}>
                        {rank === 1 && <Medal className="w-3.5 h-3.5 text-amber-400 inline" strokeWidth={2} />}
                        #{String(rank).padStart(2, '0')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        {entry.playerName}
                        {isHighlighted && (
                          <span className="text-[9px] bg-amber-400 text-black px-1.5 py-0.2 font-extrabold uppercase rounded-sm shadow-[0_0_6px_rgba(255,170,0,0.4)]">
                            나의 기록
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-gray-400">
                        테마: {getThemeKorean(entry.theme)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-cyan-300 drop-shadow-[0_0_6px_rgba(0,240,255,0.3)]">
                      {entry.score.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center text-green-400 font-semibold">
                      {entry.accuracy}%
                    </td>
                    <td className="py-2.5 px-2 text-center text-pink-400 font-bold">
                      {entry.maxCombo}x
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-bold border rounded-sm ${
                          entry.difficulty === 'hard'
                            ? 'border-pink-500/50 text-pink-300 bg-pink-950/30'
                            : entry.difficulty === 'normal'
                            ? 'border-cyan-500/50 text-cyan-300 bg-cyan-950/30'
                            : 'border-green-500/50 text-green-300 bg-green-950/30'
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
        <div className="flex justify-between items-center border-t border-white/10 pt-3">
          <button
            onClick={handleReset}
            className="text-[11px] text-gray-400 hover:text-amber-300 underline transition-colors flex items-center gap-1.5 cursor-pointer spring-btn"
          >
            <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
            <span>기본 기록으로 복원</span>
          </button>
          <button
            onClick={onClose}
            className="glass-btn spring-btn glitch-hover cyber-glass-spec text-xs py-1.5 px-6 font-bold text-amber-200 cursor-pointer shadow-[0_0_15px_rgba(255,170,0,0.3)]"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
