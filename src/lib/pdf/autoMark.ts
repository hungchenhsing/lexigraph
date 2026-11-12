/**
 * Which words on a page may be auto-marked known.
 *
 * Reference and bibliography pages are skipped entirely. Citations, numbers,
 * page chrome, mid-sentence capitalised names (authors), email local-parts,
 * and all-caps place abbreviations on an address line are never marked.
 */
import type { TokenClass } from "../../data/types";
import { isSentenceInitial } from "./sentences";

export interface AutoMarkToken {
  text: string;
  normalized: string;
  cls: TokenClass | string;
  zone?: "body" | "header" | "footer" | "pagenumber" | "chrome" | "margin" | "note" | undefined;
  charStart: number;
  lineNo?: number | undefined;
  /** Viewport y, top of the glyph, increasing downward. Same space as pageHeight. */
  y?: number | undefined;
  height?: number | undefined;
}

export interface AutoMarkPage {
  fullText: string;
  citationCount: number;
  wordCount: number;
  pageHeight?: number | undefined;
}

const REFERENCE_HEADING =
  /(?:^|\n)\s*(?:\d+(?:\.\d+)*\.?\s+)?(?:references|bibliography|works\s+cited|literature\s+cited|参考文献)\s*(?:\n|$)/i;

const NAME_SHAPE = /^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?$/;

export function referencePageReason(page: AutoMarkPage): string | null {
  if (REFERENCE_HEADING.test(page.fullText)) return "reference-heading";
  const words = page.wordCount;
  const citations = page.citationCount;
  const denom = words + citations;
  if (denom >= 8 && citations / denom >= 0.4) return "citation-density";
  const years = page.fullText.match(/\b(?:19|20)\d{2}[a-z]?\b/g)?.length ?? 0;
  if (words >= 20 && years >= 8 && years / words > 0.15) return "year-density";
  return null;
}

export function isAuthorNameToken(text: string, sentenceInitial: boolean): boolean {
  const trimmed = text.trim().replace(/[.,;:]+$/g, "");
  if (!NAME_SHAPE.test(trimmed)) return false;
  if (sentenceInitial) return false;
  return true;
}

export interface AutoMarkOptions {
  /** Surfaces the reader already opened on this page. */
  clicked?: ReadonlySet<string> | undefined;
  /** Surfaces that already have a stored state (any level). */
  hasState?: ((normalized: string) => boolean) | undefined;
  /** When the dictionary is ready, skip tokens it does not know (names, noise). */
  inDictionary?: ((normalized: string) => boolean) | undefined;
}

export interface AutoMarkDecision {
  words: string[];
  skippedReason: string | null;
}

export function autoMarkCandidates(
  tokens: AutoMarkToken[],
  page: AutoMarkPage,
  options: AutoMarkOptions = {},
): AutoMarkDecision {
  const reason = referencePageReason(page);
  if (reason) return { words: [], skippedReason: reason };
  const blocked = blockedTokenIndexes(tokens, page.pageHeight);
  const seen = new Set<string>();
  const words: string[] = [];
  tokens.forEach((token, index) => {
    if (blocked.has(index)) return;
    if (!isTokenEligible(token, page.fullText, options)) return;
    if (seen.has(token.normalized)) return;
    seen.add(token.normalized);
    words.push(token.normalized);
  });
  return { words, skippedReason: null };
}

const AFFILIATION = /@|https?:\/\/|www\.|university|institute|laboratory|department/i;

function blockedTokenIndexes(
  tokens: AutoMarkToken[],
  pageHeight: number | undefined,
): Set<number> {
  const blocked = new Set<number>();
  const denied = nameDenylist(tokens, pageHeight);
  const badLines = new Set<number>();
  tokens.forEach((token) => {
    if (token.lineNo === undefined) return;
    if (AFFILIATION.test(token.text)) badLines.add(token.lineNo);
  });
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) for (const index of run) blocked.add(index);
    run = [];
  };
  tokens.forEach((token, index) => {
    if (badLines.has(token.lineNo ?? -1)) blocked.add(index);
    if (denied.has(token.normalized)) blocked.add(index);
    if (/@/.test(token.text) || URL_LIKE.test(token.text) || token.cls === "url") {
      blocked.add(index);
    }
    const shape = token.text.trim().replace(/[.,;:*†‡]+$/g, "");
    if (token.cls === "word" && NAME_SHAPE.test(shape)) run.push(index);
    else if (!/^[,.&]*$/.test(token.text.trim())) flush();
  });
  flush();
  blockEmailLocalsAndPlaces(tokens, blocked);
  return blocked;
}

/**
 * Two-column order gives `{kahe, v-xiangz}@microsoft.com` two line numbers
 * even though the handles and the @ sit on one baseline. Group by y.
 * Tokens with no y fall back to lineNo so older callers keep working.
 */
function visualLineIndexes(tokens: AutoMarkToken[]): number[][] {
  const order = tokens.map((_, index) => index).sort((a, b) => {
    const ta = tokens[a]!;
    const tb = tokens[b]!;
    const ya = ta.y;
    const yb = tb.y;
    if (ya !== undefined && yb !== undefined && Number.isFinite(ya) && Number.isFinite(yb)) {
      return ya - yb || ta.charStart - tb.charStart || a - b;
    }
    if (ya !== undefined && Number.isFinite(ya)) return -1;
    if (yb !== undefined && Number.isFinite(yb)) return 1;
    return (ta.lineNo ?? 0) - (tb.lineNo ?? 0) || ta.charStart - tb.charStart || a - b;
  });
  const lines: number[][] = [];
  for (const index of order) {
    const token = tokens[index]!;
    const line = lines[lines.length - 1];
    const prev = line ? tokens[line[0]!] : undefined;
    const bothY = prev && token.y !== undefined && prev.y !== undefined
      && Number.isFinite(token.y) && Number.isFinite(prev.y);
    const tol = Math.max(2, Math.max(prev?.height ?? 10, token.height ?? 10) * 0.55);
    const sameY = !!bothY && Math.abs(token.y! - prev!.y!) <= tol;
    const sameLineNo = !!prev && !bothY
      && token.y === undefined && prev.y === undefined
      && (token.lineNo ?? -1) === (prev.lineNo ?? -2);
    if (line && (sameY || sameLineNo)) line.push(index);
    else lines.push([index]);
  }
  return lines;
}

const HANDLE = /^[a-z0-9]+(?:[.\-][a-z0-9]+)*$/i;

function looksLikeEmailHandle(token: AutoMarkToken): boolean {
  if (token.cls !== "word" || !HANDLE.test(token.normalized) || token.normalized.length > 24) return false;
  const letters = token.text.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  // "Residual" is a word. "KAHE" would be all caps; author ids are lowercase.
  if (letters[0] === letters[0]!.toUpperCase() && letters !== letters.toUpperCase()) return false;
  return letters === letters.toLowerCase();
}

function lineIsHandleList(indexes: number[], tokens: AutoMarkToken[]): boolean {
  const words = indexes.map((index) => tokens[index]!).filter((token) => token.cls === "word");
  if (words.length === 0 || words.length > 8) return false;
  if (!words.every(looksLikeEmailHandle)) return false;
  const braced = indexes.some((index) => /[{}]/.test(tokens[index]!.text));
  const listed = words.some((token) => /[.\-]/.test(token.normalized) || /[,;]$/.test(token.text.trim()));
  return braced || listed;
}

/**
 * USPS abbreviations that are also ordinary English words (in, or, me, hi, …)
 * are left out on purpose. "CA" / "USA" on a place line are not vocabulary.
 */
const POSTAL = new Set([
  "ak", "az", "ar", "ca", "ct", "dc", "fl", "ga", "ia", "il", "ks", "ky",
  "md", "mi", "mn", "mo", "ms", "mt", "nc", "nd", "ne", "nh", "nj", "nm",
  "nv", "ny", "ri", "sc", "sd", "tn", "tx", "ut", "va", "vt", "wa", "wi",
  "wv", "wy", "usa", "uk", "us", "uae", "prc",
]);

function isPostalAbbreviation(token: AutoMarkToken): boolean {
  const letters = token.text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || letters !== letters.toUpperCase()) return false;
  return POSTAL.has(letters.toLowerCase());
}

function blockEmailLocalsAndPlaces(tokens: AutoMarkToken[], blocked: Set<number>): void {
  const lines = visualLineIndexes(tokens);
  const emailLines = new Set<number>();
  lines.forEach((indexes, lineIndex) => {
    if (indexes.some((index) => /@/.test(tokens[index]!.text))) emailLines.add(lineIndex);
  });
  const yOf = (indexes: number[]) => {
    const ys = indexes
      .map((index) => tokens[index]!.y)
      .filter((y): y is number => y !== undefined && Number.isFinite(y));
    return ys.length > 0 ? Math.min(...ys) : Number.NaN;
  };
  const closeToEmail = (lineIndex: number) => {
    if (emailLines.has(lineIndex)) return true;
    const y = yOf(lines[lineIndex] ?? []);
    if (!Number.isFinite(y)) return false;
    for (const emailIndex of emailLines) {
      const emailY = yOf(lines[emailIndex] ?? []);
      if (!Number.isFinite(emailY)) continue;
      const height = Math.max(
        ...(lines[lineIndex] ?? []).map((index) => tokens[index]!.height ?? 10),
        ...(lines[emailIndex] ?? []).map((index) => tokens[index]!.height ?? 10),
      );
      if (Math.abs(y - emailY) <= Math.max(14, height * 1.6)) return true;
    }
    return false;
  };
  lines.forEach((indexes, lineIndex) => {
    const nearEmail = closeToEmail(lineIndex);
    if (nearEmail && lineIsHandleList(indexes, tokens)) {
      for (const index of indexes) {
        if (tokens[index]!.cls === "word") blocked.add(index);
      }
    } else if (emailLines.has(lineIndex)) {
      for (const index of indexes) {
        const token = tokens[index]!;
        if (looksLikeEmailHandle(token) && /[.\-]/.test(token.normalized)) blocked.add(index);
      }
    }
    const text = indexes.map((index) => tokens[index]!.text).join(" ");
    if (!/[A-Za-z]{2,},\s*[A-Z]{2,3}\b/.test(text)) return;
    for (const index of indexes) {
      if (isPostalAbbreviation(tokens[index]!)) blocked.add(index);
    }
  });
}

const FOOTNOTE_MARK = /^[*†‡∗]/;
const FOOTNOTE_LINE = /equal contribution|work performed while|listing order is random/i;
const MARKER_TEXT = /^[*†‡∗]+$/;
/** Words that sit on an author line but are not personal names. */
const NOT_A_PERSON = new Set([
  "google", "brain", "research", "university", "institute", "laboratory", "lab",
  "department", "college", "technology", "science", "sciences", "national",
  "center", "centre", "school", "academy", "group", "team", "inc", "ltd", "corp",
  "company", "of", "the", "and", "for", "at", "in", "on",
  "this", "these", "those", "we", "our", "their", "however", "therefore",
  "figure", "table", "section", "equation", "with", "from",
]);

function lineTop(line: AutoMarkToken[]): number {
  return line.reduce((min, token) => Math.min(min, token.y ?? min), Number.POSITIVE_INFINITY);
}

function isPersonalName(token: AutoMarkToken): boolean {
  const shape = token.text.trim().replace(/[.,;:*†‡∗]+$/g, "");
  if (!NAME_SHAPE.test(shape)) return false;
  const word = token.normalized;
  // ECDICT contains jakob, ashish, noam, niki, and aidan. Being in the
  // dictionary must not rescue a name that sits on an author or footnote line.
  if (!word || NOT_A_PERSON.has(word)) return false;
  return true;
}

/**
 * Personal names from the first-page author block and from footnotes.
 * A name found there is skipped everywhere on the page, including a later
 * sentence-initial mention ("Noam proposed...").
 *
 * Author lines on arXiv sit under the title, around 30–42% down the page,
 * often with a superscript star. Footnotes start at "Equal contribution"
 * and continue to the bottom; a fixed bottom band missed that block.
 */
function nameDenylist(
  tokens: AutoMarkToken[],
  pageHeight: number | undefined,
): Set<string> {
  const deny = new Set<string>();
  const lines = new Map<number, AutoMarkToken[]>();
  tokens.forEach((token) => {
    const key = token.lineNo ?? -1;
    const line = lines.get(key);
    if (line) line.push(token);
    else lines.set(key, [token]);
  });
  const ordered = [...lines.values()].sort((a, b) => lineTop(a) - lineTop(b));
  const authorLines = new Set<AutoMarkToken[]>();
  for (const line of ordered) {
    const text = line.map((token) => token.text).join(" ");
    const top = lineTop(line);
    const ratio = pageHeight !== undefined && Number.isFinite(top) ? top / pageHeight : undefined;
    const marker = line.some((token) => MARKER_TEXT.test(token.text.trim()));
    const words = line.filter((token) => token.cls === "word");
    const caps = capitalizedNames(line);
    const mostlyNames = words.length > 0 && words.length <= 10 && caps >= 2 && caps * 2 >= words.length && text.length < 120;
    const authorByPosition = ratio !== undefined && ratio < 0.48 && mostlyNames;
    if (marker || authorByPosition || AFFILIATION.test(text)) authorLines.add(line);
  }
  for (const line of ordered) {
    const marker = line.some((token) => MARKER_TEXT.test(token.text.trim()));
    if (!marker) continue;
    for (const other of ordered) {
      if (Math.abs(lineTop(other) - lineTop(line)) <= 16) authorLines.add(other);
    }
  }
  let inFootnote = false;
  for (const line of ordered) {
    const text = line.map((token) => token.text).join(" ");
    if (FOOTNOTE_MARK.test(text.trim()) || FOOTNOTE_LINE.test(text)) inFootnote = true;
    const author = authorLines.has(line);
    if (!inFootnote && !author) continue;
    for (const token of line) {
      if (!isPersonalName(token)) continue;
      if (author || inFootnote) deny.add(token.normalized);
    }
  }
  return deny;
}

function capitalizedNames(line: AutoMarkToken[]): number {
  return line.filter((token) => NAME_SHAPE.test(token.text.trim().replace(/[.,;:]+$/g, ""))).length;
}

const URL_LIKE = /^(?:https?:\/\/|www\.)/i;

function isTokenEligible(token: AutoMarkToken, fullText: string, options: AutoMarkOptions): boolean {
  if (token.cls !== "word") return false;
  if (!token.normalized || token.normalized.length < 2) return false;
  if (/\d/.test(token.normalized) || /\d/.test(token.text)) return false;
  if (token.zone && token.zone !== "body") return false;
  if (options.hasState?.(token.normalized)) return false;
  if (options.clicked?.has(token.normalized)) return false;
  if (options.inDictionary && !options.inDictionary(token.normalized)) return false;
  const sentenceInitial = token.charStart < 0
    ? false
    : isSentenceInitial(fullText, token.charStart);
  if (isAuthorNameToken(token.text, sentenceInitial)) return false;
  return true;
}

/**
 * Confirm list is an opt-in to 學習中.
 * Checked words are learned. Every other candidate — words the reader did
 * not click — becomes 認識. Nothing is left behind as an implied unknown.
 */
export function planConfirmedMarks(
  candidates: readonly string[],
  learn: ReadonlySet<string>,
): { learn: string[]; known: string[] } {
  const learning: string[] = [];
  const known: string[] = [];
  for (const word of candidates) {
    if (learn.has(word)) learning.push(word);
    else known.push(word);
  }
  return { learn: learning, known };
}
