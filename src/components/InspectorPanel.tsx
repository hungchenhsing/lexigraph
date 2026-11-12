import { useEffect, useState } from "react";
import type { WordState, DictEntry, PhraseBookmark } from "../data/types";
import { getRepo } from "../data/repo";
import { useRepoVersion, useEcdictStatus } from "../data/useRepo";
import { SentenceAnalysis } from "./SentenceAnalysis";
import { SentenceDeepAnalysis } from "./SentenceDeepAnalysis";
import { LevelBadge } from "./LevelBadge";
import { TopicTags } from "./TopicTags";
import { AcademicLabel } from "./AcademicLabel";
import { FamiliarityControls } from "./FamiliarityControls";
import { academicInfoFor, formatAcademicLabel } from "../lib/dict/academic";
import { LLMAnalysisSection } from "./LLMAnalysisSection";
import { useWordAnalysis } from "../lib/llm/useWordAnalysis";
import { useSentenceDeepAnalysis } from "../lib/llm/useSentenceDeepAnalysis";
import { findPhraseAt } from "../lib/dict/phraseLookup";
import { speak, canSpeak } from "../lib/tts";
import { uuid } from "../lib/blobStore";
import { MultilineText } from "./MultilineText";
import { presentGloss, useGlossScript } from "../lib/dict/gloss";
import { statusLabel } from "../data/familiarity";

interface Props {
  token: string | undefined;
  display?: string | undefined;
  sentence?: string | undefined;
  llmEnabled: boolean;
  activeBookId?: string | undefined;
  activePageNo?: number | undefined;
  onOpenSettings?: (() => void) | undefined;
}

export function InspectorPanel({
  token, display, sentence, llmEnabled, activeBookId, activePageNo, onOpenSettings,
}: Props) {
  const [state, setState] = useState<WordState | undefined>(undefined);
  const [dict, setDict] = useState<DictEntry | undefined>(undefined);
  const [noteDraft, setNoteDraft] = useState<string>("");
  const [phraseSaved, setPhraseSaved] = useState<string | null>(null);
  const repoVersion = useRepoVersion();
  const ecdict = useEcdictStatus();
  const analysis = useWordAnalysis(
    llmEnabled ? token ?? null : null,
    llmEnabled ? sentence ?? null : null,
    llmEnabled,
  );
  const sentenceDeep = useSentenceDeepAnalysis(
    sentence ?? null,
    llmEnabled,
  );
  const phraseHit = findPhraseAt(sentence, token);
  const glossScript = useGlossScript();

  useEffect(() => {
    if (!token) {
      setState(undefined);
      setDict(undefined);
      setNoteDraft("");
      return;
    }
    let cancelled = false;
    const repo = getRepo();
    Promise.all([
      repo.getWordState(token),
      repo.lookupDict(token),
    ]).then(([s, d]) => {
      if (cancelled) return;
      setState(s);
      setDict(d);
      setNoteDraft(s?.note ?? "");
    });
    return () => { cancelled = true; };
  }, [token, repoVersion]);

  useEffect(() => { setPhraseSaved(null); }, [phraseHit?.matchedText]);

  if (!token) {
    return (
      <div className="p-4 text-sm text-slate-400 dark:text-slate-500 leading-relaxed">
        Click a word in the reader to see its definition, sentence context, and
        familiarity controls here.
        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <div className="font-semibold text-slate-600 dark:text-slate-300">鍵盤</div>
          <div><kbd className="kbd">U</kbd> 不認識（學習中）</div>
          <div><kbd className="kbd">5</kbd> / <kbd className="kbd">K</kbd> 認識</div>
          <div><kbd className="kbd">0</kbd> / <kbd className="kbd">X</kbd> 忽略</div>
          <div><kbd className="kbd">PgUp</kbd>/<kbd className="kbd">PgDn</kbd> 翻頁</div>
          <div><kbd className="kbd">Esc</kbd> 關閉浮窗</div>
        </div>
      </div>
    );
  }

  const hasAnyDictField = !!(dict?.translation || dict?.definition || (dict?.pos && dict.pos.length) || dict?.cefr);
  const levelLabel = statusLabel(state?.level);

  const savePhrase = async () => {
    if (!phraseHit || !sentence) return;
    const p: PhraseBookmark = {
      id: uuid(),
      bookId: activeBookId ?? "",
      pageNo: activePageNo ?? 0,
      text: phraseHit.matchedText,
      sentence,
      tags: phraseHit.entry.tags ?? [],
      createdAt: Date.now(),
    };
    await getRepo().addPhrase(p);
    setPhraseSaved(phraseHit.matchedText);
  };

  const persistNote = () => {
    if (!token) return;
    const cur = state?.note ?? "";
    if (noteDraft === cur) return;
    void getRepo().setWordNote(token, noteDraft);
  };

  return (
    <div className="p-4 space-y-4">
      <section>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Selected</div>
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          <div className="text-xl font-reader">{token}</div>
          {canSpeak() && (
            <button
              onClick={() => speak(token)}
              className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
              title="發音"
              aria-label="speak"
            >
              {"\u{1F50A}"}
            </button>
          )}
          {dict?.phonetic && (
            <div className="text-sm text-slate-500 dark:text-slate-400">/{dict.phonetic}/</div>
          )}
          {formatAcademicLabel(academicInfoFor(token, dict))
            ? <AcademicLabel surface={token} dict={dict} />
            : dict?.cefr && dict.cefr !== "unknown" && <LevelBadge level={dict.cefr} />}
          <span className="px-1.5 py-0.5 text-[10px] rounded font-semibold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {levelLabel}
          </span>
        </div>
        {dict?.pos && dict.pos.length > 0 && (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">{dict.pos.join(", ")}</div>
        )}
      </section>

      {phraseHit && (
        <section className="panel border-indigo-200 dark:border-indigo-800">
          <div className="panel-header bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
            <span>片語 · {phraseHit.matchedText}</span>
            <button
              onClick={savePhrase}
              disabled={phraseSaved === phraseHit.matchedText}
              className="text-[10px] font-normal normal-case tracking-normal px-1.5 py-0.5 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
              title="收藏這組片語"
            >
              {phraseSaved === phraseHit.matchedText ? "✓ 已收藏" : "+ 收藏"}
            </button>
          </div>
          <div className="p-3 text-sm space-y-1.5">
            <div className="text-slate-800 dark:text-slate-100 font-medium">{phraseHit.entry.translation}</div>
            {phraseHit.entry.note && (
              <div className="text-xs text-slate-500 dark:text-slate-400 italic">{phraseHit.entry.note}</div>
            )}
            {phraseHit.entry.tags && phraseHit.entry.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap pt-0.5">
                {phraseHit.entry.tags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">{tag}</span>
                ))}
              </div>
            )}
            <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">點擊了「{token}」— 此詞在上面的片語中</div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">Dictionary · 離線詞庫</div>
        <div className="p-3 text-sm space-y-2">
          {!llmEnabled && onOpenSettings && (
            <button type="button" onClick={onOpenSettings} className="text-left text-xs text-sky-700 dark:text-sky-300 underline">
              還沒有 AI key。到設定加入後，才能看這個字在這句裡的意思。
            </button>
          )}
          {dict?.translation && (
            <MultilineText text={presentGloss(dict.translation, glossScript) ?? ""} className="text-slate-800 dark:text-slate-100" />
          )}
          {dict?.definition && (
            <MultilineText text={presentGloss(dict.definition, glossScript) ?? ""} className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed italic" />
          )}
          {!hasAnyDictField && ecdict.status === "loading" && (
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 italic text-xs">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-500" />
              <span>離線詞典載入中（首次約 3-5 秒）…</span>
            </div>
          )}
          {!hasAnyDictField && ecdict.status === "ready" && !llmEnabled && (
            <div className="text-slate-400 dark:text-slate-500 italic">此詞未在離線詞典（{ecdict.size.toLocaleString()} 條）中。可到設定啟用 LLM 做即時英英解釋。</div>
          )}
          {!hasAnyDictField && ecdict.status === "ready" && llmEnabled && (
            <div className="text-slate-400 dark:text-slate-500 italic">此詞未在離線詞典；下方 LLM 分析會補上。</div>
          )}
          {!hasAnyDictField && ecdict.status === "error" && (
            <div className="text-slate-400 dark:text-slate-500 italic">離線詞典載入失敗。{llmEnabled ? "下方 LLM 分析會補上。" : "到設定啟用 LLM。"}</div>
          )}
          {dict?.tags && dict.tags.length > 0 && (
            <div className="pt-1"><TopicTags tags={dict.tags} /></div>
          )}
        </div>
      </section>

      {llmEnabled && (
        <section className="panel">
          <div className="panel-header">LLM 深度分析</div>
          <div className="p-3 text-sm"><LLMAnalysisSection state={analysis} /></div>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">句法分析</div>
        <div className="p-3 text-sm">
          {sentence && display ? (
            <SentenceAnalysis sentence={sentence} target={display} />
          ) : (
            <div className="text-slate-400 dark:text-slate-500 italic text-xs">點擊單詞查看句中詞性與結構角色。</div>
          )}
        </div>
      </section>

      {llmEnabled && sentence && (
        <section className="panel">
          <div className="panel-header flex items-center justify-between">
            <span>LLM 深度解句</span>
            {sentenceDeep.state.status === "success" && (
              <button
                onClick={sentenceDeep.reset}
                className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-normal normal-case tracking-normal"
                title="清除目前結果，可重新分析"
              >
                清除
              </button>
            )}
          </div>
          <div className="p-3 text-sm">
            {sentenceDeep.state.status === "idle" && (
              <div className="space-y-1.5">
                <div className="text-xs text-slate-500 dark:text-slate-400 leading-snug">讓 LLM 拆解此句的主幹、子句、可盜用句式與搭配。</div>
                <button
                  onClick={sentenceDeep.analyze}
                  className="w-full px-3 py-1.5 text-xs rounded border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                >
                  深度解析此句<span className="ml-1 text-[10px] opacity-60">約 3-6 秒</span>
                </button>
              </div>
            )}
            {sentenceDeep.state.status !== "idle" && (<SentenceDeepAnalysis state={sentenceDeep.state} />)}
            {sentenceDeep.state.status === "error" && (
              <button
                onClick={sentenceDeep.analyze}
                className="mt-2 w-full px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                重試
              </button>
            )}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>Familiarity</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal normal-case tracking-normal">keys K / U</span>
        </div>
        <div className="p-3">
          <FamiliarityControls level={state?.level} onChange={(level) => { void getRepo().setWordLevel(token, level); }} />
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {state ? (
              <>seen {state.reviewCount}× · last {new Date(state.lastSeenAt).toLocaleString()}
              {state.fsrsDueAt && state.level < 5 && (<> · 下次複習 {new Date(state.fsrsDueAt).toLocaleString()}</>)}</>
            ) : ("尚未標記")}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">筆記</div>
        <div className="p-3">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={persistNote}
            placeholder="深化此詞的理解…例句、同義詞、記憶點…（離開輸入框自動儲存）"
            rows={3}
            className="w-full text-xs px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:focus:ring-sky-600 resize-y"
          />
          {state?.note && noteDraft !== state.note && (
            <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 italic">尚未儲存 · 離開框自動存</div>
          )}
        </div>
      </section>
    </div>
  );
}

