/**
 * 學習統計（Round 20）。
 *
 * 全部純函數，從 WordState[] 計算：
 *   - 每日分 bucket：新標的詞 + 複習次數
 *   - Streak：連續活動天數（lastSeenAt 落在當天）
 *   - 7/30 日摘要
 *
 * 不另存資料，每次從 repo.listAllWordStates() 重算。500-2000 詞記憶體遍歷
 * 幾 ms 等級，React useMemo 一次就好。
 */
import type { WordState } from "../../data/types";
import { familiarityStatus } from "../../data/familiarity";

export interface DailyStat {
  date: string;          // YYYY-MM-DD
  dayOffset: number;     // 0 = today, -1 = yesterday, ...
  newWords: number;      // firstSeenAt 當天的詞總數
  newKnown: number;      // 當天標為認識 (level 5)。忽略不算。
  newUnknown: number;    // 當天標為學習中 (level 0，含舊的 1–4)
  reviews: number;       // lastSeenAt 當天但 firstSeenAt != 當天（= 回訪）
}

export interface StatsSummary {
  streak: number;                // 連續活動天數（含今天）
  todayNew: number;              // 今日新標的詞
  weekNew: number;               // 過去 7 天（含今天）新標
  monthNew: number;              // 過去 30 天新標
  totalKnown: number;            // 總 known
  totalUnknown: number;          // 總 unknown
  totalTracked: number;          // known + unknown
  daily: DailyStat[];            // 預設 14 天，最舊 → 最新
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DAY_MS = 86_400_000;

/**
 * 計算過去 N 天每天的統計 + streak + 聚合摘要。
 * N 預設 14 天（適合短條狀圖）。
 */
export function computeStats(states: WordState[], days: number = 14, now: number = Date.now()): StatsSummary {
  const todayStart = startOfDay(now);

  // 建 buckets: 最舊 (-days+1) → 最新 (0 = today)
  const daily: DailyStat[] = [];
  const byDate = new Map<string, DailyStat>();
  for (let i = days - 1; i >= 0; i--) {
    const dayTs = todayStart - i * DAY_MS;
    const date = formatDate(dayTs);
    const stat: DailyStat = {
      date,
      dayOffset: -i,
      newWords: 0, newKnown: 0, newUnknown: 0, reviews: 0,
    };
    daily.push(stat);
    byDate.set(date, stat);
  }

  // 活動日集合 — 用於 streak 計算（可能超過 days 範圍）
  const activeDays = new Set<string>();

  let totalKnown = 0;
  let totalUnknown = 0;

  for (const s of states) {
    const status = familiarityStatus(s.level);
    if (status === "known") totalKnown += 1;
    else if (status === "learning") totalUnknown += 1;

    const firstDay = formatDate(startOfDay(s.firstSeenAt));
    const lastDay = formatDate(startOfDay(s.lastSeenAt));

    // Streak 看 lastSeenAt（最近互動）
    activeDays.add(lastDay);

    const firstBucket = byDate.get(firstDay);
    if (firstBucket) {
      firstBucket.newWords += 1;
      if (status === "known") firstBucket.newKnown += 1;
      else if (status === "learning") firstBucket.newUnknown += 1;
    }
    const lastBucket = byDate.get(lastDay);
    if (lastBucket && lastDay !== firstDay) {
      lastBucket.reviews += 1;
    }
  }

  // 聚合摘要
  const today = daily[daily.length - 1]!;
  const week = daily.slice(-7).reduce((a, b) => a + b.newWords, 0);
  const month = states.filter((s) => now - s.firstSeenAt <= 30 * DAY_MS).length;

  // Streak：從今天倒著數，連續有活動的天數
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const day = formatDate(todayStart - i * DAY_MS);
    if (activeDays.has(day)) streak += 1;
    else break;
  }

  return {
    streak,
    todayNew: today.newWords,
    weekNew: week,
    monthNew: month,
    totalKnown,
    totalUnknown,
    totalTracked: totalKnown + totalUnknown,
    daily,
  };
}
