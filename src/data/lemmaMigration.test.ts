import { describe, expect, it } from "vitest";
import { inflectionLemma } from "../lib/dict/inflection";
import { migrateWordStatesToLemmas } from "./lemmaMigration";
import type { WordState } from "./types";

function state(partial: Partial<WordState> & Pick<WordState, "normalized" | "level">): WordState {
  return {
    firstSeenAt: 1,
    lastSeenAt: 1,
    reviewCount: 1,
    ...partial,
  };
}

describe("inflectionLemma", () => {
  it("shares study / studies / studied / studying", () => {
    expect(inflectionLemma("study")).toBe("study");
    expect(inflectionLemma("studies")).toBe("study");
    expect(inflectionLemma("studied")).toBe("study");
    expect(inflectionLemma("studying")).toBe("study");
  });

  it("handles regular -s, -ed, -ing and a few irregulars", () => {
    expect(inflectionLemma("running")).toBe("run");
    expect(inflectionLemma("runs")).toBe("run");
    expect(inflectionLemma("planned")).toBe("plan");
    expect(inflectionLemma("computing")).toBe("compute");
    expect(inflectionLemma("computed")).toBe("compute");
    expect(inflectionLemma("required")).toBe("require");
    expect(inflectionLemma("requiring")).toBe("require");
    expect(inflectionLemma("processing")).toBe("process");
    expect(inflectionLemma("estimates")).toBe("estimate");
    expect(inflectionLemma("methods")).toBe("method");
    expect(inflectionLemma("boxes")).toBe("box");
    expect(inflectionLemma("children")).toBe("child");
    expect(inflectionLemma("analyses")).toBe("analysis");
  });

  it("does not derive unrelated words or eat function words", () => {
    expect(inflectionLemma("happiness")).toBe("happiness");
    expect(inflectionLemma("this")).toBe("this");
    expect(inflectionLemma("analysis")).toBe("analysis");
    expect(inflectionLemma("during")).toBe("during");
  });

  it("is idempotent", () => {
    for (const word of ["studies", "studied", "running", "computing", "children", "boxes", "study"]) {
      const once = inflectionLemma(word);
      expect(inflectionLemma(once)).toBe(once);
    }
  });
});

describe("migrateWordStatesToLemmas", () => {
  it("merges inflected rows onto the latest state and keeps a backup copy", () => {
    const input = [
      state({ normalized: "studies", level: 2, lastSeenAt: 10, reviewCount: 2, note: "older" }),
      state({ normalized: "studied", level: 5, firstSeenAt: 2, lastSeenAt: 20, reviewCount: 1, note: "past" }),
      state({ normalized: "study", level: 1, firstSeenAt: 3, lastSeenAt: 5, reviewCount: 4 }),
    ];
    const once = migrateWordStatesToLemmas(input);
    expect(once.changed).toBe(true);
    expect(once.backup).toHaveLength(3);
    expect(once.backup[0]).not.toBe(input[0]);
    expect(once.states).toHaveLength(1);
    const merged = once.states[0]!;
    expect(merged.normalized).toBe("study");
    expect(merged.lemma).toBe("study");
    expect(merged.level).toBe(5);
    expect(merged.note).toBe("past");
    expect(merged.firstSeenAt).toBe(1);
    expect(merged.reviewCount).toBe(7);
    expect(merged.surfaces).toEqual(["studied", "studies"]);
  });

  it("is idempotent and does not rewrite an already-migrated row", () => {
    const input = [
      state({ normalized: "studies", level: 3, lastSeenAt: 4 }),
      state({ normalized: "running", level: 1, lastSeenAt: 2 }),
      state({ normalized: "hypothesis", level: 5, lastSeenAt: 9, lemma: "hypothesis" }),
    ];
    const once = migrateWordStatesToLemmas(input);
    const twice = migrateWordStatesToLemmas(once.states);
    expect(twice.changed).toBe(false);
    expect(twice.states).toEqual(once.states);
  });

  it("leaves unrelated words as separate rows", () => {
    const input = [
      state({ normalized: "study", level: 5, lemma: "study" }),
      state({ normalized: "paper", level: 1, lemma: "paper" }),
    ];
    const result = migrateWordStatesToLemmas(input);
    expect(result.changed).toBe(false);
    expect(result.states.map((s) => s.normalized).sort()).toEqual(["paper", "study"]);
  });
});
