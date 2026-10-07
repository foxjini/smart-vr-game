'use client';

import dynamic from 'next/dynamic';

// Three.js·WebXR 게임은 브라우저에서만 동작하므로 서버 렌더링 없이 불러옴
// (URL·localStorage로 정하는 역할 등 초기값이 서버 HTML과 달라 생기던 hydration 불일치 방지)
const ShootingArenaApp = dynamic(() => import('@/components/ShootingArenaApp'), {
  ssr: false,
  loading: () => <main className="relative w-screen h-screen overflow-hidden bg-black" />,
});

export default function ShootingArenaPage() {
  return <ShootingArenaApp />;
}
