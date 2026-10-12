import { AI_NAME, ROLE_NAME } from '@/constants/labels';
import { ClientRole } from '@/types';

export type Slot = 1 | 2;
export type Winner = 'P1' | 'P2' | 'DRAW';

/** 끝난 경기 요약 (관전 화면 결과·최근 경기 목록) */
export interface MatchResultSummary {
  winner: Winner;
  p1Score: number;
  p2Score: number;
  p1Hits: number;
  p2Hits: number;
  p1Accuracy: number;
  p2Accuracy: number;
  p1MaxCombo: number;
  p2MaxCombo: number;
  /** 발사 수 (이 항목이 없는 예전 기록은 명중률을 숫자로 표시) */
  p1Shots?: number;
  p2Shots?: number;
  aiSlot: Slot | null;
  endedAt: number;
}

/**
 * AI 라이벌이 맡은 자리 (친구 대결이면 null).
 * 서버 경기는 비어 있는 자리를 AI가 맡고, 서버 정보가 없으면(혼자 연습) 내 상대 자리.
 * 모든 화면이 같은 방 정보(room_state)를 받으므로 결과 문구가 화면마다 같게 나옴
 */
export function aiSlotOf(
  mode: 'VERSUS_PVP' | 'VERSUS_AI' | undefined,
  p1Connected: boolean,
  p2Connected: boolean,
  role: ClientRole
): Slot | null {
  if (mode === 'VERSUS_PVP') return null;
  if (p1Connected && !p2Connected) return 2;
  if (p2Connected && !p1Connected) return 1;
  return role === 'P2' ? 1 : 2;
}

/** 자리 이름: '플레이어 1' / '플레이어 2' / 'AI 라이벌' */
export function slotName(slot: Slot, aiSlot: Slot | null): string {
  if (slot === aiSlot) return AI_NAME;
  return slot === 1 ? ROLE_NAME.P1 : ROLE_NAME.P2;
}

/** 내 자리 (관전은 null) */
export function localSlotOf(role: ClientRole): Slot | null {
  return role === 'P1' ? 1 : role === 'P2' ? 2 : null;
}

export function normalizeWinner(winner: string | undefined, p1Score: number, p2Score: number): Winner {
  if (winner === 'P1' || winner === 'P2' || winner === 'DRAW') return winner;
  return p1Score > p2Score ? 'P1' : p2Score > p1Score ? 'P2' : 'DRAW';
}

/**
 * 결과 배너 문구. 모든 화면(1P·2P·관전)에 같은 문구가 나와야 하므로 한 곳에서만 만듦.
 * 형식 '[ 승리 ] …' / '[ 무승부 ] …'는 자동 점검(E2E)이 찾는 표시이므로 유지
 */
export function winnerBannerText(winner: Winner, aiSlot: Slot | null): string {
  if (winner === 'DRAW') return '[ 무승부 ] 치열한 접전 무승부';
  const slot: Slot = winner === 'P1' ? 1 : 2;
  if (slot === aiSlot) return `[ 승리 ] ${AI_NAME} 승리!`;
  return slot === 1 ? '[ 승리 ] 플레이어 1 (시안) 승리!' : '[ 승리 ] 플레이어 2 (마젠타) 승리!';
}

/** 큰 승리 문구 (괄호 없는 연출용): '1P 승리' / 'AI 라이벌 승리' / '무승부' */
export function winnerHeadline(winner: Winner, aiSlot: Slot | null): string {
  if (winner === 'DRAW') return '무승부';
  const slot: Slot = winner === 'P1' ? 1 : 2;
  if (slot === aiSlot) return `${AI_NAME} 승리`;
  return `${slot}P 승리`;
}

/**
 * 화면에 보일 명중률: 한 발도 쏘지 않았으면 null('-'로 표시).
 * 엔진은 0발일 때 100으로 계산하므로 화면에서만 바꿈
 */
export function shownAccuracy(accuracy: number, shots: number | undefined): number | null {
  return shots === 0 ? null : accuracy;
}

/** 남은 시간 표시 '0:42' */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
