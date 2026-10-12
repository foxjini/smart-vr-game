import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Text } from 'troika-three-text';
import { GeometryBatch, placeMatrix } from './arena/GeometryBatch';
import { HoloTextFactory } from './text/HoloText';

const SHELL = 0x1c2433;
const TRIM = 0x2b3549;

/** 상대 선수(또는 AI) 헬멧 겉모습 */
export interface AvatarVisual {
  root: THREE.Group;
  /** 머리 위 이름표 "1P" / "2P" / "AI" (보는 사람 쪽으로 회전) */
  nameTag: Text;
}

/**
 * 바이저 헬멧 공장. 헬멧 몸체는 두 선수가 함께 쓰고, 바이저·귀 빛은 팀 색으로 따로 만듦.
 * 머리 그룹(p1Head/p2Head)의 위치·회전은 엔진이 정하고, 이 겉모습은 그 자식으로만 붙음
 */
export class AvatarFactory {
  private shellGeo: THREE.BufferGeometry;
  private shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.35 });
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private glowGeos: THREE.BufferGeometry[] = [];

  constructor(private texts: HoloTextFactory) {
    const shell = new GeometryBatch();
    // 둥근 헬멧과 위쪽 지느러미, 양쪽 귀 장치
    shell.add(new RoundedBoxGeometry(0.21, 0.23, 0.25, 3, 0.075), SHELL, placeMatrix(0, 0, 0.005));
    shell.add(new RoundedBoxGeometry(0.03, 0.05, 0.14, 2, 0.012), TRIM, placeMatrix(0, 0.125, 0.02));
    for (const x of [-0.112, 0.112]) {
      const pod = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20);
      pod.rotateZ(Math.PI / 2);
      shell.add(pod, TRIM, placeMatrix(x, -0.005, 0.02));
    }
    this.shellGeo = shell.build()!;
  }

  create(teamColor: number, label: string): AvatarVisual {
    const root = new THREE.Group();
    root.name = 'avatar-visual';
    const shell = new THREE.Mesh(this.shellGeo, this.shellMat);
    shell.raycast = () => {};
    root.add(shell);

    // 앞쪽(-Z)을 감싸는 빛나는 바이저와 귀 장치의 빛 고리
    const glow = new GeometryBatch();
    const visorWidth = 2.1;
    glow.add(
      new THREE.SphereGeometry(0.128, 28, 6, Math.PI * 1.5 - visorWidth / 2, visorWidth, Math.PI * 0.42, Math.PI * 0.17),
      teamColor,
      undefined,
      1
    );
    for (const x of [-0.128, 0.128]) {
      const ring = new THREE.TorusGeometry(0.03, 0.005, 6, 20);
      ring.rotateY(Math.PI / 2);
      glow.add(ring, teamColor, placeMatrix(x, -0.005, 0.02), 0.8);
    }
    const glowGeo = glow.build()!;
    this.glowGeos.push(glowGeo);
    const glowMesh = new THREE.Mesh(glowGeo, this.glowMat);
    glowMesh.raycast = () => {};
    root.add(glowMesh);

    const nameTag = this.texts.create({ text: label, font: 'num', size: 0.13, color: teamColor });
    nameTag.position.set(0, 0.27, 0);
    root.add(nameTag);
    return { root, nameTag };
  }

  /** 이름표가 늘 보는 사람(카메라) 쪽을 향하게: 머리 회전을 되돌리고 카메라 방향을 적용 */
  static faceCamera(v: AvatarVisual, headWorldQuat: THREE.Quaternion, cameraWorldQuat: THREE.Quaternion) {
    v.nameTag.quaternion.copy(headWorldQuat).invert().multiply(cameraWorldQuat);
  }

  dispose() {
    this.shellGeo.dispose();
    this.glowGeos.forEach((g) => g.dispose());
    this.shellMat.dispose();
    this.glowMat.dispose();
  }
}
