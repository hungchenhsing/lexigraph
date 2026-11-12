import { describe, expect, it } from "vitest";
import type { Book, WordState } from "../../data/types";
import {
  buildBackup,
  mergeSettings,
  mergeUserData,
  parseBackup,
  replaceUserData,
  summarizeBackup,
  type UserDataDump,
} from "./backup";

function word(partial: Partial<WordState> & Pick<WordState, "normalized">): WordState {
  return {
    level: 1,
    firstSeenAt: 1,
    lastSeenAt: 1,
    reviewCount: 1,
    ...partial,
  };
}

function book(id: string, title: string): Book {
  return { id, title, addedAt: 1, source: "pdf", fileRef: `pdf:${id}`, currentPage: 3, totalTokens: 10 };
}

function emptyDump(partial: Partial<UserDataDump> = {}): UserDataDump {
  return {
    wordStates: [],
    books: [],
    phrases: [],
    pages: [],
    llm: [],
    blobs: [],
    ...partial,
  };
}

describe("backup round-trip", () => {
  const settings = {
    llm: {
      mode: "multi",
      gemini: { apiKey: "secret-gemini", enabled: true },
      groq: { apiKey: "secret-groq", enabled: false },
    },
    theme: "dark",
    reader: { autoMarkKnown: false, confirmAutoMark: true, awlUnknownOnly: false, glossScript: "zh-TW" as const, uiLang: "zh-TW" as const },
  };

  it("exports and parses word states, notes, books, and review fields", () => {
    const dump = emptyDump({
      wordStates: [
        word({
          normalized: "study",
          level: 2,
          note: "focus on the verb",
          reviewCount: 4,
          fsrsStability: 2.5,
          fsrsDueAt: 50,
          lastSource: { bookId: "b1", pageNo: 2, sentence: "We study this." },
        }),
      ],
      books: [book("b1", "A paper")],
      phrases: [{
        id: "p1", bookId: "b1", pageNo: 2, text: "in terms of", sentence: "in terms of cost",
        tags: ["method"], createdAt: 9,
      }],
      blobs: [{ key: "pdf:b1", mime: "application/pdf", base64: "QQ==" }],
    });
    const file = buildBackup({ ...dump, settings }, { includeApiKeys: false, includePdfs: true, exportedAt: 42 });
    const parsed = parseBackup(JSON.parse(JSON.stringify(file)));
    expect(parsed.wordStates).toEqual(dump.wordStates);
    expect(parsed.books).toEqual(dump.books);
    expect(parsed.phrases).toEqual(dump.phrases);
    expect(parsed.blobs).toEqual(dump.blobs);
    expect(parsed.exportedAt).toBe(42);
    const llm = parsed.settings.llm as { gemini: { apiKey: string }; groq: { apiKey: string } };
    expect(llm.gemini.apiKey).toBe("");
    expect(llm.groq.apiKey).toBe("");
    expect(parsed.includesApiKeys).toBe(false);
    expect(summarizeBackup(parsed).notes).toBe(1);
  });

  it("can include API keys only when asked", () => {
    const file = buildBackup(
      { ...emptyDump(), settings },
      { includeApiKeys: true, includePdfs: false },
    );
    expect(file.blobs).toEqual([]);
    expect(file.includesPdfs).toBe(false);
    const llm = file.settings.llm as { gemini: { apiKey: string } };
    expect(llm.gemini.apiKey).toBe("secret-gemini");
  });

  it("converts cached glosses to Traditional when that is the reader setting", () => {
    const file = buildBackup({
      ...emptyDump({
        llm: [{
          cacheKey: "k",
          token: "recurrent",
          sentence: "a recurrent layer",
          domain: "cs.ML",
          senseInContext: "循环的",
          syntacticRole: "形容词",
          collocations: ["循环神经网络"],
          backend: "test",
          createdAt: 1,
        }],
      }),
      settings,
    }, { includeApiKeys: false, includePdfs: false });
    expect(file.llm[0]?.senseInContext).toBe("循環的");
    expect(file.llm[0]?.senseInContext).not.toContain("迴圈");
    expect(file.llm[0]?.collocations[0]).toContain("循環");
  });

  it("leaves simplified glosses when the reader chose zh-CN", () => {
    const file = buildBackup({
      ...emptyDump({
        llm: [{
          cacheKey: "k",
          token: "recurrent",
          sentence: "a recurrent layer",
          domain: "cs.ML",
          senseInContext: "循环的",
          syntacticRole: "形容词",
          collocations: [],
          backend: "test",
          createdAt: 1,
        }],
      }),
      settings: { ...settings, reader: { ...settings.reader, glossScript: "zh-CN" } },
    }, { includeApiKeys: false, includePdfs: false });
    expect(file.llm[0]?.senseInContext).toBe("循环的");
  });

  it("rejects a file that is not a backup", () => {
    expect(() => parseBackup({ hello: true })).toThrow(/Not a Lexigraph backup/);
    expect(() => parseBackup({
      format: "lexigraph-backup",
      version: 1,
      wordStates: [{ normalized: "x", level: 9, firstSeenAt: 1, lastSeenAt: 1, reviewCount: 1 }],
    })).toThrow(/invalid level/);
  });
});

describe("import safety", () => {
  const local = emptyDump({
    wordStates: [
      word({ normalized: "local-only", level: 4, note: "keep me", lastSeenAt: 5 }),
      word({ normalized: "shared", level: 1, note: "local note", lastSeenAt: 10, reviewCount: 3 }),
    ],
    books: [book("local", "Local paper"), book("shared", "Shared")],
    phrases: [{
      id: "local-phrase", bookId: "local", pageNo: 1, text: "as a result",
      sentence: "as a result", tags: [], createdAt: 1,
    }],
  });
  const incoming = emptyDump({
    wordStates: [
      word({ normalized: "shared", level: 5, lastSeenAt: 30, reviewCount: 2 }),
      word({ normalized: "from-file", level: 2, lastSeenAt: 8 }),
    ],
    books: [book("from-file", "Imported")],
  });

  it("merge keeps local-only records and does not drop a note when the newer row has none", () => {
    const merged = mergeUserData(local, incoming);
    const keys = merged.wordStates.map((w) => w.normalized).sort();
    expect(keys).toEqual(["from-file", "local-only", "shared"]);
    const shared = merged.wordStates.find((w) => w.normalized === "shared")!;
    expect(shared.level).toBe(5);
    expect(shared.note).toBe("local note");
    expect(shared.reviewCount).toBe(3);
    expect(merged.books.map((b) => b.id).sort()).toEqual(["from-file", "local", "shared"]);
    expect(merged.phrases).toHaveLength(1);
    const again = mergeUserData(merged, incoming);
    expect(again.wordStates.map((w) => w.normalized).sort()).toEqual(keys);
    expect(again.phrases).toHaveLength(1);
  });

  it("replace refuses to run without the confirmation text", () => {
    expect(() => replaceUserData(incoming, "replace")).toThrow(/confirmation/);
    expect(() => replaceUserData(incoming, "")).toThrow(/confirmation/);
  });

  it("replace with confirmation drops local-only rows", () => {
    const replaced = replaceUserData(incoming, "REPLACE");
    expect(replaced.wordStates.map((w) => w.normalized).sort()).toEqual(["from-file", "shared"]);
    expect(replaced.books.map((b) => b.id)).toEqual(["from-file"]);
    expect(replaced.phrases).toEqual([]);
  });

  it("settings merge does not blank an existing API key", () => {
    const current = {
      llm: { gemini: { apiKey: "already-here", enabled: true }, groq: { apiKey: "g" } },
      theme: "light" as const,
    };
    const file = {
      llm: { gemini: { apiKey: "from-backup", enabled: false }, groq: { apiKey: "other" } },
      theme: "dark" as const,
    };
    const hidden = mergeSettings(current, file, false);
    const llm = hidden.llm as { gemini: { apiKey: string; enabled: boolean } };
    expect(llm.gemini.apiKey).toBe("already-here");
    expect(llm.gemini.enabled).toBe(false);
    expect(hidden.theme).toBe("dark");
    const shown = mergeSettings(current, file, true);
    const shownLlm = shown.llm as { gemini: { apiKey: string } };
    expect(shownLlm.gemini.apiKey).toBe("from-backup");
  });
});
