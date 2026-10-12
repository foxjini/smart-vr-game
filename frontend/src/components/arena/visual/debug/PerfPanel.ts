import * as THREE from 'three';

/**
 * 개발용 성능 표시 (`?debug=perf`)
 * fps, draw call, 삼각형 수, GPU 자원 수를 화면 왼쪽 아래에 보여 줌.
 * VR에서는 한 번의 render가 두 눈을 모두 그리므로 draw call은 양 눈 합계.
 */
export class PerfPanel {
  private el: HTMLDivElement;
  private frames = 0;
  private windowStart = performance.now();
  private maxCalls = 0;
  /** 마지막 측정값 (VR 안 표시용, 0.5초마다 바뀌고 그때마다 sample이 1 늘어남) */
  last = { fps: 0, calls: 0, maxCalls: 0, sample: 0 };

  static isEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === 'perf';
  }

  constructor(private renderer: THREE.WebGLRenderer) {
    this.el = document.createElement('div');
    this.el.id = 'perf-panel';
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      zIndex: '200',
      padding: '6px 10px',
      background: 'rgba(7, 11, 20, 0.85)',
      border: '1px solid rgba(148, 197, 255, 0.25)',
      borderRadius: '6px',
      color: '#eaf2ff',
      font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
  }

  /** renderer.info는 render마다 초기화되므로 render 직후에 호출 */
  update() {
    const info = this.renderer.info;
    this.frames++;
    this.maxCalls = Math.max(this.maxCalls, info.render.calls);
    const now = performance.now();
    const elapsed = now - this.windowStart;
    if (elapsed < 500) return;

    const fps = Math.round((this.frames * 1000) / elapsed);
    this.last = { fps, calls: info.render.calls, maxCalls: this.maxCalls, sample: this.last.sample + 1 };
    const vr = this.renderer.xr.isPresenting ? ' (양 눈 합계)' : '';
    this.el.textContent =
      `FPS ${fps}\n` +
      `draw ${info.render.calls} / 최대 ${this.maxCalls}${vr}\n` +
      `삼각형 ${info.render.triangles.toLocaleString()}\n` +
      `geometry ${info.memory.geometries} · texture ${info.memory.textures} · program ${info.programs?.length ?? 0}`;
    this.frames = 0;
    this.maxCalls = 0;
    this.windowStart = now;
  }

  dispose() {
    this.el.remove();
  }
}
