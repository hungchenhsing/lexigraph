/**
 * Convert a pdfjs `TextContent` page into clickable word tokens with accurate
 * viewport-space bounding boxes.
 */
import { pdfjsLib } from "./pdfjs-loader";
import type { PageViewport, PDFPageProxy } from "pdfjs-dist";
import type {
  TextContent,
  TextItem,
  TextStyle,
} from "pdfjs-dist/types/src/display/api";
import { classifyToken, detectCitationSpans, normalizeTokenText } from "./classify";
import type { CitationSpan } from "./classify";
import type { PageToken, TokenClass } from "../../data/types";
import { bodyInReadingOrder, placeReadingOrder, type LayoutBox } from "./readingOrder";
import { sentenceSpans } from "./sentences";
import { applyCarry, boundaryWords, shouldDropLineHyphen } from "./hyphenJoin";
import { dictionaryHas } from "../dict/wordPresence";

export { sentenceAt } from "./sentences";

const measureCanvas =
  typeof document !== "undefined" ? document.createElement("canvas") : null;
const mctx = measureCanvas?.getContext("2d") ?? null;

interface WordSlice {
  text: string;
  start: number;
  end: number;
}

const SOFT_HYPHEN_END = /[-‐‑–]$/;
const LOWER_START = /^[a-z]/;

function endsWithSoftHyphen(s: string): boolean {
  if (!s) return false;
  const trimmed = s.replace(/\s+$/, "");
  return SOFT_HYPHEN_END.test(trimmed);
}

function authorRow(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 80) return false;
  if (/@|university|institute|laboratory|department|google|microsoft/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  const caps = words.filter((word) => /^[A-Z][a-zA-Z.'*-]*$/.test(word)).length;
  return caps >= Math.max(1, words.length - 1);
}

function startsWithLowerLetter(s: string): boolean {
  if (!s) return false;
  const trimmed = s.replace(/^\s+/, "");
  return LOWER_START.test(trimmed);
}

const WORD_INNER_SPLITTER = /[/|–—]+/g;
const URL_PREFIX = /^(?:https?:\/\/|www\.|ftp:\/\/)/i;

function splitItemIntoWords(str: string): WordSlice[] {
  const out: WordSlice[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const text = m[0];
    const baseStart = m.index;
    if (URL_PREFIX.test(text)) {
      out.push({ text, start: baseStart, end: baseStart + text.length });
      continue;
    }
    WORD_INNER_SPLITTER.lastIndex = 0;
    let last = 0;
    let sm: RegExpExecArray | null;
    let didSplit = false;
    while ((sm = WORD_INNER_SPLITTER.exec(text)) !== null) {
      didSplit = true;
      if (sm.index > last) {
        out.push({
          text: text.slice(last, sm.index),
          start: baseStart + last,
          end: baseStart + sm.index,
        });
      }
      last = sm.index + sm[0].length;
    }
    if (didSplit) {
      if (last < text.length) {
        out.push({
          text: text.slice(last),
          start: baseStart + last,
          end: baseStart + text.length,
        });
      }
    } else {
      out.push({ text, start: baseStart, end: baseStart + text.length });
    }
  }
  return out;
}

interface WordBox {
  text: string;
  startInItem: number;
  endInItem: number;
  bbox: { left: number; top: number; width: number; height: number };
  fontMeta: { fontFamily: string; fontSize: number; scaleX: number };
}

function placeWordsForItem(
  item: TextItem,
  viewport: PageViewport,
  styles: Record<string, TextStyle>,
): WordBox[] {
  if (!item.str || !item.str.trim() || !mctx) return [];
  const m = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const fontHeight = Math.hypot(m[2], m[3]);
  if (fontHeight < 1) return [];
  const originX = m[4];
  const originY = m[5];
  const targetWidth = item.width * viewport.scale;
  if (targetWidth <= 0) return [];
  const style = item.fontName ? styles[item.fontName] : undefined;
  const fontFamily = style?.fontFamily || "serif";
  const fontSize = Math.max(6, fontHeight);
  mctx.font = `${fontSize.toFixed(2)}px ${fontFamily}, serif`;
  const naturalFull = mctx.measureText(item.str).width;
  if (naturalFull <= 0) return [];
  const scaleX = targetWidth / naturalFull;

  const PAD_X = Math.max(1, fontHeight * 0.04);
  const PAD_Y = Math.max(2, fontHeight * 0.08);

  const words = splitItemIntoWords(item.str);
  const boxes: WordBox[] = [];
  for (const w of words) {
    const preWidth =
      w.start === 0 ? 0 : mctx.measureText(item.str.slice(0, w.start)).width;
    const wordWidth = mctx.measureText(item.str.slice(0, w.end)).width - preWidth;
    const vx = originX + preWidth * scaleX;
    const vw = wordWidth * scaleX;
    const top = originY - fontHeight * 0.85 - PAD_Y;
    const height = fontHeight * 1.0 + PAD_Y * 2;
    boxes.push({
      text: w.text,
      startInItem: w.start,
      endInItem: w.end,
      bbox: { left: vx - PAD_X, top, width: vw + PAD_X * 2, height },
      fontMeta: { fontFamily, fontSize, scaleX },
    });
  }
  return boxes;
}

export interface TokenizedPage {
  pageNo: number;
  tokens: PageToken[];
  fullText: string;
  citationSpans: CitationSpan[];
  stats: Record<TokenClass | "total", number>;
}

export interface TokenizeOptions {
  /** Head of a hyphen left open at the end of the previous page (`high-` + `way`). */
  carryIn?: string | undefined;
}

export async function pageTrailingHyphenHead(pdfPage: PDFPageProxy): Promise<string | undefined> {
  const textContent = await pdfPage.getTextContent();
  const items = textContent.items.filter((it): it is TextItem => "str" in it);
  const base = pdfPage.getViewport({ scale: 1 });
  const layout: LayoutBox[] = items.map((item, index) => ({
    index,
    text: item.str ?? "",
    x: item.transform?.[4] ?? 0,
    y: item.transform?.[5] ?? 0,
    width: item.width ?? 0,
    height: Math.hypot(item.transform?.[2] ?? 0, item.transform?.[3] ?? 0) || item.height || 0,
    angle: Math.atan2(item.transform?.[1] ?? 0, item.transform?.[0] ?? 1) * 180 / Math.PI,
  }));
  const body = bodyInReadingOrder(placeReadingOrder(layout, base.width, base.height));
  const pageNumber = /^(?:[-–—]\s*)?(?:\d{1,4}|[ivxlcdm]{1,8})$/i;
  for (let i = body.length - 1; i >= 0; i--) {
    const text = body[i]!.text.trim();
    if (!text || pageNumber.test(text)) continue;
    if (!/[-‐‑–]$/.test(text)) return undefined;
    return boundaryWords(text, "next").head || undefined;
  }
  return undefined;
}

export async function tokenizePage(
  pdfPage: PDFPageProxy,
  pageNo: number,
  scale: number,
  options: TokenizeOptions = {},
): Promise<{
  viewport: PageViewport;
  textContent: TextContent;
  tokenized: TokenizedPage;
}> {
  const viewport = pdfPage.getViewport({ scale });
  const textContent = await pdfPage.getTextContent();
  const items = textContent.items.filter((it): it is TextItem => "str" in it);
  const styles = textContent.styles as Record<string, TextStyle>;

  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const layout: LayoutBox[] = items.map((item, index) => ({
    index,
    text: item.str ?? "",
    x: item.transform?.[4] ?? 0,
    y: item.transform?.[5] ?? 0,
    width: item.width ?? 0,
    height: Math.hypot(item.transform?.[2] ?? 0, item.transform?.[3] ?? 0) || item.height || 0,
    angle: Math.atan2(item.transform?.[1] ?? 0, item.transform?.[0] ?? 1) * 180 / Math.PI,
  }));
  const bodyOrder = bodyInReadingOrder(
    placeReadingOrder(layout, baseViewport.width, baseViewport.height),
  );

  let fullText = "";
  const itemRanges = new Map<number, { start: number; end: number }>();
  // Line-end hyphen → the next item in reading order. drop=true removes it
  // (com-prehensive). drop=false keeps it (English-to-German, 34-layer).
  const hyphenJoins = new Map<number, { next: number; drop: boolean }>();
  let carriedPrefix = "";
  for (let n = 0; n < bodyOrder.length; n++) {
    const current = bodyOrder[n]!;
    const item = items[current.index]!;
    let str = item.str ?? "";
    if (n === 0 && options.carryIn) {
      const carried = applyCarry(options.carryIn, str, dictionaryHas);
      if (carried) {
        carriedPrefix = carried.drop ? options.carryIn : `${options.carryIn}-`;
        str = carried.text;
      }
    }
    if (n > 0) {
      const prev = bodyOrder[n - 1]!;
      const prevItem = items[prev.index]!;
      const prevStr = prevItem.str ?? "";
      const sameLine = Math.abs(current.y - prev.y) <= Math.max(2, Math.max(current.height, prev.height) * 0.55);
      const stitch = endsWithSoftHyphen(prevStr) && startsWithLowerLetter(str) && (sameLine || !!prevItem.hasEOL);
      if (stitch) {
        const { head, tail } = boundaryWords(prevStr, str);
        const drop = shouldDropLineHyphen(head, tail, dictionaryHas);
        if (drop) {
          fullText = fullText.replace(/[-‐‑–]$/, "");
          const prevRange = itemRanges.get(prev.index);
          if (prevRange) prevRange.end = fullText.length;
        }
        hyphenJoins.set(prev.index, { next: current.index, drop });
      } else if (sameLine) {
        fullText += " ";
      } else {
        const gap = prev.y - current.y;
        // A new column jumps back up the page. A paragraph leaves a taller gap.
        // Either one ends the sentence context; a normal line wrap does not.
        const paragraph = gap < 0 || gap > Math.max(prev.height, 8) * 1.8;
        const authorBreak = !paragraph && (authorRow(prevStr) || authorRow(str));
        fullText += paragraph ? "\n\n" : authorBreak ? "\n" : " ";
      }
    }
    const start = fullText.length;
    fullText += str;
    itemRanges.set(current.index, { start, end: fullText.length });
  }

  const citationSpans = detectCitationSpans(fullText);
  const sentenceMap = new Array<number>(fullText.length);
  sentenceSpans(fullText).forEach(([from, to], sentenceId) => {
    for (let i = from; i < to && i < sentenceMap.length; i++) sentenceMap[i] = sentenceId;
  });

  const tokens: PageToken[] = [];
  const stats: Record<string, number> = {
    total: 0, word: 0, citation: 0, formula: 0, number: 0,
    figureref: 0, punct: 0, url: 0, other: 0,
  };

  // Track first/last token index per item for hyphen re-stitching.
  const itemFirstTok = new Map<number, number>();
  const itemLastTok = new Map<number, number>();

  let lineNo = 0;
  let lastLineY: number | null = null;
  for (const ordered of bodyOrder) {
    const i = ordered.index;
    const item = items[i]!;
    if (lastLineY !== null && Math.abs(ordered.y - lastLineY) > Math.max(2, ordered.height * 0.45)) {
      lineNo += 1;
    }
    lastLineY = ordered.y;
    const boxes = placeWordsForItem(item, viewport, styles);
    const itemGlobalStart = itemRanges.get(i)?.start ?? 0;
    const carryShift = i === bodyOrder[0]?.index ? carriedPrefix.length : 0;
    for (const b of boxes) {
      const globalStart = itemGlobalStart + b.startInItem + carryShift;
      let globalEnd = itemGlobalStart + b.endInItem + carryShift;
      // The source string still contains the soft hyphen; fullText does not.
      if (hyphenJoins.get(i)?.drop && /[-‐‑–]$/.test(b.text)) globalEnd -= 1;
      const inCitation = citationSpans.some(
        (cs) => globalStart >= cs.start && globalEnd <= cs.end,
      );
      const cls: TokenClass = inCitation ? "citation" : classifyToken(b.text);
      const sentenceId = sentenceMap[globalStart] ?? 0;
      const tokIdx = tokens.length;
      tokens.push({
        x: b.bbox.left, y: b.bbox.top, w: b.bbox.width, h: b.bbox.height,
        text: b.text,
        normalized: carryShift && b.startInItem === 0
          ? normalizeTokenText(`${carriedPrefix}${b.text}`)
          : normalizeTokenText(b.text),
        cls,
        itemIndex: i, charStart: globalStart, charEnd: globalEnd,
        sentenceId, lineNo, zone: "body",
      });
      if (!itemFirstTok.has(i)) itemFirstTok.set(i, tokIdx);
      itemLastTok.set(i, tokIdx);
      stats.total = (stats.total ?? 0) + 1;
      stats[cls] = (stats[cls] ?? 0) + 1;
    }
  }

  // Both halves of a line-break hyphen share one lookup key.
  // Soft breaks drop the hyphen; compounds and number-unit breaks keep it.
  for (const [prevIndex, join] of hyphenJoins) {
    const aLastIdx = itemLastTok.get(prevIndex);
    const bFirstIdx = itemFirstTok.get(join.next);
    if (aLastIdx === undefined || bFirstIdx === undefined) continue;
    const aLast = tokens[aLastIdx]!;
    const bFirst = tokens[bFirstIdx]!;
    if (aLast.cls !== "word" && aLast.cls !== "number") continue;
    if (bFirst.cls !== "word" && bFirst.cls !== "number") continue;
    const headRaw = aLast.text.replace(/[-‐‑–]+$/, "");
    const tailRaw = bFirst.text;
    const stitched = normalizeTokenText(join.drop ? headRaw + tailRaw : `${headRaw}-${tailRaw}`);
    if (!stitched || stitched.length < 2) continue;
    aLast.normalized = stitched;
    bFirst.normalized = stitched;
  }

  return {
    viewport, textContent,
    tokenized: { pageNo, tokens, fullText, citationSpans, stats: stats as Record<TokenClass | "total", number> },
  };
}
