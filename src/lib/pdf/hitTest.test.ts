import { describe, expect, it } from "vitest";
import { nearestWordIndex, type HitBox } from "./hitTest";

const tokens: HitBox[] = [
  { x: 10, y: 10, w: 40, h: 12, cls: "word" }, // attention
  { x: 10, y: 14, w: 36, h: 12, cls: "word" }, // around, overlaps the line above
  { x: 60, y: 10, w: 20, h: 12, cls: "number" },
];

describe("nearestWordIndex", () => {
  it("picks the word whose center is closest when boxes overlap", () => {
    // Tap near the top word's center, inside both boxes.
    expect(nearestWordIndex(tokens, 24, 14)).toBe(0);
    // Tap near the lower word's center.
    expect(nearestWordIndex(tokens, 22, 22)).toBe(1);
  });

  it("ignores non-words and far taps", () => {
    expect(nearestWordIndex(tokens, 200, 16)).toBeUndefined();
    expect(nearestWordIndex(tokens, 400, 400)).toBeUndefined();
  });
});
