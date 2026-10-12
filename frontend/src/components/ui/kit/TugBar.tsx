'use client';

import React from 'react';
import { cx } from './cx';

interface TugBarProps {
  p1Score: number;
  p2Score: number;
  size?: 'sm' | 'lg';
  className?: string;
}

/** 점수 줄다리기 막대 (가운데 = 동점, 앞선 팀 색이 반대쪽으로 밀고 들어감) */
export function TugBar({ p1Score, p2Score, size = 'sm', className }: TugBarProps) {
  const total = p1Score + p2Score;
  const ratio = total > 0 ? p1Score / total : 0.5;
  const pct = `${(ratio * 100).toFixed(1)}%`;
  return (
    <div
      className={cx('relative w-full', size === 'lg' ? 'h-3' : 'h-2', className)}
      role="meter"
      aria-label="점수 줄다리기"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full bg-ink/80 ring-1 ring-line">
        <div
          className="absolute inset-y-0 left-0 bg-linear-to-r from-p1/55 to-p1 transition-[width] duration-500 ease-snap"
          style={{ width: pct }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-linear-to-l from-p2/55 to-p2 transition-[width] duration-500 ease-snap"
          style={{ width: `calc(100% - ${pct})` }}
        />
      </div>
      {/* 가운데(동점) 눈금 */}
      <span className="absolute -inset-y-1 left-1/2 w-px bg-white/45" aria-hidden="true" />
      {/* 두 팀 경계 */}
      <span
        className={cx(
          'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgb(255_255_255/0.8)] transition-[left] duration-500 ease-snap',
          size === 'lg' ? 'size-4' : 'size-3'
        )}
        style={{ left: pct }}
        aria-hidden="true"
      />
    </div>
  );
}
