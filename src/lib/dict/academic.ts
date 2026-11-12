/**
 * Academic tags from dictionary data that already ships with the app.
 *
 * AWL coverage is Coxhead's 570 families (`src/lib/dict/awl.ts`).
 * Seed tags still add a CEFR level when the curated entry has one.
 */
import type { CEFR, DictEntry } from "../../data/types";
import { lookupAwl } from "./awl";
import { DICT_SEED } from "./seed";
import { inflectionLemma } from "./inflection";

export interface AcademicInfo {
  awl: boolean;
  sublist?: number | undefined;
  cefr?: CEFR | undefined;
}

const byWord = new Map<string, AcademicInfo>();

function absorb(word: string, info: AcademicInfo) {
  const prev = byWord.get(word);
  if (!prev) {
    byWord.set(word, info);
    return;
  }
  const next: AcademicInfo = {
    awl: prev.awl || info.awl,
    sublist: prev.sublist ?? info.sublist,
    cefr: prev.cefr ?? info.cefr,
  };
  byWord.set(word, next);
}

for (const entry of DICT_SEED) {
  const parsed = academicFromTags(entry.tags, entry.cefr);
  if (!parsed.awl && !parsed.cefr) continue;
  const key = entry.word.toLowerCase();
  absorb(key, parsed);
  absorb(inflectionLemma(key), parsed);
}

export function academicFromTags(tags: string[] | undefined, cefr?: CEFR | undefined): AcademicInfo {
  let awl = false;
  let sublist: number | undefined;
  for (const tag of tags ?? []) {
    const match = /^awl(?:[-:](\d{1,2}))?$/i.exec(tag.trim());
    if (!match) continue;
    awl = true;
    if (match[1]) sublist = Number(match[1]);
  }
  const info: AcademicInfo = { awl };
  if (sublist) info.sublist = sublist;
  if (cefr && cefr !== "unknown") info.cefr = cefr;
  return info;
}

export function lookupAcademic(surface: string): AcademicInfo | undefined {
  const word = surface.toLowerCase();
  const fromSeed = byWord.get(word) ?? byWord.get(inflectionLemma(word));
  const fromAwl = lookupAwl(word);
  if (!fromSeed && !fromAwl) return undefined;
  const sublist = fromAwl && fromAwl.sublist > 0 ? fromAwl.sublist : fromSeed?.sublist;
  return {
    awl: Boolean(fromSeed?.awl || fromAwl),
    sublist,
    cefr: fromSeed?.cefr,
  };
}

export function isAwlWord(surface: string): boolean {
  return lookupAcademic(surface)?.awl === true;
}

export function academicInfoFor(surface: string, dict?: DictEntry | undefined): AcademicInfo | undefined {
  const fromSeed = lookupAcademic(surface);
  const fromDict = academicFromTags(dict?.tags, dict?.cefr);
  if (!fromSeed && !fromDict.awl && !fromDict.cefr) return undefined;
  const dictCefr = dict?.cefr && dict.cefr !== "unknown" ? dict.cefr : fromDict.cefr;
  return {
    awl: Boolean(fromSeed?.awl || fromDict.awl),
    sublist: fromSeed?.sublist ?? fromDict.sublist,
    // Prefer the curated seed level. ECDICT's level is only a frequency/exam-tag estimate.
    cefr: fromSeed?.cefr ?? dictCefr,
  };
}

export function formatAcademicLabel(info: AcademicInfo | undefined): string | null {
  if (!info) return null;
  const parts: string[] = [];
  if (info.awl) parts.push(info.sublist ? `AWL ${info.sublist}` : "AWL");
  if (info.cefr && info.cefr !== "unknown") parts.push(info.cefr);
  return parts.length > 0 ? parts.join(" · ") : null;
}
