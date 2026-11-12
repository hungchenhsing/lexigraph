/**
 * 主題三態切換按鈕（Round 14）。
 *
 * 三態循環：light → dark → auto
 * 顯示對應 emoji + label，按一下切下一態。
 */
import { useEffect, useState } from "react";
import { cycleTheme, getTheme, onThemeChange, type ThemeMode } from "../lib/theme";

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getTheme());

  useEffect(() => onThemeChange(setMode), []);

  const icon = mode === "light" ? "☀" : mode === "dark" ? "☽" : "◑";
  const label = mode === "light" ? "淺" : mode === "dark" ? "深" : "自動";

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
      title={`主題：${label}（點擊切換）`}
      aria-label={`theme ${mode}`}
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
