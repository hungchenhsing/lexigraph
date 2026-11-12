/**
 * Data-layer interface + in-memory stub.
 */

import type {
  Book, Page, WordState, PhraseBookmark, LLMExplanation, DictEntry,
  FamiliarityLevel,
} from "./types";
import { DICT_SEED } from "../lib/dict/seed";
import { lemmaCandidates } from "../lib/dict/lemmatize";
import { lookupEcdict, onEcdictStatus } from "../lib/dict/ecdict";
import { applyRating, type Rating } from "../lib/srs/fsrs";
import type { UserDataDump } from "../lib/backup/backup";
import { mergeUserData, replaceUserData, REPLACE_CONFIRMATION } from "../lib/backup/backup";
import { countByStatus, collapseFamiliarityLevels } from "./familiarity";
import { lookupState, nextWordState, staleKeys, unseenFreshMarks } from "./wordStateUpdate";

export interface Repo {
  listBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book | undefined>;
  addBook(b: Book): Promise<void>;
  updateBookProgress(id: string, page: number): Promise<void>;
  deleteBook(id: string): Promise<void>;

  getPage(bookId: string, pageNo: number): Promise<Page | undefined>;
  putPage(page: Page): Promise<void>;

  getWordState(normalized: string): Promise<WordState | undefined>;
  getWordStatesMany(normalized: string[]): Promise<Map<string, WordState>>;
  setWordLevel(normalized: string, level: FamiliarityLevel, source?: { bookId: string; pageNo: number; sentence?: string }): Promise<WordState>;
  setWordNote(normalized: string, note: string): Promise<void>;
  touchWord(normalized: string, source?: { bookId: string; pageNo: number; sentence?: string }): Promise<void>;
  listWordsByLevel(level: FamiliarityLevel): Promise<WordState[]>;
  listAllWordStates(): Promise<WordState[]>;
  markKnownUnseen(normalized: string[], source?: { bookId: string; pageNo: number; sentence?: string }): Promise<{ count: number; createdKeys: string[] }>;
  markLearningUnseen(normalized: string[], source?: { bookId: string; pageNo: number; sentence?: string }): Promise<{ count: number; createdKeys: string[] }>;
  undoKnownMarks(keys: string[]): Promise<number>;
  getStats(): Promise<{ known: number; unknown: number; ignored: number; total: number }>;
  scheduleReview(normalized: string, rating: Rating): Promise<WordState>;
  dumpUserData(): Promise<UserDataDump>;
  applyUserData(data: UserDataDump, mode: "merge" | "replace", confirmation?: string): Promise<void>;

  listPhrases(bookId?: string): Promise<PhraseBookmark[]>;
  addPhrase(p: PhraseBookmark): Promise<void>;
  deletePhrase(id: string): Promise<void>;

  getLLMCache(key: string): Promise<LLMExplanation | undefined>;
  putLLMCache(e: LLMExplanation): Promise<void>;

  lookupDict(word: string): Promise<DictEntry | undefined>;

  init(): Promise<void>;
  close(): Promise<void>;
  subscribe(fn: () => void): () => void;
}

const now = () => Date.now();

export class InMemoryRepo implements Repo {
  private books = new Map<string, Book>();
  private pages = new Map<string, Page>();
  private wordStates = new Map<string, WordState>();
  private phrases = new Map<string, PhraseBookmark>();
  private llm = new Map<string, LLMExplanation>();
  private dict = new Map<string, DictEntry>();
  private listeners = new Set<() => void>();

  async init() {
    this._seedDict(DICT_SEED);
    onEcdictStatus((s) => { if (s === "ready" || s === "error") this.notify(); });
  }
  async close() { /* nothing */ }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private notify() {
    for (const fn of this.listeners) { try { fn(); } catch { /* swallow */ } }
  }

  async listBooks() { return [...this.books.values()].sort((a, b) => b.addedAt - a.addedAt); }
  async getBook(id: string) { return this.books.get(id); }
  async addBook(b: Book) { this.books.set(b.id, b); this.notify(); }
  async updateBookProgress(id: string, page: number) {
    const b = this.books.get(id);
    if (b) { this.books.set(id, { ...b, currentPage: page }); this.notify(); }
  }
  async deleteBook(id: string) { this.books.delete(id); this.notify(); }

  private pageKey(bookId: string, pageNo: number) { return `${bookId}:${pageNo}`; }
  async getPage(bookId: string, pageNo: number) { return this.pages.get(this.pageKey(bookId, pageNo)); }
  async putPage(page: Page) { this.pages.set(this.pageKey(page.bookId, page.pageNo), page); }

  async getWordState(normalized: string) { return lookupState(this.wordStates, normalized); }
  async getWordStatesMany(normalized: string[]) {
    const m = new Map<string, WordState>();
    for (const w of normalized) {
      const s = lookupState(this.wordStates, w);
      if (s) m.set(w, s);
    }
    return m;
  }
  async setWordLevel(normalized: string, level: FamiliarityLevel, source?: { bookId: string; pageNo: number; sentence?: string }): Promise<WordState> {
    const existing = lookupState(this.wordStates, normalized);
    for (const key of staleKeys(normalized, existing)) this.wordStates.delete(key);
    const next = nextWordState(existing, normalized, level, now(), source);
    this.wordStates.set(next.normalized, next);
    this.notify();
    return next;
  }
  async setWordNote(normalized: string, note: string) {
    const s = lookupState(this.wordStates, normalized);
    if (!s) return;
    for (const key of staleKeys(normalized, s)) this.wordStates.delete(key);
    const next = { ...s, normalized: s.lemma || s.normalized, lemma: s.lemma || s.normalized, note };
    this.wordStates.set(next.normalized, next);
    this.notify();
  }
  async touchWord(normalized: string, source?: { bookId: string; pageNo: number; sentence?: string }) {
    const s = lookupState(this.wordStates, normalized);
    if (!s) return;
    for (const key of staleKeys(normalized, s)) this.wordStates.delete(key);
    const srcPatch = source ? { lastSource: source } : {};
    const key = s.lemma || s.normalized;
    const next = { ...s, normalized: key, lemma: key, lastSeenAt: now(), reviewCount: s.reviewCount + 1, ...srcPatch };
    this.wordStates.set(key, next);
    this.notify();
  }
  async listWordsByLevel(level: FamiliarityLevel) { return [...this.wordStates.values()].filter((w) => w.level === level); }
  async listAllWordStates() { return [...this.wordStates.values()]; }
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
    const created = unseenFreshMarks(
      normalized,
      level,
      now(),
      (word) => lookupState(this.wordStates, word),
      (key) => this.wordStates.has(key),
      source,
    );
    for (const rec of created) this.wordStates.set(rec.normalized, rec);
    if (created.length > 0) this.notify();
    return { count: created.length, createdKeys: created.map((rec) => rec.normalized) };
  }
  async undoKnownMarks(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      const state = this.wordStates.get(key);
      if (!state || state.level !== 5 || state.reviewCount > 1 || state.note?.trim()) continue;
      this.wordStates.delete(key);
      count += 1;
    }
    if (count > 0) this.notify();
    return count;
  }
  async scheduleReview(normalized: string, rating: Rating): Promise<WordState> {
    const existing = lookupState(this.wordStates, normalized);
    if (!existing) throw new Error(`scheduleReview: no state for ${normalized}`);
    const t = now();
    const upd = applyRating(existing, rating, t);
    const key = existing.lemma || existing.normalized;
    for (const stale of staleKeys(normalized, existing)) this.wordStates.delete(stale);
    const next: WordState = {
      ...existing, normalized: key, lemma: key, level: upd.level, fsrsStability: upd.stability, fsrsDifficulty: upd.difficulty,
      fsrsDueAt: upd.dueAt, lastSeenAt: t, reviewCount: existing.reviewCount + 1,
    };
    this.wordStates.set(key, next);
    this.notify();
    return next;
  }
  async dumpUserData(): Promise<UserDataDump> {
    return {
      wordStates: [...this.wordStates.values()],
      books: [...this.books.values()],
      phrases: [...this.phrases.values()],
      pages: [...this.pages.entries()].map(([key, page]) => ({ key, page })),
      llm: [...this.llm.values()],
      blobs: [],
    };
  }
  async applyUserData(data: UserDataDump, mode: "merge" | "replace", confirmation?: string): Promise<void> {
    const current = await this.dumpUserData();
    const next = mode === "replace"
      ? replaceUserData(data, confirmation ?? "")
      : mergeUserData(current, data);
    if (mode === "replace" && confirmation !== REPLACE_CONFIRMATION) {
      throw new Error("Refusing to replace existing data without confirmation");
    }
    this.books = new Map(next.books.map((b) => [b.id, b]));
    const wordStates = collapseFamiliarityLevels(next.wordStates).states;
    this.wordStates = new Map(wordStates.map((s) => [s.normalized, s]));
    this.phrases = new Map(next.phrases.map((p) => [p.id, p]));
    this.pages = new Map(next.pages.map((p) => [p.key, p.page]));
    this.llm = new Map(next.llm.map((e) => [e.cacheKey, e]));
    this.notify();
  }
  async getStats() {
    return countByStatus(this.wordStates.values());
  }

  async listPhrases(bookId?: string) {
    const all = [...this.phrases.values()];
    return bookId ? all.filter((p) => p.bookId === bookId) : all;
  }
  async addPhrase(p: PhraseBookmark) { this.phrases.set(p.id, p); this.notify(); }
  async deletePhrase(id: string) { this.phrases.delete(id); this.notify(); }

  async getLLMCache(key: string) { return this.llm.get(key); }
  async putLLMCache(e: LLMExplanation) { this.llm.set(e.cacheKey, e); }

  async lookupDict(word: string) {
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

  _seedDict(entries: DictEntry[]) {
    for (const e of entries) this.dict.set(e.word.toLowerCase(), e);
  }
}

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
  const pos = unionStr(seed?.pos, ecd?.pos);
  if (pos && pos.length > 0) out.pos = pos;
  const tags = unionStr(seed?.tags, ecd?.tags);
  if (tags && tags.length > 0) out.tags = tags;
  return out;
}

function unionStr(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a && !b) return undefined;
  const set = new Set<string>();
  for (const x of a ?? []) set.add(x);
  for (const x of b ?? []) set.add(x);
  return [...set];
}

import { IndexedDBRepo } from "./indexedDbRepo";

let _repo: Repo | null = null;

export function getRepo(): Repo {
  if (!_repo) { _repo = new IndexedDBRepo(); void _repo.init(); }
  return _repo;
}

export function __setRepoForTest(r: Repo) { _repo = r; }
