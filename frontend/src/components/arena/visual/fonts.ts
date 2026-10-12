/**
 * 캔버스에 그리는 글자(표적 라벨·OLED·결과판)용 폰트.
 * 이름은 globals.css의 @font-face와 같아야 함 (파일은 public/fonts, 인터넷 없이 동작).
 */
export const FONT_UI = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
export const FONT_NUM = "'Rajdhani', 'Pretendard', 'Malgun Gothic', sans-serif";

/**
 * 캔버스에 그리기 전에 웹 폰트를 불러옴.
 * 캔버스는 폰트가 아직 없으면 기본 글꼴로 그리므로, 불러온 뒤 한 번 더 그려야 함.
 */
export function loadCanvasFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load("700 32px 'Pretendard'", '가A1'),
    document.fonts.load("900 32px 'Pretendard'", '가A1'),
    document.fonts.load("600 32px 'Rajdhani'", 'A1'),
    document.fonts.load("700 32px 'Rajdhani'", 'A1'),
  ]).then(
    () => undefined,
    () => undefined
  );
}
