/**
 * LevelBadge — a small colored pill showing CEFR level (A1..C2).
 * Colors grade from calm green (easy) → warm red (hard).
 */
import type { CEFR } from "../data/types";

const LEVEL_STYLES: Record<CEFR, string> = {
  A1: "bg-green-100 text-green-800 ring-green-300",
  A2: "bg-lime-100 text-lime-800 ring-lime-300",
  B1: "bg-sky-100 text-sky-800 ring-sky-300",
  B2: "bg-indigo-100 text-indigo-800 ring-indigo-300",
  C1: "bg-amber-100 text-amber-800 ring-amber-300",
  C2: "bg-rose-100 text-rose-800 ring-rose-300",
  unknown: "bg-gray-100 text-gray-600 ring-gray-300",
};

const LEVEL_TITLE: Record<CEFR, string> = {
  A1: "A1 · 入門",
  A2: "A2 · 基礎",
  B1: "B1 · 進階",
  B2: "B2 · 中高級",
  C1: "C1 · 高級",
  C2: "C2 · 精通",
  unknown: "等級未定",
};

export function LevelBadge({ level, small = false }: { level: CEFR | undefined; small?: boolean }) {
  const lvl: CEFR = level ?? "unknown";
  const cls = LEVEL_STYLES[lvl];
  const sizeCls = small ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return (
    <span
      title={LEVEL_TITLE[lvl]}
      className={`inline-flex items-center rounded-full font-semibold ring-1 ring-inset ${sizeCls} ${cls}`}
    >
      {lvl === "unknown" ? "?" : lvl}
    </span>
  );
}
