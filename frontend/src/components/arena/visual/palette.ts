/**
 * 2D(globals.css의 @theme 토큰)와 3D가 함께 쓰는 색.
 * 값을 바꾸면 globals.css의 같은 이름 토큰도 함께 바꿔야 화면 간 색이 일치함.
 */
export const PALETTE = {
  /** 가장 어두운 배경 (--color-ink) */
  ink: 0x070b14,
  /** 1P 시안 (--color-p1) */
  p1: 0x22d3ee,
  /** 2P 마젠타 (--color-p2) */
  p2: 0xff3dc8,
  /** 2점 표적·승자 (--color-gold) */
  gold: 0xfacc15,
  /** AI 라이벌 표시 (--color-ai) */
  ai: 0xfb923c,
  ok: 0x34d399,
  warn: 0xfbbf24,
  danger: 0xf87171,
  /** 기본 글자 (--color-fg) */
  fg: 0xeaf2ff,
  /** 보조 글자 (--color-fg-2) */
  fg2: 0x9fb0c8,
} as const;

export type PlayerSlot = 1 | 2;

/** 슬롯별 팀 색 (1P 시안, 2P 마젠타) */
export function teamColor(slot: PlayerSlot): number {
  return slot === 1 ? PALETTE.p1 : PALETTE.p2;
}

/** 캔버스·CSS용 색 문자열 (#rrggbb) */
export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** 캔버스·CSS용 반투명 색 문자열 */
export function cssRgba(hex: number, alpha: number): string {
  return `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${alpha})`;
}
