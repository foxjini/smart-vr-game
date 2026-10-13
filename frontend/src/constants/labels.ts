import { ClientRole, Difficulty, SpectatorCameraMode, TargetKeyword, TargetShape, ThemeType } from '@/types';

/**
 * 화면 전체에서 같은 이름을 쓰기 위한 명칭표.
 * 관람객이 중학생이므로 짧고 쉬운 한국어를 우선함.
 */

/** 역할 짧은 이름 (점수판·칩) */
export const ROLE_SHORT: Record<ClientRole, string> = {
  P1: '1P',
  P2: '2P',
  SPECTATOR: '관전',
};

/** 역할 긴 이름 (메뉴·결과·설정) */
export const ROLE_NAME: Record<ClientRole, string> = {
  P1: '플레이어 1',
  P2: '플레이어 2',
  SPECTATOR: '관전 모니터',
};

/** 팀 색 이름 */
export const TEAM_COLOR_NAME: Record<1 | 2, string> = {
  1: '시안',
  2: '마젠타',
};

export const AI_NAME = 'AI 라이벌';

export const DIFFICULTY_NAME: Record<Difficulty, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

/** 난이도 설명 (표적 속도·크기와 AI 실력이 함께 바뀜) */
export const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: '표적이 크고 느려요 · AI도 느긋해요',
  normal: '처음 해 보는 사람에게 추천',
  hard: '작고 빠른 표적 · AI가 아주 빨라요',
};

export const THEME_NAME: Record<ThemeType, string> = {
  cyber: '사이버 아레나',
  space: '딥 스페이스',
  city: '네온 시티',
};

export const SHAPE_NAME: Record<TargetShape, string> = {
  drone: '드론',
  sphere: '구체',
  cube: '큐브',
  disc: '디스크',
};

/** 관전 카메라 이름 (숫자 키 1~4 순서) */
export const CAMERA_ORDER: SpectatorCameraMode[] = ['STADIUM', 'P1_VIEW', 'P2_VIEW', 'ORBIT'];
export const CAMERA_NAME: Record<SpectatorCameraMode, string> = {
  STADIUM: '스타디움',
  P1_VIEW: '1P 시점',
  P2_VIEW: '2P 시점',
  ORBIT: '궤도 회전',
};

/**
 * 표적 문구별 점수 (엔진이 표적을 만들 때도 이 표를 씀).
 * 정보·통신 2점, 제어·회로·인공·전자 1점.
 * 기계·전기는 맞히면 1점이 깎이는 감점 표적
 */
export const KEYWORDS_2PT = ['정보', '통신'] as const;
export const KEYWORDS_1PT = ['제어', '회로', '인공', '전자'] as const;
export const KEYWORDS_MINUS = ['기계', '전기'] as const;
/** 감점 표적의 점수 */
export const MINUS_POINTS = -1;

/** 표적 문구의 점수 */
export function keywordPoints(keyword: TargetKeyword): number {
  if ((KEYWORDS_2PT as readonly string[]).includes(keyword)) return 2;
  if ((KEYWORDS_MINUS as readonly string[]).includes(keyword)) return MINUS_POINTS;
  return 1;
}

/** 경기 시간 (초) */
export const MATCH_SECONDS = 60;
