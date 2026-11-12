import { describe, expect, it } from "vitest";
import { nextAnchorAfterScroll, pdfScrollHasRange, wordCharAtScrollTop } from "./readingPosition";

describe("reading position", () => {
  const tokens = [
    { cls: "word", y: 40, h: 12, charStart: 10 },
    { cls: "word", y: 80, h: 12, charStart: 40 },
    { cls: "word", y: 520, h: 12, charStart: 1800 },
    { cls: "word", y: 560, h: 12, charStart: 1900 },
  ];

  it("treats a fitted page as having no scroll range", () => {
    expect(pdfScrollHasRange(640, 700)).toBe(false);
    expect(pdfScrollHasRange(900, 700)).toBe(true);
    expect(pdfScrollHasRange(0, 700)).toBe(false);
  });

  it("picks the word under the top edge, not a word already scrolled past", () => {
    expect(wordCharAtScrollTop(tokens, 0)).toBe(10);
    expect(wordCharAtScrollTop(tokens, 500)).toBe(1800);
    expect(wordCharAtScrollTop(tokens, 540)).toBe(1900);
  });

  it("keeps the reflow place when the PDF page fits the viewport", () => {
    const previous = { pageNo: 3, charStart: 1800 };
    const topOfPage = { pageNo: 3, charStart: 10 };
    expect(nextAnchorAfterScroll({
      previous,
      source: "pdf",
      captured: topOfPage,
      scrollHeight: 640,
      clientHeight: 700,
    })).toEqual(previous);
  });

  it("follows a PDF scroll when the page is taller than the viewport", () => {
    const previous = { pageNo: 3, charStart: 1800 };
    const moved = { pageNo: 3, charStart: 40 };
    expect(nextAnchorAfterScroll({
      previous,
      source: "pdf",
      captured: moved,
      scrollHeight: 1600,
      clientHeight: 700,
    })).toEqual(moved);
  });

  it("follows reflow scroll even when the box is short", () => {
    const captured = { pageNo: 3, charStart: 1900 };
    expect(nextAnchorAfterScroll({
      previous: { pageNo: 3, charStart: 10 },
      source: "reflow",
      captured,
      scrollHeight: 400,
      clientHeight: 700,
    })).toEqual(captured);
  });
});
