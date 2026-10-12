import * as THREE from 'three';
import { ArenaLook } from './themes';

const DOME_RADIUS = 480;
const STAR_RADIUS = 450;
const DEG = Math.PI / 180;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vTwinkle;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio;
  vTwinkle = 0.72 + 0.28 * sin(uTime * (0.5 + aPhase) + aPhase * 6.2831);
  vColor = color;
}
`;

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vTwinkle;
void main() {
  float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vColor * vTwinkle * a, a);
  #include <colorspace_fragment>
}
`;

/**
 * 하늘: 정점 색 그라데이션 돔(셰이더 계산 없음) + 반짝이는 별 (각각 draw call 1개).
 * 지평선 근처에 정점을 촘촘히 두어 빛 띠가 부드럽게 보이게 함.
 */
export class SkyDome {
  readonly root = new THREE.Group();
  private dome?: THREE.Mesh;
  private stars?: THREE.Points;
  private domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  private starMat: THREE.ShaderMaterial;

  constructor() {
    this.root.name = 'sky';
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  build(look: ArenaLook, starCount: number, pixelRatio: number) {
    this.clear();

    // 높이각(도)과 색: 지평선 = 안개색, 바로 위에 빛 띠, 위로 갈수록 어두워짐
    const c = (hex: number) => new THREE.Color(hex);
    const mix = (a: number, b: number, t: number) => c(a).lerp(c(b), t);
    const { zenith, mid, horizon, glow } = look.sky;
    const stops: Array<[number, THREE.Color]> = [
      [-90, c(horizon)],
      [-4, c(horizon)],
      [0, c(horizon)],
      [1.5, mix(horizon, glow, 0.7)],
      [3.5, c(glow)],
      [6.5, mix(glow, mid, 0.45)],
      [11, mix(glow, mid, 0.8)],
      [18, c(mid)],
      [32, mix(mid, zenith, 0.35)],
      [52, mix(mid, zenith, 0.7)],
      [72, mix(mid, zenith, 0.9)],
      [90, c(zenith)],
    ];
    const profile = stops.map(([deg]) => new THREE.Vector2(Math.max(0.01, Math.cos(deg * DEG) * DOME_RADIUS), Math.sin(deg * DEG) * DOME_RADIUS));
    const segments = 48;
    const geometry = new THREE.LatheGeometry(profile, segments);
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    // LatheGeometry 정점 순서: 둘레 방향 i마다 단면 점 j
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j < stops.length; j++) {
        const k = (i * stops.length + j) * 3;
        const col = stops[j][1];
        colors[k] = col.r;
        colors[k + 1] = col.g;
        colors[k + 2] = col.b;
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.dome = new THREE.Mesh(geometry, this.domeMat);
    this.dome.name = 'sky-dome';
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.dome.raycast = () => {};
    this.root.add(this.dome);

    // 별
    const count = Math.round(starCount * look.starDensity);
    if (count > 0) {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const size = new Float32Array(count);
      const phase = new Float32Array(count);
      const tints = [c(0xffffff), c(0xcfe0ff), c(0xdbe4ff), c(0xffe6c7)];
      const minSin = Math.sin(4 * DEG);
      for (let i = 0; i < count; i++) {
        // 지평선 4도 위부터 고르게
        const y = minSin + Math.random() * (1 - minSin);
        const r = Math.sqrt(1 - y * y);
        const a = Math.random() * Math.PI * 2;
        pos[i * 3] = Math.cos(a) * r * STAR_RADIUS;
        pos[i * 3 + 1] = y * STAR_RADIUS;
        pos[i * 3 + 2] = Math.sin(a) * r * STAR_RADIUS;
        const elev = Math.asin(y) / DEG;
        const big = Math.random() < 0.035;
        const bright = (big ? 0.9 : 0.3 + Math.random() * 0.6) * THREE.MathUtils.smoothstep(elev, 4, 16);
        const tint = tints[Math.floor(Math.random() * tints.length)];
        col[i * 3] = tint.r * bright;
        col[i * 3 + 1] = tint.g * bright;
        col[i * 3 + 2] = tint.b * bright;
        size[i] = big ? 3.4 + Math.random() * 1.2 : 1.3 + Math.random() * 1.5;
        phase[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      this.starMat.uniforms.uPixelRatio.value = pixelRatio;
      this.stars = new THREE.Points(g, this.starMat);
      this.stars.name = 'stars';
      this.stars.renderOrder = -9;
      this.stars.frustumCulled = false;
      this.stars.raycast = () => {};
      this.root.add(this.stars);
    }
  }

  update(time: number) {
    this.starMat.uniforms.uTime.value = time;
  }

  private clear() {
    if (this.dome) {
      this.root.remove(this.dome);
      this.dome.geometry.dispose();
      this.dome = undefined;
    }
    if (this.stars) {
      this.root.remove(this.stars);
      this.stars.geometry.dispose();
      this.stars = undefined;
    }
  }

  dispose() {
    this.clear();
    this.domeMat.dispose();
    this.starMat.dispose();
  }
}
