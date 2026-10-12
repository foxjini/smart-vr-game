import * as THREE from 'three';
import { FLOOR_Y } from './structures';

/** 떠다니는 빛 알갱이 높이 범위(m) */
const HEIGHT = 13;

const VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uScale;
varying float vAlpha;
void main() {
  vec3 p = position;
  // 천천히 위로 떠오르다 꼭대기에서 바닥으로 돌아옴, 옆으로 살짝 흔들림
  float y = mod(p.y + uTime * (0.18 + aSeed * 0.3), ${HEIGHT.toFixed(1)});
  p.y = y + ${FLOOR_Y.toFixed(2)};
  p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.6;
  p.z += cos(uTime * 0.25 + aSeed * 30.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // 실제 크기 4~9cm (멀수록 작게)
  gl_PointSize = uScale * (0.04 + aSeed * 0.05) / max(-mv.z, 0.5);
  float edge = smoothstep(0.0, 1.5, y) * (1.0 - smoothstep(${(HEIGHT - 3).toFixed(1)}, ${HEIGHT.toFixed(1)}, y));
  vAlpha = edge * (0.25 + 0.35 * aSeed);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vAlpha;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}
`;

const _size = new THREE.Vector2();

/** 경기장 공기 중에 떠다니는 빛 알갱이 (VR에서 공간감, draw call 1개) */
export class Motes {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;

  constructor(count: number) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      // 선수 바로 주변(눈앞)에는 두지 않음
      do {
        x = (Math.random() - 0.5) * 56;
        z = -44 + Math.random() * 60;
      } while (Math.abs(x) < 3 && Math.abs(z) < 3);
      pos[i * 3] = x;
      pos[i * 3 + 1] = Math.random() * HEIGHT;
      pos[i * 3 + 2] = z;
      seed[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uColor: { value: new THREE.Color() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.name = 'motes';
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
  }

  setColor(color: number) {
    this.material.uniforms.uColor.value.set(color);
  }

  update(time: number, renderer: THREE.WebGLRenderer) {
    this.material.uniforms.uTime.value = time;
    // three.js PointsMaterial과 같은 기준 (그리는 화면 높이의 절반)
    this.material.uniforms.uScale.value = renderer.getDrawingBufferSize(_size).y * 0.5;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
