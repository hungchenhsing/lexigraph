/**
 * Line-end hyphens are not all soft hyphens.
 *
 * "transduc-" + "tion" is one word. "English-" + "to-German" and
 * "34-" + "layer" keep the hyphen. Dropping every trailing hyphen
 * produced "Englishto-German" and "34layer".
 */

const FRAGMENT =
  /^(?:tion|sion|ment|ments|ness|ing|ed|ly|er|al|ive|tive|ous|ence|ance|tional|ational|ization|isation|ized|ised|able|ible|ally|ful|less|hood|ship|ward|wards|dients|tations|gence|mation|tailed|itive|plicative|terested|tant|tance|ients|izing|ising)$/i;

export function boundaryWords(prevLine: string, nextLine: string): { head: string; tail: string } {
  const head = prevLine.trim().match(/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)[-‐‑–]\s*$/)?.[1] ?? "";
  const tail = nextLine.trim().match(/^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/)?.[1] ?? "";
  return { head, tail };
}

export type WordHas = (word: string) => boolean;

/**
 * Drop a line-end hyphen when the joined form is a dictionary word, or when
 * either piece is not a word by itself (`com` + `prehensive`).
 * Keep it when both pieces are words and the join is not (`sequence-aligned`),
 * when the tail is already a compound (`to-German`), or when the head is a
 * number (`34-layer`).
 */
export function shouldDropLineHyphen(head: string, tail: string, has?: WordHas): boolean {
  if (!head || !tail) return false;
  if (/\d$/.test(head)) return false;
  if (tail.includes("-")) return false;
  const h = head.toLowerCase();
  const t = tail.toLowerCase();
  const joined = h + t;
  if (has) {
    if (has(joined)) return true;
    if (!has(h) || !has(t)) return true;
    return false;
  }
  if (FRAGMENT.test(tail)) return true;
  if (head.length <= 2 || tail.length <= 2) return true;
  return true;
}

export function joinHyphenated(head: string, tail: string, has?: WordHas): string {
  return shouldDropLineHyphen(head, tail, has) ? `${head}${tail}` : `${head}-${tail}`;
}

/** Previous page ended in `carry-` and this page starts with `nextLine`. */
export function applyCarry(
  carry: string,
  nextLine: string,
  has?: WordHas,
): { text: string; drop: boolean } | null {
  const trimmed = nextLine.replace(/^\s+/, "");
  const tail = trimmed.match(/^([A-Za-z]+)/)?.[1] ?? "";
  if (!carry || !/^[a-z]/.test(tail)) return null;
  const drop = shouldDropLineHyphen(carry, tail, has);
  const word = drop ? carry + tail : `${carry}-${tail}`;
  return { text: word + trimmed.slice(tail.length), drop };
}
