import { describe, expect, it } from "vitest";
import { bodyInReadingOrder, placeReadingOrder, type LayoutBox } from "./readingOrder";

function box(partial: Omit<LayoutBox, "width" | "height"> & Partial<Pick<LayoutBox, "width" | "height">>): LayoutBox {
  return { width: 40, height: 10, ...partial };
}

describe("placeReadingOrder", () => {
  it("reads a two-column page down the left column, then the right", () => {
    const leftYs = [700, 680, 660, 640, 620];
    const rightYs = [700, 680, 660, 640, 620];
    const items: LayoutBox[] = [
      box({ index: 0, text: "Smith et al. / Journal", x: 40, y: 780, height: 8, width: 200 }),
      ...rightYs.map((y, i) => box({ index: 1 + i, text: `R${i}`, x: 340, y })),
      ...leftYs.map((y, i) => box({ index: 6 + i, text: `L${i}`, x: 40, y })),
      box({ index: 11, text: "4", x: 280, y: 20, height: 8, width: 12 }),
    ];
    const placed = placeReadingOrder(items, 600, 800);
    expect(placed.find((it) => it.text.startsWith("Smith"))?.zone).toBe("header");
    expect(placed.find((it) => it.text === "4")?.zone).toBe("pagenumber");
    const body = bodyInReadingOrder(placed).map((it) => it.text);
    expect(body).toEqual(["L0", "L1", "L2", "L3", "L4", "R0", "R1", "R2", "R3", "R4"]);
  });

  it("puts a full-width title before either column", () => {
    const items: LayoutBox[] = [
      box({ index: 0, text: "Methods", x: 40, y: 740, width: 520, height: 16 }),
      ...[700, 680, 660, 640].map((y, i) => box({ index: 1 + i, text: `L${i}`, x: 40, y })),
      ...[700, 680, 660, 640].map((y, i) => box({ index: 5 + i, text: `R${i}`, x: 340, y })),
    ];
    const body = bodyInReadingOrder(placeReadingOrder(items, 600, 800)).map((it) => it.text);
    expect(body[0]).toBe("Methods");
    expect(body.slice(1, 5)).toEqual(["L0", "L1", "L2", "L3"]);
    expect(body.slice(5)).toEqual(["R0", "R1", "R2", "R3"]);
  });

  it("sorts a single column by vertical position even if the stream is reversed", () => {
    const items: LayoutBox[] = [500, 520, 540, 560].map((y, i) =>
      box({ index: i, text: `w${y}`, x: i % 2 === 0 ? 40 : 80, y }),
    );
    const body = bodyInReadingOrder(placeReadingOrder(items, 600, 800)).map((it) => it.text);
    expect(body).toEqual(["w560", "w540", "w520", "w500"]);
  });

  it("keeps words on the same line in x order", () => {
    const items: LayoutBox[] = [
      box({ index: 0, text: "right", x: 120, y: 500 }),
      box({ index: 1, text: "left", x: 40, y: 500 }),
      box({ index: 2, text: "below", x: 40, y: 480 }),
      box({ index: 3, text: "also", x: 100, y: 480 }),
    ];
    const body = bodyInReadingOrder(placeReadingOrder(items, 600, 800)).map((it) => it.text);
    expect(body).toEqual(["left", "right", "below", "also"]);
  });
});
