/**
 * Collapse stored word states onto inflection lemmas.
 *
 * Run once against existing IndexedDB rows. The input array is copied into
 * `backup` before any merge so the caller can persist that snapshot first.
 * Applying the result a second time is a no-op (`changed === false`).
 */
import type { WordState } from "./types";
import { inflectionLemma } from "../lib/dict/inflection";

export interface LemmaMigrationResult {
  changed: boolean;
  /** Deep copy of the input, taken before merging. */
  backup: WordState[];
  states: WordState[];
}

export function migrateWordStatesToLemmas(input: WordState[]): LemmaMigrationResult {
  const backup = input.map((s) => cloneState(s));
  const groups = new Map<string, WordState[]>();
  for (const state of input) {
    const lemma = inflectionLemma(state.normalized) || state.normalized;
    const bucket = groups.get(lemma);
    if (bucket) bucket.push(state);
    else groups.set(lemma, [state]);
  }

  const states: WordState[] = [];
  let changed = false;
  for (const [lemma, group] of groups) {
    if (
      group.length === 1 &&
      group[0]!.normalized === lemma &&
      group[0]!.lemma === lemma
    ) {
      states.push(group[0]!);
      continue;
    }
    changed = true;
    states.push(mergeGroup(lemma, group));
  }

  states.sort((a, b) => a.normalized.localeCompare(b.normalized));
  return { changed, backup, states };
}

function mergeGroup(lemma: string, group: WordState[]): WordState {
  const ranked = [...group].sort((a, b) => {
    if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
    return b.level - a.level;
  });
  const winner = ranked[0]!;
  const surfaces = new Set<string>();
  const notes: string[] = [];
  let firstSeenAt = winner.firstSeenAt;
  let reviewCount = 0;
  for (const state of group) {
    surfaces.add(state.normalized);
    for (const extra of state.surfaces ?? []) surfaces.add(extra);
    if (state.note?.trim()) notes.push(state.note);
    if (state.firstSeenAt < firstSeenAt) firstSeenAt = state.firstSeenAt;
    reviewCount += state.reviewCount || 0;
  }
  surfaces.delete(lemma);
  const note = winner.note?.trim()
    ? winner.note
    : notes.find((n) => n.trim()) ;
  const next: WordState = {
    ...winner,
    normalized: lemma,
    lemma,
    firstSeenAt,
    reviewCount,
  };
  if (surfaces.size > 0) next.surfaces = [...surfaces].sort();
  else delete next.surfaces;
  if (note && note.trim()) next.note = note;
  return next;
}

function cloneState(state: WordState): WordState {
  return {
    ...state,
    lastSource: state.lastSource ? { ...state.lastSource } : undefined,
    surfaces: state.surfaces ? [...state.surfaces] : undefined,
  };
}
