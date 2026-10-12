import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import { PALETTE, cssColor, cssRgba } from './palette';
import { asCanvasTexture } from './renderSetup';
import { HoloTextFactory } from './text/HoloText';
import { VR_TEXT } from './text/vrStrings';

/** 결과판 크기(m): 리그 기준 (0, 1.6, -2.5)에 두고 보면 시야 약 55도 */
const PANEL_W = 2.6;
const PANEL_H = 1.62;
const CANVAS_W = 1024;
const CANVAS_H = 638;
/** 캔버스 픽셀 → 패널 좌표(m) */
const px = (x: number) => (x / CANVAS_W - 0.5) * PANEL_W;
const py = (y: number) => (0.5 - y / CANVAS_H) * PANEL_H;

export interface ResultPlayer {
  name: string;
  score: number;
  hits: number;
  accuracy: number;
  shots: number;
  maxCombo: number;
}

export interface ResultData {
  /** 승자 문구 ('1P 승리', '무승부', '경기 중단' 등) */
  headline: string;
  headlineColor: number;
  /** 이긴 자리 (무승부·중단이면 null) */
  winSlot: 1 | 2 | null;
  /** 이 화면 선수의 자리 (관전은 null) */
  mySlot: 1 | 2 | null;
  p1: ResultPlayer;
  p2: ResultPlayer;
}

interface Card {
  name: Text;
  score: Text;
  stats: Text;
}

/**
 * VR 결과판 (경기가 끝나면 선수 정면에 보임).
 * 뒤판(카드 테두리·띠)은 캔버스, 글자는 troika로 그려 가까이서도 선명함. 이모지는 쓰지 않음.
 * mesh는 엔진의 vrPromptMesh로 쓰여 위치(리그의 0, 1.6, -2.5)와 보이기 여부를 엔진이 정함
 */
export class ResultPanel {
  readonly mesh: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private title: Text;
  private headline: Text;
  private me: Text;
  private hint: Text;
  private cards: Record<1 | 2, Card>;
  private last?: ResultData;

  constructor(texts: HoloTextFactory) {
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = asCanvasTexture(this.canvas, true);
    // 선수 바로 앞의 판이므로 가장 나중에 그리고 깊이를 기록해, 뒤에 있는 점수판·연출·조준점이 비쳐 보이지 않게 함
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide, depthWrite: true, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), mat);
    this.mesh.renderOrder = 40;
    this.mesh.raycast = () => {};

    const z = 0.006;
    const add = (t: Text, x: number, y: number) => {
      t.renderOrder = 41;
      t.position.set(px(x), py(y), z);
      this.mesh.add(t);
      return t;
    };
    this.title = add(texts.create({ text: VR_TEXT.resultTitle, size: 0.06, color: PALETTE.fg2 }), CANVAS_W / 2, 48);
    this.headline = add(texts.create({ text: '', size: 0.15, color: PALETTE.fg }), CANVAS_W / 2, 112);
    const card = (slot: 1 | 2, cx: number): Card => ({
      name: add(texts.create({ text: '', size: 0.075, color: slot === 1 ? PALETTE.p1 : PALETTE.p2 }), cx, 222),
      score: add(texts.create({ text: '0', font: 'num', size: 0.26, color: 0xffffff }), cx, 318),
      stats: add(texts.create({ text: '', size: 0.058, color: PALETTE.fg2, lineHeight: 1.45 }), cx, 450),
    });
    this.cards = { 1: card(1, 262), 2: card(2, 762) };
    this.me = add(texts.create({ text: VR_TEXT.me, size: 0.05, color: PALETTE.ink }), 0, 0);
    this.hint = add(
      texts.create({ text: `${VR_TEXT.restartHint}    ·    ${VR_TEXT.exitHint}`, size: 0.064, color: PALETTE.fg }),
      CANVAS_W / 2,
      588
    );
    this.drawBackground(null, null);
  }

  show(data: ResultData) {
    this.last = data;
    HoloTextFactory.set(this.headline, data.headline, data.headlineColor);
    ([1, 2] as const).forEach((slot) => {
      const p = slot === 1 ? data.p1 : data.p2;
      const c = this.cards[slot];
      HoloTextFactory.set(c.name, p.name);
      HoloTextFactory.set(c.score, String(p.score));
      const acc = p.shots > 0 ? `${p.accuracy}%` : '-';
      HoloTextFactory.set(c.stats, `${VR_TEXT.hits} ${p.hits}\n${VR_TEXT.accuracy} ${acc}\n${VR_TEXT.bestCombo} ${p.maxCombo}`);
    });
    // '나' 표시: 내 카드 왼쪽 위
    this.me.visible = data.mySlot !== null;
    if (data.mySlot !== null) {
      const cx = data.mySlot === 1 ? 262 : 762;
      this.me.position.set(px(cx - 154), py(196), 0.006);
    }
    this.drawBackground(data.winSlot, data.mySlot);
  }

  /** 폰트를 불러온 뒤 같은 내용으로 다시 그림 */
  refresh() {
    if (this.last) this.show(this.last);
  }

  /** 뒤판: 어두운 패널, 위쪽 띠, 두 선수 카드 (이긴 쪽은 테두리를 굵게, 내 카드에는 '나' 배지 자리) */
  private drawBackground(winSlot: 1 | 2 | null, mySlot: 1 | 2 | null) {
    const ctx = this.ctx;
    const w = CANVAS_W;
    const h = CANVAS_H;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6, 10, 20, 0.94)';
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, 32);
    ctx.fill();
    ctx.strokeStyle = cssRgba(PALETTE.fg2, 0.4);
    ctx.lineWidth = 3;
    ctx.stroke();
    // 위쪽 띠 (1P 시안 → 2P 마젠타)
    const grad = ctx.createLinearGradient(60, 0, w - 60, 0);
    grad.addColorStop(0, cssColor(PALETTE.p1));
    grad.addColorStop(1, cssColor(PALETTE.p2));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(60, 150, w - 120, 6, 3);
    ctx.fill();

    ([1, 2] as const).forEach((slot) => {
      const x = slot === 1 ? 40 : 540;
      const color = slot === 1 ? PALETTE.p1 : PALETTE.p2;
      const won = winSlot === slot;
      ctx.fillStyle = cssRgba(color, won ? 0.16 : 0.08);
      ctx.beginPath();
      ctx.roundRect(x, 176, 444, 362, 24);
      ctx.fill();
      ctx.strokeStyle = cssRgba(color, won ? 1 : 0.55);
      ctx.lineWidth = won ? 6 : 3;
      ctx.stroke();
      if (slot === mySlot) {
        // '나' 배지 바탕
        ctx.fillStyle = cssColor(color);
        ctx.beginPath();
        ctx.roundRect(x + 22, 196 - 22, 92, 44, 22);
        ctx.fill();
      }
    });
    // 아래 안내 띠
    ctx.fillStyle = cssRgba(PALETTE.fg2, 0.1);
    ctx.beginPath();
    ctx.roundRect(40, 556, w - 80, 64, 20);
    ctx.fill();
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
