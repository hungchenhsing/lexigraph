/**
 * Export / import the whole local database.
 * Merge is the default. Replace stores a safety copy first and requires
 * the user to type REPLACE, so an import cannot wipe data silently.
 */
import { useEffect, useState } from "react";
import { getRepo } from "../data/repo";
import { loadConfig, saveConfig } from "../lib/llm/config";
import { buildGateway, clearGatewayCache } from "../lib/llm/gateway";
import type { LLMConfig } from "../lib/llm/types";
import { getTheme, setTheme, type ThemeMode } from "../lib/theme";
import { loadReaderSettings, saveReaderSettings, useUiLang, type ReaderSettings } from "../lib/readerSettings";
import { formatBytes, readStorageStatus, requestPersistentStorage, type StorageStatus } from "../lib/storagePersist";
import { downloadText, todayStamp } from "../lib/export/csv";
import {
  buildBackup,
  mergeSettings,
  parseBackup,
  summarizeBackup,
  REPLACE_CONFIRMATION,
  type LexigraphBackup,
} from "../lib/backup/backup";

const LAST_BACKUP_KEY = "lexigraph.lastBackupAt";
const SCALE_KEY = "lexigraph.pdf.scale";

interface Props {
  onImported?: (() => void) | undefined;
}

export function BackupSection({ onImported }: Props) {
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [persistMsg, setPersistMsg] = useState<string | null>(null);
  const [includeApiKeys, setIncludeApiKeys] = useState(false);
  const [includePdfs, setIncludePdfs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<LexigraphBackup | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmText, setConfirmText] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(() => readLastBackup());
  const uiLang = useUiLang();
  const en = uiLang === "en";

  useEffect(() => {
    let cancelled = false;
    void readStorageStatus().then((status) => { if (!cancelled) setStorage(status); });
    return () => { cancelled = true; };
  }, []);

  const refreshStorage = async () => setStorage(await readStorageStatus());

  const askPersist = async () => {
    setPersistMsg(null);
    const granted = await requestPersistentStorage();
    await refreshStorage();
    setPersistMsg(granted
      ? "Persistent storage granted. The browser should keep this library."
      : "The browser did not grant persistent storage. Export a backup so a cleanup cannot wipe the library.");
  };

  const onExport = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const dump = await getRepo().dumpUserData();
      const file = buildBackup({
        ...dump,
        settings: collectSettings(),
      }, { includeApiKeys, includePdfs });
      downloadText(
        `lexigraph-backup-${todayStamp()}.json`,
        JSON.stringify(file),
        "application/json",
      );
      const at = Date.now();
      try { localStorage.setItem(LAST_BACKUP_KEY, String(at)); } catch { /* ignore */ }
      setLastBackupAt(at);
      const summary = summarizeBackup(file);
      setInfo(`Exported ${summary.words} words, ${summary.books} books, ${summary.notes} notes${file.includesPdfs ? `, ${summary.pdfs} PDFs` : ""}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    setInfo(null);
    setPending(null);
    setMode("merge");
    setConfirmText("");
    if (!file) return;
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      setPending(parsed);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onApply = async () => {
    if (!pending) return;
    if (mode === "replace" && confirmText !== REPLACE_CONFIRMATION) {
      setError(en
        ? `Type ${REPLACE_CONFIRMATION} to confirm replacing the current library.`
        : `輸入 ${REPLACE_CONFIRMATION} 才會取代目前的書庫。`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getRepo().applyUserData(pending, mode, confirmText);
      applySettings(pending);
      setInfo(mode === "merge"
        ? "Merged into the current library. Existing records were kept."
        : "Replaced the library. A safety copy of the previous data is stored in this browser.");
      setPending(null);
      setConfirmText("");
      onImported?.();
      await refreshStorage();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const summary = pending ? summarizeBackup(pending) : null;

  return (
    <section className="space-y-3 rounded-md border border-slate-200 dark:border-slate-600 p-3">
      <div>
        <div className="font-medium text-slate-800 dark:text-slate-100">Backup & storage</div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Word states, notes, review schedule, library metadata, phrases, and settings
          live only in this browser. Export a file before clearing site data.
          API keys are left out unless you opt in.
        </p>
      </div>

      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
        <div>
          Storage: {storage ? `${formatBytes(storage.usage)} used` : "checking…"}
          {storage?.quota ? ` of ${formatBytes(storage.quota)}` : ""}
          {" · "}
          {storage?.persisted ? "persistent" : "not persistent"}
        </div>
        <div>
          Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "never"}
        </div>
        {persistMsg && <div className="text-slate-500 dark:text-slate-400">{persistMsg}</div>}
        <button
          type="button"
          onClick={() => { void askPersist(); }}
          className="rounded border border-slate-300 dark:border-slate-600 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          Request persistent storage
        </button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={includePdfs} onChange={(e) => setIncludePdfs(e.target.checked)} />
          Include PDF files
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={includeApiKeys} onChange={(e) => setIncludeApiKeys(e.target.checked)} />
          Include API keys
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => { void onExport(); }}
          className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          Export backup
        </button>
        <label className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
          Choose backup file
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
          />
        </label>
      </div>

      {summary && pending && (
        <div className="rounded-md bg-slate-50 dark:bg-slate-900/50 p-3 text-xs space-y-2">
          <div className="font-medium text-slate-700 dark:text-slate-200">
            File contains {summary.words} words ({summary.notes} notes), {summary.books} books, {summary.phrases} phrases, {summary.pdfs} PDFs.
          </div>
          <label className="flex items-center gap-2">
            <input type="radio" name="import-mode" checked={mode === "merge"} onChange={() => setMode("merge")} />
            Merge — add what is missing, keep everything already here
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
            Replace — remove current library and word data, then load this file
          </label>
          {mode === "replace" && (
            <div className="space-y-1">
              <p className="text-rose-700 dark:text-rose-300">
                {en
                  ? `A safety copy is saved in this browser before anything is deleted. Type ${REPLACE_CONFIRMATION} to continue.`
                  : `刪除前會先在這個瀏覽器留一份安全備份。輸入 ${REPLACE_CONFIRMATION} 才會繼續。`}
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={REPLACE_CONFIRMATION}
                className="w-full rounded border border-rose-300 px-2 py-1 font-mono dark:bg-slate-800"
                aria-label={en ? "Type REPLACE to confirm" : "輸入 REPLACE 以確認取代"}
              />
            </div>
          )}
          <button
            type="button"
            disabled={busy || (mode === "replace" && confirmText !== REPLACE_CONFIRMATION)}
            onClick={() => { void onApply(); }}
            className={`rounded px-3 py-1.5 font-medium text-white disabled:opacity-50 ${
              mode === "replace" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {mode === "merge" ? (en ? "Merge backup" : "合併匯入") : (en ? "Replace with backup" : "取代書庫")}
          </button>
        </div>
      )}

      {error && <div className="text-xs text-rose-700 dark:text-rose-300">{error}</div>}
      {info && <div className="text-xs text-emerald-700 dark:text-emerald-300">{info}</div>}
    </section>
  );
}

function readLastBackup(): number | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function collectSettings() {
  let pdfScale: string | undefined;
  try { pdfScale = localStorage.getItem(SCALE_KEY) ?? undefined; } catch { /* ignore */ }
  return {
    llm: loadConfig(),
    theme: getTheme(),
    pdfScale,
    reader: loadReaderSettings(),
  };
}

function applySettings(backup: LexigraphBackup) {
  const merged = mergeSettings(collectSettings(), backup.settings, backup.includesApiKeys);
  if (merged.llm && typeof merged.llm === "object" && "mode" in (merged.llm as object)) {
    const cfg = merged.llm as LLMConfig;
    saveConfig(cfg);
    clearGatewayCache();
    buildGateway(cfg);
  }
  if (merged.theme === "light" || merged.theme === "dark" || merged.theme === "auto") {
    setTheme(merged.theme as ThemeMode);
  }
  if (merged.pdfScale) {
    try { localStorage.setItem(SCALE_KEY, merged.pdfScale); } catch { /* ignore */ }
  }
  if (merged.reader) saveReaderSettings(merged.reader as ReaderSettings);
}
