import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Quest 2 기본 주사율. 성능 예산을 이 기준으로 잡음 */
const TARGET_XR_FRAME_RATE = 72;

/**
 * 렌더러 색 처리 설정.
 * - Neutral tone mapping: ACES보다 색이 덜 바래서 시안·마젠타 팀 색이 그대로 보임
 * - 그림자를 드리우는 물체가 없으므로 그림자 맵은 끔
 */
export function configureRenderer(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;
}

/**
 * 금속 재질이 반사할 환경맵.
 * 지금은 RoomEnvironment로 은은한 반사만 주고, 경기장 조명을 반영한 환경맵은 아레나 단계에서 교체.
 */
export function createEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return target.texture;
}

type FrameRateSession = XRSession & {
  supportedFrameRates?: Float32Array;
  updateTargetFrameRate?: (rate: number) => Promise<void>;
};

/** 헤드셋이 지원하면 72Hz로 맞춤 (90Hz로 설정된 기기에서도 같은 성능 예산 유지) */
export function requestTargetFrameRate(session: XRSession | null) {
  const s = session as FrameRateSession | null;
  if (!s?.supportedFrameRates || !s.updateTargetFrameRate) return;
  if (!Array.from(s.supportedFrameRates).includes(TARGET_XR_FRAME_RATE)) return;
  s.updateTargetFrameRate(TARGET_XR_FRAME_RATE).catch(() => {
    // 지원하지 않는 브라우저는 기본 주사율 유지
  });
}

/** 캔버스로 그린 텍스처(글자·패널)를 sRGB로 표시하도록 설정 */
export function asCanvasTexture(canvas: HTMLCanvasElement, mipmaps = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (mipmaps) {
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;
  } else {
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
  }
  return texture;
}
