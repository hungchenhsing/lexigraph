/**
 * Inflection lemma used as the shared word-state key.
 *
 * study / studies / studied / studying collapse to one state. Derivational
 * suffixes (-ly, -tion, -ness, -ment) are left alone so "happiness" does not
 * inherit the state of "happy".
 *
 * The result is deterministic and does not consult the dictionary, so the
 * migration can run offline and stay idempotent.
 */

const IRREGULAR: Record<string, string> = {
  was: "be", were: "be", been: "be", being: "be", am: "be", is: "be", are: "be",
  had: "have", has: "have", having: "have",
  did: "do", done: "do", doing: "do", does: "do",
  said: "say", saying: "say", says: "say",
  went: "go", gone: "go", going: "go", goes: "go",
  took: "take", taken: "take", taking: "take", takes: "take",
  came: "come", coming: "come", comes: "come",
  saw: "see", seen: "see", seeing: "see", sees: "see",
  made: "make", making: "make", makes: "make",
  got: "get", gotten: "get", getting: "get", gets: "get",
  knew: "know", known: "know", knowing: "know", knows: "know",
  thought: "think", thinking: "think", thinks: "think",
  gave: "give", given: "give", giving: "give", gives: "give",
  found: "find", finding: "find", finds: "find",
  told: "tell", telling: "tell", tells: "tell",
  felt: "feel", feeling: "feel", feels: "feel",
  left: "leave", leaving: "leave", leaves: "leave",
  brought: "bring", bringing: "bring", brings: "bring",
  ran: "run", running: "run", runs: "run",
  wrote: "write", written: "write", writing: "write", writes: "write",
  spoke: "speak", spoken: "speak", speaking: "speak", speaks: "speak",
  led: "lead", leading: "lead", leads: "lead",
  built: "build", building: "build", builds: "build",
  paid: "pay", paying: "pay", pays: "pay",
  met: "meet", meeting: "meet", meets: "meet",
  held: "hold", holding: "hold", holds: "hold",
  bought: "buy", buying: "buy", buys: "buy",
  sold: "sell", selling: "sell", sells: "sell",
  sent: "send", sending: "send", sends: "send",
  spent: "spend", spending: "spend", spends: "spend",
  kept: "keep", keeping: "keep", keeps: "keep",
  stood: "stand", standing: "stand", stands: "stand",
  sat: "sit", sitting: "sit", sits: "sit",
  lost: "lose", losing: "lose", loses: "lose",
  chose: "choose", chosen: "choose", choosing: "choose", chooses: "choose",
  drew: "draw", drawn: "draw", drawing: "draw", draws: "draw",
  grew: "grow", grown: "grow", growing: "grow", grows: "grow",
  heard: "hear", hearing: "hear", hears: "hear",
  ate: "eat", eaten: "eat", eating: "eat", eats: "eat",
  won: "win", winning: "win", wins: "win",
  broke: "break", broken: "break", breaking: "break", breaks: "break",
  drove: "drive", driven: "drive", driving: "drive", drives: "drive",
  rose: "rise", risen: "rise", rising: "rise", rises: "rise",
  fell: "fall", fallen: "fall", falling: "fall", falls: "fall",
  caught: "catch", catching: "catch", catches: "catch",
  taught: "teach", teaching: "teach", teaches: "teach",
  began: "begin", begun: "begin", beginning: "begin", begins: "begin",
  showed: "show", shown: "show", showing: "show", shows: "show",
  men: "man", women: "woman", children: "child",
  feet: "foot", teeth: "tooth", mice: "mouse", geese: "goose",
  phenomena: "phenomenon", criteria: "criterion",
  indices: "index", matrices: "matrix", vertices: "vertex",
  axes: "axis", analyses: "analysis", hypotheses: "hypothesis",
  theses: "thesis", bases: "basis", crises: "crisis",
  diagnoses: "diagnosis", formulae: "formula",
  appendices: "appendix", syllabi: "syllabus", corpora: "corpus",
};

/** Surface forms that look inflected but are their own lemma. */
const KEEP = new Set([
  "this", "thus", "plus", "his", "its", "news", "series", "species",
  "during", "morning", "evening", "nothing", "something", "anything", "everything",
  "analysis", "basis", "crisis", "thesis", "hypothesis", "diagnosis",
]);

const E_RESTORE = /(?:at|iv|iz|ut|od|ak|os)$/;

function isConsonant(c: string | undefined): boolean {
  return !!c && /[bcdfghjklmnpqrstvwxyz]/.test(c);
}

function undouble(base: string): string {
  if (base.length < 3) return base;
  const last = base[base.length - 1]!;
  const prev = base[base.length - 2]!;
  const before = base[base.length - 3]!;
  // "processing" ends in ss that belongs to "process", not a doubled consonant.
  if (last === "s") return base;
  if (last === prev && isConsonant(last) && /[aeiou]/.test(before)) {
    return base.slice(0, -1);
  }
  return base;
}

function restoreSilentE(base: string): string {
  if (E_RESTORE.test(base) && base.length >= 4) return base + "e";
  // require / acquire: "required" → requir, not "requir".
  if (/[^aeiou]uir$/.test(base) && base.length >= 5) return base + "e";
  if (base.length <= 2 && isConsonant(base[base.length - 1])) return base + "e";
  return base;
}

/**
 * Canonical lemma for a normalized (already lowercased) or raw surface form.
 * Idempotent: inflectionLemma(inflectionLemma(w)) === inflectionLemma(w).
 */
export function inflectionLemma(raw: string): string {
  const w = raw
    .toLowerCase()
    .trim()
    .replace(/^[.,;:!?)("'\-]+|[.,;:!?)("'\-]+$/g, "");
  if (!w) return w;
  if (KEEP.has(w)) return w;
  const irregular = IRREGULAR[w];
  if (irregular) return irregular;
  if (w.length < 4) return w;

  if (w.endsWith("ies") && w.length > 4 && isConsonant(w[w.length - 4])) {
    return w.slice(0, -3) + "y";
  }
  if (w.endsWith("ied") && w.length > 4 && isConsonant(w[w.length - 4])) {
    return w.slice(0, -3) + "y";
  }
  if (w.endsWith("ying") && w.length > 5) {
    return w.slice(0, -4) + "y";
  }
  if (w.endsWith("ing") && w.length > 5) {
    return restoreSilentE(undouble(w.slice(0, -3)));
  }
  if (w.endsWith("ed") && w.length > 4 && !w.endsWith("eed")) {
    return restoreSilentE(undouble(w.slice(0, -2)));
  }
  if (/(?:s|x|z|ch|sh)es$/.test(w) && w.length > 4) {
    return w.slice(0, -2);
  }
  if (w.endsWith("s") && !/(?:ss|us|is)$/.test(w) && w.length > 3) {
    return w.slice(0, -1);
  }
  return w;
}

/** State key. Empty input stays empty so callers can skip it. */
export function wordKey(surface: string): string {
  return inflectionLemma(surface);
}
