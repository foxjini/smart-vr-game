import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { TargetKeyword, TargetShape } from '@/types';
import { PALETTE } from './palette';
import { HitProxyFactory } from './hitProxies';
import { TargetLabels } from './TargetLabels';

/** 1점 표적 / 2점 표적 */
type Tier = 'normal' | 'bonus';

/** 표적 색: 팀 색(시안·마젠타)과 겹치지 않게 1점은 강철+주황 빛, 2점은 금색 */
const COLORS = {
  metal: 0x232c3a,
  metalLight: 0x3b4758,
  band: 0x0e131c,
  gold: 0xc79a1c,
  glow: { normal: 0xff5a32, bonus: 0xffd23f },
  rim: { normal: 0x8fb3ff, bonus: PALETTE.gold },
  rimStrength: { normal: 0.35, bonus: 0.8 },
  rotor: 0xcfe3ff,
} as const;

/** 표적 빛 색 (등장 고리·사라짐 효과에도 사용) */
export function targetGlowColor(points: number): number {
  return points === 2 ? COLORS.glow.bonus : COLORS.glow.normal;
}

/** 라벨을 올릴 높이 (모양마다 다른 위쪽 끝, 크기 배율 s 곱하기 전) */
const TOP_Y: Record<TargetShape, number> = { drone: 0.45, sphere: 0.62, cube: 0.62, disc: 0.62 };

export interface DroneParts {
  /** 엔진이 위치를 옮기는 표적 루트 (AI·명중 판정이 이 위치를 씀) */
  root: THREE.Group;
  /** 겉모습 (등장·사라짐 크기, 기울기) - 판정에 영향 없음 */
  visual: THREE.Group;
  /** 사격 판정 메시 (예전 모양 그대로, 보이지 않음) */
  hitMeshes: THREE.Mesh[];
  /** 예전처럼 회전하는 판정 메시 */
  spinners: THREE.Object3D[];
  /** 판정 메시 회전을 그대로 따라가는 장식 (spinners와 같은 순서, 없으면 null) */
  visualSpinners: Array<THREE.Object3D | null>;
  label: THREE.Sprite;
  /** 라벨 기본 크기 (거리 보정 전) */
  labelBase: THREE.Vector2;
  /** 라벨 높이 기준 (모양 위쪽 끝) */
  labelTop: number;
  /** 움직이는 방향으로 기울어지는지 (드론만) */
  banks: boolean;
}

type ShapeGeometries = {
  body: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
  rotor?: THREE.BufferGeometry;
  shell?: THREE.BufferGeometry;
};

/** 지오메트리에 한 가지 정점 색을 칠함 (여러 부품을 한 번에 그리기 위해 합칠 때 사용) */
function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) throw new Error('DroneFactory: geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}

/** 금속 재질 가장자리에 빛 테두리(프레넬)를 더함 - 어두운 하늘에서도 실루엣이 보이게 */
function withRim(material: THREE.MeshStandardMaterial, color: number, strength: number) {
  const uniforms = {
    uRimColor: { value: new THREE.Color(color).multiplyScalar(strength) },
    uRimPower: { value: 2.4 },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = uniforms.uRimColor;
    shader.uniforms.uRimPower = uniforms.uRimPower;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
          'totalEmissiveRadiance += uRimColor * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), uRimPower);'
      );
  };
  material.customProgramCacheKey = () => 'drone-rim';
  return material;
}

const ROTOR_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** 프로펠러 회전 잔상: 원판 하나에 날개 무늬를 시간에 따라 돌려 그림 (메시를 돌리지 않음) */
const ROTOR_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float a = atan(p.y, p.x) + uTime * 38.0;
  float blades = pow(abs(cos(a)), 14.0) * (1.0 - r * 0.55);
  float ring = smoothstep(0.84, 0.94, r) * (1.0 - smoothstep(0.94, 1.0, r));
  float hub = 1.0 - smoothstep(0.0, 0.2, r);
  float alpha = (blades * 0.5 + ring * 0.55 + hub * 0.35) * 0.65;
  gl_FragColor = vec4(uColor * alpha, alpha);
  #include <colorspace_fragment>
}`;

const SHELL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

/** 구체 표적의 바깥 에너지 막: 가장자리만 빛나 판정 범위(반지름 0.6)가 보이게 */
const SHELL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = pow(f, 2.6) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}`;

/**
 * 표적(드론·구체·큐브·원반) 겉모습을 만드는 곳.
 * - 모양·크기·점수별 지오메트리를 한 번만 만들어 공유하고 표적을 지울 때 해제하지 않음
 * - 표적 하나는 몸체·발광부·(프로펠러 또는 에너지 막)·라벨 = draw call 3~4개 (예전 드론은 11개)
 * - 사격 판정은 hitProxies의 예전 모양을 그대로 씀
 */
export class DroneFactory {
  readonly proxies = new HitProxyFactory();
  private geoCache = new Map<string, ShapeGeometries>();
  private bodyMat: Record<Tier, THREE.MeshStandardMaterial>;
  private glowMat: Record<Tier, THREE.MeshBasicMaterial>;
  private shellMat: Record<Tier, THREE.ShaderMaterial>;
  private rotorMat: THREE.ShaderMaterial;
  private time = 0;

  constructor(private labels: TargetLabels) {
    const tiers: Tier[] = ['normal', 'bonus'];
    this.bodyMat = {} as Record<Tier, THREE.MeshStandardMaterial>;
    this.glowMat = {} as Record<Tier, THREE.MeshBasicMaterial>;
    this.shellMat = {} as Record<Tier, THREE.ShaderMaterial>;
    tiers.forEach((tier) => {
      this.bodyMat[tier] = withRim(
        new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.32 }),
        COLORS.rim[tier],
        COLORS.rimStrength[tier]
      );
      this.glowMat[tier] = new THREE.MeshBasicMaterial({ color: COLORS.glow[tier], toneMapped: false });
      this.shellMat[tier] = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(COLORS.glow[tier]) },
          uOpacity: { value: tier === 'bonus' ? 0.9 : 0.6 },
        },
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    });
    this.rotorMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(COLORS.rotor) } },
      vertexShader: ROTOR_VERT,
      fragmentShader: ROTOR_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  }

  /** 프로펠러 무늬 회전 (일시정지 중에는 부르지 않음) */
  update(dt: number) {
    this.time += dt;
    this.rotorMat.uniforms.uTime.value = this.time;
  }

  create(shape: TargetShape, points: number, keyword: TargetKeyword, s: number): DroneParts {
    const tier: Tier = points === 2 ? 'bonus' : 'normal';
    const root = new THREE.Group();
    root.name = `target:${shape}`;
    const visual = new THREE.Group();
    root.add(visual);

    const { meshes: hitMeshes, spinners } = this.proxies.build(root, shape, s);
    const geos = this.shapeGeometries(shape, tier, s);
    const visualSpinners: Array<THREE.Object3D | null> = spinners.map(() => null);

    // 판정 메시와 함께 도는 장식은 같은 회전을 받을 그룹에 넣음
    const spinGroup = shape === 'drone' ? null : new THREE.Group();
    const holder = spinGroup ?? visual;
    if (spinGroup) {
      visual.add(spinGroup);
      // 구체는 바깥 껍질(spinners[0])을, 큐브·원반은 몸체를 따라 돎
      visualSpinners[0] = spinGroup;
    }

    const body = new THREE.Mesh(geos.body, this.bodyMat[tier]);
    holder.add(body);
    if (geos.glow) {
      // 구체의 빛나는 코어는 회전과 상관없으므로 바깥 그룹에 둠
      const glow = new THREE.Mesh(geos.glow, this.glowMat[tier]);
      (shape === 'sphere' ? visual : holder).add(glow);
    }
    if (geos.rotor) visual.add(new THREE.Mesh(geos.rotor, this.rotorMat));
    if (geos.shell) visual.add(new THREE.Mesh(geos.shell, this.shellMat[tier]));

    // 장식은 사격 판정에서 빠지도록 레이캐스트를 끔
    visual.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.raycast = () => {};
    });

    const labelScale = Math.max(s, 1);
    const label = new THREE.Sprite(this.labels.labelMaterial(keyword, points));
    label.raycast = () => {};
    const labelBase = new THREE.Vector2(1.4 * labelScale, 0.7 * labelScale);
    const labelTop = TOP_Y[shape] * s;
    label.scale.set(labelBase.x, labelBase.y, 1);
    label.position.set(0, labelTop + labelBase.y / 2 + 0.04, 0);
    root.add(label);

    return {
      root,
      visual,
      hitMeshes,
      spinners,
      visualSpinners,
      label,
      labelBase,
      labelTop,
      banks: shape === 'drone',
    };
  }

  /** 셰이더를 미리 컴파일하기 위한 견본 (모양 4종 × 점수 2종) */
  createSamples(s: number): THREE.Group {
    const group = new THREE.Group();
    (['drone', 'sphere', 'cube', 'disc'] as TargetShape[]).forEach((shape) => {
      group.add(this.create(shape, 1, '제어', s).root);
      group.add(this.create(shape, 2, '정보', s).root);
    });
    return group;
  }

  private shapeGeometries(shape: TargetShape, tier: Tier, s: number): ShapeGeometries {
    const key = `${shape}:${tier}:${s}`;
    let g = this.geoCache.get(key);
    if (g) return g;
    const bonus = tier === 'bonus';
    if (shape === 'drone') g = buildDrone(s, bonus);
    else if (shape === 'sphere') g = buildSphere(s, bonus);
    else if (shape === 'cube') g = buildCube(s, bonus);
    else g = buildDisc(s, bonus);
    this.geoCache.set(key, g);
    return g;
  }

  dispose() {
    this.geoCache.forEach((g) => {
      g.body.dispose();
      g.glow?.dispose();
      g.rotor?.dispose();
      g.shell?.dispose();
    });
    this.geoCache.clear();
    (['normal', 'bonus'] as Tier[]).forEach((tier) => {
      this.bodyMat[tier].dispose();
      this.glowMat[tier].dispose();
      this.shellMat[tier].dispose();
    });
    this.rotorMat.dispose();
    this.proxies.dispose();
  }
}

/** 프로펠러 4개 위치 (판정 메시와 같은 자리) */
function propPositions(s: number): THREE.Vector3[] {
  return [
    new THREE.Vector3(0.45 * s, 0.15 * s, 0.45 * s),
    new THREE.Vector3(-0.45 * s, 0.15 * s, 0.45 * s),
    new THREE.Vector3(0.45 * s, 0.15 * s, -0.45 * s),
    new THREE.Vector3(-0.45 * s, 0.15 * s, -0.45 * s),
  ];
}

/** 드론: 둥근 몸체 + 띠 + 팔 4개 + 모터, 앞쪽 눈과 모터 불빛, 프로펠러 원판 */
function buildDrone(s: number, bonus: boolean): ShapeGeometries {
  const body: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const rotor: THREE.BufferGeometry[] = [];

  body.push(paint(new THREE.SphereGeometry(0.35 * s, 28, 18), COLORS.metal));
  body.push(paint(new THREE.TorusGeometry(0.352 * s, 0.04 * s, 10, 40).rotateX(Math.PI / 2), bonus ? COLORS.gold : COLORS.band));
  body.push(paint(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.06 * s, 20).translate(0, 0.33 * s, 0), COLORS.metalLight));
  if (bonus) {
    // 2점 표적: 위쪽 금색 지느러미 두 장
    [-1, 1].forEach((side) => {
      body.push(
        paint(
          new THREE.BoxGeometry(0.025 * s, 0.17 * s, 0.24 * s).rotateZ(side * 0.28).translate(side * 0.11 * s, 0.4 * s, -0.04 * s),
          COLORS.gold
        )
      );
    });
  }

  propPositions(s).forEach((p) => {
    const dir = new THREE.Vector3(p.x, 0, p.z).normalize();
    const inner = 0.28 * s;
    const outer = Math.hypot(p.x, p.z);
    const len = outer - inner;
    const mid = dir.clone().multiplyScalar(inner + len / 2);
    body.push(
      paint(
        new THREE.BoxGeometry(0.07 * s, 0.05 * s, len)
          .rotateY(Math.atan2(dir.x, dir.z))
          .translate(mid.x, 0.12 * s, mid.z),
        COLORS.metalLight
      )
    );
    body.push(paint(new THREE.CylinderGeometry(0.075 * s, 0.085 * s, 0.09 * s, 16).translate(p.x, 0.12 * s, p.z), COLORS.metal));
    glow.push(new THREE.TorusGeometry(0.06 * s, 0.013 * s, 8, 20).rotateX(Math.PI / 2).translate(p.x, 0.068 * s, p.z));
    rotor.push(new THREE.CircleGeometry(0.21 * s, 32).rotateX(-Math.PI / 2).translate(p.x, 0.175 * s, p.z));
  });

  // 앞쪽 눈 (판정 메시의 눈과 같은 자리·크기)
  glow.push(new THREE.SphereGeometry(0.13 * s, 20, 14).translate(0, 0, 0.3 * s));

  return { body: merge(body), glow: merge(glow), rotor: merge(rotor) };
}

/** 구체: 빛나는 코어 + 금속 고리 3개(바깥 껍질 판정과 함께 회전) + 가장자리가 빛나는 에너지 막 */
function buildSphere(s: number, bonus: boolean): ShapeGeometries {
  const ringColor = bonus ? COLORS.gold : COLORS.metalLight;
  const rings = [
    new THREE.TorusGeometry(0.46 * s, 0.035 * s, 10, 48),
    new THREE.TorusGeometry(0.46 * s, 0.035 * s, 10, 48).rotateX(Math.PI / 2),
    new THREE.TorusGeometry(0.46 * s, 0.035 * s, 10, 48).rotateY(Math.PI / 2),
  ].map((g) => paint(g, ringColor));
  return {
    body: merge(rings),
    glow: new THREE.SphereGeometry(0.3 * s, 24, 16),
    shell: new THREE.SphereGeometry(0.6 * s, 32, 20),
  };
}

/** 큐브: 모서리가 둥근 금속 상자 + 면마다 빛나는 판 (판정 상자와 함께 회전) */
function buildCube(s: number, bonus: boolean): ShapeGeometries {
  const half = 0.35 * s;
  const body = paint(new RoundedBoxGeometry(0.7 * s, 0.7 * s, 0.7 * s, 2, 0.06 * s), bonus ? 0x2a2410 : COLORS.metal);
  const panel = 0.3 * s;
  const off = half + 0.002 * s;
  const panels = [
    new THREE.PlaneGeometry(panel, panel).translate(0, 0, off),
    new THREE.PlaneGeometry(panel, panel).rotateY(Math.PI).translate(0, 0, -off),
    new THREE.PlaneGeometry(panel, panel).rotateY(Math.PI / 2).translate(off, 0, 0),
    new THREE.PlaneGeometry(panel, panel).rotateY(-Math.PI / 2).translate(-off, 0, 0),
    new THREE.PlaneGeometry(panel, panel).rotateX(-Math.PI / 2).translate(0, off, 0),
    new THREE.PlaneGeometry(panel, panel).rotateX(Math.PI / 2).translate(0, -off, 0),
  ];
  body.computeBoundingSphere();
  return { body, glow: merge(panels) };
}

/** 원반: 모서리를 깎은 원판 + 빛나는 테두리와 윗면 (판정 원반과 함께 회전) */
function buildDisc(s: number, bonus: boolean): ShapeGeometries {
  const profile = [
    [0.0001, -0.075],
    [0.35, -0.072],
    [0.56, -0.06],
    [0.6, -0.03],
    [0.6, 0.03],
    [0.56, 0.06],
    [0.35, 0.072],
    [0.0001, 0.075],
  ].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  const parts = [paint(new THREE.LatheGeometry(profile, 40), COLORS.metal)];
  if (bonus) {
    parts.push(paint(new THREE.TorusGeometry(0.36 * s, 0.014 * s, 8, 48).rotateX(Math.PI / 2).translate(0, 0.073 * s, 0), COLORS.gold));
  }
  const glow = [
    new THREE.TorusGeometry(0.6 * s, 0.02 * s, 8, 64).rotateX(Math.PI / 2),
    new THREE.CircleGeometry(0.14 * s, 28).rotateX(-Math.PI / 2).translate(0, 0.0765 * s, 0),
    new THREE.CircleGeometry(0.14 * s, 28).rotateX(Math.PI / 2).translate(0, -0.0765 * s, 0),
  ];
  return { body: merge(parts), glow: merge(glow) };
}
