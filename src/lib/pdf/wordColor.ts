/**
 * Familiarity tints for the PDF overlay and reflow text.
 *
 * 學習中 (stored 0, and legacy 1–4) is pink-300 (#f9a8d4) at 80% opacity.
 * 認識, 忽略, and words with no state stay uncolored.
 */
import type { FamiliarityLevel } from "../../data/types";
import { familiarityStatus } from "../../data/familiarity";

/** Tailwind pink-300 is #f9a8d4. Dark pages use pink-400 at 55%. */
export const LEARNING_HIGHLIGHT =
  "bg-pink-300/80 hover:bg-pink-400/90 dark:bg-pink-400/55 dark:hover:bg-pink-400/70";

export function familiarityTint(level: FamiliarityLevel | undefined, selected: boolean): string {
  const learning = familiarityStatus(level) === "learning";
  if (selected && learning) return `outline outline-2 outline-offset-1 outline-pink-700 shadow-sm bg-pink-300/80 dark:bg-pink-400/55`;
  if (selected) return "outline outline-2 outline-offset-1 outline-slate-500 shadow-sm bg-slate-300/35";
  if (learning) return LEARNING_HIGHLIGHT;
  return "hover:bg-slate-400/15";
}

export interface PageWordStats {
  total: number;
  unmarked: number;
  learning: number;
  known: number;
  ignored: number;
}

export function pageWordStats(
  levels: Array<FamiliarityLevel | undefined>,
): PageWordStats {
  const stats: PageWordStats = { total: levels.length, unmarked: 0, learning: 0, known: 0, ignored: 0 };
  for (const level of levels) {
    const status = familiarityStatus(level);
    if (status === "unmarked") stats.unmarked += 1;
    else stats[status] += 1;
  }
  return stats;
}

export function formatPageRatio(stats: PageWordStats): string {
  if (stats.total === 0) return "沒有單字";
  const pct = (n: number) => Math.round((n / stats.total) * 100);
  return `${stats.learning} 學習中 (${pct(stats.learning)}%) · ${stats.known} 認識 (${pct(stats.known)}%)`;
}
