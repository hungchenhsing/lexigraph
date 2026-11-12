/**
 * Persisted Repo impl backed by IndexedDB -- Round 12 (+ Round 15 SRS).
 */

import type {
  Book, Page, WordState, PhraseBookmark, LLMExplanation, DictEntry,
  FamiliarityLevel,
} from "./types";
import type { Repo } from "./repo";
import { DICT_SEED } from "../lib/dict/seed";
import { lemmaCandidates } from "../lib/dict/lemmatize";
import { lookupEcdict, onEcdictStatus } from "../lib/dict/ecdict";
import { applyRating, type Rating } from "../lib/srs/fsrs";
import {
  STORE, idbGet, idbPut, idbDelete, idbGetAll, idbGetAllEntries, openLexigraphDb,
} from "./idb";
import { migrateWordStatesToLemmas } from "./lemmaMigration";
import { collapseFamiliarityLevels, countByStatus } from "./familiarity";
import { lookupState, nextWordState, staleKeys, unseenFreshMarks } from "./wordStateUpdate";
import {
  base64ToBytes, bytesToBase64, mergeUserData, replaceUserData,
  type BackupBlob, type UserDataDump,
} from "../lib/backup/backup";

const now = () => Date.now();

export class IndexedDBRepo implements Repo {
  private books = new Map<string, Book>();
  private pages = new Map<string, Page>();
  private wordStates = new Map<string, WordState>();
  private phrases = new Map<string, PhraseBookmark>();
  private llm = new Map<string, LLMExplanation>();
  private dict = new Map<string, DictEntry>();

  private listeners = new Set<() => void>();
  private _initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      for (const e of DICT_SEED) this.dict.set(e.word.toLowerCase(), e);
      const [books, wordStates, phrases, llm] = await Promise.all([
        idbGetAll<Book>(STORE.books),
        idbGetAll<WordState>(STORE.wordStates),
        idbGetAll<PhraseBookmark>(STORE.phrases),
        idbGetAll<LLMExplanation>(STORE.llm),
      ]);
      for (const b of books) if (b?.id) this.books.set(b.id, b);
      const migration = migrateWordStatesToLemmas(wordStates.filter((s) => !!s?.normalized));
      const collapsed = collapseFamiliarityLevels(migration.states);
      if (migration.changed) {
        const existingBackup = await idbGet<unknown>(STORE.meta, "pre-lemma-v1");
        if (!existingBackup) {
          await idbPut(STORE.meta, "pre-lemma-v1", { at: Date.now(), wordStates: migration.backup });
        }
      }
      if (migration.changed || collapsed.changed) await rewriteWordStates(collapsed.states);
      for (const s of collapsed.states) if (s?.normalized) this.wordStates.set(s.normalized, s);
      for (const p of phrases) if (p?.id) this.phrases.set(p.id, p);
      for (const e of llm) if (e?.cacheKey) this.llm.set(e.cacheKey, e);
      onEcdictStatus((s) => {
        if (s === "ready" || s === "error") this.notify();
      });
    })();
    return this._initPromise;
  }

  async close(): Promise<void> { /* nothing */ }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify() {
    for (const fn of this.listeners) {
      try { fn(); } catch { /* swallow */ }
    }
  }

  private async ready() {
    if (!this._initPromise) await this.init();
    else await this._initPromise;
  }

  async listBooks(): Promise<Book[]> {
    await this.ready();
    return [...this.books.values()].sort((a, b) => b.addedAt - a.addedAt);
  }
  async getBook(id: string): Promise<Book | undefined> {
    await this.ready();
    return this.books.get(id);
  }
  async addBook(b: Book): Promise<void> {
    await this.ready();
    await idbPut(STORE.books, b.id, b);
    this.books.set(b.id, b);
    this.notify();
  }
  async updateBookProgress(id: string, page: number): Promise<void> {
    await this.ready();
    const b = this.books.get(id);
    if (!b) return;
    const next = { ...b, currentPage: page };
    await idbPut(STORE.books, id, next);
    this.books.set(id, next);
    this.notify();
  }
  async deleteBook(id: string): Promise<void> {
    await this.ready();
    await idbDelete(STORE.books, id);
    this.books.delete(id);
    const toDrop: string[] = [];
    for (const key of this.pages.keys()) {
      if (key.startsWith(`${id}:`)) toDrop.push(key);
    }
    for (const k of toDrop) {
      this.pages.delete(k);
      await idbDelete(STORE.pages, k);
    }
    this.notify();
  }

  private pageKey(bookId: string, pageNo: number) { return `${bookId}:${pageNo}`; }

  async getPage(bookId: string, pageNo: number): Promise<Page | undefined> {
    await this.ready();
    const key = this.pageKey(bookId, pageNo);
    const mem = this.pages.get(key);
    if (mem) return mem;
    const disk = await idbGet<Page>(STORE.pages, key);
    if (disk) this.pages.set(key, disk);
    return disk;
  }
  async putPage(page: Page): Promise<void> {
    await this.ready();
    const key = this.pageKey(page.bookId, page.pageNo);
    await idbPut(STORE.pages, key, page);
    this.pages.set(key, page);
  }

  async getWordState(normalized: string): Promise<WordState | undefined> {
    await this.ready();
    return lookupState(this.wordStates, normalized);
  }
  async getWordStatesMany(normalized: string[]): Promise<Map<string, WordState>> {
    await this.ready();
    const m = new Map<string, WordState>();
    for (const w of normalized) {
      const s = lookupState(this.wordStates, w);
      if (s) m.set(w, s);
    }
    return m;
  }
  async setWordLevel(normalized: string, level: FamiliarityLevel, source?: { bookId: string; pageNo: number; sentence?: string }): Promise<WordState> {
    await this.ready();
    const existing = lookupState(this.wordStates, normalized);
    const next = nextWordState(existing, normalized, level, now(), source);
    await this.persistWord(next, staleKeys(normalized, existing));
    this.notify();
    return next;
  }
  async setWordNote(normalized: string, note: string): Promise<void> {
    await this.ready();
    const s = lookupState(this.wordStates, normalized);
    if (!s) return;
    const key = s.lemma || s.normalized;
    const next = { ...s, normalized: key, lemma: key, note };
    await this.persistWord(next, staleKeys(normalized, s));
    this.notify();
  }
  async touchWord(normalized: string, source?: { bookId: string; pageNo: number; sentence?: string }): Promise<void> {
    await this.ready();
    const s = lookupState(this.wordStates, normalized);
    if (!s) return;
    const key = s.lemma || s.normalized;
    const srcPatch = source ? { lastSource: source } : {};
    const next = { ...s, normalized: key, lemma: key, lastSeenAt: now(), reviewCount: s.reviewCount + 1, ...srcPatch };
    await this.persistWord(next, staleKeys(normalized, s));
    this.notify();
  }

  private async persistWord(next: WordState, drop: string[]): Promise<void> {
    for (const key of drop) {
      if (key === next.normalized) continue;
      await idbDelete(STORE.wordStates, key);
      this.wordStates.delete(key);
    }
    await idbPut(STORE.wordStates, next.normalized, next);
    this.wordStates.set(next.normalized, next);
  }
  async listWordsByLevel(level: FamiliarityLevel): Promise<WordState[]> {
    await this.ready();
    return [...this.wordStates.values()].filter((w) => w.level === level);
  }
  async listAllWordStates(): Promise<WordState[]> {
    await this.ready();
    return [...this.wordStates.values()];
  }
  async markKnownUnseen(normalized: string[], source?: { bookId: string; pageNo: number; sentence?: string }): Promise<{ count: number; createdKeys: string[] }> {
    return this.markFresh(normalized, 5, source);
  }
  async markLearningUnseen(normalized: string[], source?: { bookId: string; pageNo: number; sentence?: string }): Promise<{ count: number; createdKeys: string[] }> {
    return this.markFresh(normalized, 0, source);
  }
  private async markFresh(
    normalized: string[],
    level: FamiliarityLevel,
    source?: { bookId: string; pageNo: number; sentence?: string },
  ): Promise<{ count: number; createdKeys: string[] }> {
    await this.ready();
    const toWrite = unseenFreshMarks(
      normalized,
      level,
      now(),
      (word) => lookupState(this.wordStates, word),
      (key) => this.wordStates.has(key),
      source,
    );
    if (toWrite.length === 0) return { count: 0, createdKeys: [] };
    const db = await openLexigraphDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE.wordStates, "readwrite");
      const store = tx.objectStore(STORE.wordStates);
      for (const s of toWrite) store.put(s, s.normalized);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("markFresh tx failed"));
    });
    for (const s of toWrite) this.wordStates.set(s.normalized, s);
    this.notify();
    return { count: toWrite.length, createdKeys: toWrite.map((s) => s.normalized) };
  }
  async undoKnownMarks(keys: string[]): Promise<number> {
    await this.ready();
    const drop: string[] = [];
    for (const key of keys) {
      const state = this.wordStates.get(key);
      if (!state || state.level !== 5 || state.reviewCount > 1 || state.note?.trim()) continue;
      drop.push(key);
    }
    if (drop.length === 0) return 0;
    const db = await openLexigraphDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE.wordStates, "readwrite");
      const store = tx.objectStore(STORE.wordStates);
      for (const key of drop) store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("undoKnownMarks tx failed"));
    });
    for (const key of drop) this.wordStates.delete(key);
    this.notify();
    return drop.length;
  }
  async scheduleReview(normalized: string, rating: Rating): Promise<WordState> {
    await this.ready();
    const existing = lookupState(this.wordStates, normalized);
    if (!existing) throw new Error(`scheduleReview: no state for ${normalized}`);
    const t = now();
    const upd = applyRating(existing, rating, t);
    const key = existing.lemma || existing.normalized;
    const next: WordState = {
      ...existing,
      normalized: key,
      lemma: key,
      level: upd.level,
      fsrsStability: upd.stability,
      fsrsDifficulty: upd.difficulty,
      fsrsDueAt: upd.dueAt,
      lastSeenAt: t,
      reviewCount: existing.reviewCount + 1,
    };
    await this.persistWord(next, staleKeys(normalized, existing));
    this.notify();
    return next;
  }
  async dumpUserData(): Promise<UserDataDump> {
    await this.ready();
    const pageEntries = await idbGetAllEntries<Page>(STORE.pages);
    const blobEntries = await idbGetAllEntries<Blob>(STORE.blobs);
    const blobs: BackupBlob[] = [];
    for (const [key, blob] of blobEntries) {
      if (!(blob instanceof Blob)) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      blobs.push({
        key: String(key),
        mime: blob.type || "application/pdf",
        base64: bytesToBase64(bytes),
      });
    }
    const pages = new Map<string, Page>();
    for (const [key, page] of pageEntries) pages.set(String(key), page);
    for (const [key, page] of this.pages) pages.set(key, page);
    return {
      wordStates: [...this.wordStates.values()],
      books: [...this.books.values()],
      phrases: [...this.phrases.values()],
      pages: [...pages.entries()].map(([key, page]) => ({ key, page })),
      llm: [...this.llm.values()],
      blobs,
    };
  }
  async applyUserData(data: UserDataDump, mode: "merge" | "replace", confirmation?: string): Promise<void> {
    await this.ready();
    const current = await this.dumpUserData();
    let next: UserDataDump;
    if (mode === "replace") {
      next = replaceUserData(data, confirmation ?? "");
      await idbPut(STORE.meta, "safety-pre-import", { at: Date.now(), dump: current });
    } else {
      next = mergeUserData(current, data);
    }
    next = { ...next, wordStates: collapseFamiliarityLevels(next.wordStates).states };
    await writeUserDump(next, mode === "replace");
    this.books = new Map(next.books.map((b) => [b.id, b]));
    this.wordStates = new Map(next.wordStates.map((s) => [s.normalized, s]));
    this.phrases = new Map(next.phrases.map((p) => [p.id, p]));
    this.pages = new Map(next.pages.map((p) => [p.key, p.page]));
    this.llm = new Map(next.llm.map((e) => [e.cacheKey, e]));
    this.notify();
  }
  async getStats(): Promise<{ known: number; unknown: number; ignored: number; total: number }> {
    await this.ready();
    return countByStatus(this.wordStates.values());
  }

  async listPhrases(bookId?: string): Promise<PhraseBookmark[]> {
    await this.ready();
    const all = [...this.phrases.values()];
    return bookId ? all.filter((p) => p.bookId === bookId) : all;
  }
  async addPhrase(p: PhraseBookmark): Promise<void> {
    await this.ready();
    await idbPut(STORE.phrases, p.id, p);
    this.phrases.set(p.id, p);
    this.notify();
  }
  async deletePhrase(id: string): Promise<void> {
    await this.ready();
    await idbDelete(STORE.phrases, id);
    this.phrases.delete(id);
    this.notify();
  }

  async getLLMCache(key: string): Promise<LLMExplanation | undefined> {
    await this.ready();
    return this.llm.get(key);
  }
  async putLLMCache(e: LLMExplanation): Promise<void> {
    await this.ready();
    await idbPut(STORE.llm, e.cacheKey, e);
    this.llm.set(e.cacheKey, e);
  }

  async lookupDict(word: string): Promise<DictEntry | undefined> {
    await this.ready();
    const key = word.toLowerCase();
    const seed = this.dict.get(key);
    const ecd = lookupEcdict(key);
    if (seed || ecd) return mergeDictEntries(seed, ecd);
    for (const candidate of lemmaCandidates(key)) {
      const s2 = this.dict.get(candidate);
      const e2 = lookupEcdict(candidate);
      if (s2 || e2) return mergeDictEntries(s2, e2);
    }
    return undefined;
  }
}

// Round 16-7: merge seed (hand-curated) + ECDICT (English def + scale).
function mergeDictEntries(
  seed: DictEntry | undefined,
  ecd: DictEntry | undefined,
): DictEntry | undefined {
  if (!seed && !ecd) return undefined;
  const base = seed ?? ecd!;
  const out: DictEntry = { word: base.word };
  const translation = seed?.translation ?? ecd?.translation;
  if (translation) out.translation = translation;
  const definition = ecd?.definition ?? seed?.definition;
  if (definition) out.definition = definition;
  const phonetic = seed?.phonetic ?? ecd?.phonetic;
  if (phonetic) out.phonetic = phonetic;
  const cefr = seed?.cefr ?? ecd?.cefr;
  if (cefr) out.cefr = cefr;
  const set = new Set<string>();
  for (const x of seed?.pos ?? []) set.add(x);
  for (const x of ecd?.pos ?? []) set.add(x);
  if (set.size > 0) out.pos = [...set];
  const tagSet = new Set<string>();
  for (const x of seed?.tags ?? []) tagSet.add(x);
  for (const x of ecd?.tags ?? []) tagSet.add(x);
  if (tagSet.size > 0) out.tags = [...tagSet];
  return out;
}

async function rewriteWordStates(states: WordState[]): Promise<void> {
  const db = await openLexigraphDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE.wordStates, "readwrite");
    const store = tx.objectStore(STORE.wordStates);
    store.clear();
    for (const state of states) store.put(state, state.normalized);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("lemma migration rewrite failed"));
  });
}

const USER_STORES = [
  STORE.books, STORE.pages, STORE.wordStates, STORE.phrases, STORE.llm, STORE.blobs,
] as const;

async function writeUserDump(data: UserDataDump, replace: boolean): Promise<void> {
  const db = await openLexigraphDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...USER_STORES], "readwrite");
    if (replace) {
      for (const name of USER_STORES) tx.objectStore(name).clear();
    }
    for (const book of data.books) tx.objectStore(STORE.books).put(book, book.id);
    for (const page of data.pages) tx.objectStore(STORE.pages).put(page.page, page.key);
    for (const state of data.wordStates) tx.objectStore(STORE.wordStates).put(state, state.normalized);
    for (const phrase of data.phrases) tx.objectStore(STORE.phrases).put(phrase, phrase.id);
    for (const entry of data.llm) tx.objectStore(STORE.llm).put(entry, entry.cacheKey);
    for (const blob of data.blobs) {
      const bytes = base64ToBytes(blob.base64);
      const file = new Blob([bytes.buffer as ArrayBuffer], { type: blob.mime || "application/pdf" });
      tx.objectStore(STORE.blobs).put(file, blob.key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("applyUserData write failed"));
  });
}
