import { LeaderboardEntry } from '@/types';

// 표적당 1~2점 배점으로 바뀌면서 이전(수백~수천 점 단위) 기록과 비교할 수 없어 저장 키를 분리
const STORAGE_KEY = 'cyber_strike_vr_leaderboard_v2';

// 예시 기록: 60초 경기에서 실제로 나올 수 있는 점수대 (정보·통신 2점, 나머지 1점)
const DEFAULT_ENTRIES: LeaderboardEntry[] = [
  {
    id: 'entry-1',
    playerName: 'CYBER_GUNNER',
    score: 32,
    accuracy: 88,
    maxCombo: 9,
    difficulty: 'hard',
    theme: 'cyber',
    date: '2026-09-28'
  },
  {
    id: 'entry-2',
    playerName: 'APEX_STRIKER',
    score: 27,
    accuracy: 84,
    maxCombo: 7,
    difficulty: 'hard',
    theme: 'space',
    date: '2026-09-29'
  },
  {
    id: 'entry-3',
    playerName: 'VR_SNIPER_KR',
    score: 22,
    accuracy: 80,
    maxCombo: 6,
    difficulty: 'normal',
    theme: 'city',
    date: '2026-09-29'
  },
  {
    id: 'entry-4',
    playerName: 'NEO_PHANTOM',
    score: 17,
    accuracy: 75,
    maxCombo: 5,
    difficulty: 'normal',
    theme: 'cyber',
    date: '2026-09-30'
  },
  {
    id: 'entry-5',
    playerName: 'PILOT_ZERO',
    score: 12,
    accuracy: 70,
    maxCombo: 4,
    difficulty: 'easy',
    theme: 'space',
    date: '2026-09-30'
  }
];

export class LeaderboardManager {
  private static instance: LeaderboardManager;

  private constructor() {
    this.ensureInitialized();
  }

  public static getInstance(): LeaderboardManager {
    if (!LeaderboardManager.instance) {
      LeaderboardManager.instance = new LeaderboardManager();
    }
    return LeaderboardManager.instance;
  }

  private ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ENTRIES));
      }
    } catch (e) {
      console.warn('Failed to access localStorage for leaderboard:', e);
    }
  }

  public getTopScores(limit: number = 10): LeaderboardEntry[] {
    if (typeof window === 'undefined') return DEFAULT_ENTRIES.slice(0, limit);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_ENTRIES.slice(0, limit);
      const entries: LeaderboardEntry[] = JSON.parse(raw);
      return entries.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (e) {
      console.error('Failed to parse leaderboard data:', e);
      return DEFAULT_ENTRIES.slice(0, limit);
    }
  }

  public addEntry(entry: Omit<LeaderboardEntry, 'id' | 'date'>): LeaderboardEntry {
    const today = new Date().toISOString().split('T')[0];
    const newEntry: LeaderboardEntry = {
      ...entry,
      id: `entry-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: today,
    };

    if (typeof window === 'undefined') return newEntry;

    try {
      const current = this.getTopScores(50);
      const updated = [...current, newEntry].sort((a, b) => b.score - a.score).slice(0, 20);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save score to leaderboard:', e);
    }

    return newEntry;
  }

  public isTopTen(score: number): boolean {
    const top = this.getTopScores(10);
    if (top.length < 10) return true;
    return score > (top[top.length - 1]?.score ?? 0);
  }

  public resetToDefault(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ENTRIES));
  }
}
