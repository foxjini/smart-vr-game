import * as THREE from 'three';
import type { TargetKeyword } from '@/types';
import { PALETTE, cssColor, cssRgba } from './palette';
import { asCanvasTexture } from './renderSetup';
import { FONT_NUM, FONT_UI } from './fonts';

type Entry = { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; points: number };

/**
 * 표적 위 키워드 라벨과 명중 점수 팝업("+2 정보")의 캔버스 텍스처.
 * 키워드가 6개뿐이라 키워드마다 한 번만 그려 모든 표적이 함께 씀 (VRAM 누수 없음).
 * 별표·이모지는 Quest 글꼴에 없을 수 있어 쓰지 않음
 */
export class TargetLabels {
  private labels = new Map<TargetKeyword, Entry & { material: THREE.SpriteMaterial }>();
  private popups = new Map<TargetKeyword, Entry>();

  /** 표적 라벨 재질 (모든 같은 키워드 표적이 공유) */
  labelMaterial(keyword: TargetKeyword, points: number): THREE.SpriteMaterial {
    let entry = this.labels.get(keyword);
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      drawLabel(canvas, keyword, points);
      // 멀리 있어도 깨지지 않도록 밉맵, 손에 든 총보다 앞에 그려지지 않도록 깊이 검사
      const texture = asCanvasTexture(canvas, true);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      entry = { canvas, texture, points, material };
      this.labels.set(keyword, entry);
    }
    return entry.material;
  }

  /** 명중 팝업 텍스처 */
  popupTexture(keyword: TargetKeyword, points: number): THREE.Texture {
    let entry = this.popups.get(keyword);
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      drawPopup(canvas, keyword, points);
      entry = { canvas, texture: asCanvasTexture(canvas, true), points };
      this.popups.set(keyword, entry);
    }
    return entry.texture;
  }

  /** 웹 폰트를 불러온 뒤 다시 그림 */
  refresh() {
    this.labels.forEach((e, keyword) => {
      drawLabel(e.canvas, keyword, e.points);
      e.texture.needsUpdate = true;
    });
    this.popups.forEach((e, keyword) => {
      drawPopup(e.canvas, keyword, e.points);
      e.texture.needsUpdate = true;
    });
  }

  dispose() {
    this.labels.forEach((e) => {
      e.material.dispose();
      e.texture.dispose();
    });
    this.popups.forEach((e) => e.texture.dispose());
    this.labels.clear();
    this.popups.clear();
  }
}

/** 표적 라벨: 2점은 금색 테두리·글자, 1점은 중립색 (팀 색과 겹치지 않게) */
function drawLabel(canvas: HTMLCanvasElement, keyword: TargetKeyword, points: number) {
  const ctx = canvas.getContext('2d')!;
  const bonus = points === 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = bonus ? 'rgba(30, 22, 2, 0.9)' : 'rgba(10, 16, 30, 0.86)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 112, 20);
  ctx.fill();
  ctx.lineWidth = bonus ? 6 : 3;
  ctx.strokeStyle = bonus ? cssColor(PALETTE.gold) : cssRgba(PALETTE.fg2, 0.7);
  ctx.stroke();

  // 위쪽 점수 띠
  ctx.fillStyle = bonus ? cssColor(PALETTE.gold) : cssRgba(PALETTE.fg2, 0.22);
  ctx.beginPath();
  ctx.roundRect(78, 14, 100, 30, 15);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = bonus ? cssColor(PALETTE.ink) : cssColor(PALETTE.fg);
  ctx.font = `800 21px ${FONT_UI}`;
  ctx.fillText(bonus ? '2점' : '1점', 128, 30);

  ctx.fillStyle = bonus ? cssColor(PALETTE.gold) : '#ffffff';
  ctx.font = `900 58px ${FONT_UI}`;
  ctx.fillText(keyword, 128, 84);
}

/** 명중 팝업: "+2 정보" (2점 금색, 1점 흰색), 어두운 그림자로 밝은 배경에서도 보이게 */
function drawPopup(canvas: HTMLCanvasElement, keyword: TargetKeyword, points: number) {
  const ctx = canvas.getContext('2d')!;
  const bonus = points === 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 10;

  const main = bonus ? cssColor(PALETTE.gold) : '#ffffff';
  ctx.font = `700 76px ${FONT_NUM}`;
  const plus = `+${points}`;
  const plusWidth = ctx.measureText(plus).width;
  ctx.font = `900 44px ${FONT_UI}`;
  const wordWidth = ctx.measureText(keyword).width;
  const gap = 12;
  const start = (canvas.width - (plusWidth + gap + wordWidth)) / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = main;
  ctx.font = `700 76px ${FONT_NUM}`;
  ctx.fillText(plus, start, 66);
  ctx.fillStyle = bonus ? cssColor(PALETTE.gold) : cssColor(PALETTE.fg);
  ctx.font = `900 44px ${FONT_UI}`;
  ctx.fillText(keyword, start + plusWidth + gap, 70);
}
