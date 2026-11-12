/**
 * Rule-based English lemmatizer — catches the common ~80% case so the built-in
 * dict can answer "computing" with the entry for "compute" without needing
 * separate entries for every derived form.
 *
 * This is intentionally simple. ECDICT (~800k entries) will subsume this in
 * a later round; until then, these rules buy us multiplicative coverage:
 * 1000 base forms × ~5 derivations ≈ 5000 effective lookups.
 *
 * Returns an array of candidates in priority order — caller should try each.
 * The original word should always be looked up first; this is the fallback.
 */

const IRREGULAR_VERBS: Record<string, string> = {
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
  read: "read", reading: "read", reads: "read",
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
  cut: "cut", cutting: "cut", cuts: "cut",
  put: "put", putting: "put", puts: "put",
  set: "set", setting: "set", sets: "set",
  let: "let", letting: "let", lets: "let",
  hit: "hit", hitting: "hit", hits: "hit",
  won: "win", winning: "win", wins: "win",
  broke: "break", broken: "break", breaking: "break", breaks: "break",
  drove: "drive", driven: "drive", driving: "drive", drives: "drive",
  rose: "rise", risen: "rise", rising: "rise", rises: "rise",
  arose: "arise", arisen: "arise", arising: "arise", arises: "arise",
  fell: "fall", fallen: "fall", falling: "fall", falls: "fall",
  caught: "catch", catching: "catch", catches: "catch",
  taught: "teach", teaching: "teach", teaches: "teach",
  bore: "bear", born: "bear", borne: "bear", bearing: "bear", bears: "bear",
  began: "begin", begun: "begin", beginning: "begin", begins: "begin",
  shown: "show", showed: "show", showing: "show", shows: "show",
  proven: "prove", proved: "prove", proving: "prove", proves: "prove",
};

const IRREGULAR_NOUN_PLURALS: Record<string, string> = {
  men: "man", women: "woman", children: "child", people: "person",
  feet: "foot", teeth: "tooth", mice: "mouse", geese: "goose",
  phenomena: "phenomenon", criteria: "criterion", data: "datum",
  indices: "index", matrices: "matrix", vertices: "vertex",
  axes: "axis", analyses: "analysis", hypotheses: "hypothesis",
  theses: "thesis", bases: "basis", crises: "crisis",
  diagnoses: "diagnosis", algae: "alga", formulae: "formula",
  appendices: "appendix", syllabi: "syllabus", corpora: "corpus",
};

const IRREGULAR_COMPARATIVES: Record<string, string> = {
  better: "good", best: "good", worse: "bad", worst: "bad",
  more: "many", most: "many", less: "little", least: "little",
  further: "far", farther: "far", furthest: "far", farthest: "far",
};

/**
 * Return lemma candidates (priority order) for a lowercased token.
 * The original word itself is NOT in the output — caller should have
 * already tried it before calling this.
 */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase();
  if (!w || w.length < 2) return [];

  const out: string[] = [];
  const seen = new Set<string>([w]);
  const push = (candidate: string) => {
    if (candidate && candidate.length >= 2 && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  };

  // 1. Hardcoded irregulars (highest priority)
  if (IRREGULAR_VERBS[w]) push(IRREGULAR_VERBS[w]);
  if (IRREGULAR_NOUN_PLURALS[w]) push(IRREGULAR_NOUN_PLURALS[w]);
  if (IRREGULAR_COMPARATIVES[w]) push(IRREGULAR_COMPARATIVES[w]);

  // 2. Regular verb/noun endings — simple morphological stripping.
  //    Order matters: try longer suffixes first.

  // "-ies" → "-y"  (studies → study, policies → policy)
  if (w.endsWith("ies") && w.length > 4) {
    push(w.slice(0, -3) + "y");
  }

  // "-ied" → "-y"  (studied → study)
  if (w.endsWith("ied") && w.length > 4) {
    push(w.slice(0, -3) + "y");
  }

  // "-ying" → "-y"  (studying → study) — rare, but covers e.g. "applying"
  if (w.endsWith("ying") && w.length > 5) {
    push(w.slice(0, -4) + "y");
  }

  // "-ing" → "" / "-e"  (running → run; computing → compute)
  if (w.endsWith("ing") && w.length > 5) {
    const base = w.slice(0, -3);
    push(base);           // run-ning?  No — that's covered below via double-letter rule
    push(base + "e");     // comput-ing → compute
    // Double consonant: running → run
    if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) {
      push(base.slice(0, -1));
    }
  }

  // "-ed" → "" / "-e"  (computed → compute; played → play)
  if (w.endsWith("ed") && w.length > 3) {
    const base = w.slice(0, -2);
    push(base);           // play-ed → play
    push(base + "e");     // comput-ed → compute
    // "-ied" already handled above
    if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) {
      push(base.slice(0, -1));  // planned → plan
    }
  }

  // "-es" → "" / "-is"  (analyses → analysis handled above; processes → process)
  if (w.endsWith("es") && w.length > 3) {
    push(w.slice(0, -2));   // process-es → process
    push(w.slice(0, -1));   // cases → case (leaves trailing 'e' from base)
  }

  // "-s" → "" (plural nouns / 3sg verbs)
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && w.length > 2) {
    push(w.slice(0, -1));
  }

  // "-er" / "-est" (comparatives)
  if (w.endsWith("er") && w.length > 3) {
    push(w.slice(0, -2));          // fast-er → fast
    push(w.slice(0, -1));          // larg-er → large
  }
  if (w.endsWith("est") && w.length > 4) {
    push(w.slice(0, -3));
    push(w.slice(0, -2));
  }

  // "-ly" → "" (adverb → adjective)
  if (w.endsWith("ly") && w.length > 3) {
    push(w.slice(0, -2));          // quick-ly → quick
    // "-ily" → "-y"  (happily → happy)
    if (w.endsWith("ily") && w.length > 4) {
      push(w.slice(0, -3) + "y");
    }
  }

  // "-tion" / "-sion" → "-t" / "-s" / "-e" / "" (derivation → derive)
  if (w.endsWith("tion") && w.length > 5) {
    const base = w.slice(0, -4);
    push(base);                    // predic-tion → predic ... not base form but try
    push(base + "e");              // deriva-tion → derivate?  meh
    push(base + "t");              // creat-ion → creat?  meh
    push(base.slice(0, -1) + "e"); // definition → define
  }

  // "-ment" → "" (improvement → improve)
  if (w.endsWith("ment") && w.length > 5) {
    push(w.slice(0, -4));
    push(w.slice(0, -4) + "e");
  }

  // "-ness" → "" (happiness → happy via -iness handled below)
  if (w.endsWith("ness") && w.length > 5) {
    push(w.slice(0, -4));
    // "-iness" → "-y"
    if (w.endsWith("iness") && w.length > 6) {
      push(w.slice(0, -5) + "y");
    }
  }

  // "-ity" → "-e" / "" (activity → active; quality → qual ... no, keep both)
  if (w.endsWith("ity") && w.length > 4) {
    push(w.slice(0, -3));
    push(w.slice(0, -3) + "e");
  }

  return out;
}
