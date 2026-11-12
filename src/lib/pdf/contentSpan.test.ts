import { describe, expect, it } from "vitest";
import { contentSpan } from "./contentSpan";

describe("contentSpan", () => {
  it("crops side margins and ignores a rotated stamp", () => {
    const span = contentSpan([
      { text: "arXiv:1706.03762", x: 18, width: 70, angle: 90 },
      { text: "Attention Is All You Need", x: 140, width: 220, angle: 0 },
      { text: "The dominant sequence transduction models", x: 108, width: 396, angle: 0 },
    ], 612);
    expect(span.minX).toBeGreaterThan(90);
    expect(span.minX + span.width).toBeLessThan(530);
    expect(span.width).toBeLessThan(500);
  });

  it("keeps a full-bleed page", () => {
    const span = contentSpan([
      { text: "wide", x: 20, width: 570, angle: 0 },
    ], 612);
    expect(span).toEqual({ minX: 0, width: 612 });
  });
});
