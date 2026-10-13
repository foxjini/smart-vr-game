import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import { PALETTE, cssColor, cssRgba } from './palette';
import { asCanvasTexture } from './renderSetup';
import { GATE } from './arena/structures';
import { HoloTextFactory } from './text/HoloText';
import { VR_TEXT } from './text/vrStrings';
import { tugShare } from '@/components/ui/matchInfo';

/** 점수판 크기(m)와 위치: 게이트 고리 안쪽 위 (표적 구역 뒤라 표적을 가리지 않음) */
const BOARD_W = 8.4;
const BOARD_H = 2.4;
const BOARD_POS = new THREE.Vector3(0, GATE.y + 7.1, GATE.z + 0.4);
/** 시작·종료 문구 위치: 게이트 앞, 표적 뒤 */
const CUE_POS = new THREE.Vector3(0, GATE.y + 0.7, GATE.z + 3);

export interface ScoreboardState {
  mode: 'idle' | 'playing' | 'paused';
  /** 남은 시간(초) */
  seconds: number;
  p1: number;
  p2: number;
  /** 10초 이하 경고 */
  warning: boolean;
  label1: string;
  label2: string;
}

/**
 * 경기장 홀로그램 점수판: "1P 점수 | 남은 시간 | 2P 점수"와 줄다리기 막대.
 * 글자는 바뀔 때만 다시 배치하고, 막대는 점수가 바뀔 때만 다시 그림.
 * 시작 "GO!"·종료 "TIME UP" 연출도 여기서 보여 줌
 */
export class HoloScoreboard {
  readonly root = new THREE.Group();
  private board = new THREE.Group();
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private panel: THREE.Mesh;
  private label1: Text;
  private label2: Text;
  private score1: Text;
  private score2: Text;
  private timer: Text;
  private cueText: Text;
  private cueAge = -1;
  private barKey = '';

  constructor(texts: HoloTextFactory) {
    this.root.name = 'holo-scoreboard';
    this.canvas.width = 1024;
    this.canvas.height = 292;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = asCanvasTexture(this.canvas, true);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), mat);
    // 표적 구역 뒤에 있으므로 투명한 물체 중 가장 먼저 그림 (가까운 표적 라벨·효과가 위에 보이게)
    this.panel.renderOrder = -6;
    this.panel.raycast = () => {};
    this.board.add(this.panel);

    const z = 0.02;
    this.label1 = texts.create({ text: VR_TEXT.p1, font: 'num', size: 0.75, color: PALETTE.p1, anchorX: 'left', renderOrder: -5 });
    this.label1.position.set(-BOARD_W / 2 + 0.45, 0.6, z);
    this.score1 = texts.create({ text: '0', font: 'num', size: 1.45, color: PALETTE.p1, anchorX: 'left', renderOrder: -5 });
    this.score1.position.set(-BOARD_W / 2 + 0.45, -0.3, z);
    this.label2 = texts.create({ text: VR_TEXT.p2, font: 'num', size: 0.75, color: PALETTE.p2, anchorX: 'right', renderOrder: -5 });
    this.label2.position.set(BOARD_W / 2 - 0.45, 0.6, z);
    this.score2 = texts.create({ text: '0', font: 'num', size: 1.45, color: PALETTE.p2, anchorX: 'right', renderOrder: -5 });
    this.score2.position.set(BOARD_W / 2 - 0.45, -0.3, z);
    this.timer = texts.create({ text: VR_TEXT.ready, font: 'num', size: 1.25, color: PALETTE.fg2, renderOrder: -5 });
    this.timer.position.set(0, 0.12, z);
    this.board.add(this.label1, this.score1, this.label2, this.score2, this.timer);
    this.board.position.copy(BOARD_POS);
    this.root.add(this.board);

    this.cueText = texts.create({ text: VR_TEXT.go, font: 'num', size: 3.2, color: 0xffffff, renderOrder: -4 });
    this.cueText.position.copy(CUE_POS);
    this.cueText.visible = false;
    this.root.add(this.cueText);

    this.drawPanel(0, 0);
  }

  /** 매 프레임 호출해도 됨 (바뀐 것만 다시 그림) */
  update(s: ScoreboardState, time: number) {
    HoloTextFactory.set(this.label1, s.label1);
    HoloTextFactory.set(this.label2, s.label2);
    HoloTextFactory.set(this.score1, String(s.p1));
    HoloTextFactory.set(this.score2, String(s.p2));
    if (s.mode === 'idle') {
      HoloTextFactory.set(this.timer, VR_TEXT.ready, PALETTE.fg2);
    } else if (s.mode === 'paused') {
      HoloTextFactory.set(this.timer, VR_TEXT.paused, PALETTE.gold);
    } else {
      const sec = Math.max(0, Math.ceil(s.seconds));
      HoloTextFactory.set(this.timer, `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, s.warning ? PALETTE.danger : PALETTE.fg);
    }
    // 10초 이하이면 시간이 살짝 두근거림
    this.timer.scale.setScalar(s.mode === 'playing' && s.warning ? 1 + 0.06 * Math.max(0, Math.sin(time * 6.3)) : 1);
    this.drawPanel(s.p1, s.p2);
  }

  /** 시작 "GO!" / 종료 "TIME UP" (약 1.2초) */
  cue(kind: 'go' | 'timeUp') {
    HoloTextFactory.set(this.cueText, kind === 'go' ? VR_TEXT.go : VR_TEXT.timeUp, kind === 'go' ? PALETTE.p1 : PALETTE.gold);
    this.cueAge = 0;
    this.cueText.visible = true;
  }

  tick(dt: number) {
    if (this.cueAge < 0) return;
    this.cueAge += dt;
    const t = this.cueAge;
    if (t >= 1.25) {
      this.cueAge = -1;
      this.cueText.visible = false;
      return;
    }
    // 커지며 나타났다가(0.25초) 잠시 머문 뒤 흐려짐
    const grow = Math.min(1, t / 0.25);
    const c1 = 1.70158;
    const pop = 1 + (c1 + 1) * Math.pow(grow - 1, 3) + c1 * Math.pow(grow - 1, 2);
    this.cueText.scale.setScalar(0.6 + 0.4 * pop);
    this.cueText.fillOpacity = t < 0.85 ? 1 : Math.max(0, 1 - (t - 0.85) / 0.4);
  }

  /** 뒤판: 어두운 패널, 양쪽 팀 색 띠, 아래 줄다리기 막대 (점수가 바뀔 때만) */
  private drawPanel(p1: number, p2: number) {
    const key = `${p1}:${p2}`;
    if (key === this.barKey) return;
    this.barKey = key;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6, 10, 20, 0.78)';
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 28);
    ctx.fill();
    ctx.strokeStyle = cssRgba(PALETTE.fg2, 0.35);
    ctx.lineWidth = 3;
    ctx.stroke();
    // 양쪽 팀 색 띠
    ctx.fillStyle = cssColor(PALETTE.p1);
    ctx.beginPath();
    ctx.roundRect(4, 34, 10, h - 68, 5);
    ctx.fill();
    ctx.fillStyle = cssColor(PALETTE.p2);
    ctx.beginPath();
    ctx.roundRect(w - 14, 34, 10, h - 68, 5);
    ctx.fill();
    // 줄다리기: 두 선수 점수 비율만큼 (0:0이면 가운데, 감점으로 0보다 작은 점수도 범위 안에)
    const share = tugShare(p1, p2);
    const barX = 300;
    const barW = w - 600;
    const barY = h - 46;
    const mid = barX + barW * share;
    ctx.fillStyle = cssColor(PALETTE.p1);
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(0, mid - barX), 14, 7);
    ctx.fill();
    ctx.fillStyle = cssColor(PALETTE.p2);
    ctx.beginPath();
    ctx.roundRect(mid, barY, Math.max(0, barX + barW - mid), 14, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mid, barY + 7, 12, 0, Math.PI * 2);
    ctx.fill();
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.panel.geometry.dispose();
    (this.panel.material as THREE.Material).dispose();
    this.texture.dispose();
    this.root.removeFromParent();
  }
}
