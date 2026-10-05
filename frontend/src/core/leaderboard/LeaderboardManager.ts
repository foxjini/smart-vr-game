import { LeaderboardEntry } from '@/types';

const STORAGE_KEY = 'cyber_strike_vr_leaderboard';

const DEFAULT_ENTRIES: LeaderboardEntry[] = [
  {
    id: 'entry-1',
    playerName: 'CYBER_GUNNER',
    score: 18500,
    accuracy: 94.2,
    maxCombo: 24,
    difficulty: 'hard',
    theme: 'cyber',
    date: '2026-09-28'
  },
  {
    id: 'entry-2',
    playerName: 'APEX_STRIKER',
    score: 15400,
    accuracy: 91.0,
    maxCombo: 19,
    difficulty: 'hard',
    theme: 'space',
    date: '2026-09-29'
  },
  {
    id: 'entry-3',
    playerName: 'VR_SNIPER_KR',
    score: 12800,
    accuracy: 88.5,
    maxCombo: 15,
    difficulty: 'normal',
    theme: 'city',
    date: '2026-09-29'
  },
  {
    id: 'entry-4',
    playerName: 'NEO_PHANTOM',
    score: 10200,
    accuracy: 85.0,
    maxCombo: 12,
    difficulty: 'normal',
    theme: 'cyber',
    date: '2026-09-30'
  },
  {
    id: 'entry-5',
    playerName: 'PILOT_ZERO',
    score: 8400,
    accuracy: 82.1,
    maxCombo: 10,
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
