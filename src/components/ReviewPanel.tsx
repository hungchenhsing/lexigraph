/**
 * 複習面板 — Round 15 P0。
 *
 * 顯示目前 due 的 WordState 清單，使用者可按順序一個一個評分。
 * 評分後 repo.scheduleReview 更新 stability/difficulty/dueAt，
 * 自動進入下一張卡。
 *
 * UI 簡化：一次只看當前卡，顯示 word + dict。四個按鈕 Again/Hard/Good/Easy。
 * 佇列空時顯示「🎉 今日無複習」。
 */
import { useEffect, useMemo, useState } from "react";
import type { DictEntry, WordState } from "../data/types";
import { getRepo } from "../data/repo";
import { useRepoVersion } from "../data/useRepo";
import { selectDue } from "../lib/srs/fsrs";
import type { Rating } from "../lib/srs/fsrs";
import { speak } from "../lib/tts";
import { StatsBar } from "./StatsBar";
import { MultilineText } from "./MultilineText";
import { presentGloss, useGlossScript } from "../lib/dict/gloss";

interface Props {
  onSelectWord?: ((normalized: string) => void) | undefined;
}

export function ReviewPanel({ onSelectWord }: Props) {
  const [queue, setQueue] = useState<WordState[]>([]);
  const [idx, setIdx] = useState(0);
  const [dict, setDict] = useState<DictEntry | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [rated, setRated] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const glossScript = useGlossScript();
  const repoVersion = useRepoVersion();

  // Refresh queue whenever repo changes (e.g. after rating, or new word marked unknown).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await getRepo().listAllWordStates();
      if (cancelled) return;
      const due = selectDue(all);
      setQueue(due);
      // If current idx overshoots (we just graduated a word), clamp.
      setIdx((i) => (i >= due.length ? 0 : i));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [repoVersion]);

  const current = queue[idx];

  useEffect(() => { setRevealed(false); }, [current?.normalized, idx]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setRevealed(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!current) { setDict(undefined); return; }
    let cancelled = false;
    getRepo().lookupDict(current.normalized).then((d) => {
      if (!cancelled) setDict(d);
    });
    return () => { cancelled = true; };
  }, [current]);

  const total = queue.length;
  const progress = total > 0 ? Math.min(idx, total) / total : 0;

  const rate = async (rating: Rating) => {
    if (!current) return;
    await getRepo().scheduleReview(current.normalized, rating);
    setRated((r) => r + 1);
    // Move to next card in current queue snapshot.
    setIdx((i) => i + 1);
  };

  if (loading) {
    return (
      <div className="p-3">
        <StatsBar />
        <div className="p-4 text-xs text-slate-400 dark:text-slate-500 italic">
          載入複習佇列…
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="p-3">
        <StatsBar />
        <div className="p-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          <div className="text-2xl mb-2">🎉</div>
          今日無到期複習。
          <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            標成「不認識」的詞會放進學習中，並立刻出現在這裡。第一次評分之後，間隔才會變成 6 小時、1 天、3 天。
          </div>
        </div>
      </div>
    );
  }

  if (idx >= total) {
    return (
      <div className="p-3">
        <StatsBar />
        <div className="p-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          <div className="text-2xl mb-2">✅</div>
          本輪複習完成（{rated} 張）。
          <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            可以繼續讀書，下次到期會再出現。
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const stabilityDays = current.fsrsStability ?? 0.25;
  const nextAgainLabel = formatInterval(0.02);   // 30 min
  const nextHardLabel  = formatInterval(stabilityDays * 1.2);
  const nextGoodLabel  = formatInterval(stabilityDays * 2.5);
  const nextEasyLabel  = formatInterval(stabilityDays * 3.5);

  return (
    <div className="p-3 flex flex-col h-full">
      <StatsBar />
      {/* Progress */}
      <div className="flex items-center gap-2 mb-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>{idx + 1} / {total}</span>
        <span className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <span
            className="block h-full bg-sky-500 transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </span>
        <span>{rated} 已評</span>
      </div>

      {/* Card */}
      <div className="panel mb-3">
        <div className="p-4 space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <button
              onClick={() => onSelectWord?.(current.normalized)}
              className="text-2xl font-reader text-slate-900 dark:text-slate-50 hover:underline"
              title="在右側面板開啟詳細"
            >
              {current.normalized}
            </button>
            <button
              onClick={() => speak(current.normalized)}
              className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
              title="發音"
              aria-label="speak"
            >
              {"\u{1F50A}"}
            </button>
          </div>
          {revealed && dict?.phonetic && (
            <div className="text-sm text-slate-500 dark:text-slate-400">/{dict.phonetic}/</div>
          )}
          {!revealed && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="w-full rounded border border-dashed border-slate-300 dark:border-slate-600 py-6 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              顯示答案（空白鍵）
            </button>
          )}
          {revealed && dict?.translation && (
            <MultilineText text={presentGloss(dict.translation, glossScript) ?? ""} className="text-sm text-slate-800 dark:text-slate-100" />
          )}
          {revealed && dict?.definition && dict.definition !== dict.translation && (
            <MultilineText text={presentGloss(dict.definition, glossScript) ?? ""} className="text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed" />
          )}
          {revealed && current.note && (
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
              📝 {current.note}
            </div>
          )}
          <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
            seen {current.reviewCount}× · stability {stabilityDays.toFixed(2)}d · difficulty {(current.fsrsDifficulty ?? 0).toFixed(1)}
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        <RateBtn label="Again"  hint={nextAgainLabel} color="rose"    onClick={() => void rate("again")} />
        <RateBtn label="Hard"   hint={nextHardLabel}  color="amber"   onClick={() => void rate("hard")}  />
        <RateBtn label="Good"   hint={nextGoodLabel}  color="emerald" onClick={() => void rate("good")}  />
        <RateBtn label="Easy"   hint={nextEasyLabel}  color="sky"     onClick={() => void rate("easy")}  />
      </div>
      <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 text-center">
        評分後自動跳下一張
      </div>
    </div>
  );
}

function RateBtn({
  label, hint, color, onClick,
}: {
  label: string;
  hint: string;
  color: "rose" | "amber" | "emerald" | "sky";
  onClick: () => void;
}) {
  const cls = useMemo(() => {
    switch (color) {
      case "rose":    return "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50";
      case "amber":   return "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50";
      case "emerald": return "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50";
      case "sky":     return "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50";
    }
  }, [color]);
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center py-2 rounded border text-xs font-semibold transition-colors ${cls}`}
    >
      <span>{label}</span>
      <span className="text-[9px] opacity-70 font-normal mt-0.5">{hint}</span>
    </button>
  );
}

function formatInterval(days: number): string {
  if (days < 1 / 24) return `${Math.round(days * 24 * 60)}m`;
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
