import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 정점 색: 고정 색 또는 정점 위치(합친 뒤 좌표)에 따라 정하는 함수 */
export type VertexColor = number | THREE.Color | ((p: THREE.Vector3, out: THREE.Color) => void);

const _p = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * 움직이지 않는 구조물 조각을 모았다가 하나로 합침.
 * 색은 정점 색으로 넣으므로 재질 하나(= draw call 하나)로 여러 색 조각을 그림.
 */
export class GeometryBatch {
  private parts: THREE.BufferGeometry[] = [];

  /** 조각 추가. geometry는 이 묶음이 가져가서 합친 뒤 해제함 */
  add(geometry: THREE.BufferGeometry, color: VertexColor, matrix?: THREE.Matrix4, brightness = 1) {
    const g = geometry;
    // 합칠 때 속성 구성이 같아야 함: position, normal, color (uv는 쓰지 않음)
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (g.index === null) {
      const count = g.getAttribute('position').count;
      const index = new Array<number>(count);
      for (let i = 0; i < count; i++) index[i] = i;
      g.setIndex(index);
    }
    if (matrix) g.applyMatrix4(matrix);

    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    if (typeof color === 'function') {
      for (let i = 0; i < pos.count; i++) {
        _p.fromBufferAttribute(pos, i);
        color(_p, _c);
        colors[i * 3] = _c.r * brightness;
        colors[i * 3 + 1] = _c.g * brightness;
        colors[i * 3 + 2] = _c.b * brightness;
      }
    } else {
      _c.set(color);
      for (let i = 0; i < pos.count; i++) {
        colors[i * 3] = _c.r * brightness;
        colors[i * 3 + 1] = _c.g * brightness;
        colors[i * 3 + 2] = _c.b * brightness;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
  }

  /** 모은 조각을 하나의 지오메트리로 합침 (조각이 없으면 null) */
  build(): THREE.BufferGeometry | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    if (merged) merged.computeBoundingSphere();
    return merged;
  }
}

/** 위치·Y축 회전·크기로 변환 행렬 만들기 */
export function placeMatrix(x: number, y: number, z: number, rotY = 0, scale = 1, out = new THREE.Matrix4()): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  return out.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
}
