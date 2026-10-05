import * as THREE from 'three';
import { SpectatorCameraMode } from '@/types';

export class SpectatorCameraController {
  private camera: THREE.PerspectiveCamera;
  public mode: SpectatorCameraMode = 'STADIUM';
  private orbitAngle: number = 0;
  private currentLookAt = new THREE.Vector3(0, 1.6, -10);
  private targetLookAt = new THREE.Vector3(0, 1.6, -10);
  private targetPos = new THREE.Vector3(0, 3.2, 3.5);

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.setMode('STADIUM');
  }

  public setMode(mode: SpectatorCameraMode) {
    this.mode = mode;
  }

  public update(
    delta: number,
    p1HeadPos?: THREE.Vector3,
    p2HeadPos?: THREE.Vector3
  ) {
    if (this.mode === 'STADIUM') {
      // 1. 스타디움 중계 풀샷 (경기장 전체 및 선수/타겟 조망)
      this.targetPos.set(0, 3.6, 4.0);
      this.targetLookAt.set(0, 1.8, -12);
    } else if (this.mode === 'P1_VIEW') {
      // 2. Player 1 어깨 뒤 팔로우 캠
      const base = p1HeadPos || new THREE.Vector3(-0.35, 1.6, 0);
      this.targetPos.set(base.x - 0.25, base.y + 0.3, base.z + 0.7);
      this.targetLookAt.set(base.x, base.y, -18);
    } else if (this.mode === 'P2_VIEW') {
      // 3. Player 2 / AI 어깨 뒤 팔로우 캠
      const base = p2HeadPos || new THREE.Vector3(0.35, 1.6, 0);
      this.targetPos.set(base.x + 0.25, base.y + 0.3, base.z + 0.7);
      this.targetLookAt.set(base.x, base.y, -18);
    } else if (this.mode === 'ORBIT') {
      // 4. 시네마틱 궤도 회전 캠
      this.orbitAngle += delta * 0.25;
      const radius = 15;
      const centerX = 0;
      const centerZ = -8;
      this.targetPos.set(
        centerX + Math.sin(this.orbitAngle) * radius,
        4.5 + Math.sin(this.orbitAngle * 0.5) * 1.0,
        centerZ + Math.cos(this.orbitAngle) * radius
      );
      this.targetLookAt.set(0, 2.0, -8);
    }

    // 부드러운 카메라 위치 및 시선 보간
    this.camera.position.lerp(this.targetPos, Math.min(1.0, delta * 4.5));
    this.currentLookAt.lerp(this.targetLookAt, Math.min(1.0, delta * 4.5));
    this.camera.lookAt(this.currentLookAt);
  }
}
