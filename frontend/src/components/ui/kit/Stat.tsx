'use client';

import React from 'react';
import { cx } from './cx';

interface StatProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  /** 값 글자색 클래스만 (예: text-p1) */
  valueClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  /** false: 한글 값 (숫자 글꼴 대신 본문 글꼴) */
  numeric?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

const VALUE_SIZE = {
  sm: 'text-xl',
  md: 'text-[28px]',
  lg: 'text-[40px]',
};

/** 이름표 + 큰 숫자 */
export function Stat({ label, value, unit, valueClassName = 'text-fg', size = 'md', numeric = true, align = 'left', className }: StatProps) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-col gap-1',
        align === 'right' && 'items-end text-right',
        align === 'center' && 'items-center text-center',
        className
      )}
    >
      <span className="text-[13px] font-medium leading-none text-fg-3">{label}</span>
      <span className={cx('font-bold leading-none tabular-nums', numeric ? 'font-num' : 'font-sans', VALUE_SIZE[size], valueClassName)}>
        {value}
        {unit && <span className="ml-0.5 text-[0.55em] font-semibold text-fg-2">{unit}</span>}
      </span>
    </div>
  );
}
