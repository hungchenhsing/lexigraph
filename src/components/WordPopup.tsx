/**
 * Floating word card.
 */
import { createPortal } from "react-dom";
import type { DictEntry, FamiliarityLevel, PageToken, WordState } from "../data/types";
import { SentenceAnalysis } from "./SentenceAnalysis";
import { LevelBadge } from "./LevelBadge";
import { TopicTags } from "./TopicTags";
import { LLMAnalysisSection } from "./LLMAnalysisSection";
import { AcademicLabel } from "./AcademicLabel";
import { FamiliarityControls } from "./FamiliarityControls";
import { academicInfoFor, formatAcademicLabel } from "../lib/dict/academic";
import { useWordAnalysis } from "../lib/llm/useWordAnalysis";
import { useEcdictStatus } from "../data/useRepo";
import { findPhraseAt } from "../lib/dict/phraseLookup";
import { speak, canSpeak } from "../lib/tts";
import { presentGloss, useGlossScript } from "../lib/dict/gloss";
import { statusLabel } from "../data/familiarity";
import { MultilineText } from "./MultilineText";

interface Props {
  token: PageToken;
  normalized: string;
  dict: DictEntry | undefined;
  state: WordState | undefined;
  sentence: string | undefined;
  pageWidth: number;
  pageHeight: number;
  llmEnabled: boolean;
  onLevelChange: (level: FamiliarityLevel) => void;
  onDismiss: () => void;
  onOpenSettings?: (() => void) | undefined;
}

const POPUP_WIDTH = 680;

const POPUP_HEIGHT_EST = 380;

export function WordPopup({
  token, normalized, dict, state, sentence,
  pageWidth, pageHeight, llmEnabled, onLevelChange, onDismiss, onOpenSettings,
}: Props) {
  const analysis = useWordAnalysis(
    llmEnabled ? normalized : null,
    llmEnabled ? sentence ?? null : null,
    llmEnabled,
  );
  const ecdict = useEcdictStatus();
  const hasAnyDictField = !!(
    dict?.translation || dict?.definition || (dict?.pos && dict.pos.length) || dict?.cefr
  );
  const phraseHit = findPhraseAt(sentence, normalized);
  const spaceBelow = pageHeight - (token.y + token.h);
  const showAbove = spaceBelow < POPUP_HEIGHT_EST && token.y > POPUP_HEIGHT_EST;
  const top = showAbove ? Math.max(8, token.y - POPUP_HEIGHT_EST - 6) : token.y + token.h + 6;

  const rawLeft = token.x + token.w / 2 - POPUP_WIDTH / 2;
  const left = Math.max(8, Math.min(pageWidth - POPUP_WIDTH - 8, rawLeft));

  const glossScript = useGlossScript();
  const translation = presentGloss(dict?.translation, glossScript);
  const definition = presentGloss(dict?.definition, glossScript);
  const bodyText = translation ?? definition ?? null;
  const sheet = pageWidth < 720;

  const card = (
    <div
      role="dialog"
      aria-label={`Word card for ${normalized}`}
      onClick={(e) => e.stopPropagation()}
      className={
        sheet
          ? "fixed left-0 right-0 bottom-0 z-[80] box-border max-w-[100vw] overflow-x-hidden overflow-y-auto rounded-t-xl border-t bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-2xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm break-words text-slate-800 dark:text-slate-100"
          : "absolute z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3 text-sm text-slate-800 dark:text-slate-100"
      }
      style={sheet
        ? { maxHeight: "min(70dvh, calc(100dvh - 7.5rem))" }
        : { left, top, width: Math.min(POPUP_WIDTH, pageWidth - 16) }}
    >
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-base font-semibold leading-none">{normalized}</span>
        {canSpeak() && (
          <button
            onClick={() => speak(normalized)}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 leading-none"
            title="發音"
            aria-label="speak"
          >
            {"\u{1F50A}"}
          </button>
        )}
        {dict?.phonetic && (
          <span className="text-xs text-slate-500 dark:text-slate-400">/{dict.phonetic}/</span>
        )}
        {formatAcademicLabel(academicInfoFor(normalized, dict))
          ? <AcademicLabel surface={normalized} dict={dict} small />
          : dict?.cefr && dict.cefr !== "unknown" && <LevelBadge level={dict.cefr} small />}
        <button
          className="ml-auto text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-base leading-none"
          onClick={onDismiss}
          aria-label="Close"
          title="Close (Esc)"
        >
          {"×"}
        </button>
      </div>

      {dict?.pos && dict.pos.length > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400 italic mb-1">{dict.pos.join(", ")}</div>
      )}

      {phraseHit && (
        <div className="mb-2 rounded border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1.5">
          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider mb-0.5">
            片語 · {phraseHit.matchedText}
          </div>
          <div className="text-sm text-slate-800 dark:text-slate-100 leading-snug">
            {phraseHit.entry.translation}
          </div>
          {phraseHit.entry.note && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-0.5">
              {phraseHit.entry.note}
            </div>
          )}
        </div>
      )}

      {bodyText && (
        <MultilineText text={bodyText} className="text-slate-800 dark:text-slate-100 mb-1 leading-snug break-words" />
      )}
      {!llmEnabled && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mb-2 text-left text-xs text-sky-700 dark:text-sky-300 underline"
        >
          還沒有 AI key。到設定加入 Gemini 或 Groq，才能看這個字在這句裡的意思。
        </button>
      )}
      {definition && definition !== bodyText && (
        <div className="mb-2">
          <MultilineText text={definition} className="text-xs text-slate-600 dark:text-slate-300 leading-snug italic break-words" />
        </div>
      )}

      {!hasAnyDictField && ecdict.status === "loading" && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 italic mb-2">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-500" />
          <span>離線詞典載入中…</span>
        </div>
      )}
      {!hasAnyDictField && ecdict.status === "ready" && (
        <div className="text-xs text-slate-400 dark:text-slate-500 italic mb-2">
          {llmEnabled
            ? "未在離線詞典；下方 LLM 分析會補上。"
            : `未在離線詞典（${ecdict.size.toLocaleString()} 條）中。可到設定啟用 LLM。`}
        </div>
      )}
      {!hasAnyDictField && ecdict.status === "error" && (
        <div className="text-xs text-slate-400 dark:text-slate-500 italic mb-2">
          離線詞典載入失敗。{llmEnabled ? "下方 LLM 補上。" : "可到設定啟用 LLM。"}
        </div>
      )}

      {dict?.tags && dict.tags.length > 0 && (
        <div className="mb-2">
          <TopicTags tags={dict.tags.slice(0, 4)} small />
        </div>
      )}

      {llmEnabled && analysis.status !== "idle" && (
        <div className="mb-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold mb-1">
            LLM 深度分析
          </div>
          <LLMAnalysisSection state={analysis} compact />
        </div>
      )}

      {sentence && (
        <div className="mb-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold mb-1">
            句法分析
          </div>
          <SentenceAnalysis sentence={sentence} target={token.text} compact />
        </div>
      )}

      <div className="pt-1 border-t border-slate-100 dark:border-slate-700">
        <FamiliarityControls level={state?.level} onChange={onLevelChange} />
      </div>
      <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 tracking-wide">
        {state
          ? `seen ${state.reviewCount}× · ${statusLabel(state.level)}`
          : "尚未標記"}
      </div>
    </div>
  );
  if (sheet && typeof document !== "undefined") return createPortal(card, document.body);
  return card;
}
