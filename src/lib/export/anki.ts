/**
 * Anki export builders — Round 21 Tier 1。
 *
 * 三種格式：
 *
 *   1. Rich Basic (TSV, 6 fields)
 *      front = word + phonetic
 *      back  = translation + definition + example + source + tags
 *      適合傳統 Q&A 類型卡（Anki Basic notetype）
 *
 *   2. Cloze (TSV, 2 fields: Text + Extra)
 *      Text  = 原句，target word 挖空為 {{c1::word}}
 *      Extra = 字義 + 出處
 *      Anki 的 Cloze notetype。保留語境最佳記憶效率。
 *
 *   3. Phrase Cloze (TSV, 2 fields)
 *      從 PhraseBookmark 產；原句中片語成員挖空
 *      例："differences {{c1::between}} X {{c1::and}} Y."
 *
 * 標準 Anki TSV 匯入：File → Import → 選檔 → Field separator: Tab →
 * Notetype: Basic / Cloze → 欄位對應 → Import。
 */

import type { WordState, PhraseBookmark, DictEntry, Book } from "../../data/types";
import { exportStatus } from "../../data/familiarity";
import { localizeDictEntry } from "../dict/gloss";

// ─── TSV escape helpers ────────────────────────────────────────────────────
// Anki TSV: tab = field sep, newline = record sep. Inside a field, embedded
// newlines break import. Convert to <br> (Anki renders HTML by default).
/**
 * Anki text import: tab separates fields. A field that contains a quote
 * is wrapped in quotes and internal quotes are doubled. Literal "\n"
 * from ECDICT becomes <br> (the rich export is HTML).
 */
export function tsvField(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v)
    .replace(/\\n/g, "<br>")
    .replace(/\r\n|\r|\n|\u2028|\u2029/g, "<br>")
    .replace(/\t/g, " ");
  if (!/["]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function joinMultiline(parts: (string | undefined)[]): string {
  return parts.filter((p) => p && p.trim()).join("<br>");
}

interface Lookup {
  dict: (normalized: string) => Promise<DictEntry | undefined>;
  bookTitle?: (bookId: string) => string | undefined;
}

// ─── Format 1: Rich Basic (6 cols) ──────────────────────────────────────────
// Header row tells Anki about fields when imported with "first line is header".
// Users still need to map to their notetype if different.

export async function wordsToAnkiRich(
  words: WordState[],
  lookup: Lookup,
): Promise<string> {
  const header = ["Word", "Phonetic", "Translation_ZH", "Definition_EN", "Example", "Source", "Tags"];
  const lines: string[] = ["#separator:tab", "#html:true", "#columns:" + header.join(","), header.join("\t")];
  const dicts = await Promise.all(words.map((w) => lookup.dict(w.normalized)));
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const d = localizeDictEntry(dicts[i]);
    const src = w.lastSource;
    const bookTitle = src && lookup.bookTitle ? lookup.bookTitle(src.bookId) : undefined;
    const sourceStr = src
      ? `${bookTitle ?? src.bookId.slice(0, 8)}, p.${src.pageNo}`
      : "";
    const tags = (d?.tags ?? [])
      .concat(d?.cefr && d.cefr !== "unknown" ? [d.cefr] : [])
      .concat([exportStatus(w.level)])
      .join(" ");
    lines.push([
      tsvField(w.normalized),
      tsvField(d?.phonetic ?? ""),
      tsvField(d?.translation ?? ""),
      tsvField(d?.definition ?? ""),
      tsvField(src?.sentence ?? w.note ?? ""),
      tsvField(sourceStr),
      tsvField(tags),
    ].join("\t"));
  }
  return lines.join("\n");
}

// ─── Format 2: Cloze (挖空句式) ─────────────────────────────────────────────
// Text field 內的句子把 target 詞包成 {{c1::word}}。Skip words without a captured
// sentence (cloze needs example). Anki Cloze notetype 有兩欄：Text + Back Extra.

export async function wordsToAnkiCloze(
  words: WordState[],
  lookup: Lookup,
): Promise<{ text: string; skipped: number }> {
  const header = ["Text", "Extra"];
  const lines: string[] = ["#separator:tab", "#html:true", "#notetype:Cloze", header.join("\t")];
  let skipped = 0;
  const withSentence = words.filter((w) => w.lastSource?.sentence);
  const dicts = await Promise.all(withSentence.map((w) => lookup.dict(w.normalized)));

  for (let i = 0; i < withSentence.length; i++) {
    const w = withSentence[i];
    const d = localizeDictEntry(dicts[i]);
    const sentence = w.lastSource!.sentence!;
    const clozeText = wrapCloze(sentence, w.normalized);
    if (!clozeText) { skipped += 1; continue; }
    const src = w.lastSource!;
    const bookTitle = lookup.bookTitle?.(src.bookId);
    const sourceStr = `${bookTitle ?? src.bookId.slice(0, 8)}, p.${src.pageNo}`;
    const extra = joinMultiline([
      d?.phonetic ? `/${d.phonetic}/` : "",
      d?.cefr && d.cefr !== "unknown" ? `[${d.cefr}]` : "",
      d?.translation,
      d?.definition,
      w.note ? `💭 ${w.note}` : "",
      `— ${sourceStr}`,
    ]);
    lines.push(`${tsvField(clozeText)}\t${tsvField(extra)}`);
  }
  skipped += words.length - withSentence.length;
  return { text: lines.join("\n"), skipped };
}

/**
 * 把 sentence 中與 target word 匹配的 token 包成 {{c1::...}}。
 * Matching case-insensitive, word-boundary regex。若找不到回傳 null。
 */
function wrapCloze(sentence: string, target: string): string | null {
  const esc = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b(${esc})\\b`, "i");
  if (!re.test(sentence)) return null;
  return sentence.replace(re, "{{c1::$1}}");
}

// ─── Format 3: Phrase Cloze ─────────────────────────────────────────────────

export function phrasesToAnkiCloze(
  phrases: PhraseBookmark[],
  lookup: Lookup,
  phraseTranslations: Map<string, string>,  // phrase text → 翻譯
): string {
  const header = ["Text", "Extra"];
  const lines: string[] = ["#separator:tab", "#html:true", "#notetype:Cloze", header.join("\t")];

  for (const p of phrases) {
    const bookTitle = lookup.bookTitle?.(p.bookId);
    const sourceStr = p.bookId
      ? `${bookTitle ?? p.bookId.slice(0, 8)}, p.${p.pageNo}`
      : "";
    // Wrap all tokens of the phrase instance (p.text is the matched span text)
    const clozeText = wrapPhraseCloze(p.sentence, p.text);
    if (!clozeText) continue;
    const translation = phraseTranslations.get(p.text.toLowerCase()) ?? "";
    const extra = joinMultiline([
      p.text,
      translation,
      (p.tags ?? []).join(" "),
      p.note ? `💭 ${p.note}` : "",
      sourceStr ? `— ${sourceStr}` : "",
    ]);
    lines.push(`${tsvField(clozeText)}\t${tsvField(extra)}`);
  }
  return lines.join("\n");
}

/**
 * Wrap each token of `phraseText` where it appears in `sentence` with cloze.
 * "between cognitive loads and motor" → if phraseText = "between cognitive
 * loads and motor" then wrap exact occurrence; if it's a pattern like
 * "between and" (matched span), wrap each token separately.
 */
function wrapPhraseCloze(sentence: string, phraseText: string): string | null {
  if (!sentence || !phraseText) return null;
  // Try exact substring match first
  const idx = sentence.toLowerCase().indexOf(phraseText.toLowerCase());
  if (idx >= 0) {
    const match = sentence.slice(idx, idx + phraseText.length);
    return (
      sentence.slice(0, idx) +
      `{{c1::${match}}}` +
      sentence.slice(idx + phraseText.length)
    );
  }
  return null;
}

// ─── Format 4: Basic 正反面（推薦，免設定）─────────────────────────────────
// 預組合 HTML 到 Front / Back 兩欄。直接 import 到 Anki 內建 "Basic" notetype：
//   - Column 1 → Front (word + sentence + source)
//   - Column 2 → Back  (phonetic + translation + definition + note)
// 使用者翻面前主動推理詞義，翻面看解釋。符合 active recall 原則。

export async function wordsToAnkiBasic(
  words: WordState[],
  lookup: Lookup,
): Promise<{ text: string; withSentence: number; withoutSentence: number }> {
  const header = ["Front", "Back"];
  const lines: string[] = [
    "#separator:tab",
    "#html:true",
    "#notetype:Basic",
    "#columns:Front,Back",
    header.join("\t"),
  ];
  const dicts = await Promise.all(words.map((w) => lookup.dict(w.normalized)));
  let withSentence = 0;
  let withoutSentence = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const d = localizeDictEntry(dicts[i]);
    const src = w.lastSource;
    const sentence = src?.sentence;
    const bookTitle = src && lookup.bookTitle ? lookup.bookTitle(src.bookId) : undefined;
    const sourceStr = src
      ? `${bookTitle ?? src.bookId.slice(0, 8)}, p.${src.pageNo}`
      : "";
    const front = buildFront(w.normalized, sentence, sourceStr);
    const back = buildBack(d, w.note);
    if (sentence) withSentence += 1;
    else withoutSentence += 1;
    lines.push(`${tsvField(front)}\t${tsvField(back)}`);
  }
  return { text: lines.join("\n"), withSentence, withoutSentence };
}

function buildFront(word: string, sentence: string | undefined, source: string): string {
  const parts: string[] = [];
  parts.push(`<div style="font-size:1.5em;font-weight:600;letter-spacing:0.02em">${escapeHtml(word)}</div>`);
  if (sentence) {
    const highlighted = highlightTarget(sentence, word);
    parts.push(`<div style="margin-top:14px;font-style:italic;color:#555;line-height:1.5">${highlighted}</div>`);
  }
  if (source) {
    parts.push(`<div style="margin-top:10px;font-size:0.75em;color:#888">— ${escapeHtml(source)}</div>`);
  }
  return parts.join("");
}

function buildBack(d: DictEntry | undefined, note: string | undefined): string {
  const parts: string[] = [];
  const meta: string[] = [];
  if (d?.phonetic) meta.push(`/${escapeHtml(d.phonetic)}/`);
  if (d?.cefr && d.cefr !== "unknown") meta.push(`[${d.cefr}]`);
  if (meta.length) {
    parts.push(`<div style="font-size:0.9em;color:#666">${meta.join(" &nbsp; ")}</div>`);
  }
  if (d?.translation) {
    parts.push(`<div style="margin-top:8px;font-size:1.05em">${escapeMultiline(d.translation)}</div>`);
  }
  if (d?.definition && d.definition !== d.translation) {
    parts.push(`<div style="margin-top:8px;color:#555;font-size:0.95em;line-height:1.5">${escapeMultiline(d.definition)}</div>`);
  }
  if (note) {
    parts.push(`<div style="margin-top:10px;padding-top:8px;border-top:1px solid #eee;color:#555;font-size:0.9em">💭 ${escapeHtml(note)}</div>`);
  }
  if (parts.length === 0) return "(no data)";
  return parts.join("");
}

function highlightTarget(sentence: string, target: string): string {
  const esc = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b(${esc}\\w*)\\b`, "i");
  const escaped = escapeHtml(sentence);
  return escaped.replace(re, '<b style="color:#0369a1">$1</b>');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMultiline(s: string): string {
  return escapeHtml(s).replace(/\\n|\n/g, "<br>");
}

// ─── Filename helpers ────────────────────────────────────────────────────
export function ankiFilename(kind: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `lexigraph-anki-${kind}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.txt`;
}

export function buildBookTitleLookup(books: Book[]): (bookId: string) => string | undefined {
  const m = new Map(books.map((b) => [b.id, b.title]));
  return (id: string) => m.get(id);
}
