import * as THREE from 'three';
import { SpectatorCameraMode } from '@/types';

/** 관전 화면 시야각 (선수 PC 화면은 75, 엔진이 역할을 바꿀 때 되돌림) */
export const SPECTATOR_FOV = 60;

/** 표적 구역 가운데쯤 (모든 중계 시점이 바라보는 곳) */
const ARENA_FOCUS = new THREE.Vector3(0, 2.4, -14);

export class SpectatorCameraController {
  private camera: THREE.PerspectiveCamera;
  public mode: SpectatorCameraMode = 'STADIUM';
  private orbitAngle: number = 0;
  private currentLookAt = ARENA_FOCUS.clone();
  private targetLookAt = ARENA_FOCUS.clone();
  private targetPos = new THREE.Vector3(0, 4.4, 6.6);

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.setMode('STADIUM');
  }

  public setMode(mode: SpectatorCameraMode) {
    this.mode = mode;
  }

  public update(delta: number, p1HeadPos?: THREE.Vector3, p2HeadPos?: THREE.Vector3) {
    if (this.camera.fov !== SPECTATOR_FOV) {
      this.camera.fov = SPECTATOR_FOV;
      this.camera.updateProjectionMatrix();
    }

    if (this.mode === 'STADIUM') {
      // 1. 스타디움 풀샷: 플랫폼 뒤쪽 위에서 표적 구역·게이트·점수판을 가운데에, 선수는 화면 아래에
      this.targetPos.set(0, 4.4, 6.6);
      this.targetLookAt.copy(ARENA_FOCUS);
    } else if (this.mode === 'P1_VIEW') {
      // 2. 1P 어깨 뒤 시점
      const base = p1HeadPos || new THREE.Vector3(-0.75, 1.6, 0);
      this.targetPos.set(base.x - 0.25, base.y + 0.3, base.z + 0.7);
      this.targetLookAt.set(base.x, base.y, -18);
    } else if (this.mode === 'P2_VIEW') {
      // 3. 2P(또는 AI) 어깨 뒤 시점
      const base = p2HeadPos || new THREE.Vector3(0.75, 1.6, 0);
      this.targetPos.set(base.x + 0.25, base.y + 0.3, base.z + 0.7);
      this.targetLookAt.set(base.x, base.y, -18);
    } else if (this.mode === 'ORBIT') {
      // 4. 시네마틱 진자 시점: 선수 뒤쪽 반원(반지름 9.5m)을 좌우로 오가며 표적 구역을 바라봄
      //    (표적 구역을 지나가지 않고, 뒤쪽 기둥보다 안쪽이라 기둥에 가리지 않음)
      this.orbitAngle += delta * 0.22;
      const swing = Math.sin(this.orbitAngle) * 1.08;
      const radius = 9.5;
      this.targetPos.set(Math.sin(swing) * radius, 4.6 + Math.sin(this.orbitAngle * 0.5) * 0.8, 1.5 + Math.cos(swing) * radius);
      this.targetLookAt.copy(ARENA_FOCUS);
    }

    // 부드러운 카메라 위치 및 시선 보간
    this.camera.position.lerp(this.targetPos, Math.min(1.0, delta * 4.5));
    this.currentLookAt.lerp(this.targetLookAt, Math.min(1.0, delta * 4.5));
    this.camera.lookAt(this.currentLookAt);
  }
}
