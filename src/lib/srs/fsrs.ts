/**
 * Simplified FSRS-ish spaced repetition（Round 15）。
 *
 * 真正的 FSRS 4.5 有 17 個參數的機率模型 — 對 Phase 1 過頭。
 * 這裡用簡化版：interval doubling with difficulty modulation，
 * 保留 FSRS 的 stability/difficulty/dueAt 欄位，未來可無痛換成真 FSRS。
 *
 * 規則：
 *   - 使用者主動標「不認識／學習中」時，納入 review 佇列
 *     stability=0.25 day (6h), difficulty=7
 *   - Review 時 4 個 rating：
 *     again → stability = 0.25,      difficulty += 1
 *     hard  → stability *= 1.2,      difficulty += 0.5
 *     good  → stability *= 2.5,      difficulty 不變
 *     easy  → stability *= 3.5,      difficulty -= 0.5
 *   - difficulty clamp [1, 10]，stability clamp [0.25 day, 365 day]
 *   - 連續 good/easy 使 stability > 30 天，認定「掌握」→ level 升到 5（不再進 review）
 *
 * dueAt = lastReviewedAt + stability * 86400000.
 */

import type { WordState, FamiliarityLevel } from "../../data/types";
import { canonicalizeLevel, KNOWN_LEVEL, LEARNING_LEVEL } from "../../data/familiarity";

export type Rating = "again" | "hard" | "good" | "easy";

const DAY_MS = 86_400_000;
const MIN_STABILITY_DAYS = 0.25;   // 6 hours
const MAX_STABILITY_DAYS = 365;
const GRADUATION_DAYS = 30;        // stability 超過此值 → 升為 level 5

interface SrsUpdate {
  stability: number;
  difficulty: number;
  dueAt: number;
  level: FamiliarityLevel;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 給 WordState 一個初始 SRS schedule（使用者第一次標「不認識」時呼叫）。
 */
export function initialSchedule(now: number = Date.now()): SrsUpdate {
  return {
    stability: 0.25,
    difficulty: 7,
    // Due immediately so a word marked this session can be reviewed now.
    // The 6-hour stability applies after the first rating, not before it.
    dueAt: now,
    level: LEARNING_LEVEL,
  };
}

/**
 * 根據 rating 更新 stability/difficulty/dueAt。
 * 若 new stability > GRADUATION_DAYS 且 rating 為 good/easy，提升 level 到 5。
 */
export function applyRating(
  state: Pick<WordState, "fsrsStability" | "fsrsDifficulty" | "level">,
  rating: Rating,
  now: number = Date.now(),
): SrsUpdate {
  const curStab = state.fsrsStability ?? 0.25;
  const curDiff = state.fsrsDifficulty ?? 7;
  let stability = curStab;
  let difficulty = curDiff;

  switch (rating) {
    case "again":
      stability = 0.25;
      difficulty += 1;
      break;
    case "hard":
      stability *= 1.2;
      difficulty += 0.5;
      break;
    case "good":
      stability *= 2.5;
      break;
    case "easy":
      stability *= 3.5;
      difficulty -= 0.5;
      break;
  }

  stability = clamp(stability, MIN_STABILITY_DAYS, MAX_STABILITY_DAYS);
  difficulty = clamp(difficulty, 1, 10);

  // Graduation: 足夠穩定且不是 again/hard → 升 level 5。
  const graduate =
    (rating === "good" || rating === "easy") && stability >= GRADUATION_DAYS;
  const nextLevel: FamiliarityLevel = graduate
    ? KNOWN_LEVEL
    : canonicalizeLevel(state.level);

  return {
    stability,
    difficulty,
    dueAt: now + stability * DAY_MS,
    level: nextLevel,
  };
}

/** 判斷一個 WordState 是否該出現在「今日複習」佇列。 */
export function isDue(w: WordState, now: number = Date.now()): boolean {
  // 沒入 SRS 排程 → 跳過
  if (w.fsrsDueAt === undefined) return false;
  // 已掌握（level>=5）→ 不再出現
  if (w.level >= 5) return false;
  return w.fsrsDueAt <= now;
}

/** 所有 due review 依 dueAt 升冪（最早到期優先）。 */
export function selectDue(all: WordState[], now: number = Date.now()): WordState[] {
  return all
    .filter((w) => isDue(w, now))
    .sort((a, b) => (a.fsrsDueAt ?? 0) - (b.fsrsDueAt ?? 0));
}

/** 未到期但在 SRS 排程中的 — 給頂部 badge 顯示「還有多少在學習」。 */
export function countLearning(all: WordState[]): number {
  return all.filter(
    (w) => w.fsrsDueAt !== undefined && w.level < 5,
  ).length;
}

export const FSRS_CONFIG = {
  DAY_MS,
  MIN_STABILITY_DAYS,
  MAX_STABILITY_DAYS,
  GRADUATION_DAYS,
};
