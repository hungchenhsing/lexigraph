/**
 * Phone reading column. The fitted PDF page is about 62% and the glyphs
 * are too small; this lays the same tokens out at a body size, full width,
 * with one span per word so taps stay on the word that was clicked.
 */
import type { FamiliarityLevel, PageToken } from "../data/types";
import { familiarityTint } from "../lib/pdf/wordColor";
import { buildReflowPieces } from "./reflowPieces";

interface Props {
  tokens: PageToken[];
  fullText: string;
  selectedIdx: number | undefined;
  fontPx: number;
  levelFor: (normalized: string) => FamiliarityLevel | undefined;
  onSelect: (index: number) => void;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function reflowWordClass(level: FamiliarityLevel | undefined, selected: boolean): string {
  return familiarityTint(level, selected);
}

function PageTurn({
  canPrev, canNext, onPrev, onNext,
}: Pick<Props, "canPrev" | "canNext" | "onPrev" | "onNext">) {
  const btn = "px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 disabled:opacity-40";
  // mousedown preventDefault keeps the button from taking focus, so the
  // browser does not scroll the focused control back into view after the turn.
  const noFocus = (event: { preventDefault: () => void }) => event.preventDefault();
  return (
    <div className="flex justify-between gap-3">
      <button type="button" className={btn} disabled={!canPrev} onMouseDown={noFocus} onClick={onPrev}>上一頁</button>
      <button type="button" className={btn} disabled={!canNext} onMouseDown={noFocus} onClick={onNext}>下一頁</button>
    </div>
  );
}

export function ReflowPage({
  tokens, fullText, selectedIdx, fontPx, levelFor, onSelect, canPrev, canNext, onPrev, onNext,
}: Props) {
  const pieces = buildReflowPieces(tokens, fullText);

  return (
    <div
      className="mx-auto max-w-full px-4 py-5 text-slate-900 dark:text-slate-100"
      style={{ fontSize: fontPx, lineHeight: 1.65 }}
    >
      <PageTurn canPrev={canPrev} canNext={canNext} onPrev={onPrev} onNext={onNext} />
      <div className="mt-4">
      {pieces.map((piece) => {
        const breaks = piece.text.split(/(\n+)/);
        return breaks.map((part, i) => {
          if (part === "") return null;
          if (/^\n+$/.test(part)) {
            const count = part.length >= 2 ? 2 : 1;
            return Array.from({ length: count }, (_, n) => <br key={`${piece.key}-br-${i}-${n}`} />);
          }
          if (piece.index === undefined) {
            return <span key={`${piece.key}-${i}`}>{part}</span>;
          }
          const token = tokens[piece.index];
          const selected = piece.indexes?.includes(selectedIdx ?? -1) ?? piece.index === selectedIdx;
          const level = token?.cls === "word" ? levelFor(token.normalized) : undefined;
          return (
            <button
              key={`${piece.key}-${i}`}
              type="button"
              data-char={piece.charStart ?? token?.charStart ?? ""}
              data-char-end={piece.charEnd ?? token?.charEnd ?? ""}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(piece.index!);
              }}
              className={`inline rounded-sm px-0.5 text-left ${reflowWordClass(level, selected)}`}
            >
              {part}
            </button>
          );
        });
      })}
      </div>
      <div className="mt-8 mb-4">
        <PageTurn canPrev={canPrev} canNext={canNext} onPrev={onPrev} onNext={onNext} />
      </div>
    </div>
  );
}
