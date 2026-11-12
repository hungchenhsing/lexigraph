/**
 * SettingsModal — multi-provider LLM settings (Round 10).
 *
 * UI structure:
 *   1. Mode toggle (multi / offline)
 *   2. Three provider cards in chainOrder sequence, each with:
 *        · header: order badge + name + enabled checkbox + ↑/↓ reorder
 *        · body: provider-specific fields (disabled when not enabled)
 *   3. autoTrigger checkbox + privacy note
 *
 * Persists to localStorage via lib/llm/config.ts. Rebuilds LLM gateway on save.
 */
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  GEMINI_MODELS,
  GEMINI_FALLBACK_MODELS,
  GROQ_MODELS,
  OLLAMA_MODEL_SUGGESTIONS,
  loadConfig,
  saveConfig,
} from "../lib/llm/config";
import { buildGateway, clearGatewayCache } from "../lib/llm/gateway";
import type { LLMConfig, ProviderId } from "../lib/llm/types";
import { BackupSection } from "./BackupSection";
import { loadReaderSettings, saveReaderSettings, type ReaderSettings } from "../lib/readerSettings";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfigChange?: (cfg: LLMConfig) => void;
  onDataImported?: () => void;
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  groq: "Groq（Llama/Gemma）",
  ollama: "Ollama（本機）",
};

const PROVIDER_SUBTITLES: Record<ProviderId, string> = {
  gemini: "雲端 · 15 RPM / 1500 RPD 免費額度（每個模型獨立）",
  groq: "雲端 · 30 RPM / 14400 RPD 免費額度 · 速度最快",
  ollama: "本機 · 無額度限制 · 依賴本機硬體",
};

export function SettingsModal({ open, onClose, onConfigChange, onDataImported }: Props) {
  const [cfg, setCfg] = useState<LLMConfig>(() => loadConfig());
  const [reader, setReader] = useState<ReaderSettings>(() => loadReaderSettings());
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);

  useEffect(() => {
    if (open) {
      setCfg(loadConfig());
      setReader(loadReaderSettings());
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    saveConfig(cfg);
    clearGatewayCache();
    buildGateway(cfg);
    onConfigChange?.(cfg);
    onClose();
  };

  const handleCancel = () => onClose();

  const setMode = (mode: "multi" | "offline") => setCfg(p => ({ ...p, mode }));

  const move = (pid: ProviderId, dir: -1 | 1) => {
    setCfg(p => {
      const order = [...p.chainOrder];
      const idx = order.indexOf(pid);
      if (idx < 0) return p;
      const next = idx + dir;
      if (next < 0 || next >= order.length) return p;
      const tmp = order[idx]!;
      order[idx] = order[next]!;
      order[next] = tmp;
      return { ...p, chainOrder: order };
    });
  };

  const disabled = cfg.mode !== "multi";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleCancel}
    >
      <div
        className="max-h-[92vh] w-[620px] max-w-[94vw] overflow-y-auto rounded-lg bg-white dark:bg-slate-800 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">設定</h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <BackupSection onImported={onDataImported} />

          <div className="rounded-md border border-slate-200 dark:border-slate-600 p-3 space-y-2">
            <div className="font-medium text-slate-800 dark:text-slate-100">閱讀</div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={reader.autoMarkKnown}
                onChange={(e) => {
                  const next = { ...reader, autoMarkKnown: e.target.checked };
                  setReader(next);
                  saveReaderSettings(next);
                }}
              />
              <span>
                翻頁後把沒點過的字標成認識
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  預設開啟。點過的字不會自動改狀態。參考文獻頁、作者名、信箱帳號、地名縮寫、引用和數字不會標。
                </span>
              </span>
            </label>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              詞典顯示
              <div className="mt-1 flex gap-3">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="gloss-script"
                    checked={reader.glossScript !== "zh-CN"}
                    onChange={() => {
                      const next = { ...reader, glossScript: "zh-TW" as const };
                      setReader(next);
                      saveReaderSettings(next);
                    }}
                  />
                  繁體（台灣）
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="ui-lang"
                    checked={reader.uiLang !== "en"}
                    onChange={() => {
                      const next = { ...reader, uiLang: "zh-TW" as const };
                      setReader(next);
                      saveReaderSettings(next);
                    }}
                  />
                  介面繁體
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="ui-lang"
                    checked={reader.uiLang === "en"}
                    onChange={() => {
                      const next = { ...reader, uiLang: "en" as const };
                      setReader(next);
                      saveReaderSettings(next);
                    }}
                  />
                  English UI
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="gloss-script"
                    checked={reader.glossScript === "zh-CN"}
                    onChange={() => {
                      const next = { ...reader, glossScript: "zh-CN" as const };
                      setReader(next);
                      saveReaderSettings(next);
                    }}
                  />
                  簡體
                </label>
              </div>
            </div>
            <label className={`flex items-start gap-2 ${reader.autoMarkKnown ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={reader.confirmAutoMark}
                disabled={!reader.autoMarkKnown}
                onChange={(e) => {
                  const next = { ...reader, confirmAutoMark: e.target.checked };
                  setReader(next);
                  saveReaderSettings(next);
                }}
              />
              <span>翻頁後先列出這些字，讓我勾選要學習的（沒勾的標成認識）</span>
            </label>
          </div>

          {/* Mode toggle */}
          <div>
            <div className="mb-1.5 font-medium text-gray-800">分析模式</div>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={cfg.mode === "multi"}
                  onChange={() => setMode("multi")}
                />
                <span>多 provider 鏈（按順序嘗試，前者超額自動切下一個）</span>
              </label>
            </div>
            <div className="mt-1 flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={cfg.mode === "offline"}
                  onChange={() => setMode("offline")}
                />
                <span>僅離線（只用內建詞庫 + 啓發式句法）</span>
              </label>
            </div>
          </div>

          {/* Provider chain */}
          <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="font-medium text-gray-800">Provider 鏈（順序可調）</div>
              <div className="text-xs text-gray-500">
                順序 = gateway 嘗試順序；未啟用的會被跳過
              </div>
            </div>

            <div className="space-y-3">
              {cfg.chainOrder.map((pid, idx) => (
                <ProviderCard
                  key={pid}
                  pid={pid}
                  order={idx + 1}
                  isFirst={idx === 0}
                  isLast={idx === cfg.chainOrder.length - 1}
                  cfg={cfg}
                  setCfg={setCfg}
                  move={move}
                  showGeminiKey={showGeminiKey}
                  setShowGeminiKey={setShowGeminiKey}
                  showGroqKey={showGroqKey}
                  setShowGroqKey={setShowGroqKey}
                />
              ))}
            </div>
          </div>

          {/* Behavior */}
          <div className="border-t pt-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.autoTrigger}
                onChange={e => setCfg(p => ({ ...p, autoTrigger: e.target.checked }))}
              />
              <span>點詞即自動呼叫 LLM（快取命中不計額度）</span>
            </label>
          </div>

          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            <strong>隱私提示：</strong>Gemini / Groq 免費 tier 的輸入資料可能被用於訓練。
            閱讀未發表的學術 draft 時，建議優先使用 Ollama（本機推論，資料不出機器）。
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-gray-50 px-5 py-3">
          <button
            onClick={handleCancel}
            className="rounded border border-gray-300 bg-white dark:bg-slate-800 px-3 py-1 text-sm hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────── Per-provider card ────────────────────────────────────────────────

interface CardProps {
  pid: ProviderId;
  order: number;
  isFirst: boolean;
  isLast: boolean;
  cfg: LLMConfig;
  setCfg: Dispatch<SetStateAction<LLMConfig>>;
  move: (pid: ProviderId, dir: -1 | 1) => void;
  showGeminiKey: boolean;
  setShowGeminiKey: (v: boolean) => void;
  showGroqKey: boolean;
  setShowGroqKey: (v: boolean) => void;
}

function ProviderCard(props: CardProps) {
  const { pid, order, isFirst, isLast, cfg, setCfg, move } = props;

  const enabled = useMemo(() => {
    if (pid === "gemini") return cfg.gemini.enabled;
    if (pid === "groq") return cfg.groq.enabled;
    return cfg.ollama.enabled;
  }, [pid, cfg]);

  const setEnabled = (v: boolean) => {
    setCfg(p => {
      if (pid === "gemini") return { ...p, gemini: { ...p.gemini, enabled: v } };
      if (pid === "groq") return { ...p, groq: { ...p.groq, enabled: v } };
      return { ...p, ollama: { ...p.ollama, enabled: v } };
    });
  };

  return (
    <div
      className={`rounded-md border ${enabled ? "border-gray-300" : "border-gray-200 bg-gray-50"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-inherit px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {order}
          </span>
          <div>
            <div className="font-medium text-gray-800">{PROVIDER_LABELS[pid]}</div>
            <div className="text-xs text-gray-500">{PROVIDER_SUBTITLES[pid]}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => move(pid, -1)}
            className="rounded border border-gray-300 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-30"
            aria-label="move up"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => move(pid, 1)}
            className="rounded border border-gray-300 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-30"
            aria-label="move down"
          >
            ↓
          </button>
          <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
            />
            <span>啟用</span>
          </label>
        </div>
      </div>

      {/* Body */}
      <div className={`space-y-3 px-3 py-3 ${enabled ? "" : "opacity-60"}`}>
        {pid === "gemini" && <GeminiCard {...props} />}
        {pid === "groq" && <GroqCard {...props} />}
        {pid === "ollama" && <OllamaCard {...props} />}
      </div>
    </div>
  );
}

// ──────── Gemini card body ────────────────────────────────────────────────

function GeminiCard({ cfg, setCfg, showGeminiKey, setShowGeminiKey }: CardProps) {
  const enabled = cfg.gemini.enabled;
  return (
    <>
      <div>
        <div className="mb-1 text-xs font-medium text-gray-700">API Key</div>
        <div className="flex gap-2">
          <input
            type={showGeminiKey ? "text" : "password"}
            value={cfg.gemini.apiKey}
            onChange={e =>
              setCfg(p => ({ ...p, gemini: { ...p.gemini, apiKey: e.target.value } }))
            }
            placeholder="AIza…（aistudio.google.com 申請）"
            disabled={!enabled}
            className="flex-1 rounded border border-gray-300 px-2 py-1 font-mono text-xs disabled:bg-gray-100"
          />
          <button
            type="button"
            onClick={() => setShowGeminiKey(!showGeminiKey)}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            disabled={!enabled}
          >
            {showGeminiKey ? "隱藏" : "顯示"}
          </button>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-gray-700">主要模型</div>
        <select
          value={cfg.gemini.primaryModel}
          onChange={e =>
            setCfg(p => ({ ...p, gemini: { ...p.gemini, primaryModel: e.target.value } }))
          }
          disabled={!enabled}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100"
        >
          {GEMINI_MODELS.map(m => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-gray-700">
          備用模型
          <span className="ml-1 font-normal text-gray-500">· 主配額用完時自動切換</span>
        </div>
        <select
          value={cfg.gemini.fallbackModel}
          onChange={e =>
            setCfg(p => ({ ...p, gemini: { ...p.gemini, fallbackModel: e.target.value } }))
          }
          disabled={!enabled}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100"
        >
          {GEMINI_FALLBACK_MODELS.filter(m => m.id !== cfg.gemini.primaryModel).map(m => (
            <option key={m.id || "none"} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

// ──────── Groq card body ──────────────────────────────────────────────────

function GroqCard({ cfg, setCfg, showGroqKey, setShowGroqKey }: CardProps) {
  const enabled = cfg.groq.enabled;
  return (
    <>
      <div>
        <div className="mb-1 text-xs font-medium text-gray-700">API Key</div>
        <div className="flex gap-2">
          <input
            type={showGroqKey ? "text" : "password"}
            value={cfg.groq.apiKey}
            onChange={e =>
              setCfg(p => ({ ...p, groq: { ...p.groq, apiKey: e.target.value } }))
            }
            placeholder="gsk_…（console.groq.com 免費申請）"
            disabled={!enabled}
            className="flex-1 rounded border border-gray-300 px-2 py-1 font-mono text-xs disabled:bg-gray-100"
          />
          <button
            type="button"
            onClick={() => setShowGroqKey(!showGroqKey)}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            disabled={!enabled}
          >
            {showGroqKey ? "隱藏" : "顯示"}
          </button>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          Groq 免費 tier：~30 RPM / 14400 RPD，速度遠快於 Gemini（~750 tok/s）。
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-gray-700">模型</div>
        <input
          list="groq-models"
          value={cfg.groq.model}
          onChange={e =>
            setCfg(p => ({ ...p, groq: { ...p.groq, model: e.target.value } }))
          }
          disabled={!enabled}
          placeholder="llama-3.3-70b-versatile"
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100"
        />
        <datalist id="groq-models">
          {GROQ_MODELS.map(m => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </datalist>
        <div className="mt-1 text-xs text-gray-500">
          推薦：<span className="font-mono">llama-3.3-70b-versatile</span>（品質近 Gemini 2.5 Flash）。
          Groq 偶爾會下架舊模型，若遇 404 請至 console.groq.com 查最新 ID。
        </div>
      </div>
    </>
  );
}

// ──────── Ollama card body ────────────────────────────────────────────────

function OllamaCard({ cfg, setCfg }: CardProps) {
  const enabled = cfg.ollama.enabled;
  return (
    <>
      <div>
        <div className="mb-1 text-xs font-medium text-gray-700">伺服器位址</div>
        <input
          type="text"
          value={cfg.ollama.baseUrl}
          onChange={e =>
            setCfg(p => ({ ...p, ollama: { ...p.ollama, baseUrl: e.target.value } }))
          }
          placeholder="http://localhost:11434"
          disabled={!enabled}
          className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs disabled:bg-gray-100"
        />
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-gray-700">模型（需已透過 <span className="font-mono">ollama pull</span> 下載）</div>
        <input
          list="ollama-models"
          value={cfg.ollama.model}
          onChange={e =>
            setCfg(p => ({ ...p, ollama: { ...p.ollama, model: e.target.value } }))
          }
          disabled={!enabled}
          placeholder="qwen2.5:7b"
          className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs disabled:bg-gray-100"
        />
        <datalist id="ollama-models">
          {OLLAMA_MODEL_SUGGESTIONS.map(m => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
        <div className="font-medium">CORS 設定（Windows）</div>
        <div className="mt-0.5 leading-5">
          瀏覽器直接打 localhost:11434 需 Ollama 允許跨域。本機開發可在 PowerShell 執行：
        </div>
        <pre className="mt-1 overflow-x-auto rounded bg-amber-100 px-2 py-1 font-mono text-[11px]">
          setx OLLAMA_ORIGINS "*"
        </pre>
        <div className="mt-0.5">然後重啟 Ollama。若網站是 https（例如 read.zhenxinghong.com），瀏覽器預設會擋下 http://localhost，需讓 OLLAMA_ORIGINS 包含該網站來源。</div>
      </div>
    </>
  );
}
