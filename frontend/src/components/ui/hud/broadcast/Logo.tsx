'use client';

import React from 'react';
import { cx } from '@/components/ui/kit';

/** 게임 이름 글자 로고 (영문 Rajdhani, 가운데 점은 시안) */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('font-display font-bold uppercase leading-none tracking-[0.12em] text-fg', className)}>
      Cyber<span className="text-p1">·</span>Strike
    </span>
  );
}
