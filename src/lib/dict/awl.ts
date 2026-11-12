/**
 * Coxhead Academic Word List: 570 headword families and their family members.
 *
 * The machine-readable families are CC0, from
 * https://github.com/lpmi-13/machine_readable_wordlists (Academic/AWL/AWL.json),
 * which transcribes Averil Coxhead's list (Victoria University of Wellington;
 * Coxhead, A. (2000). A new academic word list. TESOL Quarterly, 34(2), 213–238).
 *
 * `optimise` / `optimize` is not one of those 570 families. It is added here
 * because academic CS papers use it and the reader asked for that family.
 */
import families from "./awl-coxhead.json";
import { inflectionLemma } from "./inflection";

export interface AwlHit {
  head: string;
  sublist: number;
}

const byWord = new Map<string, AwlHit>();

function add(word: string, hit: AwlHit) {
  const key = word.toLowerCase();
  if (!key || byWord.has(key)) return;
  byWord.set(key, hit);
}

const raw = families as Record<string, Record<string, { subwords?: string[] | null }>>;
for (const [sublistName, group] of Object.entries(raw)) {
  const sublist = Number(sublistName.replace("sublist_", ""));
  for (const [head, body] of Object.entries(group)) {
    const hit: AwlHit = { head, sublist };
    add(head, hit);
    for (const member of body.subwords ?? []) add(member, hit);
  }
}

const OPTIMISE: AwlHit = { head: "optimise", sublist: 0 };
for (const word of [
  "optimise", "optimised", "optimises", "optimising", "optimisation", "optimisations",
  "optimize", "optimized", "optimizes", "optimizing", "optimization", "optimizations",
  "optimizer", "optimiser", "optimizers", "optimisers",
]) add(word, OPTIMISE);

export const AWL_FAMILY_COUNT = 570;

export function lookupAwl(surface: string): AwlHit | undefined {
  const word = surface.toLowerCase().trim();
  if (!word) return undefined;
  return byWord.get(word) ?? byWord.get(inflectionLemma(word));
}

export function awlWordCount(): number {
  return byWord.size;
}
