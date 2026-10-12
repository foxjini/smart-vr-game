'use client';

import React from 'react';
import { Bot, Crown } from 'lucide-react';
import { cx } from './cx';

export type PlateSize = 'compact' | 'broadcast' | 'result';

interface TeamPlateProps {
  slot: 1 | 2;
  /** '플레이어 1', 'AI 라이벌' 등 */
  name: string;
  score?: number;
  isAI?: boolean;
  /** AI 난이도 이름 */
  aiLabel?: string;
  isMe?: boolean;
  isWinner?: boolean;
  size?: PlateSize;
  /** 좁은 화면에서 이름 숨김 (태그·점수만) */
  hideName?: boolean;
  className?: string;
}

const TEAM = {
  1: {
    text: 'text-p1',
    bar: 'bg-p1 shadow-glow-p1',
    wash: 'bg-linear-to-r from-p1/22 via-p1/6 to-transparent',
    tag: '1P',
  },
  2: {
    text: 'text-p2',
    bar: 'bg-p2 shadow-glow-p2',
    wash: 'bg-linear-to-l from-p2/22 via-p2/6 to-transparent',
    tag: '2P',
  },
} as const;

const SIZE = {
  compact: { box: 'h-14 gap-2.5 px-3', bar: 'w-1', tag: 'text-[15px]', name: 'text-[13px]', score: 'text-[34px] min-w-[2ch]', chip: 'text-[11px] px-1.5 h-5' },
  broadcast: { box: 'h-24 gap-4 px-5', bar: 'w-1.5', tag: 'text-[22px]', name: 'text-[22px]', score: 'text-[68px] min-w-[2ch]', chip: 'text-[15px] px-2 h-7' },
  result: { box: 'h-36 gap-5 px-7', bar: 'w-2', tag: 'text-[26px]', name: 'text-[28px]', score: 'text-[104px] min-w-[2ch]', chip: 'text-[16px] px-2.5 h-8' },
} as const;

/**
 * 팀 이름판 (색 띠 + 1P/2P + 이름 + 점수).
 * 2P는 좌우를 뒤집어 점수판 가운데를 향하게 배치
 */
export function TeamPlate({
  slot,
  name,
  score,
  isAI,
  aiLabel,
  isMe,
  isWinner,
  size = 'compact',
  hideName,
  className,
}: TeamPlateProps) {
  const team = TEAM[slot];
  const s = SIZE[size];
  const mirrored = slot === 2;

  const chips = (
    <span className={cx('flex items-center gap-1.5', mirrored && 'flex-row-reverse')}>
      {isAI && (
        <span className={cx('inline-flex items-center gap-1 rounded-md border border-ai/50 bg-ai/15 font-bold leading-none text-ai', s.chip)}>
          <Bot className="size-[1.05em]" strokeWidth={2.4} aria-hidden="true" />
          {aiLabel ? `AI · ${aiLabel}` : 'AI'}
        </span>
      )}
      {isMe && (
        <span className={cx('inline-flex items-center rounded-md bg-fg font-bold leading-none text-ink', s.chip)}>나</span>
      )}
      {isWinner && (
        <span className={cx('inline-flex items-center gap-1 rounded-md bg-gold font-bold leading-none text-ink', s.chip)}>
          <Crown className="size-[1.05em]" strokeWidth={2.4} aria-hidden="true" />
          승리
        </span>
      )}
    </span>
  );

  return (
    <div
      className={cx(
        'relative flex min-w-0 items-center overflow-hidden',
        mirrored && 'flex-row-reverse',
        s.box,
        team.wash,
        className
      )}
    >
      <span className={cx('absolute inset-y-0', mirrored ? 'right-0' : 'left-0', s.bar, team.bar)} aria-hidden="true" />
      <div className={cx('flex min-w-0 flex-1 flex-col justify-center gap-1', mirrored ? 'items-end text-right' : 'items-start')}>
        <span className={cx('flex min-w-0 items-center gap-2', mirrored && 'flex-row-reverse')}>
          <span className={cx('font-num font-bold leading-none tracking-wide', s.tag, team.text)}>{team.tag}</span>
          {!hideName && <span className={cx('truncate font-semibold leading-none text-fg', s.name)}>{name}</span>}
        </span>
        {(isAI || isMe || isWinner) && chips}
      </div>
      {score !== undefined && (
        <span
          key={score}
          className={cx(
            'inline-block font-num font-bold leading-none tabular-nums text-fg animate-score-pop motion-reduce:animate-none',
            mirrored ? 'text-left' : 'text-right',
            s.score
          )}
        >
          {score}
        </span>
      )}
    </div>
  );
}
