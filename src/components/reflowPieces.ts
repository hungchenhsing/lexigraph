/**
 * Reflow paints one button per token. A line-break hyphen is already one
 * lookup key (`com` + `prehensive` → comprehensive) but the two glyph runs
 * are still two buttons, so the word shows up with a gap.
 * Collapse those runs into the joined string. Real compounds keep their hyphen.
 */

export interface ReflowToken {
  text: string;
  normalized: string;
  cls: string;
  charStart: number;
  charEnd: number;
}

export interface ReflowPiece {
  key: string;
  text: string;
  /** Token index used for click and familiarity. Absent for spacing. */
  index?: number;
  indexes?: number[];
  charStart?: number;
  charEnd?: number;
}

const HYPHEN_ONLY = /^[-‐‑–]+$/;

function collapsed(text: string): string {
  return text.replace(/[-‐‑–\s]+/g, "").toLowerCase();
}

export function buildReflowPieces(tokens: readonly ReflowToken[], fullText: string): ReflowPiece[] {
  const ordered = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.charStart >= 0)
    .sort((a, b) => a.token.charStart - b.token.charStart || a.index - b.index);

  interface Run {
    index: number;
    indexes: number[];
    charStart: number;
    charEnd: number;
    normalized: string;
    cls: string;
  }
  const runs: Run[] = [];
  for (const { token, index } of ordered) {
    const prev = runs[runs.length - 1];
    const gap = prev ? fullText.slice(Math.min(prev.charEnd, token.charStart), Math.max(prev.charEnd, token.charStart)) : " ";
    const adjacent = !!prev && token.charStart >= prev.charEnd && (gap === "" || HYPHEN_ONLY.test(gap));
    const sameWord = !!prev
      && adjacent
      && prev.cls === "word"
      && token.cls === "word"
      && token.normalized.length >= 2
      && token.normalized === prev.normalized
      && collapsed(fullText.slice(prev.charStart, token.charEnd)) === collapsed(token.normalized);
    if (prev && sameWord) {
      prev.charEnd = token.charEnd;
      prev.indexes.push(index);
      continue;
    }
    runs.push({
      index,
      indexes: [index],
      charStart: token.charStart,
      charEnd: token.charEnd,
      normalized: token.normalized,
      cls: token.cls,
    });
  }

  const pieces: ReflowPiece[] = [];
  let cursor = 0;
  runs.forEach((run, order) => {
    let text = fullText.slice(run.charStart, run.charEnd);
    if (!text) text = tokens[run.index]?.text ?? "";
    const keepHyphen = run.normalized.includes("-") || run.normalized.includes("‐");
    if (run.cls === "word" && run.normalized && !keepHyphen) text = text.replace(/[-‐‑–]/g, "");
    let charStart = run.charStart;
    if (run.charStart > cursor) {
      const gap = fullText.slice(cursor, run.charStart);
      // A carried prefix (`high` + `way`) sits in fullText before the glyph run.
      const absorb = run.cls === "word"
        && gap.length > 0
        && !/[\s\n]/.test(gap)
        && collapsed(gap + text) === collapsed(run.normalized);
      if (absorb) {
        text = keepHyphen ? gap + text : (gap + text).replace(/[-‐‑–]/g, "");
        charStart = cursor;
      } else {
        pieces.push({ key: `g${order}`, text: gap });
      }
    }
    pieces.push({
      key: `t${run.index}`,
      text,
      index: run.index,
      indexes: run.indexes,
      charStart,
      charEnd: run.charEnd,
    });
    cursor = Math.max(cursor, run.charEnd);
  });
  if (cursor < fullText.length) pieces.push({ key: "end", text: fullText.slice(cursor) });
  return pieces;
}
