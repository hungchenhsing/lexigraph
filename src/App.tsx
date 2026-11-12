import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/AppShell";
import { LibraryPanel } from "./components/LibraryPanel";
import { VocabularyList } from "./components/VocabularyList";
import { ReviewPanel } from "./components/ReviewPanel";
import { ReaderPanel } from "./components/ReaderPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getRepo } from "./data/repo";
import { useReadingStats, useDueCount } from "./data/useRepo";
import type { Book } from "./data/types";
import { loadConfig, isLLMEnabled } from "./lib/llm/config";
import { buildGateway } from "./lib/llm/gateway";
import type { LLMConfig } from "./lib/llm/types";
const LAST_BOOK_KEY = "lexigraph.lastBookId";

type LeftTab = "library" | "vocabulary" | "review";

export function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | undefined>(undefined);
  const [activeToken, setActiveToken] = useState<string | undefined>(undefined);
  const [activeDisplay, setActiveDisplay] = useState<string | undefined>(undefined);
  const [activeSentence, setActiveSentence] = useState<string | undefined>(undefined);
  const [activePageNo, setActivePageNo] = useState<number | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cfg, setCfg] = useState<LLMConfig>(() => loadConfig());
  const [leftTab, setLeftTab] = useState<LeftTab>("library");
  // Round 18: pendingJump drives PdfViewer to flip to a specific page for source lookup.
  const [pendingJump, setPendingJump] = useState<{ pageNo: number; tick: number } | null>(null);
  const stats = useReadingStats();
  const dueCount = useDueCount();

  useEffect(() => { buildGateway(cfg); }, [cfg]);

  const llmEnabled = useMemo(() => isLLMEnabled(cfg) && cfg.autoTrigger, [cfg]);
  const llmStatus = useMemo(() => {
    if (cfg.mode !== "multi") return "離線";
    const active: string[] = [];
    for (const p of cfg.chainOrder) {
      if (p === "gemini" && cfg.gemini.enabled && cfg.gemini.apiKey.trim()) active.push("Gemini");
      else if (p === "groq" && cfg.groq.enabled && cfg.groq.apiKey.trim()) active.push("Groq");
      else if (p === "ollama" && cfg.ollama.enabled) active.push("Ollama");
    }
    return active.length === 0 ? "離線" : active.join("→");
  }, [cfg]);

  const refreshBooks = useCallback(async () => {
    const list = await getRepo().listBooks();
    setBooks(list);
  }, []);

  useEffect(() => { void refreshBooks(); }, [refreshBooks]);

  useEffect(() => {
    if (activeBook || books.length === 0) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(LAST_BOOK_KEY); } catch { /* ignore */ }
    const found = books.find((b) => b.id === saved);
    if (found) setActiveBook(found);
  }, [books, activeBook]);

  const rememberBook = (b: Book) => {
    setActiveBook(b);
    try { localStorage.setItem(LAST_BOOK_KEY, b.id); } catch { /* ignore */ }
    window.dispatchEvent(new Event("lexigraph-close-drawers"));
  };

  const openPrivacy = () => {
    window.location.href = new URL("privacy/", window.location.href).href;
  };

  const handleBookAdded = useCallback(
    (b: Book) => {
      setBooks((prev) => [b, ...prev.filter((x) => x.id !== b.id)]);
      setActiveBook(b);
      try { localStorage.setItem(LAST_BOOK_KEY, b.id); } catch { /* ignore */ }
      window.dispatchEvent(new Event("lexigraph-close-drawers"));
      setActiveToken(undefined);
      setActiveDisplay(undefined);
      setActiveSentence(undefined);
    },
    [],
  );

  const selectWordFromList = (normalized: string) => {
    setActiveToken(normalized);
    setActiveDisplay(normalized);
    setActiveSentence(undefined);
  };

  // Round 18: jump-to-source. Looks up lastSource, switches book, flips PDF to page.
  const jumpToSource = useCallback(async (normalized: string) => {
    const state = await getRepo().getWordState(normalized);
    if (!state?.lastSource) return;
    const { bookId, pageNo } = state.lastSource;
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    if (activeBook?.id !== bookId) {
      setActiveBook(book);
    }
    setActiveToken(normalized);
    setActiveDisplay(normalized);
    setActiveSentence(undefined);
    setPendingJump({ pageNo, tick: Date.now() });
    // leave current tab so user can still see vocab list if they want
  }, [books, activeBook]);

  return (
    <>
      <AppShell
        stats={stats}
        llmStatus={llmStatus}
        onOpenSettings={() => setSettingsOpen(true)}
        left={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <TabButton active={leftTab === "library"} onClick={() => setLeftTab("library")} label="書庫" />
              <TabButton active={leftTab === "vocabulary"} onClick={() => setLeftTab("vocabulary")} label="詞彙" badge={stats.total > 0 ? stats.total : undefined} />
              <TabButton active={leftTab === "review"} onClick={() => setLeftTab("review")} label="複習" badge={dueCount > 0 ? dueCount : undefined} badgeHot={dueCount > 0} />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <ErrorBoundary label={leftTab}>
                {leftTab === "library" && (
                  <LibraryPanel
                    books={books}
                    onOpenBook={(b) => {
                      rememberBook(b);
                      setActiveToken(undefined);
                      setActiveDisplay(undefined);
                      setActiveSentence(undefined);
                    }}
                    onBookAdded={handleBookAdded}
                    activeBookId={activeBook?.id}
                  />
                )}
                {leftTab === "vocabulary" && (
                  <VocabularyList
                    onSelectWord={selectWordFromList}
                    onJumpToSource={jumpToSource}
                    activeToken={activeToken}
                  />
                )}
                {leftTab === "review" && (
                  <div className="p-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    複習卡在中間。標成「不認識」的字會放進學習中，可以立刻練習；第一次評分之後才會拉開間隔。
                  </div>
                )}
              </ErrorBoundary>
            </div>
          </div>
        }
        onOpenPrivacy={openPrivacy}
        center={
          <ErrorBoundary label="reader">
            {leftTab === "review" ? (
              <div className="h-full overflow-y-auto">
                <div className="max-w-xl mx-auto py-4">
                  <ReviewPanel onSelectWord={selectWordFromList} />
                </div>
              </div>
            ) : (
            <ReaderPanel
              book={activeBook}
              llmEnabled={llmEnabled}
              jumpToPage={pendingJump?.pageNo}
              jumpTick={pendingJump?.tick}
              onJumpConsumed={() => setPendingJump(null)}
              onTokenSelect={(normalized, token, sentence) => {
                setActiveToken(normalized);
                setActiveDisplay(token?.text);
                setActiveSentence(sentence);
                setActivePageNo(activeBook?.currentPage);
              }}
              onBookAdded={handleBookAdded}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            )}
          </ErrorBoundary>
        }
        right={
          <ErrorBoundary label="inspector">
            <InspectorPanel
              token={activeToken}
              display={activeDisplay}
              sentence={activeSentence}
              llmEnabled={llmEnabled}
              activeBookId={activeBook?.id}
              activePageNo={activePageNo}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </ErrorBoundary>
        }
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onConfigChange={(next) => setCfg(next)}
        onDataImported={() => { void refreshBooks(); }}
      />
    </>
  );
}

function TabButton({
  active, onClick, label, badge, badgeHot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number | undefined;
  badgeHot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
        active
          ? "border-sky-500 text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/40"
          : "border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`px-1.5 py-0.5 text-[10px] rounded-full tabular-nums ${
            badgeHot
              ? "bg-rose-500 text-white dark:bg-rose-600"
              : active
                ? "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
