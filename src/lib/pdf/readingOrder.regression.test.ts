import { describe, expect, it } from "vitest";
import { bodyInReadingOrder, placeReadingOrder, type LayoutBox } from "./readingOrder";
import { sentenceAt } from "./sentences";
import resnet1 from "./fixtures/resnet-page1.json";
import resnet2 from "./fixtures/resnet-page2.json";
import attention1 from "./fixtures/attention-page1.json";

interface Fixture {
  pageWidth: number;
  pageHeight: number;
  items: LayoutBox[];
}

function spansBothColumns(sentence: string, items: LayoutBox[]): boolean {
  const hits = items.filter((it) => {
    const snippet = it.text.trim();
    return snippet.length >= 24 && sentence.includes(snippet.slice(0, 24));
  });
  if (hits.length < 2) return false;
  const xs = hits.map((it) => it.x);
  return Math.max(...xs) - Math.min(...xs) > 180;
}

function bodyText(fixture: Fixture): string {
  const placed = bodyInReadingOrder(
    placeReadingOrder(fixture.items, fixture.pageWidth, fixture.pageHeight),
  );
    let text = "";
    let prev: LayoutBox | null = null;
    for (const item of placed) {
      if (prev) {
        const sameLine = Math.abs(item.y - prev.y) <= Math.max(2, Math.max(item.height, prev.height) * 0.55);
        const gap = prev.y - item.y;
        const paragraph = !sameLine && (gap < 0 || gap > Math.max(prev.height, 8) * 1.8);
        text += sameLine ? " " : paragraph ? "\n\n" : " ";
      }
      text += item.text;
      prev = item;
    }
    return text;
}

describe("two-column papers", () => {
  it("keeps the ResNet right column out of the left column and drops the arXiv stamp", () => {
    const fixture = resnet1 as Fixture;
    const placed = placeReadingOrder(fixture.items, fixture.pageWidth, fixture.pageHeight);
    const stamp = placed.find((it) => it.text.includes("arXiv:1512"));
    expect(stamp?.zone).toBe("margin");
    const footnote = placed.find((it) => it.text.startsWith("http://image-net.org"));
    expect(footnote?.zone).toBe("note");
    const axis = placed.find((it) => it.text === "training error (%)");
    expect(axis?.zone).toBe("margin");

    const text = bodyText(fixture);
    expect(text).not.toContain("arXiv:1512");
    expect(text).not.toContain("http://image-net.org");

    const intro = text.indexOf("Deep convolutional");
    const degradation = text.indexOf("such degradation is");
    expect(intro).toBeGreaterThan(-1);
    expect(degradation).toBeGreaterThan(intro);

    const sentence = sentenceAt(text, degradation, degradation + 10);
    expect(sentence.toLowerCase()).toContain("not caused by overfitting");
    expect(sentence).not.toMatch(/arXiv|Deep convolutional|Figure 1|http:\/\//);
  });

  it("does not interleave ResNet page 2 columns", () => {
    const fixture = resnet2 as Fixture;
    const text = bodyText(fixture);
    expect(text.length).toBeGreaterThan(200);
    const placed = bodyInReadingOrder(placeReadingOrder(fixture.items, fixture.pageWidth, fixture.pageHeight));
    const sentences = text.split(/\n\n|(?<=[.?!])\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 80);
    const mixed = sentences.filter((sentence) => spansBothColumns(sentence, placed));
    expect(mixed.length).toBeLessThanOrEqual(1);
    const formal = sentences.find((s) => /desired underlying mapping/i.test(s));
    expect(formal).toBeTruthy();
    expect(formal).not.toMatch(/shallow representations|image retrieval/i);
  });

  it("does not split a single-column NeurIPS page into two columns", () => {
    const fixture = attention1 as Fixture;
    const text = bodyText(fixture);
    const title = text.indexOf("Attention");
    const abstract = text.toLowerCase().indexOf("the dominant sequence");
    expect(title).toBeGreaterThanOrEqual(0);
    expect(abstract).toBeGreaterThan(title);
    const sentence = sentenceAt(text, abstract, abstract + 12);
    expect(sentence.toLowerCase()).toContain("sequence transduction");
    expect(sentence).not.toMatch(/@|arXiv/);
  });
});
