/**
 * Token classification + citation-span detection.
 *
 * Ported verbatim from phase0/poc-a/index.html v3. Kept in a standalone module
 * so we can unit-test the regex set without a browser.
 */
import type { TokenClass } from "../../data/types";

// ─── Citation detection (operates on full-page text) ────────────────────────

/**
 * Two regex flavors:
 *   1. Numbered   — [12], [12-15], [12, 17, Smith 23]
 *   2. Author-year — (Smith, 2020), (Smith & Jones, 2020), Smith et al. 2020
 *
 * A match of pattern 2 is only kept if it actually contains a 4-digit year,
 * otherwise proper nouns like "Gaussian Mixture" would get swept up.
 */
export const CITATION_PATTERNS: RegExp[] = [
  /\[\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*(?:\d+(?:\s*[-–—]\s*\d+)?|[A-Za-z][A-Za-z\. ]*\s*\d+(?:\.\d+)?))*\]/g,
  /\(?[A-Z][a-zA-Z\-']+(?:'s)?(?:\s+(?:et\s+al\.?|and\s+colleagues|and|&)\s+[A-Z][a-zA-Z\-']+)*(?:,?\s*\(?\d{4}[a-z]?\)?)\)?/g,
];

export interface CitationSpan {
  start: number;
  end: number;
  text: string;
}

export function detectCitationSpans(fullText: string): CitationSpan[] {
  const spans: CitationSpan[] = [];
  for (const pat of CITATION_PATTERNS) {
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(fullText)) !== null) {
      // For the author-year pattern, require a 4-digit year to prune false pos.
      if (!/\d{4}/.test(m[0]) && !m[0].startsWith("[")) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  spans.sort((a, b) => a.start - b.start);

  // Merge overlapping ranges.
  const merged: CitationSpan[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      last.text = fullText.slice(last.start, last.end);
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

// ─── Per-token classification ───────────────────────────────────────────────

const FIGURE_REF  = /^(?:Fig(?:ure)?|Table|Eq(?:uation)?|Sec(?:tion)?|Ref\.?|Chapter|Ch\.?)\.?\s*\d+[a-z]?$/i;
const PURE_NUMBER = /^-?\d+(?:[.,]\d+)*%?$/;
const URL_LIKE    = /^(?:https?:\/\/|www\.)\S+/i;
const MATHY_CHARS = /[∑∏∫∆∇∂√π≤≥≠≈±×÷αβγδθλμσφψωΓΔΘΛΞΠΣΦΨΩ∈∉⊂⊃∪∩∀∃←→↔⇒⇔ℝℕℤℚℂ]/;
const WORD_SHAPE  = /^[A-Za-z][A-Za-z\-']*$/;

/** Classify a single (pre-tokenized) text fragment. */
export function classifyToken(raw: string): TokenClass {
  const stripped = raw.trim().replace(/^[.,;:!?)("'\-]+|[.,;:!?)("'\-]+$/g, "");
  if (!stripped) return "punct";
  if (URL_LIKE.test(stripped)) return "url";
  if (PURE_NUMBER.test(stripped)) return "number";
  if (FIGURE_REF.test(raw.trim())) return "figureref";
  if (MATHY_CHARS.test(stripped)) return "formula";
  if (stripped.length <= 1 && !/^[A-Za-z]$/.test(stripped)) return "formula";
  if (WORD_SHAPE.test(stripped)) return "word";
  if (
    /^[A-Za-z]/.test(stripped) &&
    stripped.replace(/[^A-Za-z]/g, "").length / stripped.length > 0.6
  ) {
    return "word";
  }
  return "other";
}

/** Normalized lookup key (lowercase, trailing punctuation stripped). */
export function normalizeTokenText(raw: string): string {
  return raw
    .trim()
    .replace(/^[.,;:!?)("'\-]+|[.,;:!?)("'\-]+$/g, "")
    .toLowerCase();
}
