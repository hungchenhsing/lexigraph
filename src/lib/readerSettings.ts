import { useEffect, useState } from "react";

/**
 * Reader behaviour stored in localStorage (not the LLM config).
 *
 * After a page turn, words the reader did not click become 認識. The confirm
 * list is an opt-in to 學習中: checked words are learned, and the rest of
 * that list is still marked known. Reference pages, author names, citations,
 * and numbers stay out of the pass.
 */

export type GlossScript = "zh-TW" | "zh-CN";
export type UiLang = "zh-TW" | "en";

export interface ReaderSettings {
  autoMarkKnown: boolean;
  confirmAutoMark: boolean;
  awlUnknownOnly: boolean;
  /** Dictionary glosses. Default Traditional Chinese (Taiwan). */
  glossScript: GlossScript;
  /** Chrome language. Default Traditional Chinese. */
  uiLang: UiLang;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  autoMarkKnown: true,
  confirmAutoMark: true,
  awlUnknownOnly: false,
  glossScript: "zh-TW",
  uiLang: "zh-TW",
};

const STORAGE_KEY = "lexigraph.reader.settings";

export function loadReaderSettings(): ReaderSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_READER_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_READER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      autoMarkKnown: typeof parsed.autoMarkKnown === "boolean"
        ? parsed.autoMarkKnown
        : DEFAULT_READER_SETTINGS.autoMarkKnown,
      confirmAutoMark: parsed.confirmAutoMark !== false,
      awlUnknownOnly: parsed.awlUnknownOnly === true,
      glossScript: parsed.glossScript === "zh-CN" ? "zh-CN" : "zh-TW",
      uiLang: parsed.uiLang === "en" ? "en" : "zh-TW",
    };
  } catch {
    return { ...DEFAULT_READER_SETTINGS };
  }
}

export function useUiLang(): UiLang {
  const [lang, setLang] = useState<UiLang>(() => loadReaderSettings().uiLang);
  useEffect(() => {
    const sync = () => setLang(loadReaderSettings().uiLang);
    window.addEventListener("lexigraph-settings", sync);
    return () => window.removeEventListener("lexigraph-settings", sync);
  }, []);
  return lang;
}

export function saveReaderSettings(settings: ReaderSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore quota */ }
  try {
    window.dispatchEvent(new Event("lexigraph-settings"));
  } catch { /* not a browser */ }
}
