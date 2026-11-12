/**
 * 三態主題管理（Round 14）。
 *
 *   "light"  — 強制淺色
 *   "dark"   — 強制暗色
 *   "auto"   — 跟隨 OS prefers-color-scheme（預設）
 *
 * 儲在 localStorage.lexigraph.theme。呼叫 initTheme() 一次在 App 掛載時，
 * 之後 setTheme() 即時套用。
 *
 * Tailwind 端 darkMode: "class"，靠切換 <html class="dark"> 來觸發 dark: 樣式。
 */

export type ThemeMode = "light" | "dark" | "auto";

const STORAGE_KEY = "lexigraph.theme";

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch { /* storage disabled */ }
  return "auto";
}

function write(mode: ThemeMode) {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
}

function prefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch { return false; }
}

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  const resolvedDark = mode === "dark" || (mode === "auto" && prefersDark());
  root.classList.toggle("dark", resolvedDark);
}

let _mode: ThemeMode = "auto";
let _mqUnsub: (() => void) | null = null;
const _listeners = new Set<(m: ThemeMode) => void>();

/** Called once at App boot. */
export function initTheme() {
  _mode = readStored();
  apply(_mode);

  // React to OS-level change only when in auto mode.
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (_mode === "auto") apply(_mode); };
    mq.addEventListener("change", handler);
    _mqUnsub = () => mq.removeEventListener("change", handler);
  } catch { /* ignore */ }
}

export function getTheme(): ThemeMode { return _mode; }

export function setTheme(mode: ThemeMode) {
  _mode = mode;
  write(mode);
  apply(mode);
  for (const fn of _listeners) {
    try { fn(mode); } catch { /* swallow */ }
  }
}

/** Subscribe to mode changes (for the toggle button to re-render). */
export function onThemeChange(fn: (m: ThemeMode) => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/** Cycle: light → dark → auto → light */
export function cycleTheme() {
  const next: ThemeMode =
    _mode === "light" ? "dark" : _mode === "dark" ? "auto" : "light";
  setTheme(next);
}

export function _dispose() {
  if (_mqUnsub) _mqUnsub();
  _mqUnsub = null;
  _listeners.clear();
}
