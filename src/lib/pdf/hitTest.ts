/**
 * Pick the word under a tap. Overlapping boxes resolve to the nearest
 * center, so a 13px line does not steal the click from the line above.
 */

export interface HitBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cls: string;
}

export function nearestWordIndex(
  tokens: HitBox[],
  x: number,
  y: number,
  maxDist = 20,
): number | undefined {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.cls !== "word" || token.w <= 0 || token.h <= 0) continue;
    const dx = Math.max(token.x - x, 0, x - (token.x + token.w));
    const dy = Math.max(token.y - y, 0, y - (token.y + token.h));
    const outside = Math.hypot(dx, dy);
    if (outside > maxDist) continue;
    const cx = token.x + token.w / 2;
    const cy = token.y + token.h / 2;
    // Inside any box: rank by distance to that word's center.
    const score = outside === 0 ? Math.hypot(cx - x, cy - y) : 1000 + outside;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best >= 0 ? best : undefined;
}
