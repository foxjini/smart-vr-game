import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ArenaLook } from './themes';
import { FLOOR_Y } from './structures';

/** 테마 고유 장식 (우주: 성운·행성, 도시: 빌딩 숲) */
export interface ThemeExtras {
  root: THREE.Object3D;
  update(time: number): void;
  dispose(): void;
}

/** 가운데가 밝고 가장자리로 갈수록 사라지는 둥근 빛 텍스처 */
function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 원점을 바라보는 사각형 (먼 하늘에 붙이는 빛 덩어리) */
function facingQuad(position: THREE.Vector3, width: number, height: number, roll: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height);
  const obj = new THREE.Object3D();
  obj.position.copy(position);
  obj.lookAt(0, position.y * 0.3, 0);
  obj.rotateZ(roll);
  obj.updateMatrix();
  g.applyMatrix4(obj.matrix);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** 우주 테마: 보라·청록 성운과 행성 */
export function createSpaceExtras(): ThemeExtras {
  const root = new THREE.Group();
  root.name = 'space-extras';
  const texture = createGlowTexture();

  const planetPos = new THREE.Vector3(-150, 85, -300);
  const quads = [
    facingQuad(new THREE.Vector3(120, 110, -330), 420, 220, 0.35, new THREE.Color(0x5b2a86).multiplyScalar(0.55)),
    facingQuad(new THREE.Vector3(60, 160, -360), 260, 160, -0.5, new THREE.Color(0x1f6f8b).multiplyScalar(0.45)),
    facingQuad(new THREE.Vector3(-260, 60, -120), 300, 180, 0.2, new THREE.Color(0x3b2a7a).multiplyScalar(0.4)),
    // 행성 뒤의 대기 빛
    facingQuad(planetPos.clone().multiplyScalar(1.02), 130, 130, 0, new THREE.Color(0x7c8cff).multiplyScalar(0.55)),
  ];
  const nebulaGeo = mergeGeometries(quads, false)!;
  quads.forEach((q) => q.dispose());
  const nebulaMat = new THREE.MeshBasicMaterial({
    map: texture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);
  nebula.renderOrder = -8;
  nebula.frustumCulled = false;
  nebula.raycast = () => {};
  root.add(nebula);

  // 행성: 경기장 조명을 받아 낮·밤 경계가 보임
  const planetGeo = new THREE.SphereGeometry(38, 48, 32);
  const planetMat = new THREE.MeshStandardMaterial({ color: 0x6b5ca5, roughness: 0.95, metalness: 0, fog: false });
  const planet = new THREE.Mesh(planetGeo, planetMat);
  planet.position.copy(planetPos);
  planet.rotation.z = 0.4;
  planet.raycast = () => {};
  root.add(planet);

  return {
    root,
    update(time: number) {
      planet.rotation.y = time * 0.01;
    },
    dispose() {
      nebulaGeo.dispose();
      nebulaMat.dispose();
      texture.dispose();
      planetGeo.dispose();
      planetMat.dispose();
    },
  };
}

const SKYLINE_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalLocal;
varying vec3 vWorld;
varying float vSeed;
void main() {
  mat4 m = instanceMatrix;
  vec3 scale = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
  vLocal = position * scale;
  vNormalLocal = normal;
  vSeed = fract(sin(dot(m[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec4 w = modelMatrix * m * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SKYLINE_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uRoof;
uniform vec3 uWindowA;
uniform vec3 uWindowB;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vLocal;
varying vec3 vNormalLocal;
varying vec3 vWorld;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 col = uBase;
  if (abs(vNormalLocal.y) < 0.5) {
    // 옆면: 1.6m x 2.4m 창문 칸, 일부만 불이 켜짐
    float u = abs(vNormalLocal.x) > 0.5 ? vLocal.z : vLocal.x;
    vec2 cell = vec2(floor(u / 1.6), floor(vLocal.y / 2.4));
    vec2 f = vec2(fract(u / 1.6), fract(vLocal.y / 2.4));
    float inside = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.72);
    float lit = step(0.76, hash(cell + vSeed * 31.0));
    vec3 wc = mix(uWindowA, uWindowB, hash(cell.yx + vSeed * 7.0));
    col += wc * inside * lit * 0.8;
    col *= 0.55 + 0.45 * smoothstep(0.0, 30.0, vLocal.y);
  } else if (vNormalLocal.y > 0.5) {
    col = uRoof;
  }
  float dist = length(vWorld - cameraPosition);
  col = mix(col, uFog, min(0.86, smoothstep(uFogNear, uFogFar, dist)));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** 도시 테마: 지평선을 두른 빌딩 숲 (InstancedMesh 1개) + 꼭대기 경고등 */
export function createCityExtras(look: ArenaLook, buildings: number): ThemeExtras {
  const root = new THREE.Group();
  root.name = 'city-extras';

  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  box.deleteAttribute('uv');
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(0x0c0812) },
      uRoof: { value: new THREE.Color(0x150d1c) },
      uWindowA: { value: new THREE.Color(0xffc38a) },
      uWindowB: { value: new THREE.Color(0x9ad8ff) },
      uFog: { value: new THREE.Color(look.fog.color) },
      uFogNear: { value: 70 },
      uFogFar: { value: 360 },
    },
    vertexShader: SKYLINE_VERT,
    fragmentShader: SKYLINE_FRAG,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(box, material, buildings);
  mesh.raycast = () => {};
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const beacons: number[] = [];
  for (let i = 0; i < buildings; i++) {
    const a = (i / buildings) * Math.PI * 2 + Math.random() * 0.03;
    // 지평선의 스카이라인으로 보이게 멀리, 표적 구역 뒤(정면)는 더 낮게 해서 표적이 잘 보이게
    const dist = 130 + Math.random() * 130;
    const w = 9 + Math.random() * 13;
    const d = 9 + Math.random() * 13;
    const front = Math.max(0, Math.cos(a - Math.PI));
    const h = (10 + Math.random() * 28 + (dist - 130) * 0.18) * (1 - front * 0.45);
    p.set(Math.sin(a) * dist, FLOOR_Y, Math.cos(a) * dist);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + (Math.random() - 0.5) * 0.3);
    s.set(w, h, d);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (h > 34) beacons.push(p.x, FLOOR_Y + h + 0.6, p.z);
  }
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);

  // 높은 빌딩 꼭대기의 붉은 경고등 (깜빡임)
  const beaconGeo = new THREE.BufferGeometry();
  beaconGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(beacons), 3));
  const beaconMat = new THREE.PointsMaterial({ color: 0xff4a5a, size: 5, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const beaconPoints = new THREE.Points(beaconGeo, beaconMat);
  beaconPoints.raycast = () => {};
  root.add(beaconPoints);

  return {
    root,
    update(time: number) {
      beaconMat.opacity = 0.35 + 0.65 * (Math.sin(time * 2.2) > 0.2 ? 1 : 0.2);
    },
    dispose() {
      box.dispose();
      material.dispose();
      mesh.dispose();
      beaconGeo.dispose();
      beaconMat.dispose();
    },
  };
}
