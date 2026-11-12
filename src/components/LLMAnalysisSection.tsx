/**
 * LLMAnalysisSection — renders the async LLM analysis block:
 * 英英 / 中文 / level badge / topic tags / 句中含義 / paraphrase.
 *
 * Props:
 *  - state: AnalysisState from useWordAnalysis
 *  - compact: if true, hide paraphrase + collocations (popup mode)
 */
import type { AnalysisState } from "../lib/llm/useWordAnalysis";
import { LevelBadge } from "./LevelBadge";
import { TopicTags } from "./TopicTags";

interface Props {
  state: AnalysisState;
  compact?: boolean;
}

export function LLMAnalysisSection({ state, compact = false }: Props) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-blue-500" />
        <span>LLM 分析中…</span>
      </div>
    );
  }

  if (state.status === "error") {
    const msg = state.message;
    const isRateLimit = /rate_limit|429|quota|exceeded/i.test(msg);
    const isModelGone = /model_not_found|404|is not (found|supported)/i.test(msg);
    if (isModelGone) {
      const modelMatch = /"([\w.\-]+)"/.exec(msg);
      const modelId = modelMatch ? modelMatch[1] : null;
      return (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200 ring-1 ring-inset ring-amber-200 dark:ring-amber-800">
          <div className="font-medium">模型不存在或已下架</div>
          <div className="mt-0.5 text-amber-700 dark:text-amber-300 leading-snug">
            {modelId ? <>LLM 找不到 <code className="text-[11px]">{modelId}</code>。</> : null}
            {" "}請點右上「設定」切換模型，或改選其他 provider。
          </div>
        </div>
      );
    }
    if (isRateLimit) {
      const secMatch = /(\d+)\s*秒/.exec(msg);
      const secs = secMatch ? secMatch[1] : null;
      return (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200 ring-1 ring-inset ring-amber-200 dark:ring-amber-800">
          <div className="font-medium">LLM 額度已滿 / 冷卻中</div>
          <div className="mt-0.5 text-amber-700 dark:text-amber-300 leading-snug">
            {secs ? `約 ${secs} 秒後可再點新詞；` : "稍候後可再試；"}
            已快取過的詞仍可查。若想立即繼續，到「設定」啟用其他 provider（Groq / Ollama）作 fallback。
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-2 py-1 text-xs text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-200 dark:ring-rose-800">
        LLM 失敗：{msg.slice(0, 120)}
      </div>
    );
  }

  const d = state.data;

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {/* Header: level + topics */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <LevelBadge level={d.level} small={compact} />
        <TopicTags tags={d.topics} small={compact} />
        {d._meta.cached && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500" title="從快取讀取，未計入本次 API 額度">
            cached
          </span>
        )}
      </div>

      {/* 英英 */}
      {d.definition_en && (
        <div>
          <div className={compact ? "text-[10px] font-medium text-slate-500 dark:text-slate-400" : "text-xs font-medium text-slate-500 dark:text-slate-400"}>
            English
          </div>
          <div className={compact ? "text-xs text-slate-700 dark:text-slate-200 leading-snug" : "text-sm text-slate-800 dark:text-slate-100 leading-snug"}>
            {d.definition_en}
          </div>
        </div>
      )}

      {/* 中文 */}
      {d.definition_zh && (
        <div>
          <div className={compact ? "text-[10px] font-medium text-slate-500 dark:text-slate-400" : "text-xs font-medium text-slate-500 dark:text-slate-400"}>
            中文
          </div>
          <div className={compact ? "text-xs text-slate-700 dark:text-slate-200 leading-snug" : "text-sm text-slate-800 dark:text-slate-100 leading-snug"}>
            {d.definition_zh}
          </div>
        </div>
      )}

      {/* 句中含義 */}
      {d.sentence_meaning && (
        <div>
          <div className={compact ? "text-[10px] font-medium text-slate-500 dark:text-slate-400" : "text-xs font-medium text-slate-500 dark:text-slate-400"}>
            句中含義
          </div>
          <div className={compact ? "text-xs text-slate-700 dark:text-slate-200 leading-snug" : "text-sm text-slate-800 dark:text-slate-100 leading-snug"}>
            {d.sentence_meaning}
          </div>
        </div>
      )}

      {!compact && d.syntactic_role && (
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Syntactic role</div>
          <div className="text-sm text-slate-800 dark:text-slate-100">{d.syntactic_role}</div>
        </div>
      )}

      {!compact && d.paraphrase && (
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Paraphrase</div>
          <div className="text-sm italic text-slate-700 dark:text-slate-200">{d.paraphrase}</div>
        </div>
      )}

      {!compact && d.collocations && d.collocations.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Collocations</div>
          <div className="flex flex-wrap gap-1 text-sm">
            {d.collocations.map(c => (
              <span key={c} className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-xs text-slate-700 dark:text-slate-200">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
