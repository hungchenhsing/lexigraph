import { useEffect, useMemo, useRef, useState } from "react";
import type { WordState, PhraseBookmark, CEFR } from "../data/types";
import { familiarityStatus } from "../data/familiarity";
import { getRepo } from "../data/repo";
import { useRepoVersion } from "../data/useRepo";
import { wordsToCsv, wordsToAnki, phrasesToCsv, downloadText, todayStamp } from "../lib/export/csv";
import {
  wordsToAnkiBasic, wordsToAnkiRich, wordsToAnkiCloze, phrasesToAnkiCloze,
  ankiFilename, buildBookTitleLookup,
} from "../lib/export/anki";
import { PHRASE_SEED } from "../lib/dict/phrases";
import { speak, canSpeak } from "../lib/tts";

interface Props {
  onSelectWord: (normalized: string) => void;
  onJumpToSource?: ((normalized: string) => void) | undefined;
  activeToken?: string | undefined;
}

type SortKey = "recent" | "alpha" | "reviews";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d} 天前`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w} 週前`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} 個月前`;
  return `${Math.floor(d / 365)} 年前`;
}

const CEFR_LEVELS: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function VocabularyList({ onSelectWord, onJumpToSource, activeToken }: Props) {
  const [states, setStates] = useState<WordState[]>([]);
  const [phrases, setPhrases] = useState<PhraseBookmark[]>([]);
  const [cefrMap, setCefrMap] = useState<Map<string, CEFR>>(new Map());
  const [loading, setLoading] = useState(true);
  const [exportMenu, setExportMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [cefrFilter, setCefrFilter] = useState<Set<CEFR>>(new Set());
  const repoVersion = useRepoVersion();

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const repo = getRepo();
      const [all, ph] = await Promise.all([
        repo.listAllWordStates(),
        repo.listPhrases(),
      ]);
      if (cancelled) return;
      setStates(all);
      setPhrases(ph);
      setLoading(false);
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [repoVersion]);

  const cefrFetchedRef = useRef(false);
  useEffect(() => {
    if (cefrFetchedRef.current) return;
    if (states.length === 0) return;
    cefrFetchedRef.current = true;
    let cancelled = false;
    (async () => {
      const repo = getRepo();
      const dicts = await Promise.all(states.map((w) => repo.lookupDict(w.normalized)));
      if (cancelled) return;
      const m = new Map<string, CEFR>();
      for (let i = 0; i < states.length; i++) {
        const d = dicts[i];
        if (d?.cefr && d.cefr !== "unknown") m.set(states[i].normalized, d.cefr);
      }
      setCefrMap(m);
    })();
    return () => { cancelled = true; };
  }, [states]);

  const toggleCefr = (lvl: CEFR) => {
    setCefrFilter((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl); else next.add(lvl);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = states;
    if (q) out = out.filter((s) => s.normalized.toLowerCase().includes(q));
    if (cefrFilter.size > 0) {
      out = out.filter((s) => {
        const c = cefrMap.get(s.normalized);
        return c !== undefined && cefrFilter.has(c);
      });
    }
    out = [...out];
    switch (sortKey) {
      case "recent": out.sort((a, b) => b.firstSeenAt - a.firstSeenAt); break;
      case "alpha":  out.sort((a, b) => a.normalized.localeCompare(b.normalized)); break;
      case "reviews": out.sort((a, b) => b.reviewCount - a.reviewCount); break;
    }
    return out;
  }, [states, query, sortKey, cefrFilter, cefrMap]);

  const unknown = filtered.filter((s) => familiarityStatus(s.level) === "learning");
  const known = filtered.filter((s) => familiarityStatus(s.level) === "known");
  const ignored = filtered.filter((s) => familiarityStatus(s.level) === "ignored");
  const sortedPhrases = [...phrases].sort((a, b) => b.createdAt - a.createdAt);

  const doExport = async (
    kind: "csv" | "anki" | "phrases" | "anki-basic" | "anki-rich" | "anki-cloze" | "anki-phrase-cloze",
  ) => {
    setExportMenu(false);
    const repo = getRepo();
    const books = await repo.listBooks();
    const bookTitle = buildBookTitleLookup(books);
    const lookup = { dict: (n: string) => repo.lookupDict(n), bookTitle };
    if (kind === "csv") {
      const text = await wordsToCsv(states, lookup);
      downloadText(`lexigraph-vocab-${todayStamp()}.csv`, text, "text/csv;charset=utf-8");
    } else if (kind === "anki") {
      const text = await wordsToAnki(states, lookup);
      downloadText(`lexigraph-anki-${todayStamp()}.txt`, text, "text/plain;charset=utf-8");
    } else if (kind === "phrases") {
      const text = phrasesToCsv(phrases);
      downloadText(`lexigraph-phrases-${todayStamp()}.csv`, text, "text/csv;charset=utf-8");
    } else if (kind === "anki-basic") {
      const { text, withSentence, withoutSentence } = await wordsToAnkiBasic(states, lookup);
      downloadText(ankiFilename("basic"), text, "text/tab-separated-values;charset=utf-8");
      if (withoutSentence > 0) {
        alert(`匯出 ${states.length} 張：${withSentence} 張有原句例句（R21 後新標）、${withoutSentence} 張只有詞本身（舊標的）。Anki 中 Import → Notetype: Basic → Field 1→Front, Field 2→Back。`);
      }
    } else if (kind === "anki-rich") {
      const text = await wordsToAnkiRich(states, lookup);
      downloadText(ankiFilename("rich"), text, "text/tab-separated-values;charset=utf-8");
    } else if (kind === "anki-cloze") {
      const { text, skipped } = await wordsToAnkiCloze(states, lookup);
      downloadText(ankiFilename("cloze"), text, "text/tab-separated-values;charset=utf-8");
      if (skipped > 0) {
        alert(`Cloze 匯出略過 ${skipped} 詞（尚無原句記錄）。R21 後新標的詞才會保留句子。`);
      }
    } else if (kind === "anki-phrase-cloze") {
      const phraseTranslations = new Map(
        PHRASE_SEED.map((e) => [e.phrase.toLowerCase(), e.translation]),
      );
      const text = phrasesToAnkiCloze(phrases, lookup, phraseTranslations);
      downloadText(ankiFilename("phrase-cloze"), text, "text/tab-separated-values;charset=utf-8");
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-xs text-slate-400 dark:text-slate-500 italic">載入詞彙書中…</div>
    );
  }

  if (states.length === 0 && phrases.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400 dark:text-slate-500 leading-relaxed">
        尚未標記任何詞。
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          打開一本書、點詞、按 <kbd className="kbd">K</kbd> 或 <kbd className="kbd">U</kbd> 開始累積。
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      <div className="px-1 space-y-1.5">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋詞彙…"
            className="w-full pl-7 pr-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">🔍</span>
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">排序：</span>
          {([["recent", "時間"], ["alpha", "字母"], ["reviews", "複習"]] as [SortKey, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`px-1.5 py-0.5 rounded ${
                sortKey === k
                  ? "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setExportMenu((v) => !v)}
            className="ml-auto px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="匯出"
          >
            匯出 ↓
          </button>
        </div>
        <div className="flex items-center gap-0.5 flex-wrap">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">CEFR：</span>
          {CEFR_LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => toggleCefr(lvl)}
              className={`px-1 py-0.5 text-[10px] rounded font-semibold ${
                cefrFilter.has(lvl)
                  ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {lvl}
            </button>
          ))}
          {cefrFilter.size > 0 && (
            <button
              onClick={() => setCefrFilter(new Set())}
              className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 ml-1"
              title="清除 CEFR 篩選"
            >
              ×
            </button>
          )}
        </div>
        {exportMenu && (
          <div className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm py-1">
            <div className="px-3 py-0.5 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Anki — 推薦</div>
            <button onClick={() => void doExport("anki-basic")} className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200" disabled={states.length === 0} title="正面=詞+原句+出處，反面=音標/中英/筆記；Anki Basic notetype，免設定">
              <span className="font-semibold">詞彙 正反面（Basic）</span>
              <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">正面：詞 + 你讀過的原句　反面：解釋</span>
            </button>
            <button onClick={() => void doExport("anki-cloze")} className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200" disabled={states.length === 0} title="原句中目標詞挖空為 {{c1::word}}；Anki Cloze notetype">
              <span className="font-semibold">詞彙 Cloze（挖空）</span>
              <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">句中挖空目標詞，填回來；記憶效率最高</span>
            </button>
            <button onClick={() => void doExport("anki-phrase-cloze")} className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50" disabled={phrases.length === 0} title="收藏的片語，原句中片語挖空">
              <span className="font-semibold">片語 Cloze（挖空）</span>
              <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">收藏的片語整段挖空</span>
            </button>
            <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
            <div className="px-3 py-0.5 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Anki 進階（需手動對欄位）</div>
            <button onClick={() => void doExport("anki-rich")} className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200" disabled={states.length === 0} title="6 欄分開：詞 / 音標 / 中譯 / 英英 / 例句 / 出處 / tags；適合自訂模板">
              詞彙 Rich（6 欄分開）
            </button>
            <button onClick={() => void doExport("anki")} className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200" disabled={states.length === 0}>
              詞彙 TSV 最簡（front/back）
            </button>
            <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
            <div className="px-3 py-0.5 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">其他</div>
            <button onClick={() => void doExport("csv")} className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200" disabled={states.length === 0}>
              詞彙 CSV（Excel / Sheets）
            </button>
            <button onClick={() => void doExport("phrases")} className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50" disabled={phrases.length === 0}>
              片語 CSV
            </button>
          </div>
        )}
      </div>

      {(query || cefrFilter.size > 0) && (
        <div className="px-2 text-[10px] text-slate-500 dark:text-slate-400">
          過濾後 {filtered.length} / {states.length} 詞
        </div>
      )}

      {unknown.length > 0 && (
        <Section title="學習中" count={unknown.length} accent="pink" words={unknown}
          cefrMap={cefrMap} onSelect={onSelectWord} onJumpToSource={onJumpToSource} activeToken={activeToken} />
      )}
      {known.length > 0 && (
        <Section title="認識" count={known.length} accent="emerald" words={known}
          cefrMap={cefrMap} onSelect={onSelectWord} onJumpToSource={onJumpToSource} activeToken={activeToken} />
      )}
      {ignored.length > 0 && (
        <Section title="忽略" count={ignored.length} accent="slate" words={ignored}
          cefrMap={cefrMap} onSelect={onSelectWord} onJumpToSource={onJumpToSource} activeToken={activeToken} />
      )}
      {sortedPhrases.length > 0 && !query && cefrFilter.size === 0 && (
        <PhraseSection phrases={sortedPhrases} />
      )}
    </div>
  );
}

function Section({
  title, count, accent, words, cefrMap, onSelect, onJumpToSource, activeToken,
}: {
  title: string;
  count: number;
  accent: "pink" | "emerald" | "slate";
  words: WordState[];
  cefrMap: Map<string, CEFR>;
  onSelect: (normalized: string) => void;
  onJumpToSource?: ((normalized: string) => void) | undefined;
  activeToken?: string | undefined;
}) {
  const [expanded, setExpanded] = useState(true);
  const chipCls =
    accent === "pink"
      ? "bg-pink-50 text-pink-800 ring-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:ring-pink-800"
      : accent === "slate"
        ? "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
        : "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800";
  return (
    <section>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
      >
        <span className="flex items-center gap-1.5">
          <span>{expanded ? "▾" : "▸"}</span>
          <span>{title}</span>
          <span className={`px-1.5 py-0.5 text-[10px] rounded-full ring-1 ring-inset tabular-nums font-normal ${chipCls}`}>
            {count}
          </span>
        </span>
      </button>
      {expanded && (
        <ul className="mt-1 space-y-0.5">
          {words.map((w) => (
            <WordRow key={w.normalized} word={w} cefr={cefrMap.get(w.normalized)}
              active={w.normalized === activeToken} onSelect={onSelect}
              onJumpToSource={onJumpToSource} accent={accent} />
          ))}
        </ul>
      )}
    </section>
  );
}

function WordRow({ word, cefr, active, onSelect, onJumpToSource, accent }: {
  word: WordState;
  cefr?: CEFR | undefined;
  active: boolean;
  onSelect: (normalized: string) => void;
  onJumpToSource?: ((normalized: string) => void) | undefined;
  accent: "pink" | "emerald" | "slate";
}) {
  const dot = accent === "pink" ? "bg-pink-400" : accent === "slate" ? "bg-slate-400" : "bg-emerald-500";
  const hasSource = word.lastSource !== undefined;
  return (
    <li>
      <div
        className={`group w-full px-2 py-1 rounded text-sm transition-colors flex items-center gap-2 ${
          active
            ? "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-200 dark:bg-sky-900/50 dark:text-sky-100 dark:ring-sky-700"
            : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
        }`}
      >
        <button
          onClick={() => onSelect(word.normalized)}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
          title={`最後看見於 ${new Date(word.lastSeenAt).toLocaleString()}`}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-none ${dot}`} />
          <span className="font-reader truncate">{word.normalized}</span>
          {cefr && (
            <span className="flex-none text-[9px] px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">{cefr}</span>
          )}
        </button>
        {canSpeak() && (
          <button
            onClick={(e) => { e.stopPropagation(); speak(word.normalized); }}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 opacity-0 group-hover:opacity-100 text-xs"
            title="發音" aria-label="speak"
          >🔊</button>
        )}
        {onJumpToSource && hasSource && (
          <button
            onClick={(e) => { e.stopPropagation(); onJumpToSource(word.normalized); }}
            className="text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 opacity-0 group-hover:opacity-100 text-xs"
            title="跳回出處 PDF 頁" aria-label="jump to source"
          >→</button>
        )}
        <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">
          {word.reviewCount}× · {timeAgo(word.firstSeenAt)}
        </span>
      </div>
    </li>
  );
}

function PhraseSection({ phrases }: { phrases: PhraseBookmark[] }) {
  const [expanded, setExpanded] = useState(true);
  const remove = async (id: string) => { await getRepo().deletePhrase(id); };
  return (
    <section>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
      >
        <span className="flex items-center gap-1.5">
          <span>{expanded ? "▾" : "▸"}</span>
          <span>片語收藏</span>
          <span className="px-1.5 py-0.5 text-[10px] rounded-full ring-1 ring-inset tabular-nums font-normal bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800">
            {phrases.length}
          </span>
        </span>
      </button>
      {expanded && (
        <ul className="mt-1 space-y-1 px-1">
          {phrases.map((p) => (
            <li key={p.id} className="group rounded border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-reader text-slate-900 dark:text-slate-100 truncate">{p.text}</div>
                  <div className="text-slate-500 dark:text-slate-400 italic truncate mt-0.5">{p.sentence}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{timeAgo(p.createdAt)}</div>
                </div>
                <button
                  onClick={() => void remove(p.id)}
                  className="text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100"
                  title="刪除" aria-label="delete phrase"
                >×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
