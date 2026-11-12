/**
 * Reading order for positioned text boxes (PDF user space: origin
 * bottom-left, y increases upward).
 *
 * Two-column pages (CVPR / IEEE / ACM / arXiv) are read as full-width lines
 * (title, authors) then the whole left column, then the whole right column.
 * Rotated margin stamps and small footnote / figure labels stay out of the
 * body text so they cannot join a sentence.
 */

export interface LayoutBox {
  index: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees from the x axis. 0 is horizontal. Omitted means 0. */
  angle?: number | undefined;
}

export type TextZone = "body" | "header" | "footer" | "pagenumber" | "margin" | "note";

export interface OrderedBox extends LayoutBox {
  zone: TextZone;
  /** Sequence among body boxes. -1 when the box is not body text. */
  order: number;
}

const PAGE_NUMBER =
  /^(?:[-–—]\s*)?(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,6})(?:\s*(?:\/|of)\s*\d{1,4})?(?:\s*[-–—])?$/i;

const URL_TEXT = /^(?:https?:\/\/|www\.)\S+$/i;

export function placeReadingOrder(
  items: LayoutBox[],
  pageWidth: number,
  pageHeight: number,
): OrderedBox[] {
  if (items.length === 0) return [];
  const med = proseMedian(items);
  const margin = Math.min(pageHeight * 0.09, Math.max(32, pageHeight * 0.06));
  const headerCut = pageHeight - margin;
  const footerCut = margin;

  const zoneOf = (it: LayoutBox): TextZone => {
    if (Math.abs(it.angle ?? 0) > 12) return "margin";
    const inHeader = it.y > headerCut;
    const inFooter = it.y < footerCut;
    if (inHeader || inFooter) {
      const text = it.text.trim();
      if (PAGE_NUMBER.test(text)) return "pagenumber";
      const bigTitle = it.height >= med * 1.15 && text.length > 2;
      if (bigTitle) return "body";
      return inHeader ? "header" : "footer";
    }
    const text = it.text.trim();
    if (URL_TEXT.test(text)) return "note";
    if (it.height > 0 && it.height < med * 0.82 && text.length < 80) return "note";
    return "body";
  };

  const zones = new Map<number, TextZone>();
  for (const it of items) zones.set(it.index, zoneOf(it));
  const body = items.filter((it) => zones.get(it.index) === "body" && it.text.trim().length > 0);
  const splitX = findColumnSplit(body, pageWidth);
  const sequence = splitX === null ? sortReading(body) : orderTwoColumn(body, splitX, pageWidth);

  const orderOf = new Map<number, number>();
  sequence.forEach((it, i) => orderOf.set(it.index, i));

  return items.map((it) => ({
    ...it,
    zone: zones.get(it.index) ?? "body",
    order: orderOf.get(it.index) ?? -1,
  }));
}

/** Body boxes in reading sequence. */
export function bodyInReadingOrder(placed: OrderedBox[]): OrderedBox[] {
  return placed.filter((it) => it.zone === "body" && it.order >= 0).sort((a, b) => a.order - b.order);
}

function proseMedian(items: LayoutBox[]): number {
  const prose = items.filter(
    (it) => Math.abs(it.angle ?? 0) < 12 && it.text.trim().length >= 12 && it.height > 0,
  );
  const pool = (prose.length >= 5 ? prose : items.filter((it) => it.height > 0)).map((it) => it.height);
  return median(pool.length > 0 ? pool : [10]);
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 10;
}

function clusterLines(items: LayoutBox[]): LayoutBox[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: LayoutBox[][] = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    const ref = line?.[0];
    const tol = ref ? Math.max(2, Math.max(ref.height, it.height) * 0.45) : 0;
    if (line && ref && Math.abs(it.y - ref.y) <= tol) line.push(it);
    else lines.push([it]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

function sortReading(items: LayoutBox[]): LayoutBox[] {
  const out: LayoutBox[] = [];
  for (const line of clusterLines(items)) out.push(...line);
  return out;
}

/**
 * Vertical gutter. Returns null when the page is a single column.
 * The split is the x that puts substantial prose on both sides while few
 * lines actually cross it (titles and author lines are allowed to cross).
 */
function findColumnSplit(body: LayoutBox[], pageWidth: number): number | null {
  if (body.length < 8 || pageWidth <= 0) return null;
  let best: { split: number; score: number; left: number; right: number; cross: number } | null = null;
  const minX = pageWidth * 0.3;
  const maxX = pageWidth * 0.7;
  for (let split = minX; split <= maxX; split += 4) {
    let left = 0;
    let right = 0;
    let cross = 0;
    for (const it of body) {
      const rightEdge = it.x + Math.max(it.width, 0);
      if (it.x < split - 8 && rightEdge > split + 8) cross += 1;
      else if (it.x + Math.max(it.width, 0) / 2 < split) left += 1;
      else right += 1;
    }
    if (left < 4 || right < 4) continue;
    if (cross > Math.min(left, right) * 0.35) continue;
    const score = left * right - cross * cross * 8;
    if (!best || score > best.score) best = { split, score, left, right, cross };
  }
  if (!best || best.score <= 0) return null;
  // Sit the split in the real gap between long prose lines, not on a formula.
  const long = body.filter((it) => it.width >= 110);
  const leftEnds = long.filter((it) => it.x + it.width / 2 < best.split + 12).map((it) => it.x + it.width);
  const rightStarts = long.filter((it) => it.x + it.width / 2 >= best.split - 12).map((it) => it.x);
  if (leftEnds.length > 0 && rightStarts.length > 0) {
    const gutterLeft = Math.max(...leftEnds);
    const gutterRight = Math.min(...rightStarts);
    if (gutterRight - gutterLeft >= 8) return (gutterLeft + gutterRight) / 2;
  }
  return best.split;
}

/**
 * A shared baseline is not a full-width line when a gutter-sized hole sits
 * on the column split. CVPR columns are vertically aligned, so the left and
 * right lines share a y. Author lines do not: the space glyphs fill the middle.
 */
function orderTwoColumn(items: LayoutBox[], splitX: number, pageWidth: number): LayoutBox[] {
  const lines = clusterLines(items);
  const out: LayoutBox[] = [];
  let leftBuf: LayoutBox[] = [];
  let rightBuf: LayoutBox[] = [];
  const flush = () => {
    out.push(...leftBuf, ...rightBuf);
    leftBuf = [];
    rightBuf = [];
  };
  for (const line of lines) {
    const part = partitionLine(line, splitX, pageWidth);
    if (part.left.length === 0 && part.right.length === 0) {
      flush();
      out.push(...part.span);
      continue;
    }
    leftBuf.push(...part.left);
    rightBuf.push(...part.right);
    if (part.span.length > 0) {
      flush();
      out.push(...part.span);
    }
  }
  flush();
  return out;
}

function partitionLine(
  line: LayoutBox[],
  splitX: number,
  pageWidth: number,
): { span: LayoutBox[]; left: LayoutBox[]; right: LayoutBox[] } {
  const fullWidth = line.filter((it) => it.width > pageWidth * 0.55);
  const rest = line.filter((it) => it.width <= pageWidth * 0.55);
  const straddling = rest.filter((it) => it.x < splitX - 6 && it.x + it.width > splitX + 6);
  const pieces = rest.filter((it) => !straddling.includes(it));
  const left = pieces.filter((it) => it.x + Math.max(it.width, 0) / 2 < splitX);
  const right = pieces.filter((it) => it.x + Math.max(it.width, 0) / 2 >= splitX);
  const long = (items: LayoutBox[]) => items.some((it) => it.width >= 110);
  const keepGlyphs = () => {
    for (const it of straddling) {
      if (it.x + it.width / 2 < splitX) left.push(it);
      else right.push(it);
    }
  };
  // Two prose lines share a baseline. Formula glyphs may fill the gutter;
  // that must not glue the columns into one sentence.
  if (long(left) && long(right)) {
    keepGlyphs();
    left.sort((a, b) => a.x - b.x);
    right.sort((a, b) => a.x - b.x);
    return { span: fullWidth, left, right };
  }
  if (left.length === 0 || right.length === 0) return { span: [...fullWidth, ...straddling], left, right };
  let maxGap = 0;
  let gapIndex = -1;
  for (let i = 0; i < pieces.length - 1; i++) {
    const gap = pieces[i + 1]!.x - (pieces[i]!.x + pieces[i]!.width);
    if (gap > maxGap) {
      maxGap = gap;
      gapIndex = i;
    }
  }
  const holeAtGutter = maxGap >= 14 && gapIndex >= 0
    && pieces[gapIndex]!.x + pieces[gapIndex]!.width <= splitX + 6
    && pieces[gapIndex + 1]!.x >= splitX - 6;
  if (holeAtGutter) {
    keepGlyphs();
    return { span: fullWidth, left, right };
  }
  return { span: [...fullWidth, ...straddling, ...pieces], left: [], right: [] };
}
