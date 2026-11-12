import { describe, expect, it } from "vitest";
import { buildReflowPieces, type ReflowToken } from "./reflowPieces";

function word(partial: Partial<ReflowToken> & Pick<ReflowToken, "text" | "normalized" | "charStart" | "charEnd">): ReflowToken {
  return { cls: "word", ...partial };
}

function shown(tokens: ReflowToken[], fullText: string): string[] {
  return buildReflowPieces(tokens, fullText).filter((piece) => piece.index !== undefined).map((piece) => piece.text);
}

describe("buildReflowPieces", () => {
  it("paints a soft hyphen as one word", () => {
    const full = "We provide comprehensive empirical evidence of training instead of learning";
    const place = (fragments: Array<[string, string]>): ReflowToken[] => {
      let from = 0;
      return fragments.map(([fragment, normalized]) => {
        const charStart = full.indexOf(fragment, from);
        from = charStart + fragment.length;
        return word({ text: fragment, normalized, charStart, charEnd: from });
      });
    };
    const tokens = place([
      ["We", "we"],
      ["provide", "provide"],
      ["com", "comprehensive"],
      ["prehensive", "comprehensive"],
      ["empirical", "empirical"],
      ["evidence", "evidence"],
      ["of", "of"],
      ["train", "training"],
      ["ing", "training"],
      ["in", "instead"],
      ["stead", "instead"],
      ["of", "of"],
      ["learn", "learning"],
      ["ing", "learning"],
    ]);
    expect(shown(tokens, full)).toEqual([
      "We", "provide", "comprehensive", "empirical", "evidence", "of",
      "training", "instead", "of", "learning",
    ]);
    const joined = buildReflowPieces(tokens, full).find((piece) => piece.text === "comprehensive");
    expect(joined?.indexes).toEqual([2, 3]);
    expect(joined?.text.includes(" ")).toBe(false);
    expect(joined?.text.includes("-")).toBe(false);
  });

  it("keeps a real compound hyphen as one token and does not glue repeated words", () => {
    const full = "English-to-German models and the the result";
    const tokens: ReflowToken[] = [
      word({ text: "English-", normalized: "english-to-german", charStart: 0, charEnd: 8 }),
      word({ text: "to-German", normalized: "english-to-german", charStart: 8, charEnd: 17 }),
      word({ text: "models", normalized: "models", charStart: 18, charEnd: 24 }),
      word({ text: "and", normalized: "and", charStart: 25, charEnd: 28 }),
      word({ text: "the", normalized: "the", charStart: 29, charEnd: 32 }),
      word({ text: "the", normalized: "the", charStart: 33, charEnd: 36 }),
      word({ text: "result", normalized: "result", charStart: 37, charEnd: 43 }),
    ];
    expect(shown(tokens, full)).toEqual([
      "English-to-German", "models", "and", "the", "the", "result",
    ]);
  });

  it("absorbs a carried prefix from the previous page", () => {
    const full = "highway networks have not";
    const tokens: ReflowToken[] = [
      word({ text: "way", normalized: "highway", charStart: 4, charEnd: 7 }),
      word({ text: "networks", normalized: "networks", charStart: 8, charEnd: 16 }),
      word({ text: "have", normalized: "have", charStart: 17, charEnd: 21 }),
      word({ text: "not", normalized: "not", charStart: 22, charEnd: 25 }),
    ];
    expect(shown(tokens, full)).toEqual(["highway", "networks", "have", "not"]);
    const highway = buildReflowPieces(tokens, full)[0];
    expect(highway?.charStart).toBe(0);
    expect(highway?.charEnd).toBe(7);
  });

  it("leaves a kept hyphen between two separate words", () => {
    const full = "a 34-layer net";
    const tokens: ReflowToken[] = [
      word({ text: "a", normalized: "a", charStart: 0, charEnd: 1 }),
      word({ text: "34-", normalized: "34-layer", cls: "number", charStart: 2, charEnd: 5 }),
      word({ text: "layer", normalized: "34-layer", charStart: 5, charEnd: 10 }),
      word({ text: "net", normalized: "net", charStart: 11, charEnd: 14 }),
    ];
    expect(shown(tokens, full)).toEqual(["a", "34-", "layer", "net"]);
  });
});
