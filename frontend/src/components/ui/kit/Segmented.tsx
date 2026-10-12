'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cx } from './cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface SegmentedProps<T extends string> {
  /** 화면 낭독기용 묶음 이름 */
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  /** 세로 목록으로 배치 (설명이 긴 항목) */
  vertical?: boolean;
  className?: string;
}

/** 여러 값 중 하나를 고르는 묶음 버튼 (라디오 그룹) */
export function Segmented<T extends string>({ label, value, options, onChange, vertical, className }: SegmentedProps<T>) {
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    if (next) onChange(next.value);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx('hud-interactive grid gap-1 rounded-xl border border-line bg-ink/55 p-1', className)}
      style={vertical ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={(e) => {
              onChange(o.value);
              if (e.detail > 0) e.currentTarget.blur();
            }}
            className={cx(
              'relative flex min-h-11 min-w-0 cursor-pointer flex-col justify-center rounded-lg px-3 py-2 text-left transition-colors duration-150',
              selected ? 'bg-raised text-fg ring-1 ring-p1/70' : 'text-fg-2 hover:bg-white/6 hover:text-fg'
            )}
          >
            <span className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight">
              {selected && <Check className="size-3.5 shrink-0 text-p1" strokeWidth={3} aria-hidden="true" />}
              <span className="truncate">{o.label}</span>
            </span>
            {o.hint && <span className="mt-0.5 text-[12px] leading-snug text-fg-3">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
