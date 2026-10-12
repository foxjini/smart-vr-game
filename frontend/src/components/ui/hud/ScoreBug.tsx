'use client';

import React from 'react';
import { Difficulty } from '@/types';
import { DIFFICULTY_NAME } from '@/constants/labels';
import { Panel, TeamPlate, TugBar, cx } from '@/components/ui/kit';
import { formatClock, slotName, Slot } from '@/components/ui/matchInfo';

interface ScoreBugProps {
  p1Score: number;
  p2Score: number;
  timeRemaining: number;
  isPaused: boolean;
  aiSlot: Slot | null;
  difficulty: Difficulty;
  /** 내 자리 ('나' 표시, 관전은 null) */
  localSlot?: Slot | null;
  /** broadcast: 관전 중계(1920 기준) / compact: 플레이어 화면 */
  variant: 'broadcast' | 'compact';
  className?: string;
}

/**
 * 상단 가운데 점수판: 1P 판넬 | 남은 시간 | 2P 판넬 + 점수 줄다리기.
 * 관전 화면과 플레이어 화면이 같은 부품을 크기만 바꿔 씀
 */
export function ScoreBug({ p1Score, p2Score, timeRemaining, isPaused, aiSlot, difficulty, localSlot = null, variant, className }: ScoreBugProps) {
  const broadcast = variant === 'broadcast';
  const warning = !isPaused && timeRemaining <= 10;
  const diff = p1Score - p2Score;
  const leader: Slot | null = diff > 0 ? 1 : diff < 0 ? 2 : null;
  const leaderTag = leader === null ? '' : leader === aiSlot ? 'AI' : `${leader}P`;

  return (
    <Panel solid className={cx('overflow-hidden p-0', broadcast ? 'w-[1040px]' : 'w-[min(560px,48vw)]', className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch">
        <TeamPlate
          slot={1}
          name={slotName(1, aiSlot)}
          score={p1Score}
          isAI={aiSlot === 1}
          aiLabel={broadcast ? DIFFICULTY_NAME[difficulty] : undefined}
          isMe={localSlot === 1}
          size={broadcast ? 'broadcast' : 'compact'}
          hideName={!broadcast}
        />
        <div
          className={cx(
            'flex flex-col items-center justify-center border-x border-line bg-ink/75',
            broadcast ? 'min-w-[176px] gap-1.5 px-6' : 'min-w-[88px] gap-0.5 px-3'
          )}
          role="timer"
          aria-live="off"
        >
          <span
            className={cx(
              'font-num font-bold leading-none tabular-nums',
              broadcast ? 'text-[54px]' : 'text-[28px]',
              isPaused ? 'text-warn' : warning ? 'text-danger animate-pulse-warn motion-reduce:animate-none' : 'text-fg'
            )}
          >
            {formatClock(timeRemaining)}
          </span>
          <span
            className={cx(
              'whitespace-nowrap font-semibold leading-none',
              broadcast ? 'text-[16px]' : 'text-[11px]',
              isPaused ? 'text-warn' : warning ? 'text-danger' : 'text-fg-3'
            )}
          >
            {isPaused ? '일시정지 중' : warning ? '마지막 10초!' : '남은 시간'}
          </span>
        </div>
        <TeamPlate
          slot={2}
          name={slotName(2, aiSlot)}
          score={p2Score}
          isAI={aiSlot === 2}
          aiLabel={broadcast ? DIFFICULTY_NAME[difficulty] : undefined}
          isMe={localSlot === 2}
          size={broadcast ? 'broadcast' : 'compact'}
          hideName={!broadcast}
        />
      </div>
      <div className={cx('flex items-center gap-3', broadcast ? 'px-6 pb-4 pt-3' : 'px-3 pb-2.5 pt-2')}>
        <TugBar p1Score={p1Score} p2Score={p2Score} size={broadcast ? 'lg' : 'sm'} />
        <span
          className={cx(
            'shrink-0 text-right font-num font-bold leading-none tabular-nums',
            broadcast ? 'w-[92px] text-[22px]' : 'w-[52px] text-[13px]',
            leader === 1 ? 'text-p1' : leader === 2 ? 'text-p2' : 'text-fg-3'
          )}
        >
          {leader === null ? '동점' : `${leaderTag} +${Math.abs(diff)}`}
        </span>
      </div>
    </Panel>
  );
}
