/**
 * Core domain types. Every other module imports from here.
 *
 * Schema mirrors the design doc §5 (SQLite tables) but is platform-agnostic:
 * the same shapes work against sql.js (browser POC), better-sqlite3 (Electron),
 * or an in-memory stub for tests.
 */

// ─── Books / documents ──────────────────────────────────────────────────────

export interface Book {
  id: string;                    // uuid
  title: string;
  author?: string | undefined;
  addedAt: number;               // epoch ms
  source: "pdf" | "epub" | "txt";
  fileRef: string;               // opaque ref — path in Electron, File obj key in browser
  pageCount?: number | undefined;
  currentPage: number;
  domain?: AcademicDomain | undefined;
  totalTokens: number;           // cumulative word tokens across doc (for stats)
}

/** Matches the arxiv-style coarse categorization used for LLM domain-aware explain. */
export type AcademicDomain =
  | "cs.ML" | "cs.CL" | "cs.CV" | "cs.SE"
  | "math.PR" | "math.ST" | "math.NA"
  | "bio.MN" | "bio.GN"
  | "physics.HE" | "physics.CM"
  | "econ.GN" | "stat.ML"
  | "general";

// ─── Tokens (per-page word spans) ───────────────────────────────────────────

export type TokenClass =
  | "word"        // alphabetic — clickable, trackable, gets a WordState
  | "citation"    // [12] / (Smith, 2020) — greyed, not trackable
  | "formula"     // mathy char / inline LaTeX — marked, not trackable
  | "number"      // 2025 / 3.14
  | "figureref"   // Fig 3, Table 2.1
  | "url"
  | "punct"
  | "other";

export interface PageToken {
  // Geometry in PDF.js viewport space (css pixels at current scale)
  x: number; y: number; w: number; h: number;
  text: string;
  normalized: string;   // lowercased, deaccented; join key for WordState
  cls: TokenClass;
  itemIndex: number;    // which TextItem this word came from
  charStart: number;    // char offset within page full text
  charEnd: number;
  sentenceId: number;   // per-page sentence index
  lineNo: number;
  /** body = reading text. Other zones are page chrome and are not tracked. */
  zone?: "body" | "header" | "footer" | "pagenumber" | undefined;
}

export interface Page {
  bookId: string;
  pageNo: number;       // 1-indexed
  tokens: PageToken[];
  fullText: string;     // joined text for search / citation regex
  sentences: string[];
}

// ─── Word state (the LingQ/Migaku-style memory layer) ───────────────────────

/**
 * 0 = 不認識／學習中（含舊資料的 1–4，讀取時同一狀態）
 * 5 = 認識（不再上色）
 * 6 = 忽略（不要統計這個 token，不是熟悉度）
 * 1–4 只會出現在尚未摺疊的舊資料裡，新的標記不會再寫入。
 */
export type FamiliarityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WordState {
  normalized: string;       // PK — inflection lemma (study/studies/studied share one row)
  lemma?: string | undefined;
  /** Other surface forms collapsed onto this lemma. */
  surfaces?: string[] | undefined;
  level: FamiliarityLevel;
  firstSeenAt: number;
  lastSeenAt: number;
  reviewCount: number;
  note?: string | undefined;      // personal note (markdown)
  // FSRS fields (Phase 2, stubbed for now)
  fsrsStability?: number | undefined;
  fsrsDifficulty?: number | undefined;
  fsrsDueAt?: number | undefined;
  // Round 18: last time this word was seen / marked in a specific book+page.
  // For "jump back to source" from vocabulary / review panels.
  // Round 21: 加 sentence 存該詞出現的原句，供 Anki Cloze export 做挖空例句。
  lastSource?: { bookId: string; pageNo: number; sentence?: string } | undefined;
}

// ─── Phrase / expression bookmarks (academic optimization) ──────────────────

export interface PhraseBookmark {
  id: string;
  bookId: string;
  pageNo: number;
  text: string;
  sentence: string;
  tags: string[];             // e.g. ["hedging", "transition", "method-verb"]
  note?: string | undefined;
  createdAt: number;
}

// ─── LLM explanation cache (persisted) ──────────────────────────────────────

export interface LLMExplanation {
  cacheKey: string;           // sha256(model|token|sentence|range|domain)
  token: string;
  sentence: string;
  domain: AcademicDomain;
  senseInContext: string;
  syntacticRole: string;
  domainNuance?: string | undefined;
  paraphrase?: string | undefined;
  levelHint?: string | undefined;   // CEFR A1..C2
  collocations: string[];
  backend: string;
  createdAt: number;
}

// ─── Dictionary entries (local ECDICT / WordNet) ────────────────────────────

export interface DictEntry {
  word: string;
  phonetic?: string | undefined;
  translation?: string | undefined;   // ECDICT Chinese translation
  definition?: string | undefined;    // WordNet English definition

  pos?: string[] | undefined;
  tags?: string[] | undefined;        // e.g. ["awl", "ngsl", "cet4", "toefl"]
  cefr?: CEFR | undefined;
}

export type CEFR = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "unknown";
