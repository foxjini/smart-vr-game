import * as THREE from 'three';
import { FLOOR_Y, PLATFORM_RADIUS } from './arena/structures';

/** 조준 표시가 보는 표적 정보 (엔진의 TargetObject 일부) */
export interface AimTarget {
  hitMeshes: THREE.Object3D[];
  isHit: boolean;
  despawn: number;
}

const MAX_DIST = 60;
const FAR_POINT = 30;

/**
 * 조준 지점 찾기 (조준선·조준점용, 사격 판정과 같은 광선·같은 판정 메시).
 * 표적에 닿으면 그 지점, 아니면 플랫폼·바닥과 만나는 곳, 그것도 없으면 30m 앞
 */
export class AimProbe {
  private raycaster = new THREE.Raycaster();
  private hits: THREE.Intersection[] = [];

  /** 표적에 닿았으면 true (out에 조준 지점) */
  probe(origin: THREE.Vector3, dir: THREE.Vector3, targets: ReadonlyArray<AimTarget>, out: THREE.Vector3): boolean {
    this.raycaster.set(origin, dir);
    this.raycaster.far = MAX_DIST;
    let best = Infinity;
    for (const t of targets) {
      if (t.isHit || t.despawn >= 0) continue;
      this.hits.length = 0;
      this.raycaster.intersectObjects(t.hitMeshes, false, this.hits);
      const h = this.hits[0];
      if (h && h.distance < best) {
        best = h.distance;
        out.copy(h.point);
      }
    }
    this.hits.length = 0;
    if (best < Infinity) return true;

    if (dir.y < -0.01) {
      // 플랫폼 윗면(y=0)에 먼저 닿는지, 아니면 격자 바닥
      const dTop = -origin.y / dir.y;
      if (dTop > 0) {
        const x = origin.x + dir.x * dTop;
        const z = origin.z + dir.z * dTop;
        if (x * x + z * z <= PLATFORM_RADIUS * PLATFORM_RADIUS) {
          out.set(x, 0, z);
          return false;
        }
      }
      const dFloor = (FLOOR_Y - origin.y) / dir.y;
      if (dFloor > 0 && dFloor < MAX_DIST) {
        out.copy(origin).addScaledVector(dir, dFloor);
        return false;
      }
    }
    out.copy(origin).addScaledVector(dir, FAR_POINT);
    return false;
  }
}
