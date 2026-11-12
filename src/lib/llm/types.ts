/**
 * LLM gateway — shared types
 *
 * Response shape is tuned for Lexigraph's reader UX: whatever comes back
 * here is rendered directly into WordPopup + InspectorPanel.
 */
import type { CEFR } from "../../data/types";

export interface WordAnalysisRequest {
  /** the token the user clicked (lowercased form used for cache key) */
  word: string;
  /** the full sentence the token lives in */
  sentence: string;
  /** optional char range [start, end) inside sentence */
  range?: [number, number];
  /** coarse academic domain, e.g. "cs.ML". defaults to "general". */
  domain?: string;
  /** user's native language BCP-47. defaults to "zh-TW". */
  userNativeLang?: string;
}

export interface WordAnalysis {
  /** English monolingual definition (WordNet-style short gloss) */
  definition_en: string;
  /** Chinese translation / gloss */
  definition_zh: string;
  /** CEFR difficulty band */
  level: CEFR;
  /** 1-3 topic tags, lowercase slugs, e.g. ["statistics", "machine-learning"] */
  topics: string[];
  /** Chinese explanation of what the word means *in this specific sentence* */
  sentence_meaning: string;
  /** brief syntactic role description, e.g. "subject of 'relies'" */
  syntactic_role: string;
  /** simple English rewrite of the containing phrase */
  paraphrase: string;
  /** 1-3 useful collocations */
  collocations: string[];
  /** bookkeeping — which backend, cache hit, timing */
  _meta: {
    backend: string;
    cached: boolean;
    elapsedMs: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface Backend {
  name: string;
  available(): Promise<boolean>;
  call(
    prompt: string,
    signal?: AbortSignal,
    opts?: { maxOutputTokens?: number },
  ): Promise<{ text: string; inputTokens?: number; outputTokens?: number }>;
  limits: { rpm: number; tpm: number; rpd?: number };
  /** Optional — remaining cooldown (ms) for rate-limited backends. Local
   *  backends (Ollama) simply omit this or return 0. */
  cooldownRemainingMs?(): number;
}

// ──────── Sentence deep-analysis ─────────────────────────────────────────
export interface SentenceAnalysisRequest {
  sentence: string;
  /** e.g. "cs.ML", "biology", "literary". defaults "general". */
  domain?: string;
  /** BCP-47. defaults "zh-TW". */
  userNativeLang?: string;
}

export type ClauseType =
  | "main"
  | "rel"
  | "adv"
  | "noun"
  | "participial"
  | "inf"
  | "appos"
  | "prep"
  | "coord"
  | "other";

export interface ClauseBreakdown {
  text: string;
  type: ClauseType;
  role_zh: string;
}

/**
 * A single contiguous piece of the sentence. Concatenating every segment's
 * text (with its `leading` separator) reproduces the original sentence, so
 * the UI can render the full sentence as an indented, color-coded parse tree
 * (classic 長難句分析 layout).
 */
export interface SentenceSegment {
  /** the exact substring from the original sentence */
  text: string;
  /** nesting depth: 0 = main clause skeleton, 1 = direct modifier, 2+ = nested */
  depth: number;
  /** syntactic kind of this segment */
  type: ClauseType;
  /** native-language role description: "why is this segment here?" */
  role_zh: string;
  /** optional bracket label, e.g. "[S]", "[REL]", "[ADV]" */
  label?: string;
}

export interface SentencePattern {
  /** abstract slot template, e.g. "The fact that X suggests that Y" */
  template: string;
  /** when/why to use this pattern (in native lang) */
  abstract_zh: string;
  /** rewrite with different content so learner sees the pattern transfer */
  your_example: string;
  register: "academic" | "formal" | "neutral" | "informal";
}

export interface SentenceCollocation {
  phrase: string;
  zh: string;
  register: "academic" | "formal" | "neutral" | "informal" | "technical";
}

export interface SentenceAnalysis {
  gist_zh: string;
  main_clause: { simplified: string; zh: string };
  /** Linear parse tree covering the whole sentence (rendered as 斷句視圖). */
  segments: SentenceSegment[];
  clauses: ClauseBreakdown[];
  reading_notes: string[];
  patterns: SentencePattern[];
  collocations: SentenceCollocation[];
  stance_hedging: string;
  style_note: string;
  difficulty: CEFR;
  genre: "academic" | "literary" | "journalistic" | "conversational" | "technical";
  _meta: {
    backend: string;
    cached: boolean;
    elapsedMs: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface CacheStore {
  get(key: string): Promise<WordAnalysis | null>;
  set(key: string, value: WordAnalysis): Promise<void>;
}

// ──────── LLM config — multi-provider chain ──────────────────────────────

/** The three currently-supported providers. */
export type ProviderId = "gemini" | "groq" | "ollama";

/** Top-level mode: "multi" iterates chainOrder; "offline" disables LLM. */
export type LLMMode = "multi" | "offline";

export interface GeminiSettings {
  enabled: boolean;
  apiKey: string;
  /** e.g. "gemini-2.5-flash" — the model tried first. */
  primaryModel: string;
  /** e.g. "gemini-2.0-flash" — tried when primary is on 429 cooldown.
   *  Empty string = no fallback. */
  fallbackModel: string;
}

export interface GroqSettings {
  enabled: boolean;
  apiKey: string;
  /** e.g. "llama-3.3-70b-versatile" */
  model: string;
}

export interface OllamaSettings {
  enabled: boolean;
  /** e.g. "http://localhost:11434" */
  baseUrl: string;
  /** e.g. "qwen2.5:7b" — must match a model already pulled on the machine. */
  model: string;
}

export interface LLMConfig {
  mode: LLMMode;
  /** Ordered provider chain. Each provider is tried in order; a provider is
   *  actually used only if its own `enabled` flag is true AND credentials
   *  are present. Missing providers are auto-appended at load time. */
  chainOrder: ProviderId[];
  gemini: GeminiSettings;
  groq: GroqSettings;
  ollama: OllamaSettings;
  /** Auto-call LLM on word click (cache hits don't count against quota). */
  autoTrigger: boolean;
}

export const DEFAULT_CONFIG: LLMConfig = {
  mode: "multi",
  chainOrder: ["gemini", "groq", "ollama"],
  gemini: {
    enabled: false,
    apiKey: "",
    primaryModel: "gemini-2.5-flash",
    fallbackModel: "gemini-2.0-flash",
  },
  groq: {
    enabled: false,
    apiKey: "",
    model: "llama-3.3-70b-versatile",
  },
  ollama: {
    enabled: false,
    baseUrl: "http://localhost:11434",
    model: "qwen2.5:7b",
  },
  autoTrigger: true,
};
