import * as THREE from 'three';
import { Difficulty, GameStats, TargetShape } from '@/types';

export interface TargetObjectRef {
  id?: string;
  mesh: THREE.Group;
  shape: TargetShape;
  basePos: THREE.Vector3;
  velocity?: THREE.Vector3;
  isHit: boolean;
}

export interface AIActionResult {
  fire: boolean;
  reload: boolean;
}

// 난이도별 수치 (매 프레임 새 객체를 만들지 않도록 모듈 상수로 둠)
/** 재장전 후 사격 딜레이 (하: 1.2s, 중: 0.8s, 상: 0.4s) */
const POST_RELOAD_COOLDOWN: Record<Difficulty, number> = { easy: 1.2, normal: 0.8, hard: 0.4 };
/** 재장전 소요 시간 (하: 2.2초 느긋함, 중: 1.6초 표준, 상: 1.0초 빠름) */
const RELOAD_DURATION: Record<Difficulty, number> = { easy: 2.2, normal: 1.6, hard: 1.0 };
/** 조준 회전 보간 속도 (하: 2.2 부드럽고 느림, 중: 3.8 자연스러운 속도, 상: 8.5 신속함) */
const AIM_SPEED: Record<Difficulty, number> = { easy: 2.2, normal: 3.8, hard: 8.5 };
/** 조준 각도 임계값 (하: 0.18, 중: 0.08, 상: 0.04) */
const ANGLE_THRESHOLD: Record<Difficulty, number> = { easy: 0.18, normal: 0.08, hard: 0.04 };
/** 난이도별 사격 쿨다운 (하: 2.6s~3.4s, 중: 1.8s~2.4s, 상: 1.1s~1.5s) */
const SHOT_COOLDOWN: Record<Difficulty, number> = { easy: 2.8, normal: 2.0, hard: 1.25 };

/** 총구 기본 방향 (-Z) */
const FORWARD = new THREE.Vector3(0, 0, -1);
/** 대기 시 돌아갈 정면 자세 */
const REST_QUAT = new THREE.Quaternion();

export class CyberAIRival {
  public difficulty: Difficulty = 'normal';
  public stats: GameStats = {
    score: 0,
    hits: 0,
    misses: 0,
    shotsFired: 0,
    accuracy: 100,
    combo: 0,
    maxCombo: 0,
    timeRemaining: 60,
    ammo: 10,
    maxAmmo: 10,
    isReloading: false,
  };

  private currentTarget: TargetObjectRef | null = null;
  private shotCooldown: number = 0;
  private reactionTimer: number = 0;
  private reloadTimer: number = 0;
  private currentAimQuat = new THREE.Quaternion();
  private noiseSeed: number = Math.random() * 100;

  // 매 프레임 재사용하는 임시 객체
  private _blasterPos = new THREE.Vector3();
  private _targetPos = new THREE.Vector3();
  private _sortA = new THREE.Vector3();
  private _sortB = new THREE.Vector3();
  private _aimDir = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _targetQuat = new THREE.Quaternion();

  constructor(difficulty: Difficulty = 'normal') {
    this.difficulty = difficulty;
    this.reset();
  }

  public reset() {
    this.stats = {
      score: 0,
      hits: 0,
      misses: 0,
      shotsFired: 0,
      accuracy: 100,
      combo: 0,
      maxCombo: 0,
      timeRemaining: 60,
      ammo: 10,
      maxAmmo: 10,
      isReloading: false,
    };
    this.currentTarget = null;
    this.shotCooldown = 1.0;
    this.reactionTimer = 0;
    this.reloadTimer = 0;
    this.currentAimQuat.identity();
    this.noiseSeed = Math.random() * 100;
  }

  public setDifficulty(diff: Difficulty) {
    this.difficulty = diff;
  }

  /**
   * 프레임별 AI 조준 및 격발 연산:
   * 인간과 유사한 자연스러운 반응 지연, 조준 회전 관성(Slerp), 손떨림/오차(Tremor)를 반영
   */
  public update(
    delta: number,
    activeTargets: TargetObjectRef[],
    blasterGroup: THREE.Group
  ): AIActionResult {
    // 1. 재장전 처리
    if (this.stats.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.stats.isReloading = false;
        this.stats.ammo = this.stats.maxAmmo;
        this.shotCooldown = POST_RELOAD_COOLDOWN[this.difficulty];
      }
      return { fire: false, reload: false };
    }

    // 2. 탄약 고갈 시 자동 재장전 시작
    if (this.stats.ammo <= 0) {
      this.stats.isReloading = true;
      this.reloadTimer = RELOAD_DURATION[this.difficulty];
      return { fire: false, reload: true };
    }

    if (this.shotCooldown > 0) {
      this.shotCooldown -= delta;
    }

    // 3. 유효 타겟 검증 및 신규 타겟 탐색
    if (!this.currentTarget || this.currentTarget.isHit || !activeTargets.includes(this.currentTarget)) {
      this.currentTarget = null;
      const available = activeTargets.filter((t) => !t.isHit);
      if (available.length > 0) {
        if (this.difficulty === 'hard') {
          // 상(Hard): 가장 가까운 표적 선호 및 빠른 반응 (0.28s ~ 0.40s)
          const bPos = blasterGroup.getWorldPosition(this._blasterPos);
          const pA = this._sortA;
          const pB = this._sortB;
          available.sort((a, b) => {
            a.mesh.getWorldPosition(pA);
            b.mesh.getWorldPosition(pB);
            return pA.distanceTo(bPos) - pB.distanceTo(bPos);
          });
          this.currentTarget = available[0];
          this.reactionTimer = 0.28 + Math.random() * 0.12;
        } else if (this.difficulty === 'normal') {
          // 중(Normal - 하향 밸런싱): 플레이어가 먼저 쏠 수 있도록 인간적인 반응 지연 (0.65s ~ 0.95s)
          const randIndex = Math.floor(Math.random() * available.length);
          this.currentTarget = available[randIndex];
          this.reactionTimer = 0.65 + Math.random() * 0.30;
        } else {
          // 하(Easy): 느긋한 반응 지연 (0.90s ~ 1.40s)
          const randIndex = Math.floor(Math.random() * available.length);
          this.currentTarget = available[randIndex];
          this.reactionTimer = 0.90 + Math.random() * 0.50;
        }
      }
    }

    const blasterWorldPos = blasterGroup.getWorldPosition(this._blasterPos);

    if (this.currentTarget && !this.currentTarget.isHit) {
      if (this.reactionTimer > 0) {
        this.reactionTimer -= delta;
      } else {
        const targetWorldPos = this.currentTarget.mesh.getWorldPosition(this._targetPos);

        // [상] 난이도에서만 이동 표적에 대한 예측 선도 사격 계산
        if (this.difficulty === 'hard' && this.currentTarget.velocity) {
          const distance = blasterWorldPos.distanceTo(targetWorldPos);
          const leadTime = Math.min(0.18, distance / 90);
          targetWorldPos.addScaledVector(this.currentTarget.velocity, leadTime);
        }

        // 인간적인 손떨림 및 조준 오차 (Tremor & Aim Dispersion)
        const timeSec = (Date.now() * 0.001) + this.noiseSeed;
        let aimNoiseX = 0;
        let aimNoiseY = 0;

        if (this.difficulty === 'easy') {
          // 하: 큰 조준 오차 (±0.18 rad) -> 표적 중심에서 크게 벗어남
          aimNoiseX = Math.sin(timeSec * 2.1) * 0.16 + Math.cos(timeSec * 1.3) * 0.08;
          aimNoiseY = Math.cos(timeSec * 2.7) * 0.14 + Math.sin(timeSec * 1.1) * 0.06;
        } else if (this.difficulty === 'normal') {
          // 중: 자연스러운 인간 조준 떨림 (±0.06 rad) -> 표적 주변을 조준하나 가끔 빗나감
          aimNoiseX = Math.sin(timeSec * 3.5) * 0.055;
          aimNoiseY = Math.cos(timeSec * 4.2) * 0.045;
        } else {
          // 상: 미세한 조준 흔들림 (±0.015 rad)
          aimNoiseX = Math.sin(timeSec * 6.0) * 0.012;
          aimNoiseY = Math.cos(timeSec * 7.0) * 0.012;
        }

        const aimDir = this._aimDir.subVectors(targetWorldPos, blasterWorldPos).normalize();
        aimDir.x += aimNoiseX;
        aimDir.y += aimNoiseY;
        aimDir.normalize();

        const targetQuat = this._targetQuat.setFromUnitVectors(FORWARD, aimDir);

        this.currentAimQuat.slerp(targetQuat, Math.min(1.0, delta * AIM_SPEED[this.difficulty]));
        blasterGroup.quaternion.copy(this.currentAimQuat);

        // 현재 총구의 실제 전방 벡터와 목표 벡터 간 각도 차이
        const currentForward = this._forward.copy(FORWARD).applyQuaternion(blasterGroup.quaternion);
        const angleDiff = currentForward.angleTo(aimDir);

        // 조준선이 대략 정렬되고 사격 쿨다운이 끝났을 때 사격 격발!
        if (angleDiff < ANGLE_THRESHOLD[this.difficulty] && this.shotCooldown <= 0) {
          this.stats.shotsFired += 1;
          this.stats.ammo -= 1;

          this.shotCooldown = SHOT_COOLDOWN[this.difficulty] * (0.85 + Math.random() * 0.3);

          // 주의: 명중 여부는 여기서 임의로 결정하지 않고, ShootingArenaEngine의 물리 3D 레이캐스트로 검증합니다!
          return { fire: true, reload: false };
        }
      }
    } else {
      // 대기 시 정면으로 부드럽게 복귀
      this.currentAimQuat.slerp(REST_QUAT, delta * 2.0);
      blasterGroup.quaternion.copy(this.currentAimQuat);
    }

    return { fire: false, reload: false };
  }

  /** 실제 3D 레이캐스트가 표적에 명중했을 때 호출 */
  public recordHit(basePoints: number = 1): number {
    this.stats.hits += 1;
    this.stats.combo += 1;
    if (this.stats.combo > this.stats.maxCombo) {
      this.stats.maxCombo = this.stats.combo;
    }

    const addedScore = basePoints;
    this.stats.score += addedScore;

    this.currentTarget = null;
    this.updateAccuracy();
    return addedScore;
  }

  /** 실제 3D 레이캐스트가 빗나갔을 때 호출 */
  public recordMiss() {
    this.stats.misses += 1;
    this.stats.combo = 0;
    this.updateAccuracy();
  }

  private updateAccuracy() {
    this.stats.accuracy =
      this.stats.shotsFired > 0
        ? Math.round((this.stats.hits / this.stats.shotsFired) * 100)
        : 100;
  }
}
