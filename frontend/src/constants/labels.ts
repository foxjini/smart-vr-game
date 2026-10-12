import { ClientRole, Difficulty, TargetShape, ThemeType } from '@/types';

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
