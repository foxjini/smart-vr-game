'use client';

import React, { useState } from 'react';
import { RotateCcw, Trophy } from 'lucide-react';
import { LeaderboardEntry } from '@/types';
import { LeaderboardManager } from '@/core/leaderboard/LeaderboardManager';
import { DIFFICULTY_NAME } from '@/constants/labels';
import { Button, ModalShell, cx } from '@/components/ui/kit';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlightId?: string;
}

// 1~3위 메달 색 (금·은·동)
const MEDAL = {
  1: { ring: 'border-gold bg-gold text-ink shadow-glow-gold', text: 'text-gold', card: 'border-gold/50 bg-gold/8' },
  2: { ring: 'border-[#cbd5e1] bg-[#cbd5e1] text-ink', text: 'text-[#e2e8f0]', card: 'border-[#cbd5e1]/35 bg-white/4' },
  3: { ring: 'border-[#d6a06b] bg-[#d6a06b] text-ink', text: 'text-[#f0bf8f]', card: 'border-[#d6a06b]/40 bg-[#d6a06b]/6' },
} as const;

const DIFF_TONE: Record<string, string> = {
  easy: 'border-ok/40 text-ok',
  normal: 'border-p1/40 text-p1',
  hard: 'border-p2/45 text-p2',
};

/** 순위표: 1~3위 시상대 + 4~10위 목록 (방금 등록한 기록 강조) */
export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ isOpen, onClose, highlightId }) => {
  const [, setResetTick] = useState(0);

  if (!isOpen) return null;

  const entries = LeaderboardManager.getInstance().getTopScores(10);
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  const handleReset = () => {
    if (window.confirm('순위표를 처음 예시 기록으로 되돌릴까요? 등록한 기록은 지워집니다.')) {
      LeaderboardManager.getInstance().resetToDefault();
      setResetTick((t) => t + 1);
    }
  };

  return (
    <ModalShell
      layer="leaderboard"
      size="lg"
      accent="gold"
      eyebrow="명예의 전당"
      icon={Trophy}
      title="순위표 TOP 10"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleReset}>
            예시 기록으로 되돌리기
          </Button>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </div>
      }
    >
      {entries.length === 0 ? (
        <p className="py-12 text-center text-[16px] text-fg-3">아직 등록된 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</p>
      ) : (
        <>
          {/* 시상대: 2위 · 1위 · 3위 */}
          <div className="grid grid-cols-3 items-end gap-3">
            {[1, 0, 2].map((idx) => {
              const entry = podium[idx];
              if (!entry) return <div key={idx} />;
              return <PodiumCard key={entry.id} entry={entry} rank={(idx + 1) as 1 | 2 | 3} highlighted={entry.id === highlightId} />;
            })}
          </div>

          {rest.length > 0 && (
            <ol className="mt-5 flex flex-col gap-1.5" start={4}>
              {rest.map((entry, i) => {
                const rank = i + 4;
                const mine = entry.id === highlightId;
                return (
                  <li
                    key={entry.id}
                    className={cx(
                      'grid grid-cols-[40px_minmax(0,1fr)_auto_64px] items-center gap-3 rounded-lg border px-3 py-2.5 sm:grid-cols-[40px_minmax(0,1fr)_auto_72px_64px_64px]',
                      mine ? 'border-gold/60 bg-gold/10' : 'border-line bg-ink/35'
                    )}
                  >
                    <span className="text-center font-num text-[20px] font-bold text-fg-3">{rank}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[16px] font-semibold text-fg">{entry.playerName}</span>
                      {mine && <span className="shrink-0 rounded bg-gold px-1.5 py-0.5 text-[11px] font-bold text-ink">나의 기록</span>}
                    </span>
                    <DifficultyChip difficulty={entry.difficulty} />
                    <span className="hidden text-right text-[14px] text-fg-2 sm:block">
                      명중률 <b className="font-num text-[16px] text-fg">{entry.accuracy}%</b>
                    </span>
                    <span className="hidden text-right text-[14px] text-fg-2 sm:block">
                      연속 <b className="font-num text-[16px] text-fg">{entry.maxCombo}</b>
                    </span>
                    <span className="text-right font-num text-[24px] font-bold tabular-nums text-fg">{entry.score}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </ModalShell>
  );
};

function DifficultyChip({ difficulty }: { difficulty: string }) {
  const name = DIFFICULTY_NAME[difficulty as keyof typeof DIFFICULTY_NAME] ?? difficulty;
  return (
    <span className={cx('rounded-md border px-2 py-0.5 text-[12px] font-semibold', DIFF_TONE[difficulty] ?? 'border-line text-fg-2')}>
      {name}
    </span>
  );
}

function PodiumCard({ entry, rank, highlighted }: { entry: LeaderboardEntry; rank: 1 | 2 | 3; highlighted: boolean }) {
  const medal = MEDAL[rank];
  return (
    <div
      className={cx(
        'flex flex-col items-center rounded-xl border px-3 text-center',
        rank === 1 ? 'pb-6 pt-5' : 'pb-4 pt-4',
        highlighted ? 'border-gold bg-gold/14 ring-2 ring-gold/50' : medal.card
      )}
    >
      <span
        className={cx(
          'flex items-center justify-center rounded-full border-2 font-num font-bold leading-none',
          rank === 1 ? 'size-12 text-[26px]' : 'size-10 text-[21px]',
          medal.ring
        )}
        aria-label={`${rank}위`}
      >
        {rank}
      </span>
      <span className="mt-3 w-full truncate text-[16px] font-bold text-fg">{entry.playerName}</span>
      {highlighted && <span className="mt-1 rounded bg-gold px-1.5 py-0.5 text-[11px] font-bold text-ink">나의 기록</span>}
      <span className={cx('mt-2 font-num font-bold leading-none tabular-nums', rank === 1 ? 'text-[48px]' : 'text-[38px]', medal.text)}>
        {entry.score}
        <span className="ml-1 text-[15px] text-fg-2">점</span>
      </span>
      <span className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-fg-2">
        <DifficultyChip difficulty={entry.difficulty} />
        <span>
          명중률 <b className="font-num text-fg">{entry.accuracy}%</b>
        </span>
      </span>
    </div>
  );
}
