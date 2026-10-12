import * as THREE from 'three';
import { ArenaLook } from './themes';
import { FLOOR_Y } from './structures';

/** 동시에 퍼지는 명중 물결 수 */
const RIPPLES = 4;
/** 물결이 퍼지는 속도(m/s)와 지속 시간(초) */
const RIPPLE_SPEED = 9;
const RIPPLE_LIFE = 1.6;

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// 화면 픽셀 기준으로 굵기를 정한 선 (멀어져도 계단 현상 없이 가늘게), 촘촘해지면 사라짐
const FRAG = /* glsl */ `
uniform vec3 uGround;
uniform vec3 uMinor;
uniform vec3 uMajor;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4 uRipples[${RIPPLES}];
uniform vec3 uRippleColors[${RIPPLES}];
varying vec3 vWorld;

float gridLine(vec2 coord, float widthPx) {
  vec2 fw = fwidth(coord);
  vec2 g = abs(fract(coord - 0.5) - 0.5) / max(fw, vec2(1e-4));
  float line = 1.0 - min(min(g.x, g.y) / widthPx, 1.0);
  // 선 간격이 픽셀보다 좁아지면 흐리게 (먼 곳의 물결무늬 방지)
  return line * (1.0 - smoothstep(0.12, 0.5, max(fw.x, fw.y)));
}

void main() {
  vec2 p = vWorld.xz;
  float minor = gridLine(p / 2.0, 1.0);
  float major = gridLine(p / 10.0, 1.6);

  vec3 col = uGround;
  // 경기장 주변은 은은하게 밝고 선도 또렷, 멀어질수록 선이 옅어짐
  float arena = 1.0 - smoothstep(3.0, 28.0, length(p - vec2(0.0, -8.0)));
  float lineK = 0.35 + 0.65 * (1.0 - smoothstep(25.0, 90.0, length(p - vec2(0.0, -10.0))));
  col += uMajor * 0.035 * arena;
  col += uMinor * minor * lineK;
  col = mix(col, uMajor, major * 0.7 * lineK);

  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float d = distance(p, r.xy);
    float radius = r.z * ${RIPPLE_SPEED.toFixed(1)};
    float ring = exp(-pow((d - radius) / 0.45, 2.0));
    float fade = r.w * (1.0 - smoothstep(0.0, ${RIPPLE_LIFE.toFixed(2)}, r.z));
    col += uRippleColors[i] * ring * fade * (0.35 + 1.2 * max(minor, major));
  }

  float dist = length(vWorld - cameraPosition);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

interface Ripple {
  x: number;
  z: number;
  age: number;
  strength: number;
}

/** 빛나는 격자 바닥 (명중하면 바닥에 물결이 퍼짐) */
export class GridFloor {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private ripples: Ripple[] = [];

  constructor() {
    const geometry = new THREE.PlaneGeometry(420, 420, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uGround: { value: new THREE.Color() },
        uMinor: { value: new THREE.Color() },
        uMajor: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uFogNear: { value: 30 },
        uFogFar: { value: 170 },
        uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
        uRippleColors: { value: Array.from({ length: RIPPLES }, () => new THREE.Color()) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'grid-floor';
    this.mesh.position.y = FLOOR_Y;
    this.mesh.raycast = () => {};
    for (let i = 0; i < RIPPLES; i++) this.ripples.push({ x: 0, z: 0, age: 0, strength: 0 });
  }

  setLook(look: ArenaLook) {
    const u = this.material.uniforms;
    u.uGround.value.set(look.grid.ground);
    u.uMinor.value.set(look.grid.minor);
    u.uMajor.value.set(look.grid.major);
    u.uFog.value.set(look.fog.color);
    u.uFogNear.value = look.fog.near;
    u.uFogFar.value = look.fog.far;
  }

  /** 명중 지점 아래 바닥에 물결 (가장 오래된 물결 자리를 다시 씀) */
  ripple(x: number, z: number, color: number, strength = 1) {
    let slot = 0;
    for (let i = 1; i < RIPPLES; i++) {
      const a = this.ripples[i];
      const b = this.ripples[slot];
      if (a.strength <= 0 && b.strength > 0) slot = i;
      else if ((a.strength > 0) === (b.strength > 0) && a.age > b.age) slot = i;
    }
    const r = this.ripples[slot];
    r.x = x;
    r.z = z;
    r.age = 0;
    r.strength = strength;
    (this.material.uniforms.uRippleColors.value as THREE.Color[])[slot].set(color);
    this.syncRipple(slot);
  }

  update(dt: number) {
    for (let i = 0; i < RIPPLES; i++) {
      const r = this.ripples[i];
      if (r.strength <= 0) continue;
      r.age += dt;
      if (r.age >= RIPPLE_LIFE) r.strength = 0;
      this.syncRipple(i);
    }
  }

  clearRipples() {
    for (let i = 0; i < RIPPLES; i++) {
      this.ripples[i].strength = 0;
      this.syncRipple(i);
    }
  }

  private syncRipple(i: number) {
    const r = this.ripples[i];
    (this.material.uniforms.uRipples.value as THREE.Vector4[])[i].set(r.x, r.z, r.age, r.strength);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
