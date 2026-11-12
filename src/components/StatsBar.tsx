/**
 * 學習統計條（Round 20）— Review tab 頂部常駐。
 *
 * 三塊：
 *   1. Streak（連續天數 + 火焰 emoji）
 *   2. 今日 / 本週 / 本月 / 總計 四個數字
 *   3. 14 天 bar chart（純 CSS）— 粉紅/綠雙條疊：學習中 + 認識
 */
import { useEffect, useMemo, useState } from "react";
import type { WordState } from "../data/types";
import { getRepo } from "../data/repo";
import { useRepoVersion } from "../data/useRepo";
import { computeStats, type DailyStat } from "../lib/srs/stats";

export function StatsBar() {
  const [states, setStates] = useState<WordState[]>([]);
  const repoVersion = useRepoVersion();

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const all = await getRepo().listAllWordStates();
      if (!cancelled) setStates(all);
    }, 100);
    return () => { cancelled = true; clearTimeout(t); };
  }, [repoVersion]);

  const stats = useMemo(() => computeStats(states, 14), [states]);

  if (states.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 italic">
        標過詞後這裡會顯示學習進度。
      </div>
    );
  }

  const maxBar = Math.max(1, ...stats.daily.map((d) => d.newWords));

  return (
    <div className="panel mb-3">
      <div className="p-3 space-y-2">
        {/* Row 1: Streak + 數字 */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1" title={`連續 ${stats.streak} 天有標記活動`}>
            <span className="text-lg" aria-hidden>{stats.streak > 0 ? "🔥" : "💤"}</span>
            <span className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              {stats.streak}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">連續天</span>
          </div>
          <div className="flex-1" />
          <Metric label="今日" value={stats.todayNew} />
          <Metric label="本週" value={stats.weekNew} />
          <Metric label="本月" value={stats.monthNew} />
          <Metric label="總計" value={stats.totalTracked} accent="emerald" />
        </div>

        {/* Row 2: 14 天 bar chart */}
        <div>
          <div className="flex items-end gap-[2px] h-14" role="img" aria-label="14 day activity chart">
            {stats.daily.map((d) => (
              <ChartBar key={d.date} day={d} max={maxBar} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">
            <span>{stats.daily[0]?.date.slice(5)}</span>
            <span className="text-slate-500 dark:text-slate-400">過去 14 天</span>
            <span>今日</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-3 pt-1 border-t border-slate-200 dark:border-slate-700">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-pink-300" />
            學習中（每日新標）
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-emerald-500" />
            認識（每日新標）
          </span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: "emerald" | undefined }) {
  const cls = accent === "emerald"
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-slate-800 dark:text-slate-100";
  return (
    <div className="flex flex-col items-center min-w-[2.5rem]">
      <span className={`text-sm font-semibold tabular-nums ${cls}`}>{value}</span>
      <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">{label}</span>
    </div>
  );
}

function ChartBar({ day, max }: { day: DailyStat; max: number }) {
  const unknownPct = (day.newUnknown / max) * 100;
  const knownPct = (day.newKnown / max) * 100;
  const isToday = day.dayOffset === 0;
  const hasData = day.newWords > 0;
  const title = `${day.date}\n新增 ${day.newWords} 詞 (學習中 ${day.newUnknown} / 認識 ${day.newKnown})${day.reviews ? `\n複習 ${day.reviews} 次` : ""}`;
  return (
    <div
      className={`flex-1 flex flex-col justify-end min-w-[4px] relative ${isToday ? "ring-1 ring-sky-400 dark:ring-sky-500 rounded-t" : ""}`}
      title={title}
    >
      {hasData ? (
        <>
          <div
            className="bg-emerald-500 dark:bg-emerald-600 rounded-t-sm"
            style={{ height: `${knownPct}%`, minHeight: day.newKnown > 0 ? "2px" : "0" }}
          />
          <div
            className="bg-pink-300 dark:bg-pink-400"
            style={{ height: `${unknownPct}%`, minHeight: day.newUnknown > 0 ? "2px" : "0" }}
          />
        </>
      ) : (
        <div className="h-[2px] bg-slate-200 dark:bg-slate-700 rounded-full self-stretch" />
      )}
    </div>
  );
}
