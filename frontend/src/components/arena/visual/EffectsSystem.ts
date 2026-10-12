import * as THREE from 'three';
import type { TargetKeyword } from '@/types';
import { PALETTE } from './palette';
import { TargetLabels } from './TargetLabels';
import { SHOT_BEAM_FRAG, createBeamGeometry, createBeamMaterial } from './beamShader';

/** 동시에 보일 수 있는 빛 입자(불꽃·섬광·고리) 수 */
const MAX_GLOWS = 640;
/** 동시에 보일 수 있는 파편 수 */
const MAX_DEBRIS = 160;
const BEAM_POOL = 8;
const POPUP_POOL = 8;

/** 빛 입자 모양: 부드러운 점 / 고리 / 가운데가 하얀 섬광 */
const SHAPE_DOT = 0;
const SHAPE_RING = 1;
const SHAPE_FLASH = 2;

interface Glow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size0: number;
  size1: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  shape: number;
  gravity: number;
  drag: number;
}

interface Debris {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: number;
  life: number;
  maxLife: number;
}

interface Beam {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  life: number;
  maxLife: number;
}

/** 빔 굵기(m): 총구 쪽은 가늘고 멀어질수록 조금 굵게 (먼 곳에서도 보이게) */
const BEAM_WIDTH_NEAR = 0.05;
const BEAM_WIDTH_FAR = 0.16;
const BEAM_LIFE = 0.14;

interface Popup {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  origin: THREE.Vector3;
  life: number;
  maxLife: number;
}

const GLOW_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
attribute float aShape;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vUv = uv;
  vColor = aColor;
  vAlpha = aAlpha;
  vShape = aShape;
  // 카메라(VR에서는 각 눈)를 향하는 사각형
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  mv.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float soft = 1.0 - smoothstep(0.0, 1.0, d);
  soft *= soft;
  float ring = 1.0 - smoothstep(0.0, 0.14, abs(d - 0.8));
  float core = 1.0 - smoothstep(0.0, 0.32, d);
  float a = vShape < 0.5 ? soft : (vShape < 1.5 ? ring : soft * 0.55 + core);
  a *= vAlpha;
  if (a < 0.004) discard;
  vec3 c = vShape > 1.5 ? mix(vColor, vec3(1.0), core * 0.85) : vColor;
  gl_FragColor = vec4(c * a, a);
  #include <colorspace_fragment>
}`;

const _color = new THREE.Color();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _camPos = new THREE.Vector3();

/**
 * 사격·명중 효과 묶음.
 * - 불꽃·섬광·고리: 인스턴싱으로 전부 draw call 1개
 * - 파편: InstancedMesh 1개
 * - 빔·점수 팝업: 미리 만든 묶음을 돌려 씀 (매 사격마다 새로 만들거나 해제하지 않음)
 */
export class EffectsSystem {
  readonly root = new THREE.Group();

  private glowGeo: THREE.InstancedBufferGeometry;
  private glowMat: THREE.ShaderMaterial;
  private glowMesh: THREE.Mesh;
  private aPos: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aAlpha: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;
  private aShape: THREE.InstancedBufferAttribute;
  private glows: Glow[] = [];
  private glowCount = 0;

  private debrisMesh: THREE.InstancedMesh;
  private debris: Debris[] = [];
  private debrisCount = 0;

  private beamGeo: THREE.BufferGeometry;
  private beams: Beam[] = [];
  private popups: Popup[] = [];

  constructor(private labels: TargetLabels) {
    this.root.name = 'effects';

    // 빛 입자
    const quad = new THREE.PlaneGeometry(1, 1);
    this.glowGeo = new THREE.InstancedBufferGeometry();
    this.glowGeo.index = quad.index;
    this.glowGeo.setAttribute('position', quad.getAttribute('position'));
    this.glowGeo.setAttribute('uv', quad.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLOWS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLOWS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLOWS), 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLOWS), 1).setUsage(THREE.DynamicDrawUsage);
    this.aShape = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLOWS), 1).setUsage(THREE.DynamicDrawUsage);
    this.glowGeo.setAttribute('aPos', this.aPos);
    this.glowGeo.setAttribute('aColor', this.aColor);
    this.glowGeo.setAttribute('aAlpha', this.aAlpha);
    this.glowGeo.setAttribute('aSize', this.aSize);
    this.glowGeo.setAttribute('aShape', this.aShape);
    this.glowGeo.instanceCount = 0;
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.glowMesh = new THREE.Mesh(this.glowGeo, this.glowMat);
    // 입자가 있을 때만 보이게 함: 첫 화면을 그릴 때 셰이더 컴파일로 멈추지 않게 (컴파일은 엔진 예열에서)
    this.glowMesh.visible = false;
    this.glowMesh.frustumCulled = false;
    this.glowMesh.renderOrder = 10;
    this.glowMesh.raycast = () => {};
    this.root.add(this.glowMesh);
    for (let i = 0; i < MAX_GLOWS; i++) {
      this.glows.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size0: 0, size1: 0, r: 1, g: 1, b: 1, alpha: 1, shape: 0, gravity: 0, drag: 0 });
    }

    // 파편
    this.debrisMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ flatShading: true, metalness: 0.65, roughness: 0.4 }),
      MAX_DEBRIS
    );
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.setColorAt(0, _color.set(0xffffff));
    this.debrisMesh.count = 0;
    this.debrisMesh.visible = false;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.raycast = () => {};
    this.root.add(this.debrisMesh);
    for (let i = 0; i < MAX_DEBRIS; i++) {
      this.debris.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), size: 0, life: 0, maxLife: 1 });
    }

    // 빔
    this.beamGeo = createBeamGeometry();
    for (let i = 0; i < BEAM_POOL; i++) {
      const material = createBeamMaterial(SHOT_BEAM_FRAG, BEAM_WIDTH_NEAR, BEAM_WIDTH_FAR, 0xffffff, 0);
      const mesh = new THREE.Mesh(this.beamGeo, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 11;
      mesh.raycast = () => {};
      this.root.add(mesh);
      this.beams.push({ mesh, material, life: 0, maxLife: 1 });
    }

    // 점수 팝업 (텍스처를 미리 넣어 두어 첫 명중 때 셰이더를 새로 만들지 않게)
    const placeholder = this.labels.popupTexture('제어', 1);
    for (let i = 0; i < POPUP_POOL; i++) {
      const material = new THREE.SpriteMaterial({ map: placeholder, transparent: true, depthWrite: false, toneMapped: false, fog: false });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 12;
      sprite.raycast = () => {};
      this.root.add(sprite);
      this.popups.push({ sprite, material, origin: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
  }

  // ───────────────────────── 공개 효과 ─────────────────────────

  /** 표적 명중 폭발 (섬광 + 충격파 고리 + 불꽃 + 파편) */
  burst(point: THREE.Vector3, color: number, points: number, scale = 1) {
    const bonus = points === 2;
    const accent = bonus ? PALETTE.gold : color;
    this.spawnGlow(point, 0, 0, 0, 0.14, 1.5 * scale * (bonus ? 1.3 : 1), 0.6 * scale, accent, 1, SHAPE_FLASH, 0, 0);
    this.spawnGlow(point, 0, 0, 0, 0.38, 0.4 * scale, (bonus ? 3.6 : 2.8) * scale, accent, 0.95, SHAPE_RING, 0, 0);
    const sparks = bonus ? 30 : 18;
    for (let i = 0; i < sparks; i++) {
      const dir = randomDir();
      const speed = 4 + Math.random() * 6;
      const pick = Math.random();
      const c = pick < 0.5 ? color : pick < 0.8 ? 0xffffff : bonus ? PALETTE.gold : color;
      const size = 0.07 + Math.random() * 0.1;
      this.spawnGlow(point, dir.x * speed, dir.y * speed + 1.2, dir.z * speed, 0.35 + Math.random() * 0.4, size, size * 0.3, c, 1, SHAPE_DOT, 6, 1.6);
    }
    const chunks = bonus ? 14 : 10;
    for (let i = 0; i < chunks; i++) this.spawnDebris(point, scale);
  }

  /** 표적 등장 (고리 + 은은한 빛) */
  spawnRing(point: THREE.Vector3, color: number, scale = 1) {
    this.spawnGlow(point, 0, 0, 0, 0.42, 0.25 * scale, 1.8 * scale, color, 0.9, SHAPE_RING, 0, 0);
    this.spawnGlow(point, 0, 0, 0, 0.28, 1.4 * scale, 0.4 * scale, color, 0.7, SHAPE_DOT, 0, 0);
  }

  /** 경기가 끝나 남은 표적이 사라질 때 */
  poof(point: THREE.Vector3, color: number, scale = 1) {
    this.spawnGlow(point, 0, 0, 0, 0.3, 0.3 * scale, 1.4 * scale, color, 0.7, SHAPE_RING, 0, 0);
    for (let i = 0; i < 8; i++) {
      const dir = randomDir();
      this.spawnGlow(point, dir.x * 2.5, dir.y * 2.5, dir.z * 2.5, 0.4, 0.09, 0.02, color, 0.9, SHAPE_DOT, 0, 2);
    }
  }

  /** 총구 섬광 */
  muzzle(point: THREE.Vector3, color: number) {
    this.spawnGlow(point, 0, 0, 0, 0.07, 0.2, 0.12, color, 1, SHAPE_FLASH, 0, 0);
  }

  /** 히트스캔 빔: 총구에서 맞은 곳(또는 먼 곳)까지 바로 이어지고 0.12초 동안 사라짐 */
  beam(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    // 빈 빔을 쓰고, 모두 쓰는 중이면 가장 먼저 사라질 빔을 다시 씀
    const b = this.beams.find((x) => x.life <= 0) ?? this.beams.reduce((a, c) => (c.life < a.life ? c : a));
    if (from.distanceToSquared(to) < 1e-4) return;
    b.life = BEAM_LIFE;
    b.maxLife = BEAM_LIFE;
    const u = b.material.uniforms;
    u.uColor.value.set(color);
    u.uOpacity.value = 1;
    u.uStart.value.copy(from);
    u.uEnd.value.copy(to);
    u.uWidth0.value = BEAM_WIDTH_NEAR;
    u.uWidth1.value = BEAM_WIDTH_FAR;
    b.mesh.visible = true;
  }

  /** 점수 팝업 "+2 정보" (보는 사람 쪽으로 조금 당겨 표적에 가려지지 않게) */
  popup(point: THREE.Vector3, keyword: TargetKeyword, points: number, camera: THREE.Camera) {
    const p = this.popups.find((x) => x.life <= 0) ?? this.popups.reduce((a, b) => (a.life < b.life ? a : b));
    camera.getWorldPosition(_camPos);
    p.origin.copy(point).addScaledVector(_camPos.sub(point).normalize(), 0.6);
    // 처음부터 텍스처가 있는 재질이라 바꿔 끼워도 셰이더를 다시 만들지 않음
    p.material.map = this.labels.popupTexture(keyword, points);
    p.life = 1.0;
    p.maxLife = 1.0;
    p.sprite.visible = true;
  }

  /** 진행 중인 효과를 모두 지움 (경기 재시작 등) */
  clear() {
    this.glowCount = 0;
    this.glowGeo.instanceCount = 0;
    this.glowMesh.visible = false;
    this.debrisCount = 0;
    this.debrisMesh.count = 0;
    this.debrisMesh.visible = false;
    this.beams.forEach((b) => {
      b.life = 0;
      b.mesh.visible = false;
    });
    this.popups.forEach((p) => {
      p.life = 0;
      p.sprite.visible = false;
    });
  }

  // ───────────────────────── 매 프레임 ─────────────────────────

  update(dt: number, camera: THREE.Camera) {
    this.updateGlows(dt);
    this.updateDebris(dt);

    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      const k = b.life / b.maxLife;
      const u = b.material.uniforms;
      u.uOpacity.value = k * k;
      u.uWidth0.value = BEAM_WIDTH_NEAR * (0.4 + 0.6 * k);
      u.uWidth1.value = BEAM_WIDTH_FAR * (0.4 + 0.6 * k);
    }

    camera.getWorldPosition(_camPos);
    for (const p of this.popups) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const t = 1 - p.life / p.maxLife; // 0 → 1
      p.sprite.position.copy(p.origin);
      p.sprite.position.y += 0.75 * easeOut(t);
      // 거리와 상관없이 비슷한 크기로 보이게 (시야각 약 4도)
      const dist = p.sprite.position.distanceTo(_camPos);
      const pop = t < 0.15 ? 1.25 - (t / 0.15) * 0.25 : 1;
      const w = Math.max(0.6, dist * 0.072) * pop;
      p.sprite.scale.set(w, w * 0.5, 1);
      p.material.opacity = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
    }
  }

  private spawnGlow(
    p: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size0: number,
    size1: number,
    color: number,
    alpha: number,
    shape: number,
    gravity: number,
    drag: number
  ) {
    if (this.glowCount >= MAX_GLOWS) return;
    const g = this.glows[this.glowCount++];
    _color.set(color);
    g.x = p.x;
    g.y = p.y;
    g.z = p.z;
    g.vx = vx;
    g.vy = vy;
    g.vz = vz;
    g.life = life;
    g.maxLife = life;
    g.size0 = size0;
    g.size1 = size1;
    g.r = _color.r;
    g.g = _color.g;
    g.b = _color.b;
    g.alpha = alpha;
    g.shape = shape;
    g.gravity = gravity;
    g.drag = drag;
  }

  private updateGlows(dt: number) {
    const pos = this.aPos.array as Float32Array;
    const col = this.aColor.array as Float32Array;
    const alp = this.aAlpha.array as Float32Array;
    const siz = this.aSize.array as Float32Array;
    const shp = this.aShape.array as Float32Array;
    let i = 0;
    while (i < this.glowCount) {
      const g = this.glows[i];
      g.life -= dt;
      if (g.life <= 0) {
        // 마지막 입자와 자리를 바꿔 배열을 빈틈없이 유지
        this.glowCount--;
        this.glows[i] = this.glows[this.glowCount];
        this.glows[this.glowCount] = g;
        continue;
      }
      const damp = Math.max(0, 1 - g.drag * dt);
      g.vx *= damp;
      g.vy = g.vy * damp - g.gravity * dt;
      g.vz *= damp;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      const t = 1 - g.life / g.maxLife;
      pos[i * 3] = g.x;
      pos[i * 3 + 1] = g.y;
      pos[i * 3 + 2] = g.z;
      col[i * 3] = g.r;
      col[i * 3 + 1] = g.g;
      col[i * 3 + 2] = g.b;
      alp[i] = g.alpha * (1 - t * t);
      siz[i] = g.size0 + (g.size1 - g.size0) * easeOut(t);
      shp[i] = g.shape;
      i++;
    }
    this.glowGeo.instanceCount = this.glowCount;
    this.glowMesh.visible = this.glowCount > 0;
    if (this.glowCount > 0) {
      this.aPos.clearUpdateRanges();
      this.aPos.addUpdateRange(0, this.glowCount * 3);
      this.aColor.clearUpdateRanges();
      this.aColor.addUpdateRange(0, this.glowCount * 3);
      this.aAlpha.clearUpdateRanges();
      this.aAlpha.addUpdateRange(0, this.glowCount);
      this.aSize.clearUpdateRanges();
      this.aSize.addUpdateRange(0, this.glowCount);
      this.aShape.clearUpdateRanges();
      this.aShape.addUpdateRange(0, this.glowCount);
      this.aPos.needsUpdate = true;
      this.aColor.needsUpdate = true;
      this.aAlpha.needsUpdate = true;
      this.aSize.needsUpdate = true;
      this.aShape.needsUpdate = true;
    }
  }

  private spawnDebris(point: THREE.Vector3, scale: number) {
    if (this.debrisCount >= MAX_DEBRIS) return;
    const index = this.debrisCount++;
    const d = this.debris[index];
    const dir = randomDir();
    const speed = 2 + Math.random() * 3.5;
    d.pos.copy(point);
    d.vel.set(dir.x * speed, dir.y * speed + 2, dir.z * speed);
    d.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    d.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
    d.size = (0.035 + Math.random() * 0.06) * scale;
    d.life = 0.8 + Math.random() * 0.5;
    d.maxLife = d.life;
    // 금속 조각 (어둡게, 가끔 밝은 조각)
    this.debrisMesh.setColorAt(index, _color.set(Math.random() < 0.25 ? 0x8a97ab : 0x3a4556));
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  private updateDebris(dt: number) {
    let i = 0;
    while (i < this.debrisCount) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.debrisCount--;
        if (i !== this.debrisCount) {
          // 마지막 조각을 이 자리로 옮김 (색도 함께)
          const last = this.debris[this.debrisCount];
          this.debris[i] = last;
          this.debris[this.debrisCount] = d;
          this.debrisMesh.getColorAt(this.debrisCount, _color);
          this.debrisMesh.setColorAt(i, _color);
        }
        continue;
      }
      d.vel.y -= 9.8 * dt;
      d.pos.addScaledVector(d.vel, dt);
      d.rot.x += d.spin.x * dt;
      d.rot.y += d.spin.y * dt;
      d.rot.z += d.spin.z * dt;
      const t = 1 - d.life / d.maxLife;
      const s = d.size * (t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
      _quat.setFromEuler(d.rot);
      _scale.setScalar(Math.max(0.0001, s));
      _matrix.compose(d.pos, _quat, _scale);
      this.debrisMesh.setMatrixAt(i, _matrix);
      i++;
    }
    this.debrisMesh.count = this.debrisCount;
    this.debrisMesh.visible = this.debrisCount > 0;
    if (this.debrisCount > 0) {
      this.debrisMesh.instanceMatrix.needsUpdate = true;
      if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.glowGeo.dispose();
    this.glowMat.dispose();
    this.debrisMesh.geometry.dispose();
    (this.debrisMesh.material as THREE.Material).dispose();
    this.debrisMesh.dispose();
    this.beamGeo.dispose();
    this.beams.forEach((b) => b.material.dispose());
    this.popups.forEach((p) => p.material.dispose());
  }
}

const _dir = new THREE.Vector3();
function randomDir(): THREE.Vector3 {
  // 구면 위 고른 방향
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return _dir.set(r * Math.cos(a), u, r * Math.sin(a));
}

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t);
}
