import { useEffect, useState, type ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useEcdictStatus } from "../data/useRepo";

interface AppShellProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  stats?: { known: number; unknown: number; ignored: number; total: number };
  llmStatus?: string;
  onOpenSettings?: () => void;
  onOpenPrivacy?: () => void;
}

export function AppShell({
  left, center, right,
  stats = { known: 0, unknown: 0, ignored: 0, total: 0 },
  llmStatus, onOpenSettings, onOpenPrivacy,
}: AppShellProps) {
  const progress = stats.total > 0 ? stats.known / stats.total : 0;
  const pct = Math.round(progress * 100);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const closeDrawers = () => { setLeftOpen(false); setRightOpen(false); };
  const dictionary = useEcdictStatus();
  useEffect(() => {
    const onClose = () => closeDrawers();
    window.addEventListener("lexigraph-close-drawers", onClose);
    return () => window.removeEventListener("lexigraph-close-drawers", onClose);
  }, []);
  return (
    <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="h-11 flex items-center justify-between gap-2 px-2 sm:px-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="lg:hidden rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs"
            onClick={() => { setRightOpen(false); setLeftOpen(true); }}
            aria-label="Open library"
          >
            書庫
          </button>
          <span className="text-lg">{"\u{1F4D6}"}</span>
          <h1 className="text-sm font-semibold tracking-tight truncate">Lexigraph</h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 text-xs shrink-0">
          <span
            className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-800"
            title="標記為「認識」的詞總數"
          >
            <span className="font-semibold tabular-nums">{stats.known}</span>
            <span className="text-[10px] opacity-70">{"認識"}</span>
          </span>
          <span
            className="hidden sm:inline-flex items-center gap-1 rounded-full bg-pink-50 dark:bg-pink-900/30 px-2 py-0.5 text-pink-800 dark:text-pink-300 ring-1 ring-inset ring-pink-200 dark:ring-pink-800"
            title="標記為學習中的詞總數"
          >
            <span className="font-semibold tabular-nums">{stats.unknown}</span>
            <span className="text-[10px] opacity-70">{"學習中"}</span>
          </span>
          {stats.total > 0 && (
            <span
              className="hidden md:inline-flex items-center gap-1 text-slate-500 dark:text-slate-400"
              title={`已掃握 ${stats.known} / ${stats.total} · ${pct}%`}
            >
              <span className="tabular-nums text-[11px]">{pct}%</span>
              <span className="relative block h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <span
                  className="absolute inset-y-0 left-0 bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </span>
          )}
          {llmStatus && (
            <button
              type="button"
              title={llmStatus === "離線" ? "尚未設定 AI key" : "目前 LLM 設定"}
              onClick={onOpenSettings}
              className="hidden sm:inline text-slate-400 dark:text-slate-500 hover:text-sky-700"
            >
              {llmStatus === "離線" ? "AI · 未設定 key" : `LLM · ${llmStatus}`}
            </button>
          )}
          <button
            type="button"
            className="lg:hidden rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs"
            onClick={() => { setLeftOpen(false); setRightOpen(true); }}
            aria-label="Open word card"
          >
            詞卡
          </button>
          <ThemeToggle />
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
            title="設定（API key / 模型）"
            aria-label="settings"
          >
            <span aria-hidden>{"⚙"}</span>
            <span className="hidden sm:inline">{"設定"}</span>
          </button>
        </div>
      </header>
      {dictionary.status === "loading" && (
        <div className="text-[11px] text-center bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100 py-1">
          詞典載入中（約 13 MB，在背景處理）。頁面可以先讀。
        </div>
      )}

      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[240px_1fr_320px]">
        {(leftOpen || rightOpen) && (
          <button
            type="button"
            className="lg:hidden fixed inset-0 z-30 bg-slate-900/40"
            aria-label="Close panels"
            onClick={closeDrawers}
          />
        )}
        <aside
          className={`border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-y-auto min-h-0
            fixed inset-y-0 left-0 z-40 w-[min(88vw,300px)] shadow-xl transition-transform
            lg:static lg:z-auto lg:w-auto lg:shadow-none lg:translate-x-0
            ${leftOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="lg:hidden sticky top-0 z-10 flex justify-end border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1">
            <button type="button" className="text-xs px-2 py-1" onClick={() => setLeftOpen(false)}>關閉</button>
          </div>
          {left}
        </aside>
        <main className="h-full min-h-0 overflow-hidden bg-white dark:bg-slate-900">
          {center}
        </main>
        <aside
          className={`border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-y-auto min-h-0
            fixed inset-y-0 right-0 z-40 w-[min(92vw,380px)] shadow-xl transition-transform
            lg:static lg:z-auto lg:w-auto lg:shadow-none lg:translate-x-0
            ${rightOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="lg:hidden sticky top-0 z-10 flex justify-end border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1">
            <button type="button" className="text-xs px-2 py-1" onClick={() => setRightOpen(false)}>關閉</button>
          </div>
          {right}
        </aside>
      </div>

      <footer className="h-6 flex items-center justify-between px-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950">
        <span className="flex items-center gap-3">
          <span>Ready</span>
          {onOpenPrivacy && (
            <button type="button" onClick={onOpenPrivacy} className="underline hover:text-slate-700 dark:hover:text-slate-200">
              隱私
            </button>
          )}
        </span>
        <span className="tabular-nums">
          {stats.total > 0
            ? `已標 ${stats.total} 詞 · 認識 ${stats.known} · 學習中 ${stats.unknown} · 忽略 ${stats.ignored}`
            : "尚未標記任何詞"}
        </span>
      </footer>
    </div>
  );
}
