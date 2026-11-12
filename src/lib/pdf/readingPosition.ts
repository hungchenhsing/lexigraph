/**
 * Where to put the reader after a scroll or a PDF ↔ 可讀 switch.
 *
 * On a phone the fitted PDF page is often entirely inside the viewport, so
 * the word nearest scrollTop is the first word on the page. That is not a
 * new reading position. Keep the place captured from reflow.
 */

export interface ReadingAnchor {
  pageNo: number;
  charStart: number;
}

export function pdfScrollHasRange(scrollHeight: number, clientHeight: number): boolean {
  if (!(scrollHeight > 0) || !(clientHeight > 0)) return false;
  return scrollHeight - clientHeight >= 24;
}

/**
 * First word at or below the top of the scrollport.
 * A word already above that edge has been read; it is not the anchor.
 */
export function wordCharAtScrollTop(
  tokens: ReadonlyArray<{ cls: string; y: number; h: number; charStart: number }>,
  scrollTop: number,
): number | null {
  let chosen: { y: number; charStart: number } | null = null;
  let last: { y: number; charStart: number } | null = null;
  const edge = scrollTop + 1;
  for (const token of tokens) {
    if (token.cls !== "word" || token.charStart < 0) continue;
    if (!last || token.y > last.y || (token.y === last.y && token.charStart > last.charStart)) {
      last = { y: token.y, charStart: token.charStart };
    }
    if (token.y + Math.max(token.h, 1) < edge) continue;
    if (!chosen || token.y < chosen.y || (token.y === chosen.y && token.charStart < chosen.charStart)) {
      chosen = { y: token.y, charStart: token.charStart };
    }
  }
  return (chosen ?? last)?.charStart ?? null;
}

export function nextAnchorAfterScroll(input: {
  previous: ReadingAnchor | null;
  source: "reflow" | "pdf";
  captured: ReadingAnchor | null;
  scrollHeight: number;
  clientHeight: number;
}): ReadingAnchor | null {
  if (input.source === "pdf" && !pdfScrollHasRange(input.scrollHeight, input.clientHeight)) {
    return input.previous;
  }
  return input.captured ?? input.previous;
}
