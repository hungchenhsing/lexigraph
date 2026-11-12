/**
 * Sentence spans for academic prose.
 *
 * A period does not end a sentence when it belongs to an abbreviation
 * (e.g., i.e., et al., Fig., pp.), a decimal, or an initial. Newlines that
 * are only line wraps are not boundaries; a blank line is.
 */

const ABBREVIATIONS = [
  "e.g", "i.e", "et al", "fig", "figs", "pp", "p", "vol", "vols", "no", "nos",
  "dr", "mr", "mrs", "ms", "prof", "vs", "cf", "etc", "eq", "eqs", "sec",
  "chap", "ch", "ed", "eds", "ibid", "viz", "ca", "jr", "sr", "st", "approx",
  "trans", "op", "cit", "al", "dept", "univ", "assoc", "proc", "conf",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "inc", "ltd", "co", "corp", "gen", "rev", "suppl", "n.d", "ph.d", "u.s", "u.k",
].sort((a, b) => b.length - a.length);

export function isSentenceBoundary(text: string, index: number): boolean {
  const ch = text[index];
  if (ch !== "." && ch !== "!" && ch !== "?") return false;
  const next = text[index + 1];
  if (next !== undefined && !/\s/.test(next)) return false;
  if (ch === "." && isAbbreviationPeriod(text, index)) return false;
  return true;
}

function isAbbreviationPeriod(text: string, index: number): boolean {
  const start = Math.max(0, index - 20);
  const before = text.slice(start, index).toLowerCase();
  for (const abbr of ABBREVIATIONS) {
    if (!before.endsWith(abbr)) continue;
    const at = before.length - abbr.length;
    if (at === 0) return true;
    const prev = before[at - 1]!;
    if (/[\s([/"'\u201c\u2018]/.test(prev)) return true;
  }
  // Single-letter initial: "A. Smith" / "J. R. R."
  if (/(?:^|[\s([/"'])[a-z]$/.test(before)) return true;
  return false;
}

/** [start, end) spans covering `text`. Punctuation stays with the sentence. */
export function sentenceSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let cursor = 0;
  const mark = (end: number) => {
    if (end > cursor) spans.push([cursor, end]);
    cursor = end;
  };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n" && text[i + 1] === "\n") {
      mark(i);
      while (text[cursor] === "\n") cursor += 1;
      i = cursor - 1;
      continue;
    }
    if (isSentenceBoundary(text, i)) {
      mark(i + 1);
      while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
      i = Math.max(i, cursor - 1);
    }
  }
  if (cursor < text.length) spans.push([cursor, text.length]);
  if (spans.length === 0) spans.push([0, text.length]);
  return spans;
}

export function sentenceAt(fullText: string, charStart: number, charEnd: number): string {
  if (charStart < 0 || !fullText) return "";
  const spans = sentenceSpans(fullText);
  for (const [start, end] of spans) {
    if (charStart >= start && charStart < end) return fullText.slice(start, end).trim();
  }
  const overlap = spans.find(([start, end]) => charEnd > start && charStart < end);
  if (overlap) return fullText.slice(overlap[0], overlap[1]).trim();
  return fullText.slice(charStart, Math.max(charStart, charEnd)).trim();
}

/** True when only opening punctuation/whitespace sits between a sentence start and `charStart`. */
export function isSentenceInitial(fullText: string, charStart: number): boolean {
  if (charStart <= 0) return true;
  const spans = sentenceSpans(fullText);
  for (const [start, end] of spans) {
    if (charStart < start || charStart >= end) continue;
    return /^[\s"'“”‘’(\[]*$/.test(fullText.slice(start, charStart));
  }
  return /^[\s"'“”‘’(\[]*$/.test(fullText.slice(0, charStart));
}
