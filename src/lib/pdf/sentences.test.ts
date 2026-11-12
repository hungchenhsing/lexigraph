import { describe, expect, it } from "vitest";
import { sentenceAt, sentenceSpans } from "./sentences";

function sentences(text: string): string[] {
  return sentenceSpans(text).map(([start, end]) => text.slice(start, end).trim()).filter(Boolean);
}

describe("sentence segmentation", () => {
  it("does not split on e.g., i.e., et al., Fig., or pp.", () => {
    expect(sentences("We use e.g. a model. Then we stop.")).toEqual([
      "We use e.g. a model.",
      "Then we stop.",
    ]);
    expect(sentences("That is i.e. the mean. Next sentence here.")).toEqual([
      "That is i.e. the mean.",
      "Next sentence here.",
    ]);
    expect(sentences("Smith et al. showed this. Next starts here.")).toEqual([
      "Smith et al. showed this.",
      "Next starts here.",
    ]);
    expect(sentences("See Fig. 1 and Fig. 2. Results follow.")).toEqual([
      "See Fig. 1 and Fig. 2.",
      "Results follow.",
    ]);
    expect(sentences("Details are on pp. 12-14 only. Done now.")).toEqual([
      "Details are on pp. 12-14 only.",
      "Done now.",
    ]);
  });

  it("does not split decimals or initials, and still splits real sentences", () => {
    expect(sentences("The value is 3.14 exactly. Next value follows.")).toEqual([
      "The value is 3.14 exactly.",
      "Next value follows.",
    ]);
    expect(sentences("J. Smith wrote it. A second sentence.")).toEqual([
      "J. Smith wrote it.",
      "A second sentence.",
    ]);
    expect(sentences("Is this real? Yes it is.")).toEqual([
      "Is this real?",
      "Yes it is.",
    ]);
  });

  it("sentenceAt returns the abbreviation-aware span used for AI context", () => {
    const text = "We follow e.g. Smith et al. here. Later work differs.";
    const at = text.indexOf("Smith");
    expect(sentenceAt(text, at, at + 5)).toBe("We follow e.g. Smith et al. here.");
    expect(sentenceAt(text, text.indexOf("Later"), text.indexOf("Later") + 5)).toBe("Later work differs.");
  });

  it("treats a blank line as a paragraph break", () => {
    expect(sentences("Introduction\n\nWe study the model.")).toEqual([
      "Introduction",
      "We study the model.",
    ]);
  });
});
