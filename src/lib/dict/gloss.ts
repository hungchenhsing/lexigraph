/**
 * Show ECDICT glosses in Traditional Chinese and put technical senses first.
 *
 * This is not word-sense disambiguation. ECDICT often lists a biology or
 * medicine sense ahead of a computing one; we only reorder lines it already
 * tagged. If every line is the same word (轉導 / 转导), the card still says that.
 */
import { useEffect, useState } from "react";
import * as OpenCC from "opencc-js/cn2t";
import type { AcademicDomain } from "../../data/types";
import { loadReaderSettings, type GlossScript } from "../readerSettings";

const toTraditional = OpenCC.Converter({ from: "cn", to: "twp" });

/**
 * OpenCC s2twp maps 循环 → 迴圈 (the Taiwan computing noun "loop").
 * In academic glosses 循环的 means recurrent/circular, which is 循環的.
 * Noun 迴圈 (a loop) is left alone. Recurrent networks are 循環神經網路.
 */
const TRADITIONAL_OVERRIDES: Array<[string, string]> = [
  ["迴圈的", "循環的"],
  ["迴圈神經", "循環神經"],
  ["迴圈網路", "循環網路"],
];

function applyTraditionalOverrides(text: string): string {
  let out = text;
  for (const [from, to] of TRADITIONAL_OVERRIDES) out = out.split(from).join(to);
  return out;
}

const TECH = /\[(?:计|數|数|统|統|物|工)\]/;
const LIFE = /\[(?:化|医|醫|生|植|药|藥)\]/;
const LIFE_EN = /\b(?:genetics|genetic|medical|medicine|chemical|biology|biological|anatom)/i;

export type { GlossScript };

export function rankGlossLines(raw: string, domain?: AcademicDomain | undefined): string {
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return lines[0] ?? raw;
  const bioDomain = domain?.startsWith("bio") === true;
  const scored = lines.map((line, index) => ({ line, index, score: scoreLine(line, bioDomain) }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((row) => row.line).join("\n");
}

function scoreLine(line: string, bioDomain: boolean): number {
  let score = 0;
  if (TECH.test(line)) score += 3;
  if (LIFE.test(line) || LIFE_EN.test(line)) score += bioDomain ? 3 : -2;
  return score;
}

export function presentGloss(
  raw: string | undefined,
  script: GlossScript,
  domain?: AcademicDomain | undefined,
): string | undefined {
  if (!raw) return raw;
  const ranked = rankGlossLines(raw, domain);
  if (script === "zh-CN") return ranked;
  return applyTraditionalOverrides(toTraditional(ranked));
}

/** Dictionary fields in the user's gloss script. Notes are left as typed. */
export function localizeDictEntry<T extends { translation?: string | undefined; definition?: string | undefined }>(
  entry: T | undefined,
  script: GlossScript = loadReaderSettings().glossScript,
): T | undefined {
  if (!entry) return entry;
  return {
    ...entry,
    translation: presentGloss(entry.translation, script),
    definition: presentGloss(entry.definition, script),
  };
}

export function useGlossScript(): GlossScript {
  const [script, setScript] = useState<GlossScript>(() => loadReaderSettings().glossScript);
  useEffect(() => {
    const sync = () => setScript(loadReaderSettings().glossScript);
    window.addEventListener("lexigraph-settings", sync);
    return () => window.removeEventListener("lexigraph-settings", sync);
  }, []);
  return script;
}
