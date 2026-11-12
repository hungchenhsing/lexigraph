/**
 * Two familiarity statuses, plus a separate ignore flag.
 *
 * 認識 is stored as 5. 不認識／學習中 is stored as 0.
 * Levels 1–4 are the old amber scale; they are the same learning status.
 * 6 is 忽略: do not count the token, and do not color it.
 */
import type { FamiliarityLevel, WordState } from "./types";

export const LEARNING_LEVEL = 0 satisfies FamiliarityLevel;
export const KNOWN_LEVEL = 5 satisfies FamiliarityLevel;
export const IGNORED_LEVEL = 6 satisfies FamiliarityLevel;

export type FamiliarityStatus = "learning" | "known" | "ignored" | "unmarked";

export function canonicalizeLevel(level: FamiliarityLevel): FamiliarityLevel {
  if (level === KNOWN_LEVEL || level === IGNORED_LEVEL) return level;
  return LEARNING_LEVEL;
}

export function familiarityStatus(level: FamiliarityLevel | undefined): FamiliarityStatus {
  if (level === undefined) return "unmarked";
  if (level === IGNORED_LEVEL) return "ignored";
  if (level === KNOWN_LEVEL) return "known";
  return "learning";
}

export function isLearningLevel(level: FamiliarityLevel | undefined): boolean {
  return familiarityStatus(level) === "learning";
}

export function statusLabel(level: FamiliarityLevel | undefined): string {
  const status = familiarityStatus(level);
  if (status === "learning") return "學習中";
  if (status === "known") return "認識";
  if (status === "ignored") return "忽略";
  return "未標記";
}

/** CSV / Anki tag. Legacy 1–4 are learning, never a separate grade. */
export function exportStatus(level: FamiliarityLevel): "learning" | "known" | "ignored" {
  const status = familiarityStatus(level);
  return status === "unmarked" ? "learning" : status;
}

export interface FamiliarityCollapse {
  changed: boolean;
  states: WordState[];
}

/** Rewrite saved 1–4 rows to the single learning level. Idempotent. */
export function collapseFamiliarityLevels(states: WordState[]): FamiliarityCollapse {
  let changed = false;
  const next = states.map((state) => {
    const level = canonicalizeLevel(state.level);
    if (level === state.level) return state;
    changed = true;
    return { ...state, level };
  });
  return { changed, states: changed ? next : states };
}

export function countByStatus(states: Iterable<WordState>): {
  known: number;
  unknown: number;
  ignored: number;
  total: number;
} {
  let known = 0;
  let unknown = 0;
  let ignored = 0;
  for (const state of states) {
    const status = familiarityStatus(state.level);
    if (status === "known") known += 1;
    else if (status === "ignored") ignored += 1;
    else if (status === "learning") unknown += 1;
  }
  return { known, unknown, ignored, total: known + unknown + ignored };
}
