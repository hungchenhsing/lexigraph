import { describe, expect, it } from "vitest";
import { applyCarry, boundaryWords, joinHyphenated, shouldDropLineHyphen } from "./hyphenJoin";
import resnet from "./fixtures/resnet-hyphens.json";

/**
 * Words that ECDICT actually contains, plus the closed-class pieces used by
 * the compounds we must not glue together.
 */
const WORDS = new Set([
  "comprehensive", "representations", "representation", "equivalent",
  "transduction", "convolutional", "multiplicative", "interpretations",
  "parameterized", "highway",
  "sequence", "aligned", "position", "wise", "self", "attention",
  "layer", "english", "german", "to", "high", "way",
]);
const has = (word: string) => WORDS.has(word.toLowerCase());

describe("line-break hyphens", () => {
  it("joins ResNet soft hyphens and keeps 34-layer", () => {
    for (const row of resnet.soft) {
      const edge = boundaryWords(row.prev, row.next);
      expect(edge).toEqual({ head: row.head, tail: row.tail });
      expect(joinHyphenated(edge.head, edge.tail, has)).toBe(row.joined);
      expect(shouldDropLineHyphen(edge.head, edge.tail, has)).toBe(true);
    }
    const layers = boundaryWords("Our 34-", "layer baseline has 3.6 billion FLOPs");
    expect(joinHyphenated(layers.head, layers.tail, has)).toBe("34-layer");
    expect(joinHyphenated("152", "layer", has)).toBe("152-layer");
  });

  it("keeps English-to-German and compounds of two real words", () => {
    const english = boundaryWords(
      "Our model achieves 28.4 BLEU on the WMT 2014 English-",
      "to-German translation task, improving over the existing best results",
    );
    expect(joinHyphenated(english.head, english.tail, has)).toBe("English-to-German");
    expect(joinHyphenated("sequence", "aligned", has)).toBe("sequence-aligned");
    expect(joinHyphenated("position", "wise", has)).toBe("position-wise");
    expect(joinHyphenated("self", "attention", has)).toBe("self-attention");
  });

  it("uses the same joined string for the PDF lookup key and reflow text", () => {
    const shown = joinHyphenated("com", "prehensive", has);
    expect(shown).toBe("comprehensive");
    expect(shown.includes("-")).toBe(false);
    expect(joinHyphenated("English", "to-German", has)).toBe("English-to-German");
  });

  it("carries high- from ResNet page 2 onto way at the start of page 3", () => {
    const carried = applyCarry("high", "way networks have not demonstrated accuracy gains with", has);
    expect(carried?.text.startsWith("highway networks")).toBe(true);
    expect(carried?.drop).toBe(true);
  });
});
