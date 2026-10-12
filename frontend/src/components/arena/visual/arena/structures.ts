import * as THREE from 'three';
import { PALETTE } from '../palette';
import { ArenaLook } from './themes';
import { GeometryBatch, placeMatrix } from './GeometryBatch';

/** 격자 바닥 높이 (플랫폼 윗면은 y=0, 바닥보다 30cm 높은 단) */
export const FLOOR_Y = -0.3;
/** 원형 플랫폼 반지름 */
export const PLATFORM_RADIUS = 3.2;
/** 선수 발판 위치 (엔진의 SLOT_OFFSET_X와 같음) */
const SLOT_X = 0.75;
/** 표적 구역 뒤 게이트 (표적은 z -12 ~ -27, x -10 ~ 10에서 움직임) */
export const GATE = { y: 5.5, z: -36, radius: 11 };

/**
 * 옆 기둥 [x, z, 높이]. 표적 구역(|x| < 12, z -8 ~ -30)을 피해 양옆과 선수 뒤에 둠.
 * 왼쪽(1P 쪽)은 시안, 오른쪽(2P 쪽)은 마젠타 빛.
 */
const PYLONS: Array<[number, number, number]> = [
  [-15, -6, 9],
  [15, -6, 9],
  [-17.5, -16, 11],
  [17.5, -16, 11],
  [-20, -26, 13],
  [20, -26, 13],
  [-9, 9, 7],
  [9, 9, 7],
  [-3.5, 14, 8],
  [3.5, 14, 8],
];

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _white = new THREE.Color(0xffffff);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** 바닥에 눕힌 평면 도형 (y 높이, x·z 위치) */
function flat(x: number, y: number, z: number, rotY = 0): THREE.Matrix4 {
  _m2.makeRotationX(-Math.PI / 2);
  _q.setFromAxisAngle(Y_AXIS, rotY);
  _m.compose(_v.set(x, y, z), _q, _s);
  return _m.clone().multiply(_m2);
}

/** 선수가 서는 원형 금속 플랫폼 + 팀 발판 + 테두리 빛 */
export function addPlatform(body: GeometryBatch, glow: GeometryBatch, look: ArenaLook) {
  const s = look.structure;

  // 윗면: 안쪽 판과 바깥 판 (경계는 빛나는 고리가 덮음)
  body.add(new THREE.CircleGeometry(1.9, 64), s.plateInner, flat(0, 0, 0));
  body.add(new THREE.RingGeometry(1.9, 3.05, 64, 1), s.plateOuter, flat(0, 0, 0));

  // 테두리 경사와 옆면: 아래에서 위로 그린 단면을 돌려 만듦 (바깥을 향하는 면)
  const profile = [
    new THREE.Vector2(2.7, FLOOR_Y - 0.03),
    new THREE.Vector2(3.12, -0.26),
    new THREE.Vector2(3.22, -0.17),
    new THREE.Vector2(3.2, -0.07),
    new THREE.Vector2(3.13, -0.02),
    new THREE.Vector2(3.05, 0),
  ];
  const edgeColor = new THREE.Color(s.plateOuter);
  const sideColor = new THREE.Color(s.metal);
  body.add(new THREE.LatheGeometry(profile, 64), (p, out) => out.copy(p.y > -0.05 ? edgeColor : sideColor));

  // 테두리 빛 고리와 안쪽 고리
  glow.add(new THREE.RingGeometry(2.96, 3.02, 128), s.accent, flat(0, 0.003, 0));
  glow.add(new THREE.RingGeometry(1.885, 1.915, 128), s.accent, flat(0, 0.003, 0), 0.45);

  // 가장자리 눈금 (15도마다)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    glow.add(new THREE.PlaneGeometry(0.035, 0.16), s.accent, flat(Math.sin(a) * 2.84, 0.003, Math.cos(a) * 2.84, a), 0.7);
  }

  // 옆면 아래쪽 빛 띠 (중계 화면에서 플랫폼 윤곽이 보이게)
  glow.add(new THREE.CylinderGeometry(3.216, 3.216, 0.03, 128, 1, true), s.accent, placeMatrix(0, -0.115, 0), 0.85);

  // 팀 발판: 1P(왼쪽) 시안, 2P(오른쪽) 마젠타
  for (const [x, color] of [
    [-SLOT_X, PALETTE.p1],
    [SLOT_X, PALETTE.p2],
  ] as const) {
    glow.add(new THREE.RingGeometry(0.4, 0.445, 64), color, flat(x, 0.004, 0));
    glow.add(new THREE.CircleGeometry(0.4, 48), color, flat(x, 0.0035, 0), 0.14);
  }
}

/** 플랫폼에서 게이트 쪽으로 뻗은 바닥 빛줄 (거리감) */
export function addFloorTracks(glow: GeometryBatch) {
  const near = -3.5;
  const far = -33.5;
  for (const [x, color] of [
    [-2.4, PALETTE.p1],
    [2.4, PALETTE.p2],
  ] as const) {
    const base = new THREE.Color(color);
    glow.add(new THREE.PlaneGeometry(0.06, near - far, 1, 12), (p, out) => {
      // 가까운 쪽은 밝고 먼 쪽은 어둡게
      const k = THREE.MathUtils.smoothstep(p.z, far, near);
      out.copy(base).multiplyScalar(0.08 + 0.55 * k);
    }, flat(x, FLOOR_Y + 0.004, (near + far) / 2));
  }
}

/** 양옆·뒤의 빛 기둥 */
export function addPylons(body: GeometryBatch, glow: GeometryBatch, look: ArenaLook) {
  const s = look.structure;
  for (const [x, z, h] of PYLONS) {
    // 경기장 쪽(0, -8)을 바라보게 회전
    const rot = Math.atan2(0 - x, -8 - z);
    const base = placeMatrix(x, 0, z, rot);
    const at = (lx: number, ly: number, lz: number) => base.clone().multiply(_m.makeTranslation(lx, ly, lz));
    const side = x < 0 ? PALETTE.p1 : PALETTE.p2;

    body.add(new THREE.BoxGeometry(1.4, 0.5, 1.4), s.metal, at(0, FLOOR_Y + 0.25, 0));
    body.add(new THREE.BoxGeometry(0.8, h, 0.8), s.metal, at(0, FLOOR_Y + h / 2, 0));
    body.add(new THREE.BoxGeometry(1.1, 0.24, 1.1), s.plateOuter, at(0, FLOOR_Y + h + 0.12, 0));

    // 경기장 쪽 면의 세로 빛줄, 꼭대기 빛, 받침 테두리
    glow.add(new THREE.BoxGeometry(0.09, h * 0.78, 0.03), side, at(0, FLOOR_Y + 0.6 + h * 0.39, 0.41));
    glow.add(new THREE.BoxGeometry(0.86, 0.06, 0.86), s.accent, at(0, FLOOR_Y + h - 0.03, 0), 0.9);
    glow.add(new THREE.BoxGeometry(1.44, 0.04, 1.44), s.accent, at(0, FLOOR_Y + 0.5, 0), 0.5);
    // 기둥을 두른 가는 빛 띠 두 줄
    for (const f of [0.36, 0.68]) glow.add(new THREE.BoxGeometry(0.84, 0.035, 0.84), s.accent, at(0, FLOOR_Y + h * f, 0), 0.45);
  }
}

/** 표적 구역 뒤의 큰 원형 게이트 (안쪽 빛은 왼쪽 1P 시안 → 오른쪽 2P 마젠타) */
export function addGate(body: GeometryBatch, glow: GeometryBatch, look: ArenaLook) {
  const s = look.structure;
  const { y: cy, z: cz, radius: R } = GATE;
  const center = placeMatrix(0, cy, cz);

  body.add(new THREE.TorusGeometry(R, 0.45, 12, 128), s.metal, center);

  const p1 = new THREE.Color(PALETTE.p1);
  const p2 = new THREE.Color(PALETTE.p2);
  const inner = R - 0.5;
  glow.add(new THREE.TorusGeometry(inner, 0.07, 6, 192), (p, out) => {
    const t = THREE.MathUtils.clamp((p.x + inner) / (inner * 2), 0, 1);
    out.copy(p1).lerp(p2, t);
    // 꼭대기는 조금 하얗게
    out.lerp(_white, THREE.MathUtils.smoothstep(p.y, cy + inner * 0.45, cy + inner) * 0.55);
  }, center);

  // 바깥 둘레의 등 (바닥 아래는 생략)
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r = R + 0.55;
    const x = Math.sin(a) * r;
    const y = cy + Math.cos(a) * r;
    if (y < FLOOR_Y + 0.4) continue;
    _q.setFromAxisAngle(Z_AXIS, -a);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, cz), _q, _s);
    glow.add(new THREE.BoxGeometry(0.14, 0.55, 0.14), s.accent, m, 0.8);
  }

  // 게이트가 바닥과 만나는 받침
  const footX = Math.sqrt(R * R - (cy - FLOOR_Y) * (cy - FLOOR_Y));
  for (const x of [-footX, footX]) {
    body.add(new THREE.BoxGeometry(2.6, 1.6, 2.8), s.metal, placeMatrix(x, FLOOR_Y + 0.8, cz));
    glow.add(new THREE.BoxGeometry(2.4, 0.06, 0.02), s.accent, placeMatrix(x, FLOOR_Y + 1.3, cz + 1.41), 0.9);
  }
}

/** 게이트 바깥을 천천히 도는 점선 고리 (회전하므로 따로 그림) */
export function createGateSpinner(look: ArenaLook): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const arc = Math.PI / 6;
  for (let i = 0; i < 8; i++) {
    _q.setFromAxisAngle(Z_AXIS, (i / 8) * Math.PI * 2);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(), _q, _s);
    batch.add(new THREE.TorusGeometry(GATE.radius + 1.35, 0.05, 4, 24, arc), look.structure.accent, m, 0.7);
  }
  return batch.build()!;
}
