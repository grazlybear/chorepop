/**
 * Level table from spec.md PHASE 2 — Gamification.
 * Lifetime minutes earned → level + title.
 */

export type Level = {
  level: number;
  title: string;
  minEarned: number;
};

export const LEVELS: Level[] = [
  { level: 1, title: "Rookie", minEarned: 0 },
  { level: 2, title: "Helper", minEarned: 50 },
  { level: 3, title: "Star", minEarned: 150 },
  { level: 4, title: "Champion", minEarned: 400 },
  { level: 5, title: "Superstar", minEarned: 800 },
  { level: 6, title: "Legend", minEarned: 1500 },
  { level: 7, title: "Hero", minEarned: 3000 },
  { level: 8, title: "Master", minEarned: 5000 },
  { level: 9, title: "Grand Master", minEarned: 10000 },
  { level: 10, title: "ChorePop King/Queen", minEarned: 20000 },
];

export type LevelProgress = {
  current: Level;
  next: Level | null;
  /** Whole-number percent toward next level. 100 if maxed. */
  percentToNext: number;
  /** Minutes still needed to reach next level. 0 if maxed. */
  minutesToNext: number;
};

export function levelFor(totalMinutes: number): LevelProgress {
  const total = Math.max(0, Math.floor(totalMinutes));
  let currentIndex = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (total >= LEVELS[i].minEarned) currentIndex = i;
    else break;
  }
  const current = LEVELS[currentIndex];
  const next = LEVELS[currentIndex + 1] ?? null;

  if (!next) {
    return { current, next: null, percentToNext: 100, minutesToNext: 0 };
  }

  const span = next.minEarned - current.minEarned;
  const into = total - current.minEarned;
  const percent = Math.min(100, Math.max(0, Math.round((into / span) * 100)));
  return {
    current,
    next,
    percentToNext: percent,
    minutesToNext: Math.max(0, next.minEarned - total),
  };
}
