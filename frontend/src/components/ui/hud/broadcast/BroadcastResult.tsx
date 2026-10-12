'use client';

import React from 'react';
import { Difficulty } from '@/types';
import { DIFFICULTY_NAME } from '@/constants/labels';
import { CompareRow, Panel, TeamPlate, cx } from '@/components/ui/kit';
import { MatchResultSummary, slotName, winnerBannerText, winnerHeadline } from '@/components/ui/matchInfo';
import { useSecondsLeft, useVisibleFor } from '../hooks';

interface BroadcastResultProps {
  result: MatchResultSummary;
  /** 대기 화면으로 돌아가는 시각 (ms) */
  until: number;
  difficulty: Difficulty;
}

/**
 * 관전 화면 경기 결과 (1920×1080 기준).
 * 처음 2.6초는 승리 팀 색 띠 연출을 덮고, 그 뒤 결과판(점수 · 기록 비교)을 보여 줌.
 * 기록 등록 칸·재경기 버튼은 플레이어 화면에만 있음
 */
export function BroadcastResult({ result, until, difficulty }: BroadcastResultProps) {
  const seconds = useSecondsLeft(until);
  const showReveal = useVisibleFor(2600);
  const winSlot = result.winner === 'P1' ? 1 : result.winner === 'P2' ? 2 : null;
  const aiLabel = DIFFICULTY_NAME[difficulty];

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-ink/72" />
      <div className="absolute left-1/2 top-1/2 w-[1320px] -translate-x-1/2 -translate-y-1/2">
        <Panel accent={winSlot === 1 ? 'p1' : winSlot === 2 ? 'p2' : 'gold'} solid className="px-14 py-11">
          <div className="flex flex-col items-center text-center">
            <span className="font-num text-[24px] font-bold tracking-[0.45em] text-fg-3">FINAL</span>
            <p className="mt-1 text-[30px] font-semibold text-fg-2">경기 결과</p>
            <p
              className={cx(
                'mt-5 rounded-full border px-9 py-3 text-[34px] font-extrabold leading-tight',
                winSlot === 1 && 'border-p1/60 bg-p1/12 text-p1',
                winSlot === 2 && 'border-p2/60 bg-p2/12 text-p2',
                winSlot === null && 'border-gold/60 bg-gold/12 text-gold'
              )}
            >
              {winnerBannerText(result.winner, result.aiSlot)}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6">
            <TeamPlate
              slot={1}
              size="result"
              name={slotName(1, result.aiSlot)}
              score={result.p1Score}
              isAI={result.aiSlot === 1}
              aiLabel={aiLabel}
              isWinner={winSlot === 1}
              className="rounded-xl"
            />
            <span className="font-display text-[44px] font-bold text-fg-3">VS</span>
            <TeamPlate
              slot={2}
              size="result"
              name={slotName(2, result.aiSlot)}
              score={result.p2Score}
              isAI={result.aiSlot === 2}
              aiLabel={aiLabel}
              isWinner={winSlot === 2}
              className="rounded-xl"
            />
          </div>

          <div className="mt-10 flex flex-col gap-5">
            <CompareRow size="xl" label="명중" left={result.p1Hits} right={result.p2Hits} />
            <CompareRow size="xl" label="명중률" left={result.p1Accuracy} right={result.p2Accuracy} unit="%" />
            <CompareRow size="xl" label="최고 연속 명중" left={result.p1MaxCombo} right={result.p2MaxCombo} />
          </div>

          <p className="mt-10 text-center text-[22px] text-fg-3">잠시 후 대기 화면으로 돌아가요 · {seconds}초</p>
        </Panel>
      </div>

      {showReveal && <WinnerReveal winSlot={winSlot} headline={winnerHeadline(result.winner, result.aiSlot)} />}
    </div>
  );
}

/** 승리 팀 색 띠가 화면을 가로지르는 2.6초 연출 (클릭은 통과) */
function WinnerReveal({ winSlot, headline }: { winSlot: 1 | 2 | null; headline: string }) {
  const band =
    winSlot === 1
      ? 'from-p1 via-[#a5f3fc] to-p1'
      : winSlot === 2
        ? 'from-p2 via-[#ffb3ec] to-p2'
        : 'from-gold via-[#fef08a] to-gold';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-ink/45 animate-reveal-dim motion-reduce:hidden" />
      <div className={cx('absolute left-[-10%] top-[330px] h-[420px] w-[120%] bg-linear-to-r animate-reveal-band motion-reduce:hidden', band)} />
      <div className="absolute inset-x-0 top-[330px] flex h-[420px] flex-col items-center justify-center animate-reveal-text motion-reduce:hidden">
        <span className="font-display text-[44px] font-bold tracking-[0.5em] text-ink/70">{winSlot ? 'WINNER' : 'DRAW'}</span>
        <span className="mt-2 text-[150px] font-black leading-none text-ink">{headline}</span>
      </div>
    </div>
  );
}
