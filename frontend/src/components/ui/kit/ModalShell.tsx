'use client';

import React, { useEffect, useId, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './Button';
import type { Accent } from './Panel';

/**
 * 창 쌓임 순서: 결과창 위에서 연 순위표·설정이 뒤에 깔리지 않도록 고정
 * (z-index는 globals.css의 .modal-backdrop 기본값 100보다 유틸리티가 우선)
 */
export type ModalLayer = 'menu' | 'result' | 'leaderboard' | 'settings';
const LAYER: Record<ModalLayer, string> = {
  menu: 'z-[100]',
  result: 'z-[110]',
  leaderboard: 'z-[120]',
  settings: 'z-[130]',
};

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
} as const;

const ACCENT_TEXT: Record<Accent, string> = {
  p1: 'text-p1',
  p2: 'text-p2',
  gold: 'text-gold',
  ai: 'text-ai',
  danger: 'text-danger',
  none: 'text-fg-2',
};

const ACCENT_LINE: Record<Accent, string> = {
  p1: 'via-p1',
  p2: 'via-p2',
  gold: 'via-gold',
  ai: 'via-ai',
  danger: 'via-danger',
  none: 'via-line-strong',
};

interface ModalShellProps {
  layer: ModalLayer;
  title: React.ReactNode;
  /** 제목 위 작은 분류 글 */
  eyebrow?: string;
  icon?: LucideIcon;
  accent?: Accent;
  size?: keyof typeof SIZE;
  onClose?: () => void;
  footer?: React.ReactNode;
  /** 제목 오른쪽(닫기 버튼 앞)에 붙는 내용 */
  headerAside?: React.ReactNode;
  /** 머리글 바로 아래 전체 너비 알림 (예: 친구 대결 준비 띠) */
  notice?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * 공통 창 틀: 어두운 배경 + 가운데 창 (제목·본문·하단 버튼).
 * modal-backdrop 클래스는 InputManager가 창 안의 클릭을 사격으로 처리하지 않게 하는 표시이므로 유지
 */
export function ModalShell({
  layer,
  title,
  eyebrow,
  icon: Icon,
  accent = 'p1',
  size = 'md',
  onClose,
  footer,
  headerAside,
  notice,
  bodyClassName,
  children,
}: ModalShellProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  // 열릴 때 창으로 포커스를 옮겨 키보드 사용자도 창 안에서 시작
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={cx('modal-backdrop', LAYER[layer])}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[min(92vh,980px)] w-full flex-col overflow-hidden rounded-2xl border border-line-strong',
          'bg-panel/96 shadow-panel outline-none animate-fade-in motion-reduce:animate-none',
          SIZE[size]
        )}
      >
        <span
          className={cx('pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent to-transparent', ACCENT_LINE[accent])}
          aria-hidden="true"
        />
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5 short:pb-2.5 short:pt-3">
          <div className="min-w-0">
            {eyebrow && (
              <p className={cx('mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold', ACCENT_TEXT[accent])}>
                {Icon && <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />}
                {eyebrow}
              </p>
            )}
            <h2 id={titleId} className="text-[22px] font-bold leading-tight text-fg">
              {title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerAside}
            {onClose && <IconButton icon={X} label="닫기" variant="ghost" onClick={onClose} />}
          </div>
        </header>
        {notice}
        <div className={cx('custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5 short:py-3', bodyClassName)}>{children}</div>
        {footer && <footer className="border-t border-line bg-ink/45 px-6 py-4 short:py-2.5">{footer}</footer>}
      </section>
    </div>
  );
}
