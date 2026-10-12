'use client';

import React from 'react';
import { cx } from '@/components/ui/kit';

/** 게임 이름 글자 로고 (영문 Rajdhani, 시안→흰색→마젠타) */
export function Logo({ size = 'sm', className }: { size?: 'sm' | 'xl'; className?: string }) {
  if (size === 'xl') {
    return (
      <h1
        className={cx(
          // inline-block: 그라데이션이 글자 폭에 맞게 (시안 → 흰색 → 마젠타)
          'inline-block font-display font-bold uppercase leading-[0.86] tracking-[0.03em]',
          'bg-linear-to-r from-p1 via-white to-p2 bg-clip-text text-transparent',
          'drop-shadow-[0_6px_30px_rgb(34_211_238/0.25)]',
          className
        )}
      >
        Cyber
        <br />
        Strike
      </h1>
    );
  }
  return (
    <span className={cx('font-display font-bold uppercase leading-none tracking-[0.12em] text-fg', className)}>
      Cyber<span className="text-p1">·</span>Strike
    </span>
  );
}
