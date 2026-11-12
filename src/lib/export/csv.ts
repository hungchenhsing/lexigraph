/**
 * 詞彙 / 片語匯出（Round 15）。
 *
 * 三種格式：
 *   - csv  — Excel / Google Sheets 友好
 *   - anki — TSV（Anki default for "Plain Text" import），兩欄 front/back
 *   - json — 備份還原用（之後可以做 import）
 */

import type { WordState, PhraseBookmark, DictEntry } from "../../data/types";
import { exportStatus } from "../../data/familiarity";
import { localizeDictEntry } from "../dict/gloss";
import { tsvField } from "./anki";

/**
 * RFC 4180 field. Dictionary glosses store the two characters "\n"
 * between senses; a raw newline (or that escape left in place) splits
 * a row in Excel. Senses become " / " so each record is one physical line.
 * Commas, quotes, and any leftover break still quote the field, and
 * embedded quotes are doubled.
 */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? "" : String(v);
  s = s.replace(/\\n/g, " / ").replace(/\r\n|\r|\n|\u2028|\u2029/g, " / ");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface Lookup {
  dict: (normalized: string) => Promise<DictEntry | undefined>;
}

export async function wordsToCsv(
  words: WordState[],
  lookup: Lookup,
): Promise<string> {
  const header = [
    "word", "status", "review_count",
    "translation", "phonetic", "cefr",
    "note", "first_seen", "last_seen",
  ];
  const lines = [header.join(",")];
  // Batch dict lookups to avoid sequential await spam.
  const entries = await Promise.all(words.map((w) => lookup.dict(w.normalized)));
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const d = localizeDictEntry(entries[i]);
    lines.push([
      csvCell(w.normalized),
      csvCell(exportStatus(w.level)),
      csvCell(w.reviewCount),
      csvCell(d?.translation ?? d?.definition ?? ""),
      csvCell(d?.phonetic ?? ""),
      csvCell(d?.cefr ?? ""),
      csvCell(w.note ?? ""),
      csvCell(new Date(w.firstSeenAt).toISOString()),
      csvCell(new Date(w.lastSeenAt).toISOString()),
    ].join(","));
  }
  return lines.join("\n");
}

/**
 * Anki TSV: front = word, back = translation + phonetic + cefr + note.
 * Tabs separate fields; newlines in back get escaped to <br> (Anki HTML).
 */
export async function wordsToAnki(
  words: WordState[],
  lookup: Lookup,
): Promise<string> {
  const lines: string[] = [];
  const entries = await Promise.all(words.map((w) => lookup.dict(w.normalized)));
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const d = localizeDictEntry(entries[i]);
    const back: string[] = [];
    if (d?.phonetic) back.push(`/${d.phonetic}/`);
    if (d?.translation) back.push(d.translation);
    if (d?.definition && d.definition !== d.translation) back.push(d.definition);
    if (d?.cefr) back.push(`[${d.cefr}]`);
    if (w.note) back.push(`📝 ${w.note}`);
    lines.push(`${tsvField(w.normalized)}\t${tsvField(back.join("<br>"))}`);
  }
  return lines.join("\n");
}

export function phrasesToCsv(phrases: PhraseBookmark[]): string {
  const header = ["phrase", "sentence", "tags", "note", "created"];
  const lines = [header.join(",")];
  for (const p of phrases) {
    lines.push([
      csvCell(p.text),
      csvCell(p.sentence),
      csvCell((p.tags ?? []).join(";")),
      csvCell(p.note ?? ""),
      csvCell(new Date(p.createdAt).toISOString()),
    ].join(","));
  }
  return lines.join("\n");
}

/** Trigger a browser download for a text blob. */
export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
