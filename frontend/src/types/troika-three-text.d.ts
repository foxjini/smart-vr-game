// troika-three-text 0.52에 들어 있는 타입 선언은 Text가 Mesh를 상속하지 않는 등 실제와 달라서,
// 이 프로젝트에서 쓰는 부분만 직접 선언함
declare module 'troika-three-text' {
  import { BufferGeometry, Color, Material, Mesh } from 'three';

  export class Text extends Mesh<BufferGeometry, Material> {
    text: string;
    /** .ttf · .otf · .woff 주소 (.woff2는 지원하지 않음) */
    font: string | null;
    fontSize: number;
    color: number | string | Color | null;
    anchorX: number | 'left' | 'center' | 'right' | `${number}%`;
    anchorY: number | 'top' | 'top-baseline' | 'top-cap' | 'top-ex' | 'middle' | 'bottom-baseline' | 'bottom' | `${number}%`;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    letterSpacing: number;
    lineHeight: number | 'normal';
    maxWidth: number;
    whiteSpace: 'normal' | 'nowrap';
    overflowWrap: 'normal' | 'break-word';
    fillOpacity: number;
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    depthOffset: number;
    sdfGlyphSize: number | null;
    gpuAccelerateSDF: boolean;
    /** 글자 배치가 끝난 뒤 채워지는 정보 (blockBounds: [minX, minY, maxX, maxY]) */
    textRenderInfo: { blockBounds: [number, number, number, number] } | null;
    /** 바뀐 속성을 반영 (비동기, 끝나면 callback) */
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export function configureTextBuilder(config: {
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
    sdfExponent?: number;
    sdfMargin?: number;
    textureWidth?: number;
    useWorker?: boolean;
  }): void;

  export function preloadFont(
    options: { font?: string | null; characters: string | string[]; sdfGlyphSize?: number },
    callback: () => void
  ): void;
}
