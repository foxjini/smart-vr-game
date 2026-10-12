'use client';

import React from 'react';
import { cx } from './cx';

const SIZE = {
  md: {
    grid: 'grid-cols-[64px_minmax(0,1fr)_112px_minmax(0,1fr)_64px] gap-3',
    value: 'text-[24px]',
    unit: 'text-[14px]',
    label: 'text-[14px]',
    bar: 'h-2.5',
  },
  xl: {
    grid: 'grid-cols-[130px_minmax(0,1fr)_240px_minmax(0,1fr)_130px] gap-5',
    value: 'text-[42px]',
    unit: 'text-[24px]',
    label: 'text-[24px]',
    bar: 'h-4',
  },
} as const;

interface CompareRowProps {
  label: string;
  /** null이면 '-'로 표시하고 막대를 비움 (예: 한 발도 쏘지 않은 명중률) */
  left: number | null;
  right: number | null;
  unit?: string;
  size?: keyof typeof SIZE;
}

/** 1P(왼쪽)·2P(오른쪽) 기록 비교 막대. 가운데에 항목 이름, 더 높은 쪽 숫자를 팀 색으로 강조 */
export function CompareRow({ label, left: leftValue, right: rightValue, unit, size = 'md' }: CompareRowProps) {
  const s = SIZE[size];
  const left = leftValue ?? 0;
  const right = rightValue ?? 0;
  const max = Math.max(left, right, 1);
  return (
    <div className={cx('grid items-center', s.grid)}>
      <span className={cx('text-right font-num font-bold leading-none tabular-nums', s.value, left > right ? 'text-p1' : 'text-fg')}>
        {leftValue ?? '-'}
        {unit && leftValue !== null && <span className={cx('text-fg-2', s.unit)}>{unit}</span>}
      </span>
      <div className={cx('flex justify-end overflow-hidden rounded-full bg-white/8', s.bar)}>
        <div
          className="h-full rounded-full bg-linear-to-l from-p1 to-p1/45 transition-[width] duration-700 ease-snap"
          style={{ width: `${(left / max) * 100}%` }}
        />
      </div>
      <span className={cx('text-center font-semibold leading-tight text-fg-2', s.label)}>{label}</span>
      <div className={cx('flex overflow-hidden rounded-full bg-white/8', s.bar)}>
        <div
          className="h-full rounded-full bg-linear-to-r from-p2 to-p2/45 transition-[width] duration-700 ease-snap"
          style={{ width: `${(right / max) * 100}%` }}
        />
      </div>
      <span className={cx('font-num font-bold leading-none tabular-nums', s.value, right > left ? 'text-p2' : 'text-fg')}>
        {rightValue ?? '-'}
        {unit && rightValue !== null && <span className={cx('text-fg-2', s.unit)}>{unit}</span>}
      </span>
    </div>
  );
}
