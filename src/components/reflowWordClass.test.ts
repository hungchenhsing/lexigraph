import { describe, expect, it } from "vitest";
import type { FamiliarityLevel } from "../data/types";
import { reflowWordClass } from "./ReflowPage";
import { formatPageRatio, pageWordStats } from "../lib/pdf/wordColor";

describe("reflow familiarity colors", () => {
  it("paints every learning grade pink and leaves known, ignored, and unmarked plain", () => {
    expect(reflowWordClass(undefined, false)).not.toMatch(/bg-(pink|sky|amber)/);
    expect(reflowWordClass(5, false)).not.toMatch(/bg-(pink|sky|amber)/);
    expect(reflowWordClass(6, false)).not.toMatch(/bg-(pink|sky|amber)/);

    const learning = reflowWordClass(0, false);
    expect(learning).toContain("bg-pink-300/80");
    for (const level of [1, 2, 3, 4] as FamiliarityLevel[]) {
      expect(reflowWordClass(level, false)).toBe(learning);
    }
    expect(reflowWordClass(2, true)).toContain("bg-pink-300/80");
    expect(reflowWordClass(5, true)).not.toContain("bg-pink");
  });

  it("counts legacy 1–4 with learning in the page ratio", () => {
    const stats = pageWordStats([undefined, 0, 3, 5, 6]);
    expect(stats).toMatchObject({ total: 5, unmarked: 1, learning: 2, known: 1, ignored: 1 });
    expect(formatPageRatio(stats)).toBe("2 學習中 (40%) · 1 認識 (20%)");
    expect(formatPageRatio(stats)).not.toMatch(/new|amber|learning \d/);
  });
});
