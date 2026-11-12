/**
 * Horizontal ink of a page, ignoring the rotated margin stamp.
 * Fitting this span (instead of the full media box) makes phone text
 * larger without a horizontal scrollbar.
 */

export interface InkItem {
  text: string;
  x: number;
  width: number;
  angle?: number | undefined;
}

export interface ContentSpan {
  minX: number;
  width: number;
}

export function contentSpan(items: InkItem[], pageWidth: number): ContentSpan {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (Math.abs(item.angle ?? 0) > 12) continue;
    if (!item.text.trim() || item.width < 6) continue;
    minX = Math.min(minX, item.x);
    maxX = Math.max(maxX, item.x + item.width);
  }
  const inkWidth = maxX - minX;
  // Too little ink, or already full-bleed: fit the whole page.
  if (!Number.isFinite(minX) || inkWidth < pageWidth * 0.45 || inkWidth > pageWidth * 0.9) {
    return { minX: 0, width: pageWidth };
  }
  const pad = 6;
  const left = Math.max(0, minX - pad);
  const right = Math.min(pageWidth, maxX + pad);
  return { minX: left, width: Math.max(1, right - left) };
}
