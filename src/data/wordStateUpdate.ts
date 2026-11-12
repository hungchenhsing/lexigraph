/**
 * Shared word-state transitions. Both repos key records by inflection lemma
 * so study / studies / studied stay one row.
 */
import type { FamiliarityLevel, WordState } from "./types";
import { wordKey } from "../lib/dict/inflection";
import { initialSchedule } from "../lib/srs/fsrs";
import { canonicalizeLevel, KNOWN_LEVEL, LEARNING_LEVEL } from "./familiarity";

export interface WordSource {
  bookId: string;
  pageNo: number;
  sentence?: string | undefined;
}

export function lookupState(map: Map<string, WordState>, surface: string): WordState | undefined {
  const key = wordKey(surface);
  return map.get(key) ?? (key !== surface ? map.get(surface) : undefined);
}

export function nextWordState(
  existing: WordState | undefined,
  surface: string,
  level: FamiliarityLevel,
  now: number,
  source?: WordSource | undefined,
): WordState {
  const key = wordKey(surface) || surface;
  const stored = canonicalizeLevel(level);
  const shouldInitSrs = stored < 5 && (!existing || existing.fsrsDueAt === undefined);
  const srs = shouldInitSrs ? initialSchedule(now) : null;
  const srcPatch = source ? { lastSource: source } : {};
  const next: WordState = existing
    ? {
        ...existing,
        normalized: key,
        lemma: key,
        level: stored,
        lastSeenAt: now,
        reviewCount: existing.reviewCount + 1,
        ...(srs ? {
          fsrsStability: srs.stability,
          fsrsDifficulty: srs.difficulty,
          fsrsDueAt: srs.dueAt,
        } : {}),
        ...srcPatch,
      }
    : {
        normalized: key,
        lemma: key,
        level: stored,
        firstSeenAt: now,
        lastSeenAt: now,
        reviewCount: 1,
        ...(srs ? {
          fsrsStability: srs.stability,
          fsrsDifficulty: srs.difficulty,
          fsrsDueAt: srs.dueAt,
        } : {}),
        ...srcPatch,
      };
  return rememberSurface(next, surface);
}

export function knownMark(surface: string, now: number, source?: WordSource | undefined): WordState {
  const key = wordKey(surface) || surface;
  const rec: WordState = {
    normalized: key,
    lemma: key,
    level: KNOWN_LEVEL,
    firstSeenAt: now,
    lastSeenAt: now,
    reviewCount: 1,
  };
  if (source) rec.lastSource = source;
  return rememberSurface(rec, surface);
}

export function learningMark(surface: string, now: number, source?: WordSource | undefined): WordState {
  const key = wordKey(surface) || surface;
  const srs = initialSchedule(now);
  const rec: WordState = {
    normalized: key,
    lemma: key,
    level: LEARNING_LEVEL,
    firstSeenAt: now,
    lastSeenAt: now,
    reviewCount: 1,
    fsrsStability: srs.stability,
    fsrsDifficulty: srs.difficulty,
    fsrsDueAt: srs.dueAt,
  };
  if (source) rec.lastSource = source;
  return rememberSurface(rec, surface);
}

/**
 * Create rows only for surfaces that do not already have a state.
 * Known rows stay free of an SRS schedule. Learning rows are due immediately.
 */
export function unseenFreshMarks(
  words: readonly string[],
  level: FamiliarityLevel,
  now: number,
  lookup: (surface: string) => WordState | undefined,
  occupied: (key: string) => boolean,
  source?: WordSource | undefined,
): WordState[] {
  const stored = canonicalizeLevel(level);
  const created: WordState[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    if (!word || lookup(word)) continue;
    const rec = stored === KNOWN_LEVEL
      ? knownMark(word, now, source)
      : learningMark(word, now, source);
    if (seen.has(rec.normalized) || occupied(rec.normalized)) continue;
    seen.add(rec.normalized);
    created.push(rec);
  }
  return created;
}

export function rememberSurface(state: WordState, surface: string): WordState {
  if (!surface || surface === state.normalized) return state;
  const surfaces = new Set(state.surfaces ?? []);
  surfaces.add(surface);
  return { ...state, surfaces: [...surfaces].sort() };
}

/** Keys that must be removed after a write because the row moved to its lemma. */
export function staleKeys(surface: string, existing: WordState | undefined): string[] {
  const key = wordKey(surface) || surface;
  const drop = new Set<string>();
  if (surface !== key) drop.add(surface);
  if (existing && existing.normalized !== key) drop.add(existing.normalized);
  drop.delete(key);
  return [...drop];
}
