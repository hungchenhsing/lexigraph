import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DICT_PUBLIC_PATH, resolveDictFetchUrl } from "./dictUrl";

describe("dictionary fetch URL", () => {
  it("resolves against the page, not the worker bundle in /assets", () => {
    const url = resolveDictFetchUrl("./dict/ecdict-core.json.gz", "https://read.zhenxinghong.com/");
    expect(url).toBe("https://read.zhenxinghong.com/dict/ecdict-core.json.gz");
    expect(url).not.toContain("/assets/dict");
  });

  it("keeps a subfolder deploy under that folder", () => {
    const url = resolveDictFetchUrl("./dict/ecdict-core.json.gz", "https://example.com/lex/index.html");
    expect(url).toBe("https://example.com/lex/dict/ecdict-core.json.gz");
  });

  it("leaves an injected data URL alone", () => {
    expect(resolveDictFetchUrl("data:application/gzip;base64,QQ==", "https://read.zhenxinghong.com/")).toBe(
      "data:application/gzip;base64,QQ==",
    );
  });

  it("publishes the gzip the worker fetches", () => {
    expect(existsSync(`public/${DICT_PUBLIC_PATH}`)).toBe(true);
  });
});
