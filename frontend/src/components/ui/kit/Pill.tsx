'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'p1' | 'p2' | 'gold' | 'ai' | 'live';

const PILL_TONE: Record<Tone, string> = {
  neutral: 'border-line-strong bg-ink/70 text-fg-2',
  ok: 'border-ok/40 bg-ok/12 text-ok',
  warn: 'border-warn/45 bg-warn/12 text-warn',
  danger: 'border-danger/50 bg-danger/14 text-[#fecaca]',
  p1: 'border-p1/45 bg-p1/12 text-p1',
  p2: 'border-p2/45 bg-p2/12 text-p2',
  gold: 'border-gold/50 bg-gold/14 text-gold',
  ai: 'border-ai/50 bg-ai/14 text-ai',
  live: 'border-danger/60 bg-danger text-white',
};

const DOT_TONE: Record<Tone, string> = {
  neutral: 'bg-fg-3',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  p1: 'bg-p1',
  p2: 'bg-p2',
  gold: 'bg-gold',
  ai: 'bg-ai',
  live: 'bg-white',
};

/** 상태 점 (pulse: 살아 있음 표시) */
export function StatusDot({ tone = 'neutral', pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cx('relative inline-flex size-2 shrink-0', className)} aria-hidden="true">
      {pulse && <span className={cx('absolute inset-0 rounded-full opacity-70 animate-ping motion-reduce:animate-none', DOT_TONE[tone])} />}
      <span className={cx('relative inline-block size-2 rounded-full', DOT_TONE[tone])} />
    </span>
  );
}

interface PillProps {
  tone?: Tone;
  icon?: LucideIcon;
  dot?: boolean;
  pulse?: boolean;
  /** xl: 관전 중계 화면(1920 기준)용 */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** 크기·색 이외의 배치용 클래스 (max-w-*, ml-auto 등) */
  className?: string;
  title?: string;
  children: React.ReactNode;
}

const PILL_SIZE = {
  sm: 'h-6 px-2 text-[12px] gap-1',
  md: 'h-7 px-2.5 text-[13px] gap-1.5',
  lg: 'h-9 px-3.5 text-[15px] gap-2',
  xl: 'h-11 px-5 text-[19px] gap-2.5',
};

const PILL_ICON = {
  sm: 'size-3.5',
  md: 'size-3.5',
  lg: 'size-4',
  xl: 'size-5',
};

/** 짧은 상태 표시 (역할·연결·모드) */
export function Pill({ tone = 'neutral', icon: Icon, dot, pulse, size = 'md', className, title, children }: PillProps) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full border font-semibold leading-none',
        PILL_SIZE[size],
        PILL_TONE[tone],
        className
      )}
    >
      {dot && <StatusDot tone={tone} pulse={pulse} />}
      {Icon && <Icon className={PILL_ICON[size]} strokeWidth={2.2} aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </span>
  );
}
