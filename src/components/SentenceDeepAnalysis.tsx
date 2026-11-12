/**
 * SentenceDeepAnalysis — LLM-powered sentence deep-dive panel.
 *
 * Reads the output of useSentenceDeepAnalysis and renders the 10 output fields
 * in a layout tuned for two complementary goals:
 *   (A) Reading precision — gist / main-clause skeleton / clause tree / reading_notes
 *   (B) Writing accumulation — patterns (★ highlighted) / collocations / stance_hedging / style_note
 *
 * Design philosophy: reading_notes 治你的眼，patterns 餵你的筆。
 */
import type { SentenceState } from "../lib/llm/useSentenceDeepAnalysis";
import { LevelBadge } from "./LevelBadge";

const CLAUSE_TYPE_LABEL: Record<string, string> = {
  main: "主句",
  rel: "關係子句",
  adv: "狀語子句",
  noun: "名詞子句",
  participial: "分詞結構",
  inf: "不定式",
  appos: "同位語",
  prep: "介系詞片語",
  coord: "並列結構",
  other: "其他",
};

const CLAUSE_TYPE_COLOR: Record<string, string> = {
  main: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  rel: "bg-sky-50 text-sky-700 ring-sky-200",
  adv: "bg-amber-50 text-amber-700 ring-amber-200",
  noun: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  participial: "bg-violet-50 text-violet-700 ring-violet-200",
  inf: "bg-pink-50 text-pink-700 ring-pink-200",
  appos: "bg-teal-50 text-teal-700 ring-teal-200",
  prep: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  coord: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  other: "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-200",
};

// Left-rail accent color — used on the indented segment row to signal depth.
const SEGMENT_RAIL: Record<string, string> = {
  main: "border-l-indigo-400",
  rel: "border-l-sky-400",
  adv: "border-l-amber-400",
  noun: "border-l-emerald-400",
  participial: "border-l-violet-400",
  inf: "border-l-pink-400",
  appos: "border-l-teal-400",
  prep: "border-l-cyan-400",
  coord: "border-l-fuchsia-400",
  other: "border-l-slate-300",
};

const REGISTER_LABEL: Record<string, string> = {
  academic: "學術",
  formal: "正式",
  neutral: "中性",
  informal: "口語",
  technical: "技術",
};

const GENRE_LABEL: Record<string, string> = {
  academic: "學術",
  literary: "文學",
  journalistic: "新聞",
  conversational: "口語",
  technical: "技術",
};

export function SentenceDeepAnalysis({ state }: { state: SentenceState }) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-1">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-indigo-500" />
        <span>深度解析中…通常 3-6 秒</span>
      </div>
    );
  }

  if (state.status === "error") {
    const msg = state.message;
    const isRateLimit = /rate_limit|429|quota|exceeded/i.test(msg);
    const isModelGone = /model_not_found|404|is not (found|supported)/i.test(msg);
    if (isModelGone) {
      return (
        <div className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          <div className="font-medium">模型不存在或已下架</div>
          <div className="mt-0.5 text-amber-700 leading-snug">
            請點右上「設定」切換到 <code className="text-[11px]">gemini-2.5-flash</code> 或 <code className="text-[11px]">gemini-2.0-flash</code>。
          </div>
        </div>
      );
    }
    if (isRateLimit) {
      const secMatch = /(\d+)\s*秒/.exec(msg);
      const secs = secMatch ? secMatch[1] : null;
      return (
        <div className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          <div className="font-medium">LLM 額度已滿 / 冷卻中</div>
          <div className="mt-0.5 text-amber-700 leading-snug">
            {secs ? `約 ${secs} 秒後可再試；` : "稍候一分鐘可再試；"}
            已快取的句子仍可看。
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
        分析失敗：{msg.slice(0, 160)}
      </div>
    );
  }

  const d = state.data;

  return (
    <div className="space-y-3">
      {/* Header: difficulty + genre + cached flag */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <LevelBadge level={d.difficulty} small />
        <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-200 ring-1 ring-inset ring-slate-200">
          {GENRE_LABEL[d.genre] ?? d.genre}
        </span>
        {d._meta.cached && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-400" title="從快取讀取，未計入本次 API 額度">
            cached
          </span>
        )}
        {!d._meta.cached && d._meta.elapsedMs > 0 && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-400" title="本次 API 耗時">
            {(d._meta.elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Gist — one-line takeaway */}
      {d.gist_zh && (
        <div className="rounded-md bg-indigo-50/60 px-2.5 py-1.5 text-sm text-indigo-900 ring-1 ring-inset ring-indigo-100">
          <span className="text-[10px] font-medium text-indigo-500 uppercase tracking-wider mr-1.5">
            一句話
          </span>
          {d.gist_zh}
        </div>
      )}

      {/* 斷句視圖 · 長難句拆解 — THE hero section. Renders the full sentence as
          an indented, color-coded parse tree so the reader can see at a glance
          which chunk is the backbone and which is a modifier. */}
      {d.segments && d.segments.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>斷句視圖 · 長難句拆解</span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-400 normal-case tracking-normal">
              （縮排 = 修飾層級；顏色 = 結構類型）
            </span>
          </div>
          <div className="rounded-md bg-slate-50 dark:bg-slate-900/60 ring-1 ring-inset ring-slate-200 py-1.5 pr-2">
            <ol className="space-y-0.5">
              {d.segments.map((s, i) => {
                const depth = Math.max(0, Math.min(3, s.depth | 0));
                const rail = SEGMENT_RAIL[s.type] ?? SEGMENT_RAIL.other;
                const labelColor = CLAUSE_TYPE_COLOR[s.type] ?? CLAUSE_TYPE_COLOR.other;
                return (
                  <li
                    key={i}
                    className={`flex gap-1.5 pl-1.5 border-l-[3px] ${rail}`}
                    style={{ marginLeft: 8 + depth * 18 }}
                  >
                    <span
                      className={`shrink-0 self-start mt-0.5 inline-block rounded px-1 py-0 text-[9px] font-mono font-semibold ring-1 ring-inset ${labelColor}`}
                      title={CLAUSE_TYPE_LABEL[s.type] ?? s.type}
                    >
                      {s.label ?? (CLAUSE_TYPE_LABEL[s.type] ?? s.type).slice(0, 3)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-reader text-sm text-slate-800 dark:text-slate-100 leading-snug break-words">
                        {s.text}
                      </div>
                      {s.role_zh && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                          {s.role_zh}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}

      {/* Main clause skeleton */}
      {(d.main_clause.simplified || d.main_clause.zh) && (
        <div>
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            骨幹 · 去掉修飾
          </div>
          {d.main_clause.simplified && (
            <div className="mt-0.5 text-sm text-slate-800 dark:text-slate-100 font-reader leading-snug">
              {d.main_clause.simplified}
            </div>
          )}
          {d.main_clause.zh && (
            <div className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
              {d.main_clause.zh}
            </div>
          )}
        </div>
      )}

      {/* Clause tree — shown only if segments view is missing, since segments
          already covers the same ground with richer depth info. */}
      {(!d.segments || d.segments.length === 0) && d.clauses && d.clauses.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            子句拆解
          </div>
          <ul className="mt-1 space-y-1.5">
            {d.clauses.map((c, i) => (
              <li key={i} className="text-xs">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset mr-1.5 ${
                    CLAUSE_TYPE_COLOR[c.type] ?? CLAUSE_TYPE_COLOR.other
                  }`}
                >
                  {CLAUSE_TYPE_LABEL[c.type] ?? c.type}
                </span>
                <span className="font-reader text-slate-800 dark:text-slate-100 leading-snug">{c.text}</span>
                {c.role_zh && (
                  <div className="mt-0.5 ml-2 text-slate-500 dark:text-slate-400 leading-snug">
                    {"↳"} {c.role_zh}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reading notes — the "治眼" section */}
      {d.reading_notes && d.reading_notes.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            讀時注意 · 避免誤解
          </div>
          <ul className="mt-0.5 space-y-1 text-xs text-slate-700 dark:text-slate-200 leading-snug">
            {d.reading_notes.map((n, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-amber-500 mt-0.5">{"⚠"}</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Patterns — the "餵筆" section, starred */}
      {d.patterns && d.patterns.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <span>{"★"}</span>
            <span>可盜用句式 · 寫作積累</span>
          </div>
          <div className="mt-1 space-y-2">
            {d.patterns.map((p, i) => (
              <div
                key={i}
                className="rounded-md bg-amber-50/50 px-2.5 py-1.5 ring-1 ring-inset ring-amber-100"
              >
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <code className="text-xs text-amber-900 font-semibold font-reader leading-snug">
                    {p.template}
                  </code>
                  <span className="text-[9px] text-amber-700 bg-amber-100 rounded px-1 py-0 ring-1 ring-inset ring-amber-200">
                    {REGISTER_LABEL[p.register] ?? p.register}
                  </span>
                </div>
                {p.abstract_zh && (
                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-snug">
                    {p.abstract_zh}
                  </div>
                )}
                {p.your_example && (
                  <div className="mt-1 text-xs italic text-slate-500 dark:text-slate-400 leading-snug">
                    <span className="not-italic text-[10px] text-slate-400 dark:text-slate-500 dark:text-slate-400 mr-1">例：</span>
                    {p.your_example}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collocations */}
      {d.collocations && d.collocations.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            搭配短語
          </div>
          <ul className="mt-0.5 space-y-0.5 text-xs">
            {d.collocations.map((c, i) => (
              <li key={i} className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-reader text-slate-800 dark:text-slate-100">{c.phrase}</span>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1 py-0">
                  {REGISTER_LABEL[c.register] ?? c.register}
                </span>
                {c.zh && <span className="text-slate-500 dark:text-slate-400">— {c.zh}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stance / hedging */}
      {d.stance_hedging && (
        <div>
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            立場與語氣
          </div>
          <div className="mt-0.5 text-xs text-slate-700 dark:text-slate-200 leading-snug">
            {d.stance_hedging}
          </div>
        </div>
      )}

      {/* Style note */}
      {d.style_note && (
        <div>
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            修辭手法 · 可模仿
          </div>
          <div className="mt-0.5 text-xs italic text-slate-700 dark:text-slate-200 leading-snug">
            {d.style_note}
          </div>
        </div>
      )}
    </div>
  );
}
