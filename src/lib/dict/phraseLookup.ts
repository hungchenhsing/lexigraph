/**
 * Phrase lookup in a sentence context (Round 11C + Round 17 wildcard).
 *
 * Round 17: 支援 pattern 匹配 — 片語可用 `*` 作為 1-4 詞的 wildcard。
 *   "between * and *" 會匹配 "between agents and objects"、
 *   "between the brain and the body" 等。
 *
 * Algorithm:
 *   1. 粗切 sentence → word tokens
 *   2. 找 target 出現位置
 *   3. 對每個候選片語 entry：
 *      - 若片語不含 `*`：原地 exact match（+ lemma first-token 變體）
 *      - 若含 `*`：遞迴 pattern matcher，wildcard 貪婪匹配 1-4 tokens
 *   4. 挑最長且涵蓋 target 位置的命中
 */
import { PHRASE_SEED, type PhraseEntry } from "./phrases";
import { lemmaCandidates } from "./lemmatize";

const MAX_WILDCARD_SPAN = 4;       // 一個 * 最多吃 4 詞
const MAX_MATCH_SPAN = 8;          // 整個片語跨度上限（防爆）

export interface PhraseHit {
  entry: PhraseEntry;
  matchedText: string;
  length: number;
}

export function tokenizeForPhrase(sentence: string): string[] {
  if (!sentence) return [];
  return sentence
    .split(/\s+/)
    .map((tok) => tok.toLowerCase().replace(/^[^\w'-]+|[^\w'-]+$/g, ""))
    .filter(Boolean);
}

/**
 * 在 tokens[startIdx..] 位置嘗試匹配 patternParts。
 * patternParts 可含 "*" wildcard，匹配 1..MAX_WILDCARD_SPAN 詞。
 * 回傳 [start, end]（closed interval）或 null。
 * 每個 literal 也允許以 lemma 形式匹配（e.g. "account" ↔ "accounts"）。
 */
function tryMatchPattern(
  tokens: string[],
  startIdx: number,
  patternParts: string[],
): [number, number] | null {
  function rec(tokenIdx: number, partIdx: number): number | null {
    if (partIdx === patternParts.length) return tokenIdx - 1;
    if (tokenIdx >= tokens.length) return null;
    // 防跨度爆
    if (tokenIdx - startIdx > MAX_MATCH_SPAN) return null;
    const part = patternParts[partIdx];
    if (part === "*") {
      // wildcard: try 1..MAX_WILDCARD_SPAN tokens
      for (let len = 1; len <= MAX_WILDCARD_SPAN; len++) {
        if (tokenIdx + len > tokens.length) break;
        const rest = rec(tokenIdx + len, partIdx + 1);
        if (rest !== null) return rest;
      }
      return null;
    }
    // literal match: direct or via lemma
    const tk = tokens[tokenIdx];
    if (tk === part) return rec(tokenIdx + 1, partIdx + 1);
    // try lemma variants
    for (const lem of lemmaCandidates(tk)) {
      if (lem === part) return rec(tokenIdx + 1, partIdx + 1);
    }
    // or, pattern literal is lemma of token (e.g. pattern "take" vs token "took")
    for (const lem of lemmaCandidates(part)) {
      if (tk === lem) return rec(tokenIdx + 1, partIdx + 1);
    }
    return null;
  }
  const end = rec(startIdx, 0);
  return end !== null ? [startIdx, end] : null;
}

/**
 * 找到 sentence 中涵蓋 target 的最長片語。null if none.
 * target 允許 exact 或 lemma 匹配（"accounts" 找到 "account for"）。
 */
export function findPhraseAt(
  sentence: string | undefined | null,
  target: string | undefined | null,
): PhraseHit | undefined {
  if (!sentence || !target) return undefined;
  const tokens = tokenizeForPhrase(sentence);
  if (tokens.length < 2) return undefined;
  const t = target.toLowerCase().trim();
  if (!t) return undefined;

  // Locate target occurrences (exact or via lemma).
  const targetLemmas = new Set<string>([t, ...lemmaCandidates(t)]);
  const hitIndexes: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (!tk) continue;
    if (targetLemmas.has(tk)) { hitIndexes.push(i); continue; }
    for (const l of lemmaCandidates(tk)) {
      if (targetLemmas.has(l)) { hitIndexes.push(i); break; }
    }
  }
  if (hitIndexes.length === 0) return undefined;

  let best: PhraseHit | undefined;

  // Try every phrase entry × every target hit position × start offset within pattern
  for (const entry of PHRASE_SEED) {
    const parts = entry.phrase.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;

    for (const hitIdx of hitIndexes) {
      // Pattern must span through hitIdx. Try starting at min..hitIdx.
      const minStart = Math.max(0, hitIdx - MAX_MATCH_SPAN);
      const maxStart = hitIdx;
      for (let start = minStart; start <= maxStart; start++) {
        const match = tryMatchPattern(tokens, start, parts);
        if (!match) continue;
        const [s, e] = match;
        if (hitIdx < s || hitIdx > e) continue;  // target not inside match
        const length = e - s + 1;
        if (!best || length > best.length) {
          const matchedText = tokens.slice(s, e + 1).join(" ");
          best = { entry, matchedText, length };
        }
      }
    }
  }
  return best;
}


/**
 * Round 18: 整頁掃描 — 遍歷 tokens，回傳所有命中片語的 span。
 */
export interface PhraseSpan {
  startIdx: number;
  endIdx: number;
  entry: PhraseEntry;
}

export function scanPhrasesInTokens(tokens: string[]): PhraseSpan[] {
  if (tokens.length < 2) return [];

  const byFirst = new Map<string, { parts: string[]; entry: PhraseEntry }[]>();
  const wildcardFirst: { parts: string[]; entry: PhraseEntry }[] = [];
  for (const entry of PHRASE_SEED) {
    const parts = entry.phrase.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const first = parts[0];
    if (first === "*") {
      wildcardFirst.push({ parts, entry });
    } else {
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first)!.push({ parts, entry });
    }
  }

  const spans: PhraseSpan[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (!tk) continue;
    const candidates: { parts: string[]; entry: PhraseEntry }[] = [];
    if (byFirst.has(tk)) candidates.push(...byFirst.get(tk)!);
    for (const lem of lemmaCandidates(tk)) {
      if (byFirst.has(lem)) candidates.push(...byFirst.get(lem)!);
    }
    if (wildcardFirst.length > 0) candidates.push(...wildcardFirst);

    let bestAtI: PhraseSpan | undefined;
    for (const { parts, entry } of candidates) {
      const match = tryMatchPattern(tokens, i, parts);
      if (!match) continue;
      const [s, e] = match;
      const length = e - s + 1;
      if (!bestAtI || length > bestAtI.endIdx - bestAtI.startIdx + 1) {
        bestAtI = { startIdx: s, endIdx: e, entry };
      }
    }
    if (bestAtI) {
      spans.push(bestAtI);
      i = bestAtI.endIdx;
    }
  }
  return spans;
}
