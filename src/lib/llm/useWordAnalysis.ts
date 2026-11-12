/**
 * useWordAnalysis — React hook that fires an LLM analysis for
 * (word, sentence) and exposes { data, loading, error }.
 *
 * Auto-triggers whenever word / sentence changes AND llm is enabled.
 * Cancels in-flight requests on unmount or prop change.
 */
import { useEffect, useState, useRef } from "react";
import { getGateway } from "./gateway";
import type { WordAnalysis } from "./types";

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: WordAnalysis }
  | { status: "error"; message: string };

export function useWordAnalysis(
  word: string | null,
  sentence: string | null,
  enabled: boolean,
): AnalysisState {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel previous
    if (abortRef.current) abortRef.current.abort();
    if (!enabled || !word || !sentence) {
      setState({ status: "idle" });
      return;
    }
    const gw = getGateway();
    if (!gw) {
      setState({ status: "idle" });
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: "loading" });

    gw.explain({ word, sentence }, ctrl.signal)
      .then(data => {
        if (ctrl.signal.aborted) return;
        setState({ status: "success", data });
      })
      .catch(err => {
        if (ctrl.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      ctrl.abort();
    };
  }, [word, sentence, enabled]);

  return state;
}
