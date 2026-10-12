'use client';

import { useEffect, useState } from 'react';

/**
 * 1920×1080 기준으로 만든 중계 화면을 지금 창 크기에 맞추는 배율.
 * TV·모니터 해상도가 달라도 점수판·카드 배치가 똑같이 보이게 함
 */
export function useStageScale(baseWidth = 1920, baseHeight = 1080): number {
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight));
  useEffect(() => {
    const onResize = () => setScale(Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [baseWidth, baseHeight]);
  return scale;
}

/** 마우스·키보드 입력이 ms 동안 없으면 true (운영 버튼 숨김용) */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [ms]);
  return idle;
}

/** until(ms 시각)까지 남은 초 (1초마다 갱신) */
export function useSecondsLeft(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** 처음 보인 뒤 ms가 지나면 false (승리 연출 등 잠깐 보이는 요소) */
export function useVisibleFor(ms: number): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return visible;
}
