import type { Book } from "../data/types";
import { PdfDropZone } from "./PdfDropZone";

interface Props {
  books: Book[];
  onOpenBook: (book: Book) => void;
  onBookAdded: (book: Book) => void;
  activeBookId: string | undefined;
}

export function LibraryPanel({
  books, onOpenBook, onBookAdded, activeBookId,
}: Props) {
  return (
    <div className="py-3 flex flex-col h-full">
      <div className="panel-header !border-0 px-3">書庫</div>

      <div className="flex-1 overflow-y-auto px-3 min-h-0">
        {books.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
            還沒有書。
            <br />
            <span className="text-slate-400 dark:text-slate-500">
              把 PDF 拖進中間，或用下面的按鈕。
            </span>
          </div>
        ) : (
          <ul className="space-y-1 mt-1">
            {books.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => onOpenBook(b)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-slate-200 dark:hover:bg-slate-800 ${
                    activeBookId === b.id ? "bg-slate-200 dark:bg-slate-800 font-medium" : ""
                  }`}
                >
                  <div className="truncate">{b.title}</div>
                  {b.author && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{b.author}</div>
                  )}
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    p.{b.currentPage}
                    {b.pageCount ? ` / ${b.pageCount}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 mt-2">
        <PdfDropZone onBookAdded={onBookAdded} variant="compact" />
      </div>
    </div>
  );
}
