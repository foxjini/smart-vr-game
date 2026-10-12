import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from './palette';
import { GeometryBatch, placeMatrix } from './arena/GeometryBatch';
import { AIM_BEAM_FRAG, createBeamGeometry, createBeamMaterial } from './beamShader';
import { asCanvasTexture } from './renderSetup';

/** 탄약 칸 수 (엔진의 maxAmmo와 같음) */
const AMMO_CELLS = 10;
/** 조준선 굵기(m): 총구 쪽 / 먼 쪽 */
const AIM_WIDTH_NEAR = 0.004;
const AIM_WIDTH_FAR = 0.03;

const GUNMETAL = 0x1b2230;
const PANEL = 0x283246;
const GRIP = 0x11151d;
const BEZEL = 0x0b0f17;
const CELL_OFF = new THREE.Color(0x1a2230);

/** 블래스터 한 정의 겉모습과 조준 표시 */
export interface BlasterVisual {
  /** 몸체·빛·탄약 칸·OLED (rig.group의 자식, 사격 판정에는 쓰이지 않음) */
  root: THREE.Group;
  displayMesh: THREE.Mesh;
  displayTexture: THREE.CanvasTexture;
  displayCanvas: HTMLCanvasElement;
  displayCtx: CanvasRenderingContext2D;
  /** 조준선·조준점·고정 링 (장면에 바로 붙여 월드 좌표로 그림) */
  aimBeam: THREE.Mesh;
  aimMaterial: THREE.ShaderMaterial;
  aimDot: THREE.Mesh;
  lockRing: THREE.Mesh;
  cells: THREE.InstancedMesh;
  /** 마지막으로 칠한 탄약 칸 상태 (같으면 다시 칠하지 않음) */
  cellsKey: string;
}

/**
 * 블래스터 모델 공장. 몸체 지오메트리·재질은 두 블래스터가 함께 쓰고,
 * 팀 색이 들어간 빛 부분만 팀마다 따로 만듦
 */
export class BlasterFactory {
  private bodyGeo: THREE.BufferGeometry;
  /** 경기장 반사는 은은하게 (팀 색 총에 다른 팀 색 반사가 진하게 비치지 않게) */
  private bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.5, envMapIntensity: 0.55 });
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private cellGeo = new THREE.BoxGeometry(0.026, 0.006, 0.011);
  private beamGeo = createBeamGeometry();
  private dotGeo = new THREE.CircleGeometry(1, 20);
  private ringGeo = new THREE.RingGeometry(0.72, 1, 40);
  private glowGeos: THREE.BufferGeometry[] = [];
  private instanced: THREE.InstancedMesh[] = [];
  private owned: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  constructor() {
    const body = new GeometryBatch();
    // 몸체·윗덮개
    body.add(new RoundedBoxGeometry(0.07, 0.105, 0.3, 2, 0.018), GUNMETAL, placeMatrix(0, 0.005, -0.12));
    body.add(new RoundedBoxGeometry(0.05, 0.03, 0.22, 2, 0.01), PANEL, placeMatrix(0, 0.07, -0.16));
    // 총열과 총구 덮개 (총구 끝은 엔진의 MUZZLE_LOCAL (0, 0.02, -0.5) 바로 뒤)
    const barrel = new THREE.CylinderGeometry(0.022, 0.026, 0.2, 20);
    barrel.rotateX(Math.PI / 2);
    body.add(barrel, PANEL, placeMatrix(0, 0.02, -0.37));
    const shroud = new THREE.CylinderGeometry(0.032, 0.032, 0.05, 20);
    shroud.rotateX(Math.PI / 2);
    body.add(shroud, GUNMETAL, placeMatrix(0, 0.02, -0.465));
    // 손잡이와 방아쇠
    const grip = new RoundedBoxGeometry(0.05, 0.14, 0.07, 2, 0.015);
    grip.rotateX(-0.28);
    body.add(grip, GRIP, placeMatrix(0, -0.09, 0));
    body.add(new THREE.BoxGeometry(0.012, 0.035, 0.012), PANEL, placeMatrix(0, -0.06, -0.05));
    // OLED 테두리 (화면과 같은 각도로 기울임)
    const bezel = new RoundedBoxGeometry(0.112, 0.064, 0.012, 2, 0.006);
    bezel.rotateX(-0.35);
    body.add(bezel, BEZEL, placeMatrix(0, 0.0878, -0.0461));
    this.bodyGeo = body.build()!;
    this.owned.push(this.bodyMat, this.glowMat);
  }

  /** 팀 색 블래스터 하나 */
  create(teamColor: number): BlasterVisual {
    const root = new THREE.Group();
    root.name = 'blaster-visual';

    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.raycast = () => {};
    root.add(body);

    // 팀 색 빛: 옆면 줄, 총열 고리 2개, 총구 고리, 뒷면 빛
    const glow = new GeometryBatch();
    for (const x of [-0.0365, 0.0365]) glow.add(new THREE.BoxGeometry(0.003, 0.012, 0.22), teamColor, placeMatrix(x, 0.02, -0.13));
    for (const z of [-0.33, -0.4]) glow.add(new THREE.TorusGeometry(0.027, 0.0035, 6, 24), teamColor, placeMatrix(0, 0.02, z), 0.8);
    glow.add(new THREE.TorusGeometry(0.033, 0.005, 8, 28), teamColor, placeMatrix(0, 0.02, -0.492), 1.2);
    glow.add(new THREE.BoxGeometry(0.04, 0.008, 0.003), teamColor, placeMatrix(0, 0.03, 0.031));
    const glowGeo = glow.build()!;
    this.glowGeos.push(glowGeo);
    const glowMesh = new THREE.Mesh(glowGeo, this.glowMat);
    glowMesh.raycast = () => {};
    root.add(glowMesh);

    // 탄약 칸 10개 (윗덮개 위, 앞쪽부터 0번)
    const cellMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.owned.push(cellMat);
    const cells = new THREE.InstancedMesh(this.cellGeo, cellMat, AMMO_CELLS);
    const m = new THREE.Matrix4();
    for (let i = 0; i < AMMO_CELLS; i++) {
      cells.setMatrixAt(i, m.makeTranslation(0, 0.0885, -0.25 + i * 0.0165));
      cells.setColorAt(i, CELL_OFF);
    }
    cells.raycast = () => {};
    this.instanced.push(cells);
    root.add(cells);

    // OLED 화면 (내용이 바뀔 때만 다시 그림)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const texture = asCanvasTexture(canvas);
    this.textures.push(texture);
    const displayMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
    this.owned.push(displayMat);
    const screenGeo = new THREE.PlaneGeometry(0.1, 0.05);
    this.glowGeos.push(screenGeo);
    const displayMesh = new THREE.Mesh(screenGeo, displayMat);
    displayMesh.position.set(0, 0.09, -0.04);
    displayMesh.rotation.set(-0.35, 0, 0);
    displayMesh.raycast = () => {};
    root.add(displayMesh);

    // 조준선 (총구 → 실제 조준 지점)
    const aimMaterial = createBeamMaterial(AIM_BEAM_FRAG, AIM_WIDTH_NEAR, AIM_WIDTH_FAR, teamColor, 0.6);
    this.owned.push(aimMaterial);
    const aimBeam = new THREE.Mesh(this.beamGeo, aimMaterial);
    aimBeam.frustumCulled = false;
    aimBeam.renderOrder = 9;
    aimBeam.raycast = () => {};

    // 조준점과 표적 위 고정 링 (다른 물체에 가려지지 않게 맨 위에 그림)
    const dotMat = new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
    this.owned.push(dotMat, ringMat);
    const aimDot = new THREE.Mesh(this.dotGeo, dotMat);
    aimDot.renderOrder = 30;
    aimDot.raycast = () => {};
    const lockRing = new THREE.Mesh(this.ringGeo, ringMat);
    lockRing.renderOrder = 30;
    lockRing.visible = false;
    lockRing.raycast = () => {};

    return { root, displayMesh, displayTexture: texture, displayCanvas: canvas, displayCtx: ctx, aimBeam, aimMaterial, aimDot, lockRing, cells, cellsKey: '' };
  }

  /**
   * 탄약 칸 색: 남은 탄약만큼 뒤쪽(손 쪽)부터 켜짐, 3발 이하이면 경고색,
   * 재장전 중이면 진행 정도만큼 하얗게 차오름
   */
  static setAmmo(v: BlasterVisual, teamColor: number, ammo: number, reloadProgress: number | null) {
    const lit = reloadProgress !== null ? Math.floor(reloadProgress * AMMO_CELLS) : Math.max(0, Math.min(AMMO_CELLS, ammo));
    const mode = reloadProgress !== null ? 'reload' : ammo <= 3 ? 'low' : 'ok';
    const key = `${mode}|${lit}`;
    if (key === v.cellsKey) return;
    v.cellsKey = key;
    const on = new THREE.Color(mode === 'reload' ? 0xdff6ff : mode === 'low' ? PALETTE.warn : teamColor);
    for (let i = 0; i < AMMO_CELLS; i++) {
      v.cells.setColorAt(i, i >= AMMO_CELLS - lit ? on : CELL_OFF);
    }
    if (v.cells.instanceColor) v.cells.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.bodyGeo.dispose();
    this.glowGeos.forEach((g) => g.dispose());
    this.instanced.forEach((m) => m.dispose());
    this.cellGeo.dispose();
    this.beamGeo.dispose();
    this.dotGeo.dispose();
    this.ringGeo.dispose();
    this.owned.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
  }
}
