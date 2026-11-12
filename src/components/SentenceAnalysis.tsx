/**
 * Shared component for rendering the heuristic syntactic analysis of a sentence,
 * used by both WordPopup and InspectorPanel.
 *
 * Two views stacked:
 *   1. 「所在句子」 — sentence with the target word bolded and main chunks
 *      lightly color-coded (subject=sky, verb=emerald, object=amber).
 *   2. 「句法分析」 — the target word's POS + role + a list of each chunk
 *      with its label.
 */
import { useMemo } from "react";
import { analyzeSentence, posLabel } from "../lib/nlp/analyze";

interface Props {
  sentence: string;
  /** Original-case target word (as clicked in the reader). */
  target: string;
  /** Compact variant for the popup (smaller text, tighter spacing). */
  compact?: boolean;
}

export function SentenceAnalysis({ sentence, target, compact = false }: Props) {
  const analysis = useMemo(
    () => analyzeSentence(sentence, target),
    [sentence, target],
  );

  const text = compact ? "text-xs" : "text-sm";
  const padding = compact ? "px-0.5" : "px-0.5 py-0.5";

  // Render sentence with per-token coloring
  const body: React.ReactNode[] = [];
  let prevEnd = 0;
  analysis.tokens.forEach((t, i) => {
    if (t.charStart > prevEnd) {
      body.push(sentence.slice(prevEnd, t.charStart));
    }
    const cls = [
      padding,
      "rounded-sm",
      t.isTarget
        ? "font-bold underline decoration-2 decoration-amber-500 underline-offset-2"
        : "",
    ].filter(Boolean).join(" ");
    body.push(
      <span key={i} className={cls} title={posLabel(t.pos)}>
        {t.text}
      </span>,
    );
    prevEnd = t.charEnd;
  });
  if (prevEnd < sentence.length) {
    body.push(sentence.slice(prevEnd));
  }

  const targetTok = analysis.targetIndex >= 0
    ? analysis.tokens[analysis.targetIndex]
    : undefined;

  return (
    <div className="space-y-2">
      <div className={`${compact ? "text-[10px]" : "text-xs"} text-amber-700 dark:text-amber-300`}>
        離線粗略推測，主語和賓語常常不准。要看可靠的句法，請在設定裡加上 AI key。
      </div>
      <div className={`${text} leading-relaxed text-slate-800 dark:text-slate-100`}>{body}</div>

      {targetTok && (
        <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-600 dark:text-slate-300`}>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {targetTok.text}
          </span>
          <span className="mx-1 text-slate-400">·</span>
          <span>{posLabel(targetTok.pos)}</span>
          <span className="ml-1 text-slate-400">（詞性是規則推測）</span>
        </div>
      )}
    </div>
  );
}

