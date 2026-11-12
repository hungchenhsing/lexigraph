import { describe, expect, it } from "vitest";
import { applyRating } from "../lib/srs/fsrs";
import type { WordState } from "./types";
import {
  collapseFamiliarityLevels,
  exportStatus,
  familiarityStatus,
  statusLabel,
} from "./familiarity";
import { nextWordState, unseenFreshMarks } from "./wordStateUpdate";

function row(level: WordState["level"], normalized = "word"): WordState {
  return { normalized, level, firstSeenAt: 1, lastSeenAt: 1, reviewCount: 1 };
}

describe("familiarity collapse", () => {
  it("treats 0 and legacy 1–4 as learning, and keeps ignore separate", () => {
    expect(familiarityStatus(undefined)).toBe("unmarked");
    expect(statusLabel(undefined)).toBe("未標記");
    for (const level of [0, 1, 2, 3, 4] as const) {
      expect(familiarityStatus(level)).toBe("learning");
      expect(statusLabel(level)).toBe("學習中");
      expect(exportStatus(level)).toBe("learning");
    }
    expect(familiarityStatus(5)).toBe("known");
    expect(exportStatus(5)).toBe("known");
    expect(familiarityStatus(6)).toBe("ignored");
    expect(exportStatus(6)).toBe("ignored");
  });

  it("rewrites saved 1–4 to the learning level and leaves 0, 5, and 6", () => {
    const input = [row(0, "a"), row(1, "b"), row(4, "c"), row(5, "d"), row(6, "e")];
    const once = collapseFamiliarityLevels(input);
    expect(once.changed).toBe(true);
    expect(once.states.map((state) => state.level)).toEqual([0, 0, 0, 5, 6]);
    expect(once.states[0]).toBe(input[0]);
    expect(once.states[3]).toBe(input[3]);
    const twice = collapseFamiliarityLevels(once.states);
    expect(twice.changed).toBe(false);
    expect(twice.states).toBe(once.states);
  });

  it("stores a new 1–4 mark as learning and does not schedule known words", () => {
    const learning = nextWordState(undefined, "hypothesis", 3, 10);
    expect(learning.level).toBe(0);
    expect(learning.fsrsDueAt).toBe(10);
    const known = nextWordState(undefined, "paper", 5, 10);
    expect(known.level).toBe(5);
    expect(known.fsrsDueAt).toBeUndefined();
    const ignored = nextWordState(undefined, "ibid", 6, 10);
    expect(ignored.level).toBe(6);
    expect(ignored.fsrsDueAt).toBeUndefined();
  });

  it("folds a legacy learning grade back to learning on review", () => {
    const next = applyRating({ level: 3, fsrsStability: 1, fsrsDifficulty: 5 }, "again", 100);
    expect(next.level).toBe(0);
  });

  it("does not overwrite an existing state when auto-marking", () => {
    const existing = new Map<string, WordState>([["kept", row(4, "kept")]]);
    const created = unseenFreshMarks(
      ["kept", "fresh", "fresh"],
      5,
      20,
      (word) => existing.get(word),
      (key) => existing.has(key),
    );
    expect(created.map((state) => state.normalized)).toEqual(["fresh"]);
    expect(created[0]?.level).toBe(5);
    expect(created[0]?.fsrsDueAt).toBeUndefined();
    const learning = unseenFreshMarks(["study"], 2, 20, () => undefined, () => false);
    expect(learning[0]?.level).toBe(0);
    expect(learning[0]?.fsrsDueAt).toBe(20);
  });
});
