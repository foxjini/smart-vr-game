'use client';

import React from 'react';
import { Bot, Pause, Video } from 'lucide-react';
import { Difficulty, SpectatorCameraMode, VersusMatchStats } from '@/types';
import { CAMERA_NAME, CAMERA_ORDER, DIFFICULTY_NAME } from '@/constants/labels';
import { Panel, Pill, cx } from '@/components/ui/kit';
import { Slot, shownAccuracy, slotName } from '@/components/ui/matchInfo';
import { ScoreBug } from '../ScoreBug';
import { Logo } from './Logo';

interface LiveBroadcastProps {
  versusStats: VersusMatchStats;
  timeRemaining: number;
  isPaused: boolean;
  aiSlot: Slot | null;
  difficulty: Difficulty;
  cameraMode: SpectatorCameraMode;
}

/** 실제 경기 중계 화면 (1920×1080 기준): 상단 점수판 · 아래 선수 카드 · 카메라 표시 */
export function LiveBroadcast({ versusStats, timeRemaining, isPaused, aiSlot, difficulty, cameraMode }: LiveBroadcastProps) {
  return (
    <div className="absolute inset-0">
      {/* 밝은 장면 위에서도 점수판·카드가 읽히도록 위·아래만 살짝 어둡게 */}
      <div className="absolute inset-x-0 top-0 h-[280px] bg-linear-to-b from-ink/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[300px] bg-linear-to-t from-ink/78 to-transparent" />

      <div className="absolute left-[64px] top-[48px] flex flex-col items-start gap-3">
        <Logo className="text-[30px]" />
        <Pill tone="live" dot pulse size="xl" className="font-num tracking-[0.12em]">
          LIVE
        </Pill>
      </div>

      <div className="absolute left-1/2 top-[40px] -translate-x-1/2">
        <ScoreBug
          variant="broadcast"
          p1Score={versusStats.p1Score}
          p2Score={versusStats.p2Score}
          timeRemaining={timeRemaining}
          isPaused={isPaused}
          aiSlot={aiSlot}
          difficulty={difficulty}
        />
      </div>

      {isPaused && (
        <div className="absolute inset-x-0 top-[430px] flex justify-center">
          <div className="flex items-center gap-5 rounded-2xl border border-warn/50 bg-ink/85 px-14 py-7 shadow-panel backdrop-blur-md">
            <Pause className="size-14 text-warn" strokeWidth={2.4} aria-hidden="true" />
            <span className="text-[60px] font-black leading-none text-warn">일시정지 중</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-[56px] left-[64px]">
        <PlayerCard
          slot={1}
          name={slotName(1, aiSlot)}
          isAI={aiSlot === 1}
          aiLabel={DIFFICULTY_NAME[difficulty]}
          hits={versusStats.p1Hits}
          accuracy={shownAccuracy(versusStats.p1Accuracy, versusStats.p1Shots)}
          combo={versusStats.p1Combo}
        />
      </div>
      <div className="absolute bottom-[56px] right-[64px]">
        <PlayerCard
          slot={2}
          name={slotName(2, aiSlot)}
          isAI={aiSlot === 2}
          aiLabel={DIFFICULTY_NAME[difficulty]}
          hits={versusStats.p2Hits}
          accuracy={shownAccuracy(versusStats.p2Accuracy, versusStats.p2Shots)}
          combo={versusStats.p2Combo}
        />
      </div>

      <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2">
        <Panel solid className="flex items-center gap-3 px-6 py-3">
          <Video className="size-6 text-fg-2" strokeWidth={2} aria-hidden="true" />
          <span className="font-num text-[24px] font-bold tracking-[0.1em] text-fg-2">CAM {CAMERA_ORDER.indexOf(cameraMode) + 1}</span>
          <span className="text-[24px] font-semibold text-fg">{CAMERA_NAME[cameraMode]}</span>
        </Panel>
      </div>
    </div>
  );
}

interface PlayerCardProps {
  slot: 1 | 2;
  name: string;
  isAI: boolean;
  aiLabel: string;
  hits: number;
  /** null이면 아직 쏘지 않음 ('-') */
  accuracy: number | null;
  combo: number;
}

/** 아래쪽 선수 카드: 이름 · 명중 · 명중률 · 연속 명중 (위치는 감싸는 요소가 정함) */
function PlayerCard({ slot, name, isAI, aiLabel, hits, accuracy, combo }: PlayerCardProps) {
  const right = slot === 2;
  return (
    <Panel accent={slot === 1 ? 'p1' : 'p2'} solid className="w-[500px] overflow-hidden p-0">
      <div className={cx('flex items-center gap-4 px-7 pt-5', right && 'flex-row-reverse text-right')}>
        <span className={cx('font-num text-[34px] font-bold leading-none', slot === 1 ? 'text-p1' : 'text-p2')}>{slot}P</span>
        <span className="truncate text-[28px] font-bold leading-none text-fg">{name}</span>
        {isAI && (
          <Pill tone="ai" icon={Bot} size="xl" className={right ? 'mr-auto' : 'ml-auto'}>
            {aiLabel}
          </Pill>
        )}
      </div>
      <div className={cx('grid grid-cols-3 gap-4 px-7 pb-6 pt-5', right && 'text-right')}>
        <CardStat label="명중" value={hits} />
        <CardStat label="명중률" value={accuracy ?? '-'} unit={accuracy === null ? undefined : '%'} />
        <CardStat label="연속 명중" value={combo > 0 ? `x${combo}` : '-'} highlight={combo >= 3} />
      </div>
    </Panel>
  );
}

function CardStat({ label, value, unit, highlight }: { label: string; value: number | string; unit?: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[18px] font-medium leading-none text-fg-3">{label}</span>
      <span className={cx('font-num text-[44px] font-bold leading-none tabular-nums', highlight ? 'text-gold' : 'text-fg')}>
        {value}
        {unit && <span className="text-[24px] text-fg-2">{unit}</span>}
      </span>
    </div>
  );
}
