import * as THREE from 'three';

/**
 * 시작점·끝점을 잇는 빛 띠 (사격 빔·조준선이 함께 씀).
 * 띠를 보는 사람(VR에서는 각 눈) 쪽으로 돌려 그려서, 자기 총에서 나가는 빔을 뒤에서 봐도 납작한 선이 되지 않음
 */
export const BEAM_VERT = /* glsl */ `
uniform vec3 uStart;
uniform vec3 uEnd;
uniform float uWidth0;
uniform float uWidth1;
varying vec2 vUv;
void main() {
  vec3 viewStart = (viewMatrix * vec4(uStart, 1.0)).xyz;
  vec3 viewEnd = (viewMatrix * vec4(uEnd, 1.0)).xyz;
  vec3 p = mix(viewStart, viewEnd, position.z);
  vec3 axis = normalize(viewEnd - viewStart);
  vec3 c = cross(axis, normalize(-p));
  float l = length(c);
  vec3 side = l > 1e-5 ? c / l : vec3(1.0, 0.0, 0.0);
  p += side * position.x * mix(uWidth0, uWidth1, position.z);
  vUv = vec2(position.x + 0.5, position.z);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;

/** 사격 빔: 가운데는 하얀 심, 바깥은 팀 색 빛, 총구 쪽에서 살짝 페이드 인 */
export const SHOT_BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = abs(vUv.x - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.2, d);
  float glow = pow(1.0 - d, 1.6);
  float along = smoothstep(0.0, 0.03, vUv.y) * (1.0 - 0.3 * vUv.y);
  float a = (glow * 0.75 + core) * along * uOpacity;
  vec3 c = mix(uColor, vec3(1.0), core * 0.85);
  gl_FragColor = vec4(c * a, a);
  #include <colorspace_fragment>
}`;

/** 조준선: 가늘고 은은하게, 멀어질수록 옅어짐 (표적을 가리지 않게) */
export const AIM_BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = abs(vUv.x - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.35, d);
  float glow = pow(1.0 - d, 2.0);
  float along = smoothstep(0.0, 0.02, vUv.y) * (1.0 - 0.75 * vUv.y);
  float a = (glow * 0.45 + core * 0.8) * along * uOpacity;
  vec3 c = mix(uColor, vec3(1.0), core * 0.5);
  gl_FragColor = vec4(c * a, a);
  #include <colorspace_fragment>
}`;

/** 빔 띠: x = 폭 방향(-0.5~0.5), z = 길이 방향(0 = 시작, 1 = 끝). 실제 위치는 셰이더가 계산 */
export function createBeamGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1]), 3));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  return geo;
}

/** 빔 재질 (가산 혼합, 깊이 기록 없음, 색은 그대로) */
export function createBeamMaterial(fragmentShader: string, width0: number, width1: number, color = 0xffffff, opacity = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uStart: { value: new THREE.Vector3() },
      uEnd: { value: new THREE.Vector3(0, 0, -1) },
      uWidth0: { value: width0 },
      uWidth1: { value: width1 },
    },
    vertexShader: BEAM_VERT,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}
