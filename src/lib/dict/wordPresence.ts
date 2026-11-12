/**
 * Whether a surface is a dictionary word right now.
 * The seed and the Coxhead list are always available. ECDICT is included
 * once it has finished loading; until then an unknown string is not a word,
 * so a line-break fragment is joined rather than kept as a fake compound.
 */
import { getEcdictStatus, lookupEcdict } from "./ecdict";
import { DICT_SEED } from "./seed";
import { lookupAwl } from "./awl";

const seed = new Set(DICT_SEED.map((entry) => entry.word.toLowerCase()));

export function dictionaryHas(word: string): boolean {
  const key = word.toLowerCase();
  if (!key) return false;
  if (seed.has(key) || lookupAwl(key)) return true;
  if (getEcdictStatus() === "ready") return lookupEcdict(key) !== undefined;
  return false;
}
