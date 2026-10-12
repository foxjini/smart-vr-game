import * as THREE from 'three';

/** 이만큼(m) 넘게 떨어지면 따라가지 않고 바로 옮김 (역할 바꿈·재접속 등) */
const SNAP_DISTANCE = 1;
/** 따라가는 빠르기 (클수록 빠름, 18이면 약 0.05초 만에 대부분 따라잡음) */
const FOLLOW_RATE = 18;

/**
 * 상대 선수 자세(초당 20번 도착)를 부드럽게 보이게 함.
 * 받은 자세를 목표로 저장해 두고 매 프레임 조금씩 따라감
 */
export class PoseSmoother {
  private targetPos = new THREE.Vector3();
  private targetQuat = new THREE.Quaternion();
  private hasTarget = false;
  private snapNext = true;

  set(pos: readonly [number, number, number], quat: readonly [number, number, number, number]) {
    this.targetPos.set(pos[0], pos[1], pos[2]);
    this.targetQuat.set(quat[0], quat[1], quat[2], quat[3]);
    this.hasTarget = true;
  }

  /** 받은 자세가 아직 없으면 아무것도 하지 않음 */
  update(obj: THREE.Object3D, dt: number) {
    if (!this.hasTarget) return;
    if (this.snapNext || obj.position.distanceTo(this.targetPos) > SNAP_DISTANCE) {
      obj.position.copy(this.targetPos);
      obj.quaternion.copy(this.targetQuat);
      this.snapNext = false;
      return;
    }
    const k = 1 - Math.exp(-dt * FOLLOW_RATE);
    obj.position.lerp(this.targetPos, k);
    obj.quaternion.slerp(this.targetQuat, k);
  }

  /** 배치를 새로 할 때 (다음 자세는 바로 옮김) */
  reset() {
    this.hasTarget = false;
    this.snapNext = true;
  }
}
