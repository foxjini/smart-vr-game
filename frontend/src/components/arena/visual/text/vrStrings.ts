import { AI_NAME, ROLE_NAME } from '@/constants/labels';

/**
 * VR 안 3D 글자(troika)에 쓰는 문구를 한곳에 모음.
 * 시작할 때 여기에 있는 글자로 글리프를 미리 만들어 경기 중 새 글자 때문에 멈칫하지 않게 함.
 * Quest 글꼴에 없을 수 있는 이모지·★·✓는 쓰지 않음
 */
export const VR_TEXT = {
  // 점수판
  ready: 'READY',
  paused: '일시정지',
  p1: '1P',
  p2: '2P',
  ai: 'AI',
  // 시작·종료 연출
  go: 'GO!',
  timeUp: 'TIME UP',
  // 결과판
  resultTitle: '경기 결과',
  aborted: '경기 중단',
  replaced: '같은 역할로 새로 접속됨',
  slotBusy: '내 자리를 다른 기기가 사용 중',
  me: '나',
  score: '점수',
  hits: '명중',
  accuracy: '명중률',
  bestCombo: '최고 연속',
  restartHint: '트리거: 다시 시작',
  // 경기 밖에서는 그립·A·B·X·Y를 누르는 즉시 VR이 끝남 (경기 중 A·B·X·Y는 1.2초 길게)
  exitHint: '그립 또는 A·B 버튼: VR 종료',
  // 결과판 승자 문구 (ui/matchInfo.ts의 winnerHeadline과 같은 글자)
  win1: '1P 승리',
  win2: '2P 승리',
  winAi: `${AI_NAME} 승리`,
  draw: '무승부',
  // 선수 이름
  name1: ROLE_NAME.P1,
  name2: ROLE_NAME.P2,
  nameAi: AI_NAME,
  // 개발용 성능 표시
  fps: 'FPS',
  draws: 'DRAW',
} as const;

const DIGITS = '0123456789';
const SYMBOLS = ' :-%+x.!·/';

function uniqueChars(...parts: string[]): string {
  return [...new Set(parts.join(''))].join('');
}

/** 미리 만들 글리프: 한글·문장은 Pretendard, 숫자·영문은 Rajdhani */
export const VR_GLYPHS = {
  ui: uniqueChars(...Object.values(VR_TEXT), DIGITS, SYMBOLS),
  num: uniqueChars(DIGITS, SYMBOLS, 'READYGOTIMEUPAIFSDRW', '1P2P'),
};
