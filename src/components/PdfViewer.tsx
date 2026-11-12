import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadPdf } from "../lib/pdf/pdfjs-loader";
import type { PDFDocumentProxy } from "../lib/pdf/pdfjs-loader";
import { tokenizePage, sentenceAt, pageTrailingHyphenHead } from "../lib/pdf/tokenize";
import type { TokenizedPage } from "../lib/pdf/tokenize";
import { getBlobAsArrayBuffer } from "../lib/blobStore";
import { getRepo } from "../data/repo";
import { useEcdictStatus, useRepoVersion } from "../data/useRepo";
import { WordPopup } from "./WordPopup";
import { ReflowPage } from "./ReflowPage";
import { showFloatingWordCard } from "./wordCardPlacement";
import { contentSpan, type InkItem } from "../lib/pdf/contentSpan";
import { scanPhrasesInTokens, type PhraseSpan } from "../lib/dict/phraseLookup";
import type { Book, DictEntry, FamiliarityLevel, PageToken, WordState } from "../data/types";
import { IGNORED_LEVEL, isLearningLevel, KNOWN_LEVEL, LEARNING_LEVEL, statusLabel } from "../data/familiarity";
import { autoMarkCandidates, planConfirmedMarks, type AutoMarkToken } from "../lib/pdf/autoMark";
import { nextAnchorAfterScroll, pdfScrollHasRange, wordCharAtScrollTop, type ReadingAnchor } from "../lib/pdf/readingPosition";
import { nearestWordIndex } from "../lib/pdf/hitTest";
import { getEcdictStatus, lookupEcdict } from "../lib/dict/ecdict";
import { DICT_SEED } from "../lib/dict/seed";
import { familiarityTint, formatPageRatio, pageWordStats } from "../lib/pdf/wordColor";
import { isAwlWord } from "../lib/dict/academic";
import { loadReaderSettings, saveReaderSettings, type ReaderSettings } from "../lib/readerSettings";

const seedWords = new Set(DICT_SEED.map((entry) => entry.word.toLowerCase()));

interface Props {
  book: Book;
  llmEnabled: boolean;
  jumpToPage?: number | undefined;
  jumpTick?: number | undefined;
  onJumpConsumed?: (() => void) | undefined;
  onTokenSelect: (
    normalized: string | undefined,
    token?: PageToken,
    sentence?: string,
  ) => void;
  onOpenSettings?: (() => void) | undefined;
}

const MAX_SCALE = 3.0;
const MIN_SCALE = 0.4;
const SIDE_PADDING = 32;
const SCALE_STEP = 0.1;
const SCALE_STORAGE_KEY = "lexigraph.pdf.scale";
const MOBILE_VIEW_KEY = "lexigraph.pdf.mobileView";
const REFLOW_PX_KEY = "lexigraph.pdf.reflowPx";

type MobileView = "reflow" | "pdf";

function loadMobileView(): MobileView {
  try { return localStorage.getItem(MOBILE_VIEW_KEY) === "pdf" ? "pdf" : "reflow"; }
  catch { return "reflow"; }
}
function loadReflowPx(): number {
  try {
    const n = Number(localStorage.getItem(REFLOW_PX_KEY));
    return Number.isFinite(n) && n >= 15 && n <= 24 ? n : 18;
  } catch { return 18; }
}

type UserScale = number | "fit";

interface PageSnap {
  bookId: string;
  pageNo: number;
  fullText: string;
  citationCount: number;
  wordCount: number;
  pageHeight?: number;
  tokens: AutoMarkToken[];
}

function loadScale(): UserScale {
  try {
    const v = localStorage.getItem(SCALE_STORAGE_KEY);
    if (!v || v === "fit") return "fit";
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= MIN_SCALE && n <= MAX_SCALE ? n : "fit";
  } catch { return "fit"; }
}
function saveScale(s: UserScale) {
  try { localStorage.setItem(SCALE_STORAGE_KEY, s === "fit" ? "fit" : String(s)); } catch { /* ignore */ }
}

export function PdfViewer({ book, llmEnabled, jumpToPage, jumpTick, onJumpConsumed, onTokenSelect, onOpenSettings }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | undefined>(undefined);
  const [pageNo, setPageNo] = useState(book.currentPage || 1);
  const [tokenized, setTokenized] = useState<TokenizedPage | undefined>(undefined);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | undefined>(undefined);
  const [selectedIdx, setSelectedIdx] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [wordStateMap, setWordStateMap] = useState<Map<string, WordState>>(() => new Map());
  const [popupDict, setPopupDict] = useState<DictEntry | undefined>(undefined);
  const [containerWidth, setContainerWidth] = useState<number>(720);
  const [debouncedWidth, setDebouncedWidth] = useState<number>(720);
  const [userScale, setUserScale] = useState<UserScale>(() => loadScale());
  const [effectiveScale, setEffectiveScale] = useState<number>(1);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [narrowLayout, setNarrowLayout] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  const [mobileView, setMobileView] = useState<MobileView>(() => loadMobileView());
  const [reflowPx, setReflowPx] = useState(() => loadReflowPx());
  const [crop, setCrop] = useState<{ left: number; viewW: number } | null>(null);
  const [undoKeys, setUndoKeys] = useState<string[] | null>(null);
  const [pendingMark, setPendingMark] = useState<{ pageNo: number; words: string[] } | null>(null);
  const [markSelection, setMarkSelection] = useState<Set<string>>(() => new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clickedRef = useRef<Set<string>>(new Set());
  const pageSnapRef = useRef<PageSnap | null>(null);
  const repoVersion = useRepoVersion();
  const dictionary = useEcdictStatus();
  const anchorRef = useRef<ReadingAnchor | null>(null);
  const seenPageRef = useRef(pageNo);
  const seenBookRef = useRef(book.id);
  /** Page turns start at the top until the reader actually scrolls. */
  const pinTopRef = useRef(true);
  const ignoreScrollRef = useRef(false);

  useEffect(() => {
    const sync = () => setReaderSettings(loadReaderSettings());
    window.addEventListener("lexigraph-settings", sync);
    const mq = window.matchMedia("(max-width: 1023px)");
    const onMq = () => setNarrowLayout(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("lexigraph-settings", sync);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  useEffect(() => { saveScale(userScale); }, [userScale]);
  useEffect(() => {
    try { localStorage.setItem(MOBILE_VIEW_KEY, mobileView); } catch { /* ignore */ }
  }, [mobileView]);
  useEffect(() => {
    try { localStorage.setItem(REFLOW_PX_KEY, String(reflowPx)); } catch { /* ignore */ }
  }, [reflowPx]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedWidth(containerWidth), 180);
    return () => clearTimeout(t);
  }, [containerWidth]);

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    setDoc(undefined);
    setPageNo(book.currentPage || 1);
    setTokenized(undefined);
    setSelectedIdx(undefined);
    (async () => {
      try {
        const buf = await getBlobAsArrayBuffer(book.fileRef);
        if (!buf) throw new Error("PDF blob not found (was the tab reloaded?)");
        const pdf = await loadPdf(buf);
        if (!cancelled) setDoc(pdf);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [book.id, book.fileRef]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    setLoading(true);
    setSelectedIdx(undefined);
    (async () => {
      try {
        const pdfPage = await doc.getPage(pageNo);
        const natural = pdfPage.getViewport({ scale: 1 });
        const sidePad = debouncedWidth < 720 ? 4 : SIDE_PADDING;
        const raw = await pdfPage.getTextContent();
        const ink: InkItem[] = [];
        for (const item of raw.items) {
          if (!("str" in item)) continue;
          ink.push({
            text: item.str ?? "",
            x: item.transform?.[4] ?? 0,
            width: item.width ?? 0,
            angle: Math.atan2(item.transform?.[1] ?? 0, item.transform?.[0] ?? 1) * 180 / Math.PI,
          });
        }
        const span = contentSpan(ink, natural.width);
        // On a phone, fit the text block rather than the full media box so
        // side margins (and the rotated arXiv stamp) are cropped and the
        // glyphs are larger, still with no horizontal scrollbar.
        const cropFit = narrowLayout && userScale === "fit" && span.width < natural.width - 8;
        const basis = cropFit ? span.width : natural.width;
        const fitScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (debouncedWidth - sidePad) / basis));
        const desired = userScale === "fit" ? fitScale : Math.min(MAX_SCALE, Math.max(MIN_SCALE, userScale));
        const carryIn = pageNo > 1 ? await pageTrailingHyphenHead(await doc.getPage(pageNo - 1)) : undefined;
        const { viewport, tokenized: tp } = await tokenizePage(pdfPage, pageNo, desired, { carryIn });
        if (cancelled) return;
        setPageSize({ w: viewport.width, h: viewport.height });
        setCrop(cropFit ? { left: span.minX * desired, viewW: span.width * desired } : null);
        setTokenized(tp);
        setEffectiveScale(desired);
        requestAnimationFrame(async () => {
          const canvas = canvasRef.current;
          if (!canvas || cancelled) return;
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.round(viewport.width * dpr);
          canvas.height = Math.round(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          if (dpr !== 1) ctx.scale(dpr, dpr);
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [doc, pageNo, debouncedWidth, userScale, narrowLayout, mobileView, dictionary.status]);

  const zoomIn = useCallback(() => {
    setUserScale((s) => {
      const cur = s === "fit" ? effectiveScale : s;
      return Math.min(MAX_SCALE, Math.round((cur + SCALE_STEP) * 100) / 100);
    });
  }, [effectiveScale]);
  const zoomOut = useCallback(() => {
    setUserScale((s) => {
      const cur = s === "fit" ? effectiveScale : s;
      return Math.max(MIN_SCALE, Math.round((cur - SCALE_STEP) * 100) / 100);
    });
  }, [effectiveScale]);
  const zoomFit = useCallback(() => setUserScale("fit"), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reading = narrowLayout && mobileView === "reflow";
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (reading) {
        setReflowPx((px) => Math.min(24, Math.max(15, px + (e.deltaY < 0 ? 1 : -1))));
        return;
      }
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    let pinch: number | null = null;
    const distance = (touches: TouchList) => {
      const a = touches[0]!;
      const b = touches[1]!;
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) pinch = distance(event.touches);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || pinch === null) return;
      event.preventDefault();
      const next = distance(event.touches);
      const ratio = next / pinch;
      if (Math.abs(ratio - 1) < 0.02) return;
      pinch = next;
      if (reading) {
        setReflowPx((px) => Math.min(24, Math.max(15, Math.round(px * ratio))));
        return;
      }
      setUserScale((current) => {
        const base = current === "fit" ? effectiveScale : current;
        return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(base * ratio * 100) / 100));
      });
    };
    const onTouchEnd = () => { pinch = null; };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [zoomIn, zoomOut, effectiveScale, narrowLayout, mobileView]);

  const handleWordClick = useCallback((idx: number) => {
    if (!tokenized) return;
    const t = tokenized.tokens[idx];
    if (!t) return;
    setSelectedIdx(idx);
    if (t.cls === "word") {
      const sent = sentenceAt(tokenized.fullText, t.charStart, t.charEnd);
      clickedRef.current.add(t.normalized);
      onTokenSelect(t.normalized, t, sent);
      void getRepo().touchWord(t.normalized, { bookId: book.id, pageNo, sentence: sent });
    } else {
      onTokenSelect(undefined, t);
      setPopupDict(undefined);
    }
  }, [tokenized, onTokenSelect]);

  useEffect(() => {
    if (!tokenized || selectedIdx === undefined) { setPopupDict(undefined); return; }
    const t = tokenized.tokens[selectedIdx];
    if (!t || t.cls !== "word" || !t.normalized) { setPopupDict(undefined); return; }
    let cancelled = false;
    getRepo().lookupDict(t.normalized).then((d) => { if (!cancelled) setPopupDict(d); });
    return () => { cancelled = true; };
  }, [selectedIdx, tokenized]);

  const wordNormalizedKeys = useMemo(() => {
    if (!tokenized) return [] as string[];
    const set = new Set<string>();
    for (const t of tokenized.tokens) {
      if (t.cls === "word" && t.normalized) set.add(t.normalized);
    }
    return [...set];
  }, [tokenized]);

  // Round 18: scan phrases in current page -> Map<tokenIdx, PhraseSpan> for WordBox highlight.
  const phraseByIdx = useMemo(() => {
    if (!tokenized) return new Map<number, PhraseSpan>();
    // Build token-idx -> normalized mapping (only word tokens).
    const wordTokens: string[] = tokenized.tokens.map((t) =>
      t.cls === "word" && t.normalized ? t.normalized : "",
    );
    const spans = scanPhrasesInTokens(wordTokens);
    const m = new Map<number, PhraseSpan>();
    for (const span of spans) {
      for (let i = span.startIdx; i <= span.endIdx; i++) {
        // Only mark actual word tokens (skip empty entries from non-word tokens).
        if (wordTokens[i]) m.set(i, span);
      }
    }
    return m;
  }, [tokenized]);

  useEffect(() => {
    if (wordNormalizedKeys.length === 0) { setWordStateMap(new Map()); return; }
    let cancelled = false;
    getRepo().getWordStatesMany(wordNormalizedKeys).then((m) => {
      if (!cancelled) setWordStateMap(m);
    });
    return () => { cancelled = true; };
  }, [wordNormalizedKeys, repoVersion]);

  // Round 16: persist reading position.
  useEffect(() => {
    const t = setTimeout(() => {
      void getRepo().updateBookProgress(book.id, pageNo);
    }, 500);
    return () => clearTimeout(t);
  }, [book.id, pageNo]);

  // Round 18: jump-to-page from vocabulary / review. jumpTick triggers even if
  // jumpToPage is the same as current pageNo (forces re-render / toast).
  useEffect(() => {
    if (jumpToPage === undefined || jumpTick === undefined) return;
    if (!doc) return;
    const target = Math.max(1, Math.min(doc.numPages, jumpToPage));
    setPageNo(target);
    if (onJumpConsumed) onJumpConsumed();
  }, [jumpTick, jumpToPage, doc, onJumpConsumed]);

  useEffect(() => {
    if (!tokenized) return;
    const prev = pageSnapRef.current;
    if (prev && prev.bookId === book.id && pageNo > prev.pageNo) {
      const clicked = clickedRef.current;
      clickedRef.current = new Set();
      void considerAutoMark(prev, clicked);
    }
    if (prev && prev.bookId !== book.id) clickedRef.current = new Set();
    pageSnapRef.current = {
      bookId: book.id,
      pageNo,
      fullText: tokenized.fullText,
      citationCount: tokenized.stats.citation ?? 0,
      wordCount: tokenized.stats.word ?? 0,
      pageHeight: pageSize?.h,
      tokens: tokenized.tokens.map((t) => ({
        text: t.text,
        normalized: t.normalized,
        cls: t.cls,
        zone: t.zone,
        charStart: t.charStart,
        lineNo: t.lineNo,
        y: t.y,
        height: t.h,
      })),
    };
  }, [tokenized, pageNo, book.id, pageSize]);

  const considerAutoMark = useCallback(async (snap: PageSnap, clicked: Set<string>) => {
    const settings = loadReaderSettings();
    if (!settings.autoMarkKnown) return;
    const surfaces = [...new Set(snap.tokens.map((t) => t.normalized).filter(Boolean))];
    const states = await getRepo().getWordStatesMany(surfaces);
    const dictReady = getEcdictStatus() === "ready";
    const decision = autoMarkCandidates(snap.tokens, snap, {
      clicked,
      hasState: (word) => states.has(word),
      inDictionary: dictReady
        ? (word) => seedWords.has(word) || lookupEcdict(word) !== undefined
        : undefined,
    });
    if (decision.words.length === 0) return;
    if (settings.confirmAutoMark) {
      setPendingMark({ pageNo: snap.pageNo, words: decision.words });
      setMarkSelection(new Set());
      return;
    }
    const result = await getRepo().markKnownUnseen(decision.words, { bookId: book.id, pageNo: snap.pageNo });
    if (result.createdKeys.length > 0) setUndoKeys(result.createdKeys);
  }, [book.id]);

  const commitPendingMark = useCallback(async () => {
    if (!pendingMark) return;
    const plan = planConfirmedMarks(pendingMark.words, markSelection);
    const source = { bookId: book.id, pageNo: pendingMark.pageNo };
    const known = plan.known.length > 0
      ? await getRepo().markKnownUnseen(plan.known, source)
      : { count: 0, createdKeys: [] as string[] };
    if (plan.learn.length > 0) await getRepo().markLearningUnseen(plan.learn, source);
    setUndoKeys(known.createdKeys.length > 0 ? known.createdKeys : null);
    setPendingMark(null);
  }, [pendingMark, markSelection, book.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (selectedIdx === undefined || !tokenized) return;
      const t = tokenized.tokens[selectedIdx];
      if (!t || t.cls !== "word" || !t.normalized) return;
      const key = e.key.toLowerCase();
      const sent = sentenceAt(tokenized.fullText, t.charStart, t.charEnd);
      const source = { bookId: book.id, pageNo, sentence: sent };
      if (key === "k" || key === "5") {
        e.preventDefault();
        void getRepo().setWordLevel(t.normalized, KNOWN_LEVEL, source);
      } else if (key === "u") {
        e.preventDefault();
        void getRepo().setWordLevel(t.normalized, LEARNING_LEVEL, source);
      } else if (key === "0" || key === "x") {
        e.preventDefault();
        void getRepo().setWordLevel(t.normalized, IGNORED_LEVEL, source);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIdx, tokenized]);

  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") {
        setSelectedIdx(undefined);
        onTokenSelect(undefined);
      } else if (e.key === "PageDown" || (e.key === "ArrowRight" && e.ctrlKey)) {
        setPageNo((p) => Math.min(doc.numPages, p + 1));
      } else if (e.key === "PageUp" || (e.key === "ArrowLeft" && e.ctrlKey)) {
        setPageNo((p) => Math.max(1, p - 1));
      } else if (e.key === "Home" && e.ctrlKey) {
        setPageNo(1);
      } else if (e.key === "End" && e.ctrlKey) {
        setPageNo(doc.numPages);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        zoomFit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, onTokenSelect, zoomIn, zoomOut, zoomFit]);

  const captureAnchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !tokenized || pinTopRef.current) return;
    const source = narrowLayout && mobileView === "reflow" ? "reflow" : "pdf";
    let captured: ReadingAnchor | null = null;
    if (source === "reflow") {
      const buttons = [...el.querySelectorAll<HTMLElement>("[data-char]")];
      const edge = el.getBoundingClientRect().top + 8;
      let chosen = buttons[0];
      for (const button of buttons) {
        if (button.getBoundingClientRect().top >= edge) { chosen = button; break; }
      }
      const charStart = Number(chosen?.dataset.char);
      if (Number.isFinite(charStart)) captured = { pageNo, charStart };
    } else {
      const charStart = wordCharAtScrollTop(tokenized.tokens, el.scrollTop);
      if (charStart !== null) captured = { pageNo, charStart };
    }
    anchorRef.current = nextAnchorAfterScroll({
      previous: anchorRef.current,
      source,
      captured,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  }, [tokenized, narrowLayout, mobileView, pageNo]);

  const assignScroll = useCallback((el: HTMLElement, top: number) => {
    const next = Math.max(0, top);
    if (Math.abs(el.scrollTop - next) < 1) return;
    ignoreScrollRef.current = true;
    el.scrollTop = next;
  }, []);

  const scrollToAnchor = useCallback((el: HTMLElement, charStart: number) => {
    if (narrowLayout && mobileView === "reflow") {
      const nodes = [...el.querySelectorAll<HTMLElement>("[data-char]")];
      const target = nodes.find((node) => {
        const start = Number(node.dataset.char);
        const end = Number(node.dataset.charEnd ?? node.dataset.char);
        return Number.isFinite(start) && (charStart === start || (Number.isFinite(end) && charStart >= start && charStart < end));
      });
      if (!target) return;
      const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      assignScroll(el, top - 8);
      return;
    }
    if (!pdfScrollHasRange(el.scrollHeight, el.clientHeight)) return;
    const token = tokenized?.tokens.find((item) => item.charStart === charStart)
      ?? tokenized?.tokens.find((item) => charStart >= item.charStart && charStart < item.charEnd);
    if (token) assignScroll(el, token.y - 8);
  }, [assignScroll, mobileView, narrowLayout, tokenized]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !tokenized) return;
    if (seenBookRef.current !== book.id) {
      seenBookRef.current = book.id;
      seenPageRef.current = pageNo;
      pinTopRef.current = true;
      anchorRef.current = null;
    }
    if (seenPageRef.current !== pageNo) {
      seenPageRef.current = pageNo;
      pinTopRef.current = true;
      anchorRef.current = null;
    }
    if (pinTopRef.current) {
      assignScroll(el, 0);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor || anchor.pageNo !== pageNo) return;
    scrollToAnchor(el, anchor.charStart);
  }, [book.id, mobileView, pageNo, tokenized, narrowLayout, assignScroll, scrollToAnchor]);

  const onReaderScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (ignoreScrollRef.current) {
      ignoreScrollRef.current = false;
      return;
    }
    if (pinTopRef.current) {
      if (el.scrollTop !== 0) {
        ignoreScrollRef.current = true;
        el.scrollTop = 0;
      }
      return;
    }
    captureAnchor();
  }, [captureAnchor]);

  const releasePin = useCallback(() => { pinTopRef.current = false; }, []);

  const dismissPopup = useCallback(() => {
    setSelectedIdx(undefined);
    onTokenSelect(undefined);
  }, [onTokenSelect]);

  if (error) {
    return (
      <div className="p-6 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md m-4">
        <div className="font-semibold mb-1">Could not load PDF</div>
        <div className="text-xs">{error}</div>
      </div>
    );
  }

  const selectedToken = tokenized && selectedIdx !== undefined ? tokenized.tokens[selectedIdx] : undefined;
  const selectedState = selectedToken && selectedToken.cls === "word" ? wordStateMap.get(selectedToken.normalized) : undefined;
  const selectedSentence = tokenized && selectedToken && selectedToken.cls === "word"
    ? sentenceAt(tokenized.fullText, selectedToken.charStart, selectedToken.charEnd) : undefined;

  const pctLabel = `${Math.round(effectiveScale * 100)}%`;
  const isFit = userScale === "fit";
  const ratioLabel = useMemo(() => {
    if (!tokenized) return "";
    const levels = new Map<string, FamiliarityLevel | undefined>();
    for (const token of tokenized.tokens) {
      if (token.cls !== "word" || !token.normalized || levels.has(token.normalized)) continue;
      levels.set(token.normalized, wordStateMap.get(token.normalized)?.level);
    }
    return formatPageRatio(pageWordStats([...levels.values()]));
  }, [tokenized, wordStateMap]);

  const toggleAwl = () => {
    const next = { ...loadReaderSettings(), awlUnknownOnly: !readerSettings.awlUnknownOnly };
    saveReaderSettings(next);
    setReaderSettings(next);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="min-h-10 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 border-b border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 shrink-0">
        <span className="flex items-center gap-1">
          Page{" "}
          <input
            type="number"
            min={1}
            max={doc?.numPages ?? 1}
            value={pageNo}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n) && doc) setPageNo(Math.max(1, Math.min(doc.numPages, n)));
            }}
            className="w-14 px-1 py-0.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded text-center"
          />{" "}
          / {doc?.numPages ?? "-"}
        </span>

        <div className="flex items-center gap-0.5 ml-1">
          <button onClick={zoomOut} disabled={!doc || effectiveScale <= MIN_SCALE + 0.001}
            className="w-6 h-6 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            title="縮小 (Ctrl+-)" aria-label="zoom out">{"−"}</button>
          <span className="min-w-[3.2rem] text-center tabular-nums cursor-default select-none"
            title={isFit ? "自動貼合寬度" : "目前縮放"}>{pctLabel}</span>
          <button onClick={zoomIn} disabled={!doc || effectiveScale >= MAX_SCALE - 0.001}
            className="w-6 h-6 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            title="放大 (Ctrl++)" aria-label="zoom in">{"+"}</button>
          <button onClick={zoomFit}
            className={`ml-0.5 px-1.5 h-6 rounded border text-[11px] ${
              isFit
                ? "border-sky-400 text-sky-700 bg-sky-50 dark:border-sky-600 dark:text-sky-300 dark:bg-sky-950/40"
                : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title="貼合寬度 (Ctrl+0)" aria-label="fit width">fit</button>
          {narrowLayout && (
            <button
              type="button"
              onClick={() => { releasePin(); captureAnchor(); setMobileView((mode) => mode === "reflow" ? "pdf" : "reflow"); }}
              className={`ml-0.5 px-1.5 h-6 rounded border text-[11px] ${
                mobileView === "reflow"
                  ? "border-sky-400 text-sky-700 bg-sky-50 dark:border-sky-600 dark:text-sky-300 dark:bg-sky-950/40"
                  : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
              }`}
              title={mobileView === "reflow" ? "改看原 PDF 頁（貼合文字寬度，不橫向捲動）" : "改成可讀的單欄文字"}
              aria-label={mobileView === "reflow" ? "show pdf page" : "show reflow text"}
            >
              {mobileView === "reflow" ? "PDF" : "可讀"}
            </button>
          )}
        </div>

        <span className="text-slate-500 dark:text-slate-400 tabular-nums shrink-0" title="本頁學習中與認識的比例">
          {ratioLabel}
        </span>
        <button
          type="button"
          onClick={toggleAwl}
          className={`px-1.5 h-6 rounded border text-[11px] shrink-0 ${
            readerSettings.awlUnknownOnly
              ? "border-indigo-400 text-indigo-700 bg-indigo-50 dark:border-indigo-600 dark:text-indigo-300 dark:bg-indigo-950/40"
              : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
          }`}
          title="只高亮學習中的 AWL 學術詞"
        >
          AWL
        </button>
        {undoKeys && undoKeys.length > 0 && (
          <button
            type="button"
            onClick={() => { void getRepo().undoKnownMarks(undoKeys).then(() => setUndoKeys(null)); }}
            className="px-1.5 h-6 rounded border border-amber-400 text-amber-800 bg-amber-50 text-[11px] dark:border-amber-700 dark:text-amber-200 dark:bg-amber-950/40"
          >
            復原認識 ({undoKeys.length})
          </button>
        )}
        <div className="flex-1" />
        <span className="text-slate-500 dark:text-slate-400 tabular-nums hidden sm:inline">
          {tokenized ? <>{tokenized.stats.word} words · {tokenized.stats.citation} citations</>
            : loading ? "rendering..." : "loading..."}
        </span>
      </div>
      {pendingMark && (
        <div className="border-b border-pink-200 bg-pink-50 px-4 py-2 text-xs text-pink-950 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-100">
          <div className="font-medium mb-1">
            第 {pendingMark.pageNo} 頁沒點過的 {pendingMark.words.length} 個字會標成認識。勾選要放進學習的字（{markSelection.size}）。
          </div>
          <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1 mb-2">
            {pendingMark.words.map((word) => {
              const on = markSelection.has(word);
              return (
                <label key={word} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 border ${on ? "bg-pink-100 border-pink-400 text-pink-950 dark:bg-pink-900/50 dark:text-pink-100" : "bg-white/70 border-slate-200 dark:bg-slate-900/40 dark:border-slate-600"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      setMarkSelection((prev) => {
                        const next = new Set(prev);
                        if (next.has(word)) next.delete(word);
                        else next.add(word);
                        return next;
                      });
                    }}
                  />
                  {word}
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { void commitPendingMark(); }} className="px-2 py-1 rounded bg-pink-600 text-white">套用</button>
            <button type="button" onClick={() => setPendingMark(null)} className="px-2 py-1 rounded border border-pink-300">先不標</button>
            <button type="button" onClick={() => setMarkSelection(new Set(pendingMark.words))} className="px-2 py-1 rounded border border-pink-300">全部學習</button>
            <button type="button" onClick={() => setMarkSelection(new Set())} className="px-2 py-1 rounded border border-pink-300">全部認識</button>
          </div>
        </div>
      )}

      <div ref={scrollRef}
        className={`flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900 p-1 sm:p-4 ${crop && !(narrowLayout && mobileView === "reflow") ? "overflow-x-hidden" : "overflow-x-auto"}`}
        style={{ overflowAnchor: "none" }}
        onClick={dismissPopup}
        onWheel={releasePin}
        onTouchMove={releasePin}
        onPointerDown={releasePin}
        onScroll={onReaderScroll}>
        {narrowLayout && mobileView === "reflow" && tokenized ? (
          <ReflowPage
            tokens={tokenized.tokens}
            fullText={tokenized.fullText}
            selectedIdx={selectedIdx}
            fontPx={reflowPx}
            levelFor={(word) => wordStateMap.get(word)?.level}
            onSelect={handleWordClick}
            canPrev={pageNo > 1}
            canNext={!!doc && pageNo < doc.numPages}
            onPrev={() => setPageNo((p) => Math.max(1, p - 1))}
            onNext={() => setPageNo((p) => Math.min(doc?.numPages ?? p, p + 1))}
          />
        ) : (
        <div className="mx-auto overflow-hidden shadow-lg" style={{ width: crop?.viewW ?? pageSize?.w ?? 0, height: pageSize?.h ?? 0 }}>
          <div
            className="relative bg-white"
            style={{ width: pageSize?.w ?? 0, height: pageSize?.h ?? 0, marginLeft: crop ? -crop.left : 0 }}
            onClick={(event) => {
              event.stopPropagation();
              if (!tokenized || !pageSize) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const idx = nearestWordIndex(
                tokenized.tokens,
                event.clientX - rect.left,
                event.clientY - rect.top,
                narrowLayout ? 22 : 12,
              );
              if (idx === undefined) dismissPopup();
              else handleWordClick(idx);
            }}
          >
            <canvas ref={canvasRef} className="block absolute inset-0"
              style={{ width: pageSize?.w ?? 0, height: pageSize?.h ?? 0 }} />
            <button type="button" aria-label="Previous page" title="Previous page"
              onClick={(e) => { e.stopPropagation(); setPageNo((p) => Math.max(1, p - 1)); }}
              disabled={!doc || pageNo <= 1}
              className="group absolute left-0 top-0 bottom-0 z-30 w-[9%] cursor-pointer bg-transparent hover:bg-slate-900/[0.04] disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-100 flex items-center justify-start pl-2">
              <span className="opacity-0 group-hover:opacity-70 group-disabled:opacity-0 text-2xl text-slate-700 select-none transition-opacity">{"‹"}</span>
            </button>
            <button type="button" aria-label="Next page" title="Next page"
              onClick={(e) => { e.stopPropagation(); setPageNo((p) => Math.min(doc?.numPages ?? p, p + 1)); }}
              disabled={!doc || pageNo >= (doc?.numPages ?? 1)}
              className="group absolute right-0 top-0 bottom-0 z-30 w-[9%] cursor-pointer bg-transparent hover:bg-slate-900/[0.04] disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-100 flex items-center justify-end pr-2">
              <span className="opacity-0 group-hover:opacity-70 group-disabled:opacity-0 text-2xl text-slate-700 select-none transition-opacity">{"›"}</span>
            </button>
            {tokenized?.tokens.map((t, idx) => (
              <WordBox key={idx} token={t} selected={idx === selectedIdx}
                state={t.cls === "word" ? wordStateMap.get(t.normalized) : undefined}
                phrase={phraseByIdx.get(idx)}
                awlOnly={readerSettings.awlUnknownOnly} />
            ))}
          </div>
        </div>
        )}
        {showFloatingWordCard(narrowLayout) && selectedToken && selectedToken.cls === "word" && pageSize && (
          <WordPopup token={selectedToken} normalized={selectedToken.normalized}
            dict={popupDict} state={selectedState} sentence={selectedSentence}
            pageWidth={400} pageHeight={pageSize.h} llmEnabled={llmEnabled}
            onLevelChange={(lvl) => { void getRepo().setWordLevel(selectedToken.normalized, lvl, { bookId: book.id, pageNo, sentence: selectedSentence }); }}
            onDismiss={dismissPopup}
            onOpenSettings={onOpenSettings} />
        )}
      </div>
    </div>
  );
}

function WordBox({ token, selected, state, phrase, awlOnly }: {
  token: PageToken;
  selected: boolean;
  state: WordState | undefined;
  phrase?: PhraseSpan | undefined;
  awlOnly: boolean;
}) {
  const isWord = token.cls === "word";
  const base = "absolute z-10 pointer-events-none transition-colors duration-75 rounded-sm";
  const cursor = "";
  const level = state?.level;
  const awl = isWord && isAwlWord(token.normalized);
  const hideTint = awlOnly && !(awl && isLearningLevel(level));
  let tint = "";
  if (isWord) {
    tint = hideTint && !selected ? "hover:bg-slate-400/10" : familiarityTint(level, selected);
  }
  const phraseUnderline = phrase
    ? "border-b-[3px] border-indigo-400/70 dark:border-indigo-500/70"
    : "";
  const label = statusLabel(level);
  const phraseTitle = phrase
    ? `  ·  片語：${phrase.entry.phrase} → ${phrase.entry.translation}`
    : "";
  return (
    <div className={`${base} ${cursor} ${tint} ${phraseUnderline}`}
      style={{ left: token.x, top: token.y, width: token.w, height: token.h }}
      title={`${token.text} · ${token.cls}${isWord ? ` · ${label}${awl ? " · AWL" : ""}` : ""}${phraseTitle}`} />
  );
}
