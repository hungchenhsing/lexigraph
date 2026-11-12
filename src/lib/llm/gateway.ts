/**
 * LLM Gateway — multi-provider reader pipeline.
 *
 * Supports three pluggable backends:
 *   - GeminiBackend  (cloud, generateContent v1beta)
 *   - GroqBackend    (cloud, OpenAI-compat /chat/completions, very fast)
 *   - OllamaBackend  (local, /api/chat — effectively unlimited)
 *
 * Responsibilities:
 *  - provider abstraction behind a single Backend interface
 *  - token-bucket rate limiting per backend
 *  - SHA-256 cache keyed on (model, word, sentence, domain) so repeated
 *    clicks on the same token in the same sentence don't burn quota
 *  - graceful iterate-in-order chain: when a backend 429s or errors,
 *    the next one in the chainOrder is tried transparently
 *
 * The gateway returns `WordAnalysis` with everything WordPopup /
 * InspectorPanel need: 英英、中文、CEFR level、topic tags、句中含義。
 */
import type {
  Backend,
  CacheStore,
  LLMConfig,
  SentenceAnalysis,
  SentenceAnalysisRequest,
  WordAnalysis,
  WordAnalysisRequest,
} from "./types";

// ──────────────── Token-bucket rate limiter ───────────────────────────────
class TokenBucket {
  private capacity: number;
  private tokens: number;
  private refillRate: number; // tokens/sec
  private lastRefill: number;

  constructor(capacityPerMinute: number) {
    this.capacity = capacityPerMinute;
    this.tokens = capacityPerMinute;
    this.refillRate = capacityPerMinute / 60;
    this.lastRefill = Date.now();
  }
  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
  async take(amount = 1): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= amount) {
        this.tokens -= amount;
        return;
      }
      const wait = ((amount - this.tokens) / this.refillRate) * 1000;
      await new Promise(r => setTimeout(r, Math.min(wait + 20, 2000)));
    }
  }
}

// ──────────────── Errors ──────────────────────────────────────────────────
export class RateLimitError extends Error {
  readonly kind = "rate_limit" as const;
  constructor(message: string, public retryMs: number) {
    super(message);
  }
}

export class ModelNotFoundError extends Error {
  readonly kind = "model_not_found" as const;
  constructor(public modelId: string, message: string) {
    super(message);
  }
}

// ──────────────── Gemini backend ──────────────────────────────────────────
export class GeminiBackend implements Backend {
  name: string;
  // free tier (gemini-2.0-flash, public numbers — may drift)
  limits = { rpm: 15, tpm: 1_000_000, rpd: 1500 };
  private cooldownUntil = 0;
  constructor(private apiKey: string, model = "gemini-2.0-flash") {
    this.name = model;
  }
  async available() {
    if (!this.apiKey) return false;
    return Date.now() >= this.cooldownUntil;
  }
  cooldownRemainingMs(): number {
    return Math.max(0, this.cooldownUntil - Date.now());
  }
  async call(prompt: string, signal?: AbortSignal, opts?: { maxOutputTokens?: number }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.name}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: "application/json",
          maxOutputTokens: opts?.maxOutputTokens ?? 512,
          // Disable thinking on 2.5-flash (ignored on 2.0/older). Biggest
          // single latency win — typically saves 2-5s per call.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || /not found|is not supported/i.test(body)) {
        throw new ModelNotFoundError(
          this.name,
          `model_not_found: Gemini 找不到模型 "${this.name}"（可能已下架）。請到設定改選其他模型。`,
        );
      }
      if (res.status === 429) {
        // Parse retryDelay from Gemini 429 body; default 60s.
        let retryMs = 60_000;
        try {
          const j = JSON.parse(body);
          const details = j?.error?.details ?? [];
          for (const d of details) {
            const rd = d?.retryDelay as string | undefined;
            if (rd) {
              const m = /(\d+)s/.exec(rd);
              if (m) retryMs = parseInt(m[1]!, 10) * 1000;
            }
          }
        } catch {
          /* ignore parse error, use default */
        }
        this.cooldownUntil = Date.now() + retryMs;
        const secs = Math.ceil(retryMs / 1000);
        throw new RateLimitError(
          `rate_limit: Gemini 額度已滿，請等待 ${secs} 秒（或已達每日 1500 次上限，明天重試）`,
          retryMs,
        );
      }
      throw new Error(`gemini ${res.status}: ${body.slice(0, 200)}`);
    }
    const j = (await res.json()) as any;
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return {
      text,
      inputTokens: j.usageMetadata?.promptTokenCount,
      outputTokens: j.usageMetadata?.candidatesTokenCount,
    };
  }
}

// ──────────────── Groq backend (OpenAI-compat) ────────────────────────────
// Groq free tier @ 2025-05: llama-3.3-70b-versatile ≈ 30 RPM / 1000 RPD /
// 6K TPM / 100K TPD; llama-3.1-8b-instant ≈ 30 RPM / 14400 RPD. Extremely
// fast decode (~500 t/s on 70B) — in many sessions faster than Gemini
// Flash even after accounting for network RTT.
export class GroqBackend implements Backend {
  name: string;
  limits = { rpm: 30, tpm: 6_000, rpd: 1_000 };
  private cooldownUntil = 0;
  private modelId: string;
  constructor(private apiKey: string, model = "llama-3.3-70b-versatile") {
    this.modelId = model;
    this.name = `groq:${model}`;
  }
  async available() {
    if (!this.apiKey) return false;
    return Date.now() >= this.cooldownUntil;
  }
  cooldownRemainingMs(): number {
    return Math.max(0, this.cooldownUntil - Date.now());
  }
  async call(prompt: string, signal?: AbortSignal, opts?: { maxOutputTokens?: number }) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: opts?.maxOutputTokens ?? 512,
        response_format: { type: "json_object" },
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || /model.*(not.*found|does not exist|decommissioned)/i.test(body)) {
        throw new ModelNotFoundError(
          this.modelId,
          `model_not_found: Groq 找不到模型 "${this.modelId}"（可能已下架）。到設定改選其他模型。`,
        );
      }
      if (res.status === 429) {
        // Groq uses the standard Retry-After header (seconds, sometimes float).
        const ra = res.headers.get("retry-after");
        let retryMs = ra ? Math.round(parseFloat(ra) * 1000) : 60_000;
        if (!Number.isFinite(retryMs) || retryMs <= 0) retryMs = 60_000;
        // Cap at 10 min so a bogus header doesn't strand the backend.
        retryMs = Math.min(retryMs, 600_000);
        this.cooldownUntil = Date.now() + retryMs;
        const secs = Math.ceil(retryMs / 1000);
        throw new RateLimitError(
          `rate_limit: Groq 額度已滿，請等待 ${secs} 秒`,
          retryMs,
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`groq ${res.status}: API key 無效或被封禁 — ${body.slice(0, 160)}`);
      }
      throw new Error(`groq ${res.status}: ${body.slice(0, 200)}`);
    }
    const j = (await res.json()) as any;
    const text = j.choices?.[0]?.message?.content ?? "";
    return {
      text,
      inputTokens: j.usage?.prompt_tokens,
      outputTokens: j.usage?.completion_tokens,
    };
  }
}

// ──────────────── Ollama backend (local HTTP) ─────────────────────────────
// Browser → http://localhost:11434/api/chat. Requires the user to set
// OLLAMA_ORIGINS=* (or specifically http://localhost:5173) on the Ollama
// server so the browser preflight passes — SettingsModal surfaces this.
//
// Effectively unlimited in rate; speed depends on user's hardware. Setting
// limits.rpm high so the token bucket never blocks us.
export class OllamaBackend implements Backend {
  name: string;
  limits = { rpm: 600, tpm: 10_000_000 };
  private baseUrl: string;
  private modelId: string;
  constructor(baseUrl: string, model = "qwen2.5:7b") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.modelId = model;
    this.name = `ollama:${model}`;
  }
  async available() {
    // We don't probe here — cheaper to let the first call fail and fall
    // through to the next backend than to round-trip on every request.
    return true;
  }
  cooldownRemainingMs(): number {
    return 0;
  }
  async call(prompt: string, signal?: AbortSignal, opts?: { maxOutputTokens?: number }) {
    const url = `${this.baseUrl}/api/chat`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.modelId,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          format: "json",
          options: {
            temperature: 0.2,
            num_predict: opts?.maxOutputTokens ?? 512,
          },
        }),
        signal,
      });
    } catch (e) {
      // Typical: TypeError "Failed to fetch" — Ollama not running, wrong
      // URL, or CORS preflight rejected (OLLAMA_ORIGINS not set).
      throw new Error(
        `ollama_unreachable: 無法連到 Ollama (${this.baseUrl})。確認 (1) Ollama 正在運行，` +
        `(2) 環境變數 OLLAMA_ORIGINS=* 已設定以允許瀏覽器跨域 (Windows: ` +
        `setx OLLAMA_ORIGINS "*" 然後重啟 Ollama)。原錯誤：${(e as Error).message}`,
      );
    }
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 && /not found|try pulling|pull/i.test(body)) {
        throw new ModelNotFoundError(
          this.modelId,
          `model_not_found: Ollama 找不到模型 "${this.modelId}"。先跑 \`ollama pull ${this.modelId}\`。`,
        );
      }
      throw new Error(`ollama ${res.status}: ${body.slice(0, 200)}`);
    }
    const j = (await res.json()) as any;
    const text = j.message?.content ?? "";
    return {
      text,
      inputTokens: j.prompt_eval_count,
      outputTokens: j.eval_count,
    };
  }
}

// ──────────────── In-memory cache ─────────────────────────────────────────
export class MemoryCache implements CacheStore {
  private m = new Map<string, WordAnalysis>();
  async get(key: string) {
    return this.m.get(key) ?? null;
  }
  async set(key: string, v: WordAnalysis) {
    this.m.set(key, v);
  }
  size() {
    return this.m.size;
  }
}

// ──────────────── Prompt ──────────────────────────────────────────────────
function buildPrompt(req: WordAnalysisRequest): string {
  const native = req.userNativeLang ?? "zh-TW";
  const dom = req.domain ?? "general";
  const sentence = req.sentence.replace(/"/g, '\\"');
  const word = req.word.replace(/"/g, '\\"');
  return (
    `You are an academic English reading tutor. Output STRICT JSON only — no code fences, no commentary.\n\n` +
    `Sentence: "${sentence}"\n` +
    `Target word: "${word}"\n` +
    `Document domain: "${dom}"\n` +
    `User native language: "${native}"\n\n` +
    `Return JSON with EXACTLY these keys:\n` +
    `  definition_en     (string, concise English gloss ≤120 chars, WordNet style)\n` +
    `  definition_zh     (string, Chinese gloss ≤30 chars; use ； to separate senses)\n` +
    `  level             (one of "A1" "A2" "B1" "B2" "C1" "C2" — CEFR difficulty)\n` +
    `  topics            (array of 1-3 lowercase slug tags, e.g. "statistics", "machine-learning", "biology", "linguistics", "general-academic")\n` +
    `  sentence_meaning  (string, in ${native}, 1-2 sentences explaining what the word means IN THIS SENTENCE specifically)\n` +
    `  syntactic_role    (string, ≤60 chars, e.g. "subject of 'relies'" or "object of 'propose'")\n` +
    `  paraphrase        (string, simple English rewrite of the clause containing the word)\n` +
    `  collocations      (array of 1-3 useful collocations)\n`
  );
}

// ──────────────── Cache key (SHA-256 via Web Crypto) ──────────────────────
async function hashKey(model: string, req: WordAnalysisRequest): Promise<string> {
  const payload = JSON.stringify({
    m: model,
    t: req.word.toLowerCase(),
    s: req.sentence.trim(),
    d: req.domain ?? "general",
    l: req.userNativeLang ?? "zh-TW",
  });
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sentenceHashKey(model: string, req: SentenceAnalysisRequest): Promise<string> {
  const payload = JSON.stringify({
    kind: "sent",
    m: model,
    s: req.sentence.trim(),
    d: req.domain ?? "general",
    l: req.userNativeLang ?? "zh-TW",
  });
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ──────────────── Sentence prompt & parser ────────────────────────────────
function buildSentencePrompt(req: SentenceAnalysisRequest): string {
  const native = req.userNativeLang ?? "zh-TW";
  const dom = req.domain ?? "general";
  const sentence = req.sentence.replace(/"/g, '\\"');
  return (
    `You are a reading + writing coach for advanced non-native English learners studying academic texts.\n` +
    `Your analysis has TWO GOALS:\n` +
    `  (A) Help the reader understand the sentence's meaning AND structure precisely.\n` +
    `  (B) Extract transferable PATTERNS and COLLOCATIONS the learner can steal for their own writing.\n\n` +
    `Target sentence: "${sentence}"\n` +
    `Document domain: "${dom}"\n` +
    `Learner's native language: "${native}"\n\n` +
    `Output STRICT JSON only (no code fences, no prose) with EXACTLY these keys:\n\n` +
    `  gist_zh         : string — one-sentence ${native} gist, ≤50 chars. What is this sentence DOING?\n` +
    `  main_clause     : { simplified: string, zh: string }\n` +
    `                    Strip modifiers to the bare S-V-O skeleton in simple English + ${native} translation.\n` +
    `  segments        : array of { text, depth, type, role_zh, label } — **長難句斷句視圖**.\n` +
    `                    Split the sentence into contiguous chunks so that concatenating every "text"\n` +
    `                    in order REPRODUCES the original sentence (preserve punctuation, spacing).\n` +
    `                    depth: integer 0-3. 0 = main-clause skeleton (S / V / O / complement);\n` +
    `                    1 = direct modifier of the main (adv/rel/participial etc);\n` +
    `                    2+ = nested modifiers of modifiers. Indent deeper when genuinely embedded.\n` +
    `                    type ∈ "main"|"rel"|"adv"|"noun"|"participial"|"inf"|"appos"|"prep"|"coord"|"other".\n` +
    `                    role_zh (in ${native}): one short phrase saying what job this chunk does — e.g.\n` +
    `                    "主語" / "謂語" / "限定 X 的關係子句" / "讓步背景" / "並列補充說明".\n` +
    `                    label: short bracket tag like "[S]" "[V]" "[O]" "[REL]" "[ADV]" "[INF]" "[PREP]"\n` +
    `                    "[APPOS]" "[COORD]" "[PART]" — shown as a badge before the chunk.\n` +
    `                    IMPORTANT: This is the MOST visible field in the UI. Keep chunks readable (≥2 words\n` +
    `                    where possible) and make depth genuinely reflect nesting, not arbitrary indentation.\n` +
    `  clauses         : array of { text, type, role_zh } — clause-level summary (redundant with segments\n` +
    `                    but flat; used for the clause list view). type ∈ same enum as segments.\n` +
    `                    role_zh (in ${native}) says WHY this clause is here (modifies X / sets time / concedes / etc).\n` +
    `  reading_notes   : array of 0-3 strings in ${native}. Point out parts a learner would MISREAD:\n` +
    `                      • ambiguous pronouns / demonstratives — say what they refer to\n` +
    `                      • word-class traps (e.g. "concerning" as prep, not V-ing)\n` +
    `                      • discourse markers and their logical function\n` +
    `                      • scope of negation or quantifiers\n` +
    `                    Empty array if genuinely straightforward.\n` +
    `  patterns        : array of 1-3 { template, abstract_zh, your_example, register } — **THE MOST IMPORTANT FIELD.**\n` +
    `                    Extract transferable SENTENCE-LEVEL patterns the learner can steal for their own writing.\n` +
    `                    template: abstract structure with X/Y/Z slots, e.g. "The fact that X suggests that Y".\n` +
    `                    abstract_zh: in ${native}, when & why to use this pattern.\n` +
    `                    your_example: rewrite the pattern on a COMPLETELY DIFFERENT topic so the transfer is obvious.\n` +
    `                    register ∈ "academic"|"formal"|"neutral"|"informal".\n` +
    `  collocations    : array of 0-4 { phrase, zh, register } — phrase-level (NOT single words).\n` +
    `                    register ∈ "academic"|"formal"|"neutral"|"informal"|"technical".\n` +
    `  stance_hedging  : string in ${native}. Describe epistemic/stance markers (hedges, boosters, evaluation).\n` +
    `                    Empty string "" if none.\n` +
    `  style_note      : string in ${native}. ONE rhetorical move worth imitating (nominalization, parallelism,\n` +
    `                    appositive gloss, voice choice, information order, etc.). Empty "" if plain.\n` +
    `  difficulty      : "A1"|"A2"|"B1"|"B2"|"C1"|"C2" — overall CEFR of this sentence.\n` +
    `  genre           : "academic"|"literary"|"journalistic"|"conversational"|"technical".\n\n` +
    `Principles:\n` +
    `  • Be SPECIFIC. Say "refers to the affordance introduced in clause 1" not "refers to a prior concept".\n` +
    `  • Patterns must be TRULY REUSABLE — don't echo the sentence's content verbatim.\n` +
    `  • If sentence is simple, give 1 pattern + empty reading_notes, don't pad.\n` +
    `  • segments must cover the entire sentence with NO gaps and NO overlaps; concat(segment.text) ≈ original.\n` +
    `  • A word joined across a line break may appear with an internal hyphen (e.g. "unin-terpretable");\n` +
    `    treat it as ONE word. Do not split the segment at the hyphen.\n`
  );
}

function parseSentenceAnalysis(text: string): Omit<SentenceAnalysis, "_meta"> {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let obj: any;
  try {
    obj = JSON.parse(stripped);
  } catch {
    throw new Error(`LLM parse error (sentence): ${stripped.slice(0, 180)}`);
  }
  const validCefr = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const validGenre = ["academic", "literary", "journalistic", "conversational", "technical"];
  const validClauseType = [
    "main", "rel", "adv", "noun", "participial", "inf", "appos", "prep", "coord", "other",
  ];
  const validRegWord = ["academic", "formal", "neutral", "informal"];
  const validRegColl = [...validRegWord, "technical"];

  const pickEnum = <T extends string>(v: any, valid: readonly string[], fallback: T): T =>
    (valid.includes(String(v)) ? String(v) : fallback) as T;

  return {
    gist_zh: String(obj.gist_zh ?? "").slice(0, 120),
    main_clause: {
      simplified: String(obj.main_clause?.simplified ?? "").slice(0, 200),
      zh: String(obj.main_clause?.zh ?? "").slice(0, 200),
    },
    segments: Array.isArray(obj.segments)
      ? obj.segments.slice(0, 24).map((s: any) => {
          const rawDepth = Number(s?.depth);
          const depth = Number.isFinite(rawDepth) ? Math.max(0, Math.min(3, Math.floor(rawDepth))) : 0;
          return {
            text: String(s?.text ?? "").slice(0, 400),
            depth,
            type: pickEnum(s?.type, validClauseType, "other"),
            role_zh: String(s?.role_zh ?? "").slice(0, 80),
            label: s?.label ? String(s.label).slice(0, 12) : undefined,
          };
        })
      : [],
    clauses: Array.isArray(obj.clauses)
      ? obj.clauses.slice(0, 8).map((c: any) => ({
          text: String(c?.text ?? "").slice(0, 300),
          type: pickEnum(c?.type, validClauseType, "other"),
          role_zh: String(c?.role_zh ?? "").slice(0, 120),
        }))
      : [],
    reading_notes: Array.isArray(obj.reading_notes)
      ? obj.reading_notes.map(String).slice(0, 4)
      : [],
    patterns: Array.isArray(obj.patterns)
      ? obj.patterns.slice(0, 3).map((p: any) => ({
          template: String(p?.template ?? "").slice(0, 200),
          abstract_zh: String(p?.abstract_zh ?? "").slice(0, 160),
          your_example: String(p?.your_example ?? "").slice(0, 240),
          register: pickEnum(p?.register, validRegWord, "neutral"),
        }))
      : [],
    collocations: Array.isArray(obj.collocations)
      ? obj.collocations.slice(0, 5).map((c: any) => ({
          phrase: String(c?.phrase ?? "").slice(0, 80),
          zh: String(c?.zh ?? "").slice(0, 80),
          register: pickEnum(c?.register, validRegColl, "neutral"),
        }))
      : [],
    stance_hedging: String(obj.stance_hedging ?? "").slice(0, 240),
    style_note: String(obj.style_note ?? "").slice(0, 240),
    difficulty: pickEnum(obj.difficulty, validCefr, "B2") as any,
    genre: pickEnum(obj.genre, validGenre, "academic"),
  };
}

// ──────────────── Parse / validate ────────────────────────────────────────
function parseAnalysis(text: string): Omit<WordAnalysis, "_meta"> {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let obj: any;
  try {
    obj = JSON.parse(stripped);
  } catch {
    throw new Error(`LLM parse error: ${stripped.slice(0, 160)}`);
  }
  const level = String(obj.level ?? "B2").toUpperCase();
  const validLvl = ["A1", "A2", "B1", "B2", "C1", "C2"].includes(level) ? level : "B2";
  return {
    definition_en: String(obj.definition_en ?? "").slice(0, 200),
    definition_zh: String(obj.definition_zh ?? "").slice(0, 80),
    level: validLvl as any,
    topics: Array.isArray(obj.topics) ? obj.topics.map(String).slice(0, 3) : [],
    sentence_meaning: String(obj.sentence_meaning ?? ""),
    syntactic_role: String(obj.syntactic_role ?? "").slice(0, 100),
    paraphrase: String(obj.paraphrase ?? ""),
    collocations: Array.isArray(obj.collocations)
      ? obj.collocations.map(String).slice(0, 3)
      : [],
  };
}

// ──────────────── Gateway ─────────────────────────────────────────────────
export class LLMGateway {
  private buckets = new Map<string, TokenBucket>();
  // Sentence analyses get their own in-memory cache — shape differs from
  // WordAnalysis, so we don't route through the shared CacheStore.
  private sentenceCache = new Map<string, SentenceAnalysis>();
  constructor(
    private backends: Backend[],
    private cache: CacheStore = new MemoryCache(),
  ) {
    for (const b of backends) {
      this.buckets.set(b.name, new TokenBucket(b.limits.rpm));
    }
  }

  get backendNames(): string[] {
    return this.backends.map(b => b.name);
  }

  hasBackend(): boolean {
    return this.backends.length > 0;
  }

  /** Helper: throw RateLimitError early if every backend that *has* a
   *  cooldown concept is currently cooling. A backend that omits
   *  cooldownRemainingMs (e.g. Ollama) defeats the early-throw because it's
   *  always-available from the gateway's POV — which is correct. */
  private checkAllCooling(): void {
    let maxRemaining = 0;
    let allCooling = true;
    for (const b of this.backends) {
      if (typeof b.cooldownRemainingMs === "function") {
        const rem = b.cooldownRemainingMs();
        if (rem === 0) {
          allCooling = false;
        } else {
          maxRemaining = Math.max(maxRemaining, rem);
        }
      } else {
        // No cooldown concept — assume available.
        allCooling = false;
      }
    }
    if (allCooling && this.backends.length > 0) {
      throw new RateLimitError(
        `rate_limit: 所有 backend 冷卻中，約 ${Math.ceil(maxRemaining / 1000)} 秒後可再試`,
        maxRemaining,
      );
    }
  }

  async explain(req: WordAnalysisRequest, signal?: AbortSignal): Promise<WordAnalysis> {
    if (!this.backends.length) {
      throw new Error("No LLM backend configured. Open Settings to paste an API key.");
    }
    const primaryModel = this.backends[0]!.name;
    const key = await hashKey(primaryModel, req);
    const hit = await this.cache.get(key);
    if (hit) {
      return { ...hit, _meta: { ...hit._meta, cached: true, elapsedMs: 0 } };
    }

    this.checkAllCooling();

    const prompt = buildPrompt(req);
    const t0 = Date.now();
    let lastErr: unknown = null;
    for (const b of this.backends) {
      if (!(await b.available())) continue;
      const bucket = this.buckets.get(b.name)!;
      try {
        await bucket.take(1);
        const { text, inputTokens, outputTokens } = await b.call(prompt, signal, {
          maxOutputTokens: 512,
        });
        const parsed = parseAnalysis(text);
        const resp: WordAnalysis = {
          ...parsed,
          _meta: {
            backend: b.name,
            cached: false,
            elapsedMs: Date.now() - t0,
            inputTokens,
            outputTokens,
          },
        };
        await this.cache.set(key, resp);
        return resp;
      } catch (e) {
        lastErr = e;
        // fall through to next backend
      }
    }
    // Preserve rate-limit / model-not-found classification when bubbling up.
    if (lastErr instanceof RateLimitError) throw lastErr;
    if (lastErr instanceof ModelNotFoundError) throw lastErr;
    throw new Error(`All LLM backends failed: ${String(lastErr)}`);
  }

  /**
   * Deep sentence analysis — structure + reading pitfalls + transferable
   * writing patterns. Larger output budget than word-level explain() because
   * the schema has 10 fields including 1-3 pattern objects.
   */
  async explainSentence(
    req: SentenceAnalysisRequest,
    signal?: AbortSignal,
  ): Promise<SentenceAnalysis> {
    if (!this.backends.length) {
      throw new Error("No LLM backend configured. Open Settings to paste an API key.");
    }
    const primaryModel = this.backends[0]!.name;
    const key = await sentenceHashKey(primaryModel, req);
    const hit = this.sentenceCache.get(key);
    if (hit) {
      return { ...hit, _meta: { ...hit._meta, cached: true, elapsedMs: 0 } };
    }

    this.checkAllCooling();

    const prompt = buildSentencePrompt(req);
    const t0 = Date.now();
    let lastErr: unknown = null;
    for (const b of this.backends) {
      if (!(await b.available())) continue;
      const bucket = this.buckets.get(b.name)!;
      try {
        await bucket.take(1);
        const { text, inputTokens, outputTokens } = await b.call(prompt, signal, {
          maxOutputTokens: 1536,
        });
        const parsed = parseSentenceAnalysis(text);
        const resp: SentenceAnalysis = {
          ...parsed,
          _meta: {
            backend: b.name,
            cached: false,
            elapsedMs: Date.now() - t0,
            inputTokens,
            outputTokens,
          },
        };
        this.sentenceCache.set(key, resp);
        return resp;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr instanceof RateLimitError) throw lastErr;
    if (lastErr instanceof ModelNotFoundError) throw lastErr;
    throw new Error(`All LLM backends failed: ${String(lastErr)}`);
  }
}

// ──────────────── Factory: build gateway from config ──────────────────────
let _gateway: LLMGateway | null = null;
let _cache: MemoryCache | null = null;

export function buildGateway(cfg: LLMConfig): LLMGateway | null {
  if (cfg.mode !== "multi") {
    _gateway = null;
    return null;
  }
  const backends: Backend[] = [];
  for (const pid of cfg.chainOrder) {
    if (pid === "gemini" && cfg.gemini.enabled && cfg.gemini.apiKey) {
      backends.push(new GeminiBackend(cfg.gemini.apiKey, cfg.gemini.primaryModel));
      if (
        cfg.gemini.fallbackModel &&
        cfg.gemini.fallbackModel !== cfg.gemini.primaryModel
      ) {
        backends.push(new GeminiBackend(cfg.gemini.apiKey, cfg.gemini.fallbackModel));
      }
    } else if (pid === "groq" && cfg.groq.enabled && cfg.groq.apiKey && cfg.groq.model) {
      backends.push(new GroqBackend(cfg.groq.apiKey, cfg.groq.model));
    } else if (pid === "ollama" && cfg.ollama.enabled && cfg.ollama.model) {
      backends.push(new OllamaBackend(cfg.ollama.baseUrl, cfg.ollama.model));
    }
  }
  if (!backends.length) {
    _gateway = null;
    return null;
  }
  if (!_cache) _cache = new MemoryCache();
  _gateway = new LLMGateway(backends, _cache);
  return _gateway;
}

export function getGateway(): LLMGateway | null {
  return _gateway;
}

export function clearGatewayCache() {
  _cache = new MemoryCache();
  _gateway = null;
}
