import { describe, expect, it } from "vitest";
import { presentGloss, rankGlossLines } from "./gloss";

describe("gloss ranking and Traditional Chinese", () => {
  it("demotes a chemistry sense when a computing sense is present", () => {
    const raw = "n. 转导\n[化] 转导\n[计] 转导";
    const ranked = rankGlossLines(raw);
    expect(ranked.startsWith("[计]")).toBe(true);
    expect(ranked.endsWith("[化] 转导")).toBe(true);
  });

  it("converts the ranked gloss to Taiwan Traditional Chinese", () => {
    const shown = presentGloss("n. 软件\n[化] 转导\n[计] 软件", "zh-TW");
    expect(shown?.startsWith("[計] 軟體")).toBe(true);
    expect(shown).not.toContain("软件");
  });

  it("can leave Simplified Chinese when asked", () => {
    expect(presentGloss("[计] 软件", "zh-CN")).toBe("[计] 软件");
  });

  it("does not turn academic 循环的 into the programming noun 迴圈的", () => {
    const shown = presentGloss("a. 再发生的, 定期重复的, 循环的", "zh-TW");
    expect(shown).toContain("循環的");
    expect(shown).not.toContain("迴圈的");
    expect(presentGloss("n. 循环\n[计] 循环", "zh-TW")).toContain("迴圈");
    expect(presentGloss("循环神经网络", "zh-TW")).toContain("循環神經");
    expect(presentGloss("循环神经网络", "zh-TW")).not.toContain("迴圈");
  });
});
