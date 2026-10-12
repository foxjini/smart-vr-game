'use client';

import React, { useEffect, useRef } from 'react';
import type { AimScreenPoint, ShootingArenaEngine } from '@/components/arena/ShootingArenaEngine';
import { cx } from '@/components/ui/kit';

interface AimReticleProps {
  engineRef: React.RefObject<ShootingArenaEngine | null>;
  /** 내 명중 수 (늘어날 때마다 명중 표시를 잠깐 띄움) */
  hits: number;
  slot: 1 | 2;
  dimmed?: boolean;
}

/**
 * PC 조준점: 화면 가운데가 아니라 총이 실제로 겨누는 곳(처음 닿는 표적 또는 먼 지점)을 따라감.
 * 위치는 매 프레임 DOM에 직접 써서 React 다시 그리기를 하지 않음.
 * 표적 위에 있으면 고리가 좁아지며 팀 색(2점 표적은 금색)으로 바뀜
 */
export function AimReticle({ engineRef, hits, slot, dimmed }: AimReticleProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const out: AimScreenPoint = { x: 0, y: 0, locked: false, points: 0 };
    let raf = 0;
    let lastState = '';
    let lastVisible = true;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = rootRef.current;
      const engine = engineRef.current;
      if (!el || !engine) return;
      const visible = engine.getAimScreenPoint(out);
      if (visible !== lastVisible) {
        el.style.visibility = visible ? '' : 'hidden';
        lastVisible = visible;
      }
      if (!visible) return;
      el.style.transform = `translate3d(${out.x.toFixed(1)}px, ${out.y.toFixed(1)}px, 0)`;
      const state = out.locked ? (out.points >= 2 ? 'gold' : 'lock') : 'free';
      if (state !== lastState) {
        el.dataset.state = state;
        lastState = state;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engineRef]);

  const team = slot === 1 ? 'text-p1' : 'text-p2';

  return (
    <div
      ref={rootRef}
      data-state="free"
      aria-hidden="true"
      className={cx(
        'group pointer-events-none fixed left-0 top-0 z-[15] -ml-9 -mt-9 size-18 will-change-transform',
        'drop-shadow-[0_0_2px_rgb(0_0_0/0.9)] transition-opacity duration-200',
        dimmed ? 'opacity-40' : 'opacity-100'
      )}
    >
      {/* 바깥 고리 4조각: 표적 위에서 45도 돌며 좁아짐 */}
      <svg
        viewBox="0 0 72 72"
        className={cx(
          'absolute inset-0 size-full text-white/90 transition-[transform,color] duration-150 ease-snap',
          'group-data-[state=lock]:rotate-45 group-data-[state=lock]:scale-[0.72]',
          'group-data-[state=gold]:rotate-45 group-data-[state=gold]:scale-[0.72] group-data-[state=gold]:text-gold',
          slot === 1 ? 'group-data-[state=lock]:text-p1' : 'group-data-[state=lock]:text-p2'
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="M27.11 11.57A26 26 0 0 1 44.89 11.57" />
        <path d="M60.43 27.11A26 26 0 0 1 60.43 44.89" />
        <path d="M44.89 60.43A26 26 0 0 1 27.11 60.43" />
        <path d="M11.57 44.89A26 26 0 0 1 11.57 27.11" />
      </svg>
      {/* 가운데 점과 짧은 십자 */}
      <svg viewBox="0 0 72 72" className={cx('absolute inset-0 size-full', team)} fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="36" cy="36" r="2.4" fill="currentColor" stroke="none" />
        <path d="M36 25v5M36 42v5M25 36h5M42 36h5" strokeWidth="2" className="opacity-80" />
      </svg>
      {/* 명중 표시 (X) */}
      {hits > 0 && (
        <svg
          key={hits}
          viewBox="0 0 72 72"
          className="absolute inset-0 size-full text-white animate-hitmarker motion-reduce:animate-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M24 24l7 7M48 24l-7 7M24 48l7-7M48 48l-7-7" />
        </svg>
      )}
    </div>
  );
}
