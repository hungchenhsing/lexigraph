import { describe, expect, it } from "vitest";
import { showFloatingWordCard } from "./wordCardPlacement";

describe("showFloatingWordCard", () => {
  it("hides the floating card on desktop and keeps the phone sheet", () => {
    expect(showFloatingWordCard(false)).toBe(false);
    expect(showFloatingWordCard(true)).toBe(true);
  });
});
