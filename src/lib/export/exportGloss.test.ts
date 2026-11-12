import { describe, expect, it } from "vitest";
import type { DictEntry, WordState } from "../../data/types";
import { tsvField, wordsToAnkiRich } from "./anki";
import { csvCell, wordsToAnki, wordsToCsv } from "./csv";

/** RFC 4180 reader for one physical line, or a whole file of records. */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); records.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); records.push(row); }
  return records;
}

function word(normalized: string): WordState {
  return { normalized, level: 1, firstSeenAt: 1, lastSeenAt: 1, reviewCount: 1 };
}

describe("export gloss script", () => {
  const entry: DictEntry = {
    word: "recurrent",
    translation: "a. 再发生的, 定期重复的, 循环的",
    definition: "循环神经网络",
  };

  it("writes Traditional Chinese into CSV and Anki", async () => {
    const lookup = { dict: async () => entry };
    const csv = await wordsToCsv([word("recurrent")], lookup);
    const anki = await wordsToAnki([word("recurrent")], lookup);
    expect(csv).toContain("循環的");
    expect(csv.split("\n")[0]).toContain("status");
    expect(csv.split("\n")[1]).toContain("learning");
    expect(csv).not.toContain("循环");
    expect(csv).not.toContain("迴圈的");
    expect(anki).toContain("循環神經");
    expect(anki).not.toContain("迴圈");
  });

  it("keeps one CSV row when a gloss has commas, quotes, and literal newlines", async () => {
    const messy: DictEntry = {
      word: "method",
      translation: 'n. 方法, "手段"\\n[计] 方法',
      definition: 'a way.\nAnother line, with "quotes"',
    };
    const csv = await wordsToCsv([word("method")], { dict: async () => messy });
    expect(csv).not.toContain("\\n");
    const records = parseCsvRecords(csv);
    expect(records).toHaveLength(2);
    expect(records[1]?.[0]).toBe("method");
    expect(records[1]?.[3]).toContain("手段");
    expect(records[1]?.[3]).toContain(" / ");
    expect(records[1]?.[3]).not.toContain("\n");
    expect(csvCell('say "hi", friend')).toBe('"say ""hi"", friend"');
  });

  it("exports learning, known, and ignored without the 1–4 scale", async () => {
    const lookup = { dict: async () => undefined };
    const words = [
      { ...word("alpha"), level: 4 as const },
      { ...word("beta"), level: 5 as const },
      { ...word("gamma"), level: 6 as const },
    ];
    const csv = await wordsToCsv(words, lookup);
    const rows = parseCsvRecords(csv);
    expect(rows.slice(1).map((row) => row[1])).toEqual(["learning", "known", "ignored"]);
    const rich = await wordsToAnkiRich(words, lookup);
    const tags = rich.split("\n").filter((line) => line.startsWith("alpha") || line.startsWith("beta") || line.startsWith("gamma"));
    expect(tags.map((line) => line.split("\t").at(-1))).toEqual(["learning", "known", "ignored"]);
  });

  it("quotes Anki fields that contain embedded quotes", () => {
    expect(tsvField('called "attention"\\nmechanism')).toBe('"called ""attention""<br>mechanism"');
    expect(tsvField("plain")).toBe("plain");
  });
});
