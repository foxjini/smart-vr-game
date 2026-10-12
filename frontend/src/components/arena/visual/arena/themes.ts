import { ThemeType } from '@/types';
import { PALETTE } from '../palette';

/** 테마별 색·조명·안개 값. 경기장 구조(플랫폼·기둥·게이트·격자 바닥)는 모든 테마가 같이 씀 */
export interface ArenaLook {
  sky: {
    /** 머리 위 */
    zenith: number;
    /** 중간 높이 */
    mid: number;
    /** 지평선 */
    horizon: number;
    /** 지평선 바로 위 빛 띠 */
    glow: number;
  };
  /** 안개 (멀리 있는 바닥·구조물이 이 색으로 사라짐). sky.horizon과 같은 색이어야 지평선이 자연스럽게 이어짐 */
  fog: { color: number; near: number; far: number };
  grid: { ground: number; minor: number; major: number };
  /** 별 개수 배율 (품질 설정의 별 개수에 곱함) */
  starDensity: number;
  lights: {
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number;
    key: number;
    keyIntensity: number;
    rim: number;
    rimIntensity: number;
  };
  /** 금속 반사용 환경맵에 그려 넣을 빛 (색, 세기) */
  env: {
    base: number;
    top: [number, number];
    left: [number, number];
    right: [number, number];
    horizon: [number, number];
    intensity: number;
  };
  structure: {
    /** 플랫폼 안쪽 판 */
    plateInner: number;
    /** 플랫폼 바깥 판 */
    plateOuter: number;
    /** 옆면·기둥·게이트 금속 */
    metal: number;
    /** 테두리 빛 */
    accent: number;
  };
  /** 테마 고유 장식 */
  extra: 'none' | 'space' | 'city';
}

export const ARENA_LOOKS: Record<ThemeType, ArenaLook> = {
  // 사이버 경기장: 남색 하늘, 시안 격자, 1P 시안 · 2P 마젠타가 양쪽을 나눔
  cyber: {
    sky: { zenith: 0x02040b, mid: 0x050c1d, horizon: 0x0a1830, glow: 0x174a72 },
    fog: { color: 0x0a1830, near: 30, far: 170 },
    grid: { ground: 0x03060d, minor: 0x0b2a40, major: 0x1a6a94 },
    starDensity: 1,
    lights: {
      hemiSky: 0x4a6fb5,
      hemiGround: 0x0a0e18,
      hemiIntensity: 1.1,
      key: 0xdde8ff,
      keyIntensity: 1.5,
      // 림 라이트는 팀 색(시안·마젠타)과 겹치지 않는 보라 (1P 총에 2P 색 반사가 비치지 않게)
      rim: 0x8f7dff,
      rimIntensity: 0.8,
    },
    env: {
      base: 0x070d1c,
      top: [0xcfe0ff, 5],
      left: [PALETTE.p1, 2.5],
      right: [PALETTE.p2, 2.5],
      horizon: [0x2a6f9e, 1.5],
      intensity: 0.7,
    },
    structure: { plateInner: 0x1f2a3b, plateOuter: 0x161e2b, metal: 0x141b27, accent: 0x7dd3fc },
    extra: 'none',
  },
  // 우주 정거장: 보라빛 성운과 행성, 별이 많음
  space: {
    sky: { zenith: 0x010104, mid: 0x04030d, horizon: 0x0a0a1f, glow: 0x231a4d },
    fog: { color: 0x0a0a1f, near: 40, far: 220 },
    grid: { ground: 0x030308, minor: 0x161636, major: 0x34347a },
    starDensity: 1.6,
    lights: {
      hemiSky: 0x5a5fa8,
      hemiGround: 0x08080f,
      hemiIntensity: 0.9,
      key: 0xffffff,
      keyIntensity: 1.6,
      rim: 0x7c5cff,
      rimIntensity: 1.0,
    },
    env: {
      base: 0x05050d,
      top: [0xffffff, 5],
      left: [0x5b6cff, 1.6],
      right: [0xb15cff, 1.6],
      horizon: [0x302060, 1.2],
      intensity: 0.65,
    },
    structure: { plateInner: 0x22243a, plateOuter: 0x181a2b, metal: 0x15172a, accent: 0xa5b4fc },
    extra: 'space',
  },
  // 네온 도시: 보라·분홍 저녁 하늘과 멀리 보이는 빌딩 숲
  city: {
    sky: { zenith: 0x05030c, mid: 0x140a26, horizon: 0x2e1434, glow: 0x7a2d4f },
    fog: { color: 0x2e1434, near: 28, far: 150 },
    grid: { ground: 0x07050c, minor: 0x2a0f23, major: 0x6a2049 },
    starDensity: 0.25,
    lights: {
      hemiSky: 0x8a5aa8,
      hemiGround: 0x100810,
      hemiIntensity: 1.0,
      key: 0xffe2d0,
      keyIntensity: 1.3,
      rim: 0xb0c4ff,
      rimIntensity: 0.9,
    },
    env: {
      base: 0x0d0714,
      top: [0xffe0f0, 4],
      left: [0xff7a3d, 2],
      right: [PALETTE.p2, 2],
      horizon: [0x7a2d4f, 1.5],
      intensity: 0.7,
    },
    structure: { plateInner: 0x2a1f33, plateOuter: 0x1d1626, metal: 0x1a1420, accent: 0xf9a8d4 },
    extra: 'city',
  },
};
