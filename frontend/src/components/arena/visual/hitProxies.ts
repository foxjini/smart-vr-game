import * as THREE from 'three';
import type { TargetShape } from '@/types';

/**
 * 표적 사격 판정용 메시 (화면에는 보이지 않음).
 *
 * 예전 표적 모양(크기·위치·회전하는 부품)을 그대로 옮겨서, 겉모습을 바꿔도 맞는 범위가 전혀 달라지지 않게 함.
 * - 숫자를 바꾸면 명중 판정이 달라지므로 바꾸지 말 것 (hitbox_parity 점검이 예전 값과 비교함)
 * - spinners: 예전에 회전하던 부품 (매 프레임 rotation.y += 15·dt, rotation.z += 8·dt)
 * - 보이는 장식은 DroneFactory가 따로 만들고 판정에는 쓰지 않음
 *
 * 이 파일은 three만 사용 (Node에서 판정 비교 점검을 돌릴 수 있게)
 */

export interface HitProxyParts {
  /** 판정에 쓰는 메시 전부 (예전 표적의 Mesh와 같은 순서) */
  meshes: THREE.Mesh[];
  /** 회전하는 판정 메시 (예전 subMeshesToRotate와 같은 순서) */
  spinners: THREE.Mesh[];
}

type ProxyGeometries = {
  shape: TargetShape;
  geos: THREE.BufferGeometry[];
};

/** 판정 메시는 그리지 않음 (레이캐스트는 visible과 상관없이 동작) */
function proxyMesh(geo: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material);
  mesh.visible = false;
  mesh.name = 'hitProxy';
  return mesh;
}

/**
 * 모양·크기별 판정 지오메트리를 한 번만 만들어 공유.
 * 표적마다 새로 만들던 예전 방식과 모양은 같고, 메모리 할당만 줄어듦
 */
export class HitProxyFactory {
  /** 판정 전용 재질 (그리지 않음, 앞면만 판정하는 예전 재질과 같은 FrontSide) */
  readonly material = new THREE.MeshBasicMaterial({ visible: false });
  private cache = new Map<string, ProxyGeometries>();

  private geometries(shape: TargetShape, s: number): ProxyGeometries {
    const key = `${shape}:${s}`;
    let entry = this.cache.get(key);
    if (entry) return entry;

    const geos: THREE.BufferGeometry[] = [];
    if (shape === 'drone') {
      geos.push(new THREE.SphereGeometry(0.35 * s, 16, 16)); // 0 몸체
      geos.push(new THREE.SphereGeometry(0.13 * s, 16, 16)); // 1 눈
      const arm = new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.5 * s);
      arm.rotateZ(Math.PI / 4);
      geos.push(arm); // 2 팔 (네 개가 같은 모양)
      geos.push(new THREE.BoxGeometry(0.4 * s, 0.02 * s, 0.06 * s)); // 3 프로펠러
    } else if (shape === 'sphere') {
      geos.push(new THREE.SphereGeometry(0.45 * s, 24, 24)); // 0 코어
      geos.push(new THREE.IcosahedronGeometry(0.6 * s, 1)); // 1 바깥 껍질 (회전)
    } else if (shape === 'cube') {
      geos.push(new THREE.BoxGeometry(0.7 * s, 0.7 * s, 0.7 * s)); // 0 (회전)
    } else {
      geos.push(new THREE.CylinderGeometry(0.6 * s, 0.6 * s, 0.15 * s, 24)); // 0 원반 (회전)
    }
    entry = { shape, geos };
    this.cache.set(key, entry);
    return entry;
  }

  /** 표적 하나의 판정 메시를 만들어 parent에 붙임 (예전 createTargetMesh의 Mesh 배치와 같음) */
  build(parent: THREE.Object3D, shape: TargetShape, s: number): HitProxyParts {
    const { geos } = this.geometries(shape, s);
    const mat = this.material;
    const meshes: THREE.Mesh[] = [];
    const spinners: THREE.Mesh[] = [];

    if (shape === 'drone') {
      meshes.push(proxyMesh(geos[0], mat));
      const eye = proxyMesh(geos[1], mat);
      eye.position.set(0, 0, 0.3 * s);
      meshes.push(eye);
      const propPositions = [
        [0.45 * s, 0.15 * s, 0.45 * s],
        [-0.45 * s, 0.15 * s, 0.45 * s],
        [0.45 * s, 0.15 * s, -0.45 * s],
        [-0.45 * s, 0.15 * s, -0.45 * s],
      ];
      propPositions.forEach(([px, py, pz]) => {
        const arm = proxyMesh(geos[2], mat);
        arm.position.set(px * 0.6, py * 0.6, pz * 0.6);
        meshes.push(arm);
        const prop = proxyMesh(geos[3], mat);
        prop.position.set(px, py, pz);
        meshes.push(prop);
        spinners.push(prop);
      });
    } else if (shape === 'sphere') {
      meshes.push(proxyMesh(geos[0], mat));
      const wire = proxyMesh(geos[1], mat);
      meshes.push(wire);
      spinners.push(wire);
    } else {
      const body = proxyMesh(geos[0], mat);
      meshes.push(body);
      spinners.push(body);
    }

    meshes.forEach((m) => parent.add(m));
    return { meshes, spinners };
  }

  /** 예전과 같은 회전 (일시정지 중에는 부르지 않음) */
  static spin(spinners: THREE.Object3D[], dt: number) {
    for (let i = 0; i < spinners.length; i++) {
      spinners[i].rotation.y += dt * 15;
      spinners[i].rotation.z += dt * 8;
    }
  }

  dispose() {
    this.cache.forEach((entry) => entry.geos.forEach((g) => g.dispose()));
    this.cache.clear();
    this.material.dispose();
  }
}
