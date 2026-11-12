import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_READER_SETTINGS, loadReaderSettings, saveReaderSettings } from "./readerSettings";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
}

describe("reader settings", () => {
  const previous = globalThis.localStorage;
  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: previous,
      configurable: true,
    });
  });

  it("marks unclicked words known unless a saved choice turned that off", () => {
    const store = memoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
    expect(loadReaderSettings().autoMarkKnown).toBe(true);
    expect(loadReaderSettings().confirmAutoMark).toBe(true);

    store.setItem("lexigraph.reader.settings", JSON.stringify({ uiLang: "zh-TW" }));
    expect(loadReaderSettings().autoMarkKnown).toBe(true);

    saveReaderSettings({ ...DEFAULT_READER_SETTINGS, autoMarkKnown: false });
    expect(loadReaderSettings().autoMarkKnown).toBe(false);
  });
});
