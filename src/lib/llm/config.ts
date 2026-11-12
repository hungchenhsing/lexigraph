/**
 * LLM settings persistence.
 *
 * API keys live in localStorage — this is a local desktop-ish reader, not a
 * server-facing app, so a raw string is acceptable. For Electron later we'd
 * swap to keytar / DPAPI.
 *
 * Schema v2 (Round 10): multi-provider (Gemini / Groq / Ollama) with
 * explicit chainOrder. Older v1 configs (single-provider) are auto-migrated.
 */
import { DEFAULT_CONFIG, type LLMConfig, type ProviderId } from "./types";

const STORAGE_KEY = "lexigraph.llm.config";

// ──────── Model catalogs (exposed to SettingsModal) ──────────────────────
// Gemini v1beta. Gemini 1.5 was removed in late 2025; any stored config
// pointing at it is auto-migrated to the default below.
export const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash（推薦 · 目前主力）" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash（較舊版，仍可用）" },
  { id: "gemini-flash-latest", label: "gemini-flash-latest（總是指向最新 stable）" },
];

export const GEMINI_FALLBACK_MODELS = [
  { id: "", label: "不使用備用模型" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash（獨立 15 RPM 配額）" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash（與主配額共用，不建議作 fallback）" },
  { id: "gemini-flash-latest", label: "gemini-flash-latest" },
];

// Groq — OpenAI-compatible API at api.groq.com. Model IDs shift occasionally;
// user can paste any valid Groq model ID in as long as it matches Groq's
// public model list. These three are the most useful for Lexigraph's JSON
// response mode and were live at 2025-05.
export const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile（推薦 · 近 Gemini 2.5 品質）" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant（最快 · ~750 t/s · 配額最寬）" },
  { id: "gemma2-9b-it", label: "Gemma 2 9B IT（Google 風格）" },
];

// Ollama — model is free-form (must match a model already pulled on the
// user's machine). We surface a few common academic-friendly picks as
// datalist suggestions but the text input accepts anything.
export const OLLAMA_MODEL_SUGGESTIONS = [
  "qwen2.5:7b",
  "qwen2.5:14b",
  "llama3.2:3b",
  "llama3.1:8b",
  "phi3.5",
  "gemma2:9b",
];

const VALID_GEMINI_IDS = new Set(GEMINI_MODELS.map((m) => m.id));
const VALID_GEMINI_FALLBACK_IDS = new Set(GEMINI_FALLBACK_MODELS.map((m) => m.id));
// Old IDs we know are deprecated — migrate silently.
const DEPRECATED_GEMINI_IDS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-1.0-pro",
]);

const ALL_PROVIDERS: ProviderId[] = ["gemini", "groq", "ollama"];

// ──────── Load / save / migrate ───────────────────────────────────────────

function cloneDefault(): LLMConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function loadConfig(): LLMConfig {
  if (typeof localStorage === "undefined") return cloneDefault();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return cloneDefault();

    // Legacy shape detection: v1 had { provider: "gemini"|"offline",
    // geminiApiKey, geminiModel, geminiFallbackModel } and no `mode`.
    if (!("mode" in parsed) && "provider" in parsed) {
      const migrated = migrateLegacy(parsed);
      persist(migrated);
      return migrated;
    }

    const merged = mergeWithDefaults(parsed);
    const validated = validateAndFix(merged);
    // Persist back if validation corrected anything, so next load is stable.
    if (JSON.stringify(validated) !== JSON.stringify(parsed)) {
      persist(validated);
    }
    return validated;
  } catch {
    return cloneDefault();
  }
}

export function saveConfig(cfg: LLMConfig) {
  persist(cfg);
}

function persist(cfg: LLMConfig) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

function mergeWithDefaults(parsed: any): LLMConfig {
  const def = cloneDefault();
  return {
    mode: parsed.mode === "offline" ? "offline" : "multi",
    chainOrder: Array.isArray(parsed.chainOrder)
      ? (parsed.chainOrder.filter((x: any): x is ProviderId =>
          ALL_PROVIDERS.includes(x)) as ProviderId[])
      : def.chainOrder,
    gemini: { ...def.gemini, ...(parsed.gemini ?? {}) },
    groq: { ...def.groq, ...(parsed.groq ?? {}) },
    ollama: { ...def.ollama, ...(parsed.ollama ?? {}) },
    autoTrigger:
      typeof parsed.autoTrigger === "boolean" ? parsed.autoTrigger : def.autoTrigger,
  };
}

function validateAndFix(cfg: LLMConfig): LLMConfig {
  const fixed: LLMConfig = JSON.parse(JSON.stringify(cfg));

  // chainOrder: must contain each provider exactly once. Append missing;
  // drop unknown; de-dup.
  const seen = new Set<string>();
  const cleaned: ProviderId[] = [];
  for (const p of fixed.chainOrder) {
    if (ALL_PROVIDERS.includes(p) && !seen.has(p)) {
      cleaned.push(p);
      seen.add(p);
    }
  }
  for (const p of ALL_PROVIDERS) if (!seen.has(p)) cleaned.push(p);
  fixed.chainOrder = cleaned;

  // Gemini model sanity
  if (
    typeof fixed.gemini.primaryModel !== "string" ||
    DEPRECATED_GEMINI_IDS.has(fixed.gemini.primaryModel) ||
    !VALID_GEMINI_IDS.has(fixed.gemini.primaryModel)
  ) {
    fixed.gemini.primaryModel = DEFAULT_CONFIG.gemini.primaryModel;
  }
  if (
    typeof fixed.gemini.fallbackModel !== "string" ||
    (fixed.gemini.fallbackModel !== "" &&
      !VALID_GEMINI_FALLBACK_IDS.has(fixed.gemini.fallbackModel))
  ) {
    fixed.gemini.fallbackModel = DEFAULT_CONFIG.gemini.fallbackModel;
  }
  // Primary == fallback is wasteful (same per-model quota).
  if (
    fixed.gemini.fallbackModel &&
    fixed.gemini.fallbackModel === fixed.gemini.primaryModel
  ) {
    fixed.gemini.fallbackModel = "";
  }

  // Groq: model can be any string (Groq adds/removes models often); at
  // least ensure it's a non-empty string.
  if (typeof fixed.groq.model !== "string" || !fixed.groq.model.trim()) {
    fixed.groq.model = DEFAULT_CONFIG.groq.model;
  }

  // Ollama: normalize URL; guarantee non-empty model.
  if (typeof fixed.ollama.baseUrl !== "string" || !fixed.ollama.baseUrl.trim()) {
    fixed.ollama.baseUrl = DEFAULT_CONFIG.ollama.baseUrl;
  }
  fixed.ollama.baseUrl = fixed.ollama.baseUrl.replace(/\/+$/, "");
  if (typeof fixed.ollama.model !== "string" || !fixed.ollama.model.trim()) {
    fixed.ollama.model = DEFAULT_CONFIG.ollama.model;
  }

  return fixed;
}

function migrateLegacy(old: any): LLMConfig {
  const cfg = cloneDefault();
  if (old.provider === "gemini") {
    cfg.mode = "multi";
    cfg.gemini.enabled =
      typeof old.geminiApiKey === "string" && !!old.geminiApiKey.trim();
    cfg.gemini.apiKey = typeof old.geminiApiKey === "string" ? old.geminiApiKey : "";
    if (typeof old.geminiModel === "string") {
      cfg.gemini.primaryModel = old.geminiModel;
    }
    if (typeof old.geminiFallbackModel === "string") {
      cfg.gemini.fallbackModel = old.geminiFallbackModel;
    }
  } else {
    cfg.mode = "offline";
  }
  if (typeof old.autoTrigger === "boolean") cfg.autoTrigger = old.autoTrigger;
  return validateAndFix(cfg);
}

// ──────── Enablement check (used by App + hooks) ─────────────────────────

export function isLLMEnabled(cfg: LLMConfig): boolean {
  if (cfg.mode !== "multi") return false;
  return (
    (cfg.gemini.enabled && !!cfg.gemini.apiKey.trim()) ||
    (cfg.groq.enabled && !!cfg.groq.apiKey.trim()) ||
    cfg.ollama.enabled
  );
}
