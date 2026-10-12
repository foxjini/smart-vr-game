'use client';

import React from 'react';
import { cx } from './cx';

const SIZE = {
  xs: 'h-5 min-w-5 px-1 text-[11px]',
  md: 'h-6 min-w-6 px-1.5 text-[12px]',
  xl: 'h-10 min-w-10 px-3 text-[22px]',
};

const TONE = {
  neutral: 'border-line-strong bg-raised text-fg',
  danger: 'border-danger/40 bg-danger/20 text-[#fecaca]',
};

/** 키보드·컨트롤러 버튼 표시 */
export function Kbd({
  children,
  size = 'md',
  tone = 'neutral',
}: {
  children: React.ReactNode;
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
}) {
  return (
    <kbd
      className={cx(
        'inline-flex items-center justify-center rounded-md border font-sans font-bold leading-none',
        'shadow-[inset_0_-2px_0_rgb(0_0_0/0.35)]',
        SIZE[size],
        TONE[tone]
      )}
    >
      {children}
    </kbd>
  );
}
