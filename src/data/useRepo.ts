/**
 * Tiny React glue around Repo.subscribe().
 */
import { useEffect, useState } from "react";
import { getRepo } from "./repo";
import { onEcdictStatus, getEcdictSize } from "../lib/dict/ecdict";
import { selectDue } from "../lib/srs/fsrs";

type EcdictStatus = "idle" | "loading" | "ready" | "error";

export function useRepoVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const repo = getRepo();
    const unsub = repo.subscribe(() => setV((n) => n + 1));
    return unsub;
  }, []);
  return v;
}

export function useEcdictStatus(): { status: EcdictStatus; size: number } {
  const [status, setStatus] = useState<EcdictStatus>("idle");
  const [size, setSize] = useState<number>(0);
  useEffect(() => {
    return onEcdictStatus((s) => {
      setStatus(s);
      setSize(getEcdictSize());
    });
  }, []);
  return { status, size };
}

export function useReadingStats(): { known: number; unknown: number; ignored: number; total: number } {
  const v = useRepoVersion();
  const [stats, setStats] = useState({ known: 0, unknown: 0, ignored: 0, total: 0 });
  useEffect(() => {
    let cancelled = false;
    void getRepo().getStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => { cancelled = true; };
  }, [v]);
  return stats;
}

/**
 * Round 15: count of words currently due for SRS review.
 * Polls on repo mutation + every 60s (to catch time-based due transitions).
 */
export function useDueCount(): number {
  const v = useRepoVersion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const all = await getRepo().listAllWordStates();
      if (!cancelled) setCount(selectDue(all).length);
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [v]);
  return count;
}
