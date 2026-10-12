'use client';

import React, { useId } from 'react';
import { cx } from './cx';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** 오른쪽에 보이는 값 (기본: 그대로) */
  format?: (value: number) => string;
  disabled?: boolean;
  tone?: 'p1' | 'p2';
  className?: string;
}

/** 이름·값이 붙은 가로 슬라이더 */
export function Slider({ label, value, min, max, step, onChange, format, disabled, tone = 'p1', className }: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cx('flex flex-col gap-2', disabled && 'opacity-50', className)}>
      <label htmlFor={id} className="flex items-center justify-between gap-3 text-[14px] text-fg-2">
        <span>{label}</span>
        <span className="font-num text-[17px] font-bold tabular-nums text-fg">{format ? format(value) : value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={cx('kit-range hud-interactive', tone === 'p2' && 'kit-range-p2')}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
}
