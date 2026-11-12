import { describe, expect, it } from "vitest";
import { autoMarkCandidates, isAuthorNameToken, planConfirmedMarks, type AutoMarkToken } from "./autoMark";
import { classifyToken, normalizeTokenText } from "./classify";
import { bodyInReadingOrder, placeReadingOrder, type LayoutBox } from "./readingOrder";
import attention1 from "./fixtures/attention-page1.json";
import resnet1 from "./fixtures/resnet-page1.json";

function token(partial: Partial<AutoMarkToken> & Pick<AutoMarkToken, "text" | "normalized">): AutoMarkToken {
  return { cls: "word", zone: "body", charStart: 0, ...partial };
}

describe("autoMarkCandidates", () => {
  const prose = "The model studies language with Smith today. Values are 3.";

  it("skips citations, numbers, chrome, clicked words, and existing states", () => {
    const tokens: AutoMarkToken[] = [
      token({ text: "The", normalized: "the", charStart: 0 }),
      token({ text: "model", normalized: "model", charStart: 4 }),
      token({ text: "[12]", normalized: "12", cls: "citation", charStart: 40 }),
      token({ text: "3", normalized: "3", cls: "number", charStart: prose.lastIndexOf("3") }),
      token({ text: "Smith", normalized: "smith", charStart: prose.indexOf("Smith") }),
      token({ text: "today", normalized: "today", charStart: prose.indexOf("today") }),
      token({ text: "Values", normalized: "values", charStart: prose.indexOf("Values") }),
      token({ text: "12", normalized: "12", zone: "pagenumber", charStart: -1 }),
      token({ text: "clicked", normalized: "clicked", charStart: 4 }),
      token({ text: "known", normalized: "known", charStart: 4 }),
    ];
    const decision = autoMarkCandidates(tokens, {
      fullText: prose,
      citationCount: 1,
      wordCount: 8,
    }, {
      clicked: new Set(["clicked"]),
      hasState: (word) => word === "known",
    });
    expect(decision.skippedReason).toBeNull();
    expect(decision.words).toEqual(["the", "model", "today", "values"]);
  });

  it("does not mark a references page or mid-sentence author names", () => {
    const text = "References\nSmith, A. (2020). A paper title. Journal of Things.";
    const tokens = [
      token({ text: "paper", normalized: "paper", charStart: text.indexOf("paper") }),
      token({ text: "Smith", normalized: "smith", charStart: text.indexOf("Smith") }),
    ];
    const decision = autoMarkCandidates(tokens, { fullText: text, citationCount: 0, wordCount: 6 });
    expect(decision.skippedReason).toBe("reference-heading");
    expect(decision.words).toEqual([]);
    expect(isAuthorNameToken("Smith", false)).toBe(true);
    expect(isAuthorNameToken("Smith", true)).toBe(false);
    expect(isAuthorNameToken("model", false)).toBe(false);
  });

  it("skips footnote first names even when they stand alone", () => {
    const tokens: AutoMarkToken[] = [
      token({ text: "Jakob", normalized: "jakob", lineNo: 9, y: 700, height: 8, charStart: 20 }),
      token({ text: "proposed", normalized: "proposed", lineNo: 9, y: 700, height: 8, charStart: 30 }),
      token({ text: "Ashish", normalized: "ashish", lineNo: 2, y: 40, height: 11, charStart: 10 }),
      token({ text: "Vaswani", normalized: "vaswani", lineNo: 2, y: 40, height: 11, charStart: 18 }),
      token({ text: "model", normalized: "model", lineNo: 5, y: 300, height: 11, charStart: 4 }),
    ];
    const decision = autoMarkCandidates(tokens, {
      fullText: "Ashish Vaswani\nThe model works.\n* Jakob proposed the idea.",
      citationCount: 0,
      wordCount: 6,
      pageHeight: 800,
    }, {
      inDictionary: (word) => word === "model" || word === "proposed",
    });
    expect(decision.words).toEqual(["proposed", "model"]);
  });

  it("skips Attention author names that reappear in the equal-contribution footnote", () => {
    const pageHeight = 792;
    const authorY = 0.30 * pageHeight;
    const footnoteY = 0.76 * pageHeight;
    const tokens: AutoMarkToken[] = [
      token({ text: "Ashish", normalized: "ashish", lineNo: 2, y: authorY, height: 10, charStart: 10 }),
      token({ text: "Vaswani", normalized: "vaswani", lineNo: 2, y: authorY, height: 10, charStart: 18 }),
      token({ text: "∗", normalized: "", lineNo: 3, y: authorY - 4, height: 7, cls: "other", charStart: 26 }),
      token({ text: "Noam", normalized: "noam", lineNo: 2, y: authorY, height: 10, charStart: 30 }),
      token({ text: "Shazeer", normalized: "shazeer", lineNo: 2, y: authorY, height: 10, charStart: 36 }),
      token({ text: "Niki", normalized: "niki", lineNo: 2, y: authorY, height: 10, charStart: 44 }),
      token({ text: "Parmar", normalized: "parmar", lineNo: 2, y: authorY, height: 10, charStart: 50 }),
      token({ text: "model", normalized: "model", lineNo: 6, y: 0.5 * pageHeight, height: 10, charStart: 80 }),
      token({ text: "Equal", normalized: "equal", lineNo: 9, y: 0.75 * pageHeight, height: 9, charStart: 100 }),
      token({ text: "contribution", normalized: "contribution", lineNo: 9, y: 0.75 * pageHeight, height: 9, charStart: 106 }),
      token({ text: "Ashish", normalized: "ashish", lineNo: 10, y: footnoteY, height: 9, charStart: 140 }),
      token({ text: "Noam", normalized: "noam", lineNo: 11, y: footnoteY + 10, height: 9, charStart: 180 }),
      token({ text: "proposed", normalized: "proposed", lineNo: 11, y: footnoteY + 10, height: 9, charStart: 186 }),
      token({ text: "Niki", normalized: "niki", lineNo: 12, y: footnoteY + 20, height: 9, charStart: 220 }),
      token({ text: "designed", normalized: "designed", lineNo: 12, y: footnoteY + 20, height: 9, charStart: 226 }),
    ];
    const decision = autoMarkCandidates(tokens, {
      fullText: "Ashish Vaswani Noam Shazeer Niki Parmar. The model works. Equal contribution. Ashish designed it. Noam proposed it. Niki designed it.",
      citationCount: 0,
      wordCount: 20,
      pageHeight,
    }, {
      inDictionary: (word) => ["model", "proposed", "designed", "research", "equal", "contribution"].includes(word),
    });
    expect(decision.words).not.toEqual(expect.arrayContaining(["ashish", "noam", "niki", "vaswani", "shazeer", "parmar"]));
    expect(decision.words).toContain("model");
    expect(decision.words).toContain("designed");
  });

  it("excludes Attention page-1 names even when ECDICT contains them", () => {
    // Geometry from pdf.js on arXiv 1706.03762 page 1 (612×792).
    // Author row y≈549 (viewport top ratio 0.29). Footnote starts at
    // "Equal contribution" (ratio 0.75) and names the same people again.
    // jakob, ashish, noam, and niki are ECDICT headwords, which used to
    // make isPersonalName return false and put them on the known list.
    const pageHeight = 792;
    const authorY = 792 - 549.3 - 10;
    const foot = (pdfY: number) => 792 - pdfY - 9;
    const inDict = new Set([
      "jakob", "ashish", "noam", "niki", "aidan", "illia", "parmar",
      "model", "proposed", "designed", "research", "equal", "contribution", "with",
    ]);
    const name = (text: string, y: number, lineNo: number, charStart: number): AutoMarkToken =>
      token({ text, normalized: text.toLowerCase(), y, height: 10, lineNo, charStart });
    const tokens: AutoMarkToken[] = [
      name("Ashish", authorY, 4, 20),
      name("Vaswani", authorY, 4, 28),
      name("Noam", authorY, 4, 36),
      name("Shazeer", authorY, 4, 42),
      name("Niki", authorY, 4, 50),
      name("Parmar", authorY, 4, 56),
      name("Jakob", authorY, 4, 64),
      name("Uszkoreit", authorY, 4, 70),
      token({ text: "avaswani@google.com", normalized: "avaswani@google.com", y: 792 - 527.5 - 10, height: 10, lineNo: 6, charStart: 90, cls: "other" }),
      name("model", 400, 12, 120),
      token({ text: "Equal", normalized: "equal", y: foot(186.1), height: 9, lineNo: 20, charStart: 200 }),
      token({ text: "contribution", normalized: "contribution", y: foot(186.1), height: 9, lineNo: 20, charStart: 206 }),
      name("Jakob", foot(186.1), 20, 230),
      name("Ashish", foot(176.2), 21, 260),
      token({ text: "with", normalized: "with", y: foot(176.2), height: 9, lineNo: 21, charStart: 268 }),
      name("Noam", foot(166.2), 22, 300),
      token({ text: "proposed", normalized: "proposed", y: foot(166.2), height: 9, lineNo: 22, charStart: 306 }),
      name("Niki", foot(146.3), 23, 340),
      token({ text: "designed", normalized: "designed", y: foot(146.3), height: 9, lineNo: 23, charStart: 346 }),
    ];
    const decision = autoMarkCandidates(tokens, {
      fullText: "Ashish Vaswani Noam Shazeer Niki Parmar Jakob Uszkoreit. The model works. Equal contribution. Jakob proposed. Ashish, with Illia. Noam proposed. Niki designed.",
      citationCount: 0,
      wordCount: 24,
      pageHeight,
    }, {
      inDictionary: (word) => inDict.has(word),
    });
    for (const banned of ["jakob", "ashish", "noam", "niki", "vaswani", "shazeer", "parmar", "uszkoreit"]) {
      expect(decision.words, banned).not.toContain(banned);
    }
    expect(decision.words).toEqual(expect.arrayContaining(["model", "proposed", "designed"]));
  });

  it("skips emails, urls, and a run of capitalized names", () => {
    const tokens: AutoMarkToken[] = [
      token({ text: "Ashish", normalized: "ashish", lineNo: 1, charStart: 10 }),
      token({ text: "Vaswani", normalized: "vaswani", lineNo: 1, charStart: 20 }),
      token({ text: "avaswani@google.com", normalized: "avaswani@google.com", lineNo: 2, charStart: 40 }),
      token({ text: "https://arxiv.org", normalized: "https://arxiv.org", cls: "url", lineNo: 3, charStart: 60 }),
      token({ text: "model", normalized: "model", lineNo: 4, charStart: 4 }),
    ];
    const decision = autoMarkCandidates(tokens, {
      fullText: "Ashish Vaswani avaswani@google.com https://arxiv.org model",
      citationCount: 0,
      wordCount: 5,
    });
    expect(decision.words).toEqual(["model"]);
  });

  it("skips email local-parts that share a baseline with @ but not a line number", () => {
    const y = 180;
    const tokens: AutoMarkToken[] = [
      token({ text: "{", normalized: "", cls: "formula", y, height: 10, lineNo: 3, charStart: 1 }),
      token({ text: "kahe,", normalized: "kahe", y, height: 10, lineNo: 3, charStart: 2 }),
      token({ text: "v-xiangz,", normalized: "v-xiangz", y, height: 10, lineNo: 3, charStart: 8 }),
      token({ text: "v-shren,", normalized: "v-shren", y, height: 10, lineNo: 3, charStart: 18 }),
      token({ text: "jiansun", normalized: "jiansun", y, height: 10, lineNo: 3, charStart: 28 }),
      token({ text: "}", normalized: "", cls: "formula", y, height: 10, lineNo: 3, charStart: 36 }),
      token({ text: "@microsoft.com", normalized: "microsoft.com", cls: "other", y, height: 10, lineNo: 41, charStart: 400 }),
      token({ text: "residual", normalized: "residual", y: 400, height: 11, lineNo: 8, charStart: 80 }),
      token({ text: "training", normalized: "training", y: 420, height: 11, lineNo: 9, charStart: 100 }),
    ];
    const decision = autoMarkCandidates(tokens, {
      fullText: "{ kahe, v-xiangz, v-shren, jiansun } @microsoft.com residual training",
      citationCount: 0,
      wordCount: 20,
      pageHeight: 792,
    }, { inDictionary: () => true });
    expect(decision.words).not.toEqual(expect.arrayContaining(["kahe", "v-xiangz", "v-shren", "jiansun"]));
    expect(decision.words).toEqual(expect.arrayContaining(["residual", "training"]));
  });

  it("skips a dotted or hyphenated local-part beside an email and keeps the sentence", () => {
    const y = 300;
    const tokens: AutoMarkToken[] = [
      token({ text: "The", normalized: "the", y, height: 11, lineNo: 4, charStart: 0 }),
      token({ text: "model", normalized: "model", y, height: 11, lineNo: 4, charStart: 4 }),
      token({ text: "illia.polosukhin", normalized: "illia.polosukhin", y, height: 11, lineNo: 4, charStart: 10 }),
      token({ text: "@gmail.com", normalized: "gmail.com", cls: "other", y, height: 11, lineNo: 9, charStart: 40 }),
      token({ text: "research", normalized: "research", y: 360, height: 11, lineNo: 6, charStart: 60 }),
    ];
    const decision = autoMarkCandidates(tokens, {
      fullText: "The model illia.polosukhin @gmail.com research",
      citationCount: 0,
      wordCount: 8,
      pageHeight: 792,
    }, { inDictionary: () => true });
    expect(decision.words).not.toContain("illia.polosukhin");
    expect(decision.words).toEqual(expect.arrayContaining(["the", "model", "research"]));
  });

  it("skips all-caps place abbreviations and keeps the academic words on that line", () => {
    const y = 730;
    const line = "31st Conference on Neural Information Processing Systems (NIPS 2017), Long Beach, CA, USA.";
    const parts = line.split(/\s+/);
    let cursor = 0;
    const tokens: AutoMarkToken[] = parts.map((text, index) => {
      const charStart = cursor;
      cursor += text.length + 1;
      return token({
        text,
        normalized: normalizeTokenText(text),
        cls: classifyToken(text),
        y,
        height: 9,
        lineNo: 39,
        charStart,
        ...(index === 0 ? {} : {}),
      });
    });
    tokens.push(
      token({ text: "neural", normalized: "neural", y: 400, height: 11, lineNo: 12, charStart: 200 }),
      token({ text: "model", normalized: "model", y: 420, height: 11, lineNo: 13, charStart: 210 }),
      token({ text: "training", normalized: "training", y: 440, height: 11, lineNo: 14, charStart: 220 }),
    );
    const decision = autoMarkCandidates(tokens, {
      fullText: `${line}\n\nThe neural model studies training.`,
      citationCount: 0,
      wordCount: 20,
      pageHeight: 792,
    }, { inDictionary: () => true });
    expect(decision.words).not.toEqual(expect.arrayContaining(["ca", "usa"]));
    expect(decision.words).toEqual(expect.arrayContaining(["neural", "model", "training"]));
  });

  it("does not skip ordinary words that look a little like places or handles", () => {
    const tokens: AutoMarkToken[] = [
      token({ text: "The", normalized: "the", y: 100, height: 11, lineNo: 1, charStart: 0 }),
      token({ text: "model", normalized: "model", y: 100, height: 11, lineNo: 1, charStart: 4 }),
      token({ text: "uses", normalized: "uses", y: 100, height: 11, lineNo: 1, charStart: 10 }),
      token({ text: "research", normalized: "research", y: 120, height: 11, lineNo: 2, charStart: 20 }),
      token({ text: "and", normalized: "and", y: 120, height: 11, lineNo: 2, charStart: 29 }),
      token({ text: "ca", normalized: "ca", y: 120, height: 11, lineNo: 2, charStart: 33 }),
      token({ text: "MODELS,", normalized: "models", y: 160, height: 11, lineNo: 3, charStart: 40 }),
      token({ text: "OR", normalized: "or", y: 160, height: 11, lineNo: 3, charStart: 48 }),
      token({ text: "METHODS", normalized: "methods", y: 160, height: 11, lineNo: 3, charStart: 51 }),
      token({ text: "state-of-the-art", normalized: "state-of-the-art", y: 200, height: 11, lineNo: 4, charStart: 60 }),
      token({ text: "training", normalized: "training", y: 200, height: 11, lineNo: 4, charStart: 78 }),
    ];
    const decision = autoMarkCandidates(tokens, {
      fullText: "The model uses research and ca. MODELS, OR METHODS state-of-the-art training",
      citationCount: 0,
      wordCount: 12,
      pageHeight: 792,
    }, { inDictionary: () => true });
    expect(decision.words).toEqual(expect.arrayContaining([
      "model", "research", "ca", "models", "or", "methods", "state-of-the-art", "training",
    ]));
  });

  it("skips a page that is mostly citations even without a heading", () => {
    const decision = autoMarkCandidates(
      [token({ text: "residual", normalized: "residual" })],
      { fullText: "See also more context here.", citationCount: 8, wordCount: 4 },
    );
    expect(decision.skippedReason).toBe("citation-density");
    expect(decision.words).toEqual([]);
  });
});

function tokensFromFixture(fix: { pageWidth: number; pageHeight: number; items: LayoutBox[] }) {
  const body = bodyInReadingOrder(placeReadingOrder(fix.items, fix.pageWidth, fix.pageHeight));
  const tokens: AutoMarkToken[] = [];
  let lineNo = 0;
  let lastY: number | null = null;
  let full = "";
  for (const item of body) {
    if (lastY !== null && Math.abs(item.y - lastY) > Math.max(2, item.height * 0.45)) lineNo += 1;
    lastY = item.y;
    const parts = item.text.match(/\S+/g) ?? [];
    for (const text of parts) {
      if (full && !/\s$/.test(full)) full += " ";
      const charStart = full.length;
      full += text;
      tokens.push({
        text,
        normalized: normalizeTokenText(text),
        cls: classifyToken(text),
        zone: "body",
        charStart,
        lineNo,
        y: fix.pageHeight - item.y - item.height,
        height: item.height,
      });
    }
  }
  return { tokens, fullText: full, pageHeight: fix.pageHeight };
}

describe("auto-mark on paper fixtures", () => {
  it("drops Attention page-1 place codes and keeps body vocabulary", () => {
    const page = tokensFromFixture(attention1 as { pageWidth: number; pageHeight: number; items: LayoutBox[] });
    const decision = autoMarkCandidates(page.tokens, {
      fullText: page.fullText,
      citationCount: 0,
      wordCount: 200,
      pageHeight: page.pageHeight,
    }, { inDictionary: () => true });
    expect(decision.words).not.toEqual(expect.arrayContaining(["ca", "usa", "jakob", "ashish", "noam", "niki"]));
    expect(decision.words).toEqual(expect.arrayContaining(["model", "training", "research"]));
  });

  it("drops ResNet page-1 email local-parts and keeps body vocabulary", () => {
    const page = tokensFromFixture(resnet1 as { pageWidth: number; pageHeight: number; items: LayoutBox[] });
    const decision = autoMarkCandidates(page.tokens, {
      fullText: page.fullText,
      citationCount: 0,
      wordCount: 200,
      pageHeight: page.pageHeight,
    }, { inDictionary: () => true });
    expect(decision.words).not.toEqual(expect.arrayContaining(["kahe", "v-xiangz", "v-shren", "jiansun"]));
    expect(decision.words).toEqual(expect.arrayContaining(["neural", "networks", "training", "model"]));
  });
});

describe("planConfirmedMarks", () => {
  it("opts checked words into learning and marks the rest known", () => {
    expect(planConfirmedMarks(["model", "loss", "token"], new Set(["loss"]))).toEqual({
      learn: ["loss"],
      known: ["model", "token"],
    });
    expect(planConfirmedMarks(["model", "loss"], new Set())).toEqual({
      learn: [],
      known: ["model", "loss"],
    });
  });
});

