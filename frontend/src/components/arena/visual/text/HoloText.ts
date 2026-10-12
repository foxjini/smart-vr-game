import * as THREE from 'three';
import { Text, configureTextBuilder, preloadFont } from 'troika-three-text';
import { VR_GLYPHS } from './vrStrings';

/** VR 글자 폰트 (troika는 woff2를 못 읽어 woff를 씀, 둘 다 public/fonts에 있어 오프라인 동작) */
export const VR_FONT_UI = '/fonts/Pretendard-Bold.subset.woff';
export const VR_FONT_NUM = '/fonts/rajdhani-latin-700-normal.woff';

let configured = false;

/**
 * troika 전역 설정 (한 번만).
 * 기본 폰트와 없는 글자용 대체 폰트 주소를 모두 이 서버로 지정해 인터넷(CDN) 요청이 생기지 않게 함.
 * VR 문구의 글자는 모두 두 폰트에 들어 있어 대체 폰트는 실제로 쓰이지 않음
 */
function configureOnce() {
  if (configured) return;
  configured = true;
  configureTextBuilder({
    defaultFontURL: VR_FONT_UI,
    unicodeFontsURL: '/fonts/unicode-fallback',
    sdfGlyphSize: 64,
  });
}

export interface HoloTextOptions {
  text?: string;
  /** 'ui': 한글·문장(Pretendard), 'num': 숫자·영문(Rajdhani) */
  font?: 'ui' | 'num';
  /** 글자 높이(m) */
  size: number;
  color?: number;
  anchorX?: Text['anchorX'];
  anchorY?: Text['anchorY'];
  textAlign?: Text['textAlign'];
  maxWidth?: number;
  letterSpacing?: number;
  lineHeight?: number;
  renderOrder?: number;
}

/**
 * VR 안 글자를 만들고 한꺼번에 정리하는 묶음 (엔진마다 하나).
 * 모든 글자가 하나의 기본 재질을 함께 써서, 재질을 해제하면 troika가 만든 재질도 함께 해제됨
 */
export class HoloTextFactory {
  /** 색은 그린 그대로(tone mapping 없음), 안개 없음, 뒤 패널과 겹쳐도 깜빡이지 않게 깊이 기록 안 함 */
  private material = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, transparent: true, depthWrite: false });
  private texts = new Set<Text>();

  constructor() {
    configureOnce();
  }

  /** 시작할 때 VR 문구의 글리프를 미리 만듦 (경기 중 처음 나오는 글자 때문에 멈칫하지 않게) */
  preload(onDone?: () => void) {
    let left = 2;
    const done = () => {
      left -= 1;
      if (left === 0) onDone?.();
    };
    preloadFont({ font: VR_FONT_UI, characters: VR_GLYPHS.ui }, done);
    preloadFont({ font: VR_FONT_NUM, characters: VR_GLYPHS.num }, done);
  }

  create(o: HoloTextOptions): Text {
    const t = new Text();
    t.material = this.material;
    t.font = o.font === 'num' ? VR_FONT_NUM : VR_FONT_UI;
    t.fontSize = o.size;
    t.text = o.text ?? '';
    t.color = o.color ?? 0xffffff;
    t.anchorX = o.anchorX ?? 'center';
    t.anchorY = o.anchorY ?? 'middle';
    t.textAlign = o.textAlign ?? 'center';
    if (o.maxWidth) t.maxWidth = o.maxWidth;
    if (o.letterSpacing) t.letterSpacing = o.letterSpacing;
    if (o.lineHeight) t.lineHeight = o.lineHeight;
    t.renderOrder = o.renderOrder ?? 20;
    t.raycast = () => {};
    t.sync();
    this.texts.add(t);
    return t;
  }

  /** 글자 내용·색이 바뀔 때만 다시 배치 (같으면 아무것도 하지 않음) */
  static set(t: Text, text: string, color?: number) {
    let changed = false;
    if (t.text !== text) {
      t.text = text;
      changed = true;
    }
    if (color !== undefined && t.color !== color) {
      t.color = color;
      changed = true;
    }
    if (changed) t.sync();
  }

  dispose() {
    this.texts.forEach((t) => {
      t.removeFromParent();
      t.dispose();
    });
    this.texts.clear();
    this.material.dispose();
  }
}
