import { describe, expect, it } from "vitest";
import { AWL_FAMILY_COUNT, awlWordCount, lookupAwl } from "./awl";
import { isAwlWord, lookupAcademic } from "./academic";

describe("AWL headwords and inflections", () => {
  const heads = ["method", "data", "function", "require", "estimate", "process", "research"];

  it("tags the Adam-paper headwords as AWL", () => {
    for (const word of heads) {
      expect(isAwlWord(word), word).toBe(true);
      expect(lookupAcademic(word)?.sublist).toBe(1);
    }
  });

  it("matches inflected forms to the same headword", () => {
    expect(isAwlWord("methods")).toBe(true);
    expect(isAwlWord("functions")).toBe(true);
    expect(isAwlWord("estimates")).toBe(true);
    expect(isAwlWord("estimated")).toBe(true);
    expect(isAwlWord("required")).toBe(true);
    expect(isAwlWord("processing")).toBe(true);
    expect(isAwlWord("researches")).toBe(true);
    expect(lookupAcademic("required")?.sublist).toBe(1);
    expect(lookupAcademic("processing")?.sublist).toBe(1);
  });

  it("covers all 570 Coxhead families, including the ones the seed missed", () => {
    expect(AWL_FAMILY_COUNT).toBe(570);
    expect(awlWordCount()).toBeGreaterThan(2000);
    expect(lookupAwl("parameter")?.sublist).toBe(4);
    expect(lookupAwl("parameters")?.head).toBe("parameter");
    expect(lookupAwl("sequence")?.sublist).toBe(3);
    expect(lookupAwl("sequences")?.head).toBe("sequence");
    expect(lookupAwl("variance")?.head).toBe("vary");
    expect(lookupAwl("variances")?.head).toBe("vary");
    expect(isAwlWord("optimization")).toBe(true);
    expect(isAwlWord("optimise")).toBe(true);
    expect(isAwlWord("optimized")).toBe(true);
    expect(lookupAcademic("analyse")?.awl).toBe(true);
  });
});
