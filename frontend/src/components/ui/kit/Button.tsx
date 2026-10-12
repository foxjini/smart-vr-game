'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'vr' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

// hud-interactive: 이 영역의 마우스 클릭은 사격으로 처리하지 않음 (InputManager)
const BASE =
  'hud-interactive inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-semibold ' +
  'transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 ease-snap cursor-pointer select-none ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-45';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-p1 bg-p1 text-ink hover:bg-[#67e8f9] hover:shadow-glow-p1',
  secondary: 'border-line-strong bg-raised/85 text-fg hover:border-p1/70 hover:bg-[#1a2a4a]',
  ghost: 'border-transparent bg-transparent text-fg-2 hover:bg-white/8 hover:text-fg',
  danger: 'border-danger/55 bg-danger/14 text-[#fecaca] hover:border-danger hover:bg-danger/26',
  vr: 'border-transparent bg-linear-to-r from-p1 to-p2 text-ink hover:brightness-110 hover:shadow-glow-p1',
  gold: 'border-gold/55 bg-gold/14 text-gold hover:border-gold hover:bg-gold/24',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-10 px-3.5 text-[14px]',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-12 px-5 text-base',
  xl: 'h-14 px-7 text-lg font-bold',
};

const SQUARE: Record<ButtonSize, string> = {
  sm: 'size-10',
  md: 'size-11',
  lg: 'size-12',
  xl: 'size-14',
};

const ICON: Record<ButtonSize, string> = {
  sm: 'size-4',
  md: 'size-[18px]',
  lg: 'size-5',
  xl: 'size-6',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cx(BASE, VARIANT[variant], SIZE[size], className);
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** 아이콘 뒤에 붙는 보조 표시 (단축키 등) */
  trailing?: React.ReactNode;
  /** 글자 부분 클래스 (예: 좁은 화면에서 숨기기 'hidden xl:inline') */
  labelClassName?: string;
}

type ButtonProps = CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * 기본 버튼.
 * 마우스로 누른 뒤에는 포커스를 풀어, 이어서 누르는 스페이스바(사격)가 버튼을 다시 누르지 않게 함
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  trailing,
  labelClassName,
  className,
  children,
  onClick,
  type = 'button',
  ...rest
}: ButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (e.detail > 0) e.currentTarget.blur();
  };
  return (
    <button type={type} className={buttonClass(variant, size, className)} onClick={handleClick} {...rest}>
      {Icon && <Icon className={ICON[size]} strokeWidth={2} aria-hidden="true" />}
      {children !== undefined && <span className={labelClassName}>{children}</span>}
      {trailing}
    </button>
  );
}

type ButtonLinkProps = CommonProps & React.AnchorHTMLAttributes<HTMLAnchorElement>;

/** 버튼 모양의 링크 (매뉴얼 등 새 창 열기) */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  trailing,
  labelClassName,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <a className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon className={ICON[size]} strokeWidth={2} aria-hidden="true" />}
      {children !== undefined && <span className={labelClassName}>{children}</span>}
      {trailing}
    </a>
  );
}

type IconButtonProps = Omit<ButtonProps, 'children' | 'icon' | 'labelClassName'> & {
  icon: LucideIcon;
  /** 화면 낭독기와 마우스 툴팁에 쓰는 이름 */
  label: string;
};

/** 아이콘만 있는 정사각형 버튼 */
export function IconButton({ icon: Icon, label, variant = 'secondary', size = 'md', className, onClick, type = 'button', ...rest }: IconButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (e.detail > 0) e.currentTarget.blur();
  };
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(BASE, VARIANT[variant], SQUARE[size], className)}
      onClick={handleClick}
      {...rest}
    >
      <Icon className={ICON[size]} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
