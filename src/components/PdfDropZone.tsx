import { useCallback, useRef, useState } from "react";
import { addBookFromFile } from "../lib/addBookFromFile";
import { useUiLang } from "../lib/readerSettings";
import type { Book } from "../data/types";

interface Props {
  onBookAdded: (book: Book) => void;
  /** Render variant: full-surface dropzone (when no book open) vs. inline chip. */
  variant?: "full" | "compact";
}

export function PdfDropZone({ onBookAdded, variant = "full" }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uiLang = useUiLang();
  const addLabel = uiLang === "en" ? "+ Add PDF" : "＋ 加入 PDF";

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(undefined);
      setBusy(true);
      try {
        const pdfs = Array.from(files).filter(
          (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
        );
        if (pdfs.length === 0) {
          throw new Error("No PDF files in selection.");
        }
        const first = pdfs[0]!;
        const book = await addBookFromFile(first);
        onBookAdded(book);
        // (Additional PDFs dropped in same action could be added silently — skip for now.)
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [onBookAdded],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files?.length) void handleFiles(files);
    },
    [handleFiles],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  if (variant === "compact") {
    return (
      <div className="px-3 py-2">
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full text-xs px-2 py-1.5 rounded border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-200 hover:bg-white dark:bg-slate-800 transition-colors"
        >
          {addLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {error && (
          <div className="mt-2 text-xs text-red-600">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center h-full p-8 m-6 rounded-xl border-2 border-dashed transition-colors ${
        isDragging
          ? "border-amber-400 bg-amber-50"
          : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="text-5xl mb-3">📄</div>
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 text-center">Lexigraph</h2>
      <p className="mt-2 max-w-md text-center text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        給讀英文論文的人。保留 PDF 原版面，點單字看釋義、標熟悉度、之後再複習。資料和 API key 只留在這台瀏覽器。
      </p>
      <p className="mt-1 max-w-md text-center text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        An academic PDF reader. Click a word for a gloss, mark how well you know it, and review later. Your files and API keys stay in this browser.
      </p>
      <div className="text-sm text-slate-700 dark:text-slate-200 mt-4 font-medium">把 PDF 拖到這裡</div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        或{" "}
        <button
          onClick={() => inputRef.current?.click()}
          className="underline hover:text-slate-700 dark:hover:text-slate-200"
        >
          選擇檔案
        </button>
      </div>
      <div className="text-xs text-slate-400 mt-6 max-w-sm text-center leading-relaxed">
        適合單欄或雙欄論文。掃描檔（只有圖）需要 OCR，目前不支援。
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {busy && <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">loading…</div>}
      {error && (
        <div className="mt-4 text-xs text-red-600">{error}</div>
      )}
    </div>
  );
}
