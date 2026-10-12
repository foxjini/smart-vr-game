'use client';

import React from 'react';
import { cx } from './cx';

export type Accent = 'p1' | 'p2' | 'gold' | 'ai' | 'danger' | 'none';

// 패널 윗변의 가는 빛 (어느 팀·의미의 패널인지 표시)
const ACCENT: Record<Accent, string> = {
  p1: 'before:via-p1',
  p2: 'before:via-p2',
  gold: 'before:via-gold',
  ai: 'before:via-ai',
  danger: 'before:via-danger',
  none: 'before:hidden',
};

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: Accent;
  /** 마우스 클릭을 받는 패널 (사격으로 처리하지 않음) */
  interactive?: boolean;
  /** 더 진한 바탕 (밝은 3D 장면 위 글자) */
  solid?: boolean;
}

/**
 * 반투명 남색 패널.
 * 기본이 position: relative이므로 absolute·fixed 배치는 감싸는 요소에 줄 것 (같은 요소에 주면 충돌)
 */
export function Panel({ accent = 'none', interactive, solid, className, children, ...rest }: PanelProps) {
  return (
    <div
      className={cx(
        'relative rounded-panel border border-line shadow-panel backdrop-blur-md',
        solid ? 'bg-panel/95' : 'bg-panel/82',
        "before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:to-transparent before:content-['']",
        ACCENT[accent],
        interactive && 'hud-interactive',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
