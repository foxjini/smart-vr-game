import * as THREE from 'three';
import { ThemeType } from '@/types';
import { QualitySettings } from './quality';
import { ARENA_LOOKS, ArenaLook } from './arena/themes';
import { GeometryBatch } from './arena/GeometryBatch';
import { addFloorTracks, addGate, addPlatform, addPylons, createGateSpinner, GATE } from './arena/structures';
import { GridFloor } from './arena/GridFloor';
import { SkyDome } from './arena/SkyDome';
import { Motes } from './arena/Motes';
import { createCityExtras, createSpaceExtras, ThemeExtras } from './arena/extras';

/**
 * 경기장 배경 전체 (하늘·별·격자 바닥·플랫폼·기둥·게이트·빛 알갱이·조명·안개·반사 환경맵).
 * - 움직이지 않는 구조물은 금속·플랫폼·빛 3개로 합쳐 그림 (테마당 draw call 약 7~9개)
 * - 모든 테마가 같은 조명 구성(반구광 1 + 방향광 2)과 같은 종류의 안개를 써서,
 *   테마를 바꿔도 표적·효과 셰이더를 다시 컴파일하지 않음
 */
export class ArenaEnvironment {
  readonly root = new THREE.Group();

  private hemi = new THREE.HemisphereLight();
  private key = new THREE.DirectionalLight();
  private rim = new THREE.DirectionalLight();
  private fog = new THREE.Fog(0x000000, 30, 170);

  private sky = new SkyDome();
  private grid = new GridFloor();
  private motes: Motes;
  private bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.4 });
  /** 선수가 내려다보는 플랫폼은 덜 번들거리게 */
  private plateMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.7 });
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private body?: THREE.Mesh;
  private plate?: THREE.Mesh;
  private glow?: THREE.Mesh;
  private spinner?: THREE.Mesh;
  private extras?: ThemeExtras;
  private envTarget?: THREE.WebGLRenderTarget;
  private theme?: ThemeType;
  private time = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private quality: QualitySettings
  ) {
    this.root.name = 'arena';
    // 키 라이트: 선수 쪽 위에서 표적 정면을 비춤
    // 림 라이트: 표적 뒤에서 낮게 비춰 윤곽만 살림 (높으면 플랫폼 바닥에 번들거림이 생김)
    this.key.position.set(4, 10, 6);
    this.rim.position.set(-5, 1.6, -12);
    this.root.add(this.hemi, this.key, this.rim);
    this.motes = new Motes(quality.motes);
    this.root.add(this.sky.root, this.grid.mesh, this.motes.points);
    this.scene.fog = this.fog;
  }

  get currentTheme(): ThemeType | undefined {
    return this.theme;
  }

  setTheme(theme: ThemeType) {
    if (theme === this.theme) return;
    this.theme = theme;
    const look = ARENA_LOOKS[theme];

    // 안개·배경 (하늘 돔이 모두 덮지만 첫 프레임 전 빈 화면 색도 맞춤)
    this.fog.color.set(look.fog.color);
    this.fog.near = look.fog.near;
    this.fog.far = look.fog.far;
    this.scene.background = new THREE.Color(look.fog.color);

    // 조명
    const l = look.lights;
    this.hemi.color.set(l.hemiSky);
    this.hemi.groundColor.set(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    this.key.color.set(l.key);
    this.key.intensity = l.keyIntensity;
    this.rim.color.set(l.rim);
    this.rim.intensity = l.rimIntensity;

    this.buildEnvironmentMap(look);
    this.buildStructures(look);
    this.sky.build(look, this.quality.stars, Math.min(this.renderer.getPixelRatio(), 2));
    this.grid.setLook(look);
    this.grid.clearRipples();
    this.motes.setColor(look.structure.accent);
    this.buildExtras(look);
  }

  /** 표적 명중 지점 아래 바닥에 물결 */
  ripple(point: THREE.Vector3, color: number, strength = 1) {
    this.grid.ripple(point.x, point.z, color, strength);
  }

  update(dt: number) {
    this.time += dt;
    this.sky.update(this.time);
    this.grid.update(dt);
    this.motes.update(this.time, this.renderer);
    if (this.spinner) this.spinner.rotation.z = this.time * 0.05;
    this.extras?.update(this.time);
  }

  /** 금속이 비출 환경: 경기장 색의 빛 판들을 작은 장면에 그려 PMREM으로 만듦 */
  private buildEnvironmentMap(look: ArenaLook) {
    const env = new THREE.Scene();
    env.background = new THREE.Color(look.env.base);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const materials: THREE.Material[] = [];
    const panel = ([hex, power]: [number, number], sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(power) });
      materials.push(material);
      const mesh = new THREE.Mesh(box, material);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      env.add(mesh);
    };
    panel(look.env.top, 8, 0.4, 8, 0, 9, 0);
    panel(look.env.left, 0.4, 3, 14, -10, 2.5, -2);
    panel(look.env.right, 0.4, 3, 14, 10, 2.5, -2);
    panel(look.env.horizon, 30, 1.2, 0.4, 0, 1, -14);
    panel([look.grid.ground, 1], 40, 0.2, 40, 0, -2, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromScene(env, 0.04);
    pmrem.dispose();
    box.dispose();
    materials.forEach((m) => m.dispose());

    this.envTarget?.dispose();
    this.envTarget = target;
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = look.env.intensity;
  }

  private buildStructures(look: ArenaLook) {
    this.clearStructures();
    const body = new GeometryBatch();
    const plate = new GeometryBatch();
    const glow = new GeometryBatch();
    addPlatform(plate, glow, look);
    addFloorTracks(glow);
    addPylons(body, glow, look);
    addGate(body, glow, look);

    this.body = this.staticMesh(body.build()!, this.bodyMat, 'arena-structure');
    this.plate = this.staticMesh(plate.build()!, this.plateMat, 'arena-platform');
    this.glow = this.staticMesh(glow.build()!, this.glowMat, 'arena-lights');
    this.spinner = this.staticMesh(createGateSpinner(look), this.glowMat, 'gate-spinner');
    this.spinner.position.set(0, GATE.y, GATE.z);
  }

  private staticMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.raycast = () => {};
    this.root.add(mesh);
    return mesh;
  }

  private buildExtras(look: ArenaLook) {
    if (this.extras) {
      this.root.remove(this.extras.root);
      this.extras.dispose();
      this.extras = undefined;
    }
    if (look.extra === 'space') this.extras = createSpaceExtras();
    else if (look.extra === 'city') this.extras = createCityExtras(look, this.quality.buildings);
    if (this.extras) this.root.add(this.extras.root);
  }

  private clearStructures() {
    for (const mesh of [this.body, this.plate, this.glow, this.spinner]) {
      if (!mesh) continue;
      this.root.remove(mesh);
      mesh.geometry.dispose();
    }
    this.body = this.plate = this.glow = this.spinner = undefined;
  }

  dispose() {
    this.clearStructures();
    if (this.extras) {
      this.extras.dispose();
      this.extras = undefined;
    }
    this.sky.dispose();
    this.grid.dispose();
    this.motes.dispose();
    this.bodyMat.dispose();
    this.plateMat.dispose();
    this.glowMat.dispose();
    if (this.scene.environment === this.envTarget?.texture) this.scene.environment = null;
    this.envTarget?.dispose();
    this.envTarget = undefined;
    this.root.removeFromParent();
  }
}
