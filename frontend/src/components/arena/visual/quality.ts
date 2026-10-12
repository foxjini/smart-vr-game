import * as THREE from 'three';

/** 그래픽 품질 단계. Quest·소프트웨어 렌더러는 low, PC는 high */
export type QualityLevel = 'low' | 'high';

export interface QualitySettings {
  level: QualityLevel;
  /** 하늘의 별 개수 */
  stars: number;
  /** 도시 테마 건물 개수 */
  buildings: number;
  /** 경기장에 떠다니는 빛 알갱이 개수 */
  motes: number;
}

const PRESETS: Record<QualityLevel, QualitySettings> = {
  low: { level: 'low', stars: 1200, buildings: 70, motes: 250 },
  high: { level: 'high', stars: 3000, buildings: 150, motes: 500 },
};

/**
 * 품질 결정: 주소의 ?quality=low|high가 있으면 그대로 쓰고,
 * 없으면 Quest 브라우저와 소프트웨어 렌더러(SwiftShader 등)는 low, 나머지는 high.
 */
export function detectQuality(renderer: THREE.WebGLRenderer): QualitySettings {
  const param = new URLSearchParams(window.location.search).get('quality');
  if (param === 'low' || param === 'high') return PRESETS[param];
  if (isQuestBrowser() || isSoftwareRenderer(renderer)) return PRESETS.low;
  return PRESETS.high;
}

function isQuestBrowser(): boolean {
  return /OculusBrowser|Quest/i.test(navigator.userAgent);
}

function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  const gl = renderer.getContext();
  let name = String(gl.getParameter(gl.RENDERER) ?? '');
  // Chrome은 RENDERER를 'WebKit WebGL'로 가리므로 확장으로 실제 이름을 읽음
  // (Firefox는 RENDERER에 실제 이름이 있으므로 사용 중단 예정인 확장을 부르지 않음)
  if (/^WebKit WebGL$/i.test(name)) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
  }
  return /SwiftShader|llvmpipe|softpipe|Software/i.test(name);
}
