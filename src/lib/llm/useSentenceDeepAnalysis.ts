/**
 * useSentenceDeepAnalysis — React hook for the LLM-backed sentence deep-dive.
 *
 * Unlike useWordAnalysis, this one is **manual-trigger**: a sentence analysis
 * costs ~2-4x more tokens than a word analysis, so we don't want it firing
 * on every hover / click — only when the user explicitly presses the
 * "深度解析此句" button.
 *
 * The hook keeps the last successful result keyed on the sentence string, so
 * re-rendering the panel with the same sentence shows results immediately
 * without a re-analyze click. Switching sentences resets state to idle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getGateway } from "./gateway";
import type { SentenceAnalysis } from "./types";

export type SentenceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: SentenceAnalysis }
  | { status: "error"; message: string };

export interface UseSentenceDeepAnalysisResult {
  state: SentenceState;
  /** Current sentence this hook is bound to — analyze() uses whatever's latest. */
  analyze: () => void;
  reset: () => void;
}

/**
 * @param sentence  current sentence in context; changing it resets state.
 * @param enabled   whether LLM is configured (key + provider).
 */
export function useSentenceDeepAnalysis(
  sentence: string | null,
  enabled: boolean,
): UseSentenceDeepAnalysisResult {
  const [state, setState] = useState<SentenceState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  // Track the sentence each state was produced for, so stale results don't
  // bleed across selections.
  const resultForRef = useRef<string | null>(null);

  // Reset when sentence changes (but NOT when enabled toggles — user may
  // still want to read a cached result).
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    if (resultForRef.current !== sentence) {
      setState({ status: "idle" });
      resultForRef.current = null;
    }
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [sentence]);

  const analyze = useCallback(() => {
    if (!enabled || !sentence) return;
    const gw = getGateway();
    if (!gw) {
      setState({
        status: "error",
        message: "LLM 未設定。請打開「設定」貼上 API key。",
      });
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: "loading" });

    gw.explainSentence({ sentence }, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        resultForRef.current = sentence;
        setState({ status: "success", data });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, [sentence, enabled]);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    resultForRef.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, analyze, reset };
}
