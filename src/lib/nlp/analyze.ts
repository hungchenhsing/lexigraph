/**
 * Lightweight heuristic sentence analyzer — pure JS, no deps, no model download.
 *
 * Given a sentence and a target word, returns:
 *   - POS tagging for each token (rule-based: closed-class lookup + suffix rules)
 *   - Rough chunk labels: subject / verb / object / modifier / other
 *   - The target token's position and POS
 *
 * Limitations (intentional — this is the Round 6 離線 layer):
 *   - No real dependency parsing; chunk labels are heuristic.
 *   - POS accuracy ~85% on plain English, lower on academic jargon.
 *   - Doesn't handle complex clauses (subordinate, relative) well.
 *
 * A future round will replace this with wink-nlp or similar for accuracy,
 * and/or defer to the LLM gateway for deep syntactic role analysis.
 */

export type POS =
  | "noun" | "verb" | "adj" | "adv"
  | "pron" | "det" | "prep" | "conj"
  | "aux" | "modal" | "num" | "punct" | "other";

export type ChunkRole = "subject" | "verb" | "object" | "modifier" | "other";

export interface AnalyzedToken {
  text: string;
  lower: string;
  pos: POS;
  role: ChunkRole;
  /** 0-indexed position in the input sentence's token stream */
  index: number;
  /** Char offset in the original sentence */
  charStart: number;
  charEnd: number;
  /** True if this token matches the target word */
  isTarget: boolean;
}

export interface Analysis {
  tokens: AnalyzedToken[];
  targetIndex: number;   // -1 if not found
}

// ─── Closed-class word lists ────────────────────────────────────────────────

const PRONOUNS = new Set([
  "i","you","he","she","it","we","they","me","him","her","us","them",
  "my","your","his","its","our","their","mine","yours","hers","ours","theirs",
  "this","that","these","those","who","whom","whose","which","what",
  "myself","yourself","himself","herself","itself","ourselves","themselves",
]);

const DETERMINERS = new Set([
  "a","an","the","some","any","each","every","all","both","either","neither",
  "this","that","these","those","my","your","his","her","its","our","their",
  "no","another","other","such","enough","much","many","few","little","several",
]);

const PREPOSITIONS = new Set([
  "of","in","on","at","to","for","with","by","from","about","as","into",
  "through","over","under","above","below","between","among","against",
  "during","before","after","since","until","within","without","upon","onto",
  "toward","towards","beyond","behind","across","along","around","near","per","via",
]);

const CONJUNCTIONS = new Set([
  "and","or","but","nor","so","yet","for",
  "if","unless","although","though","while","because","when","whenever",
  "where","wherever","how","why","since","until","whereas","whether",
]);

const AUXILIARIES = new Set([
  "be","is","am","are","was","were","been","being",
  "have","has","had","having",
  "do","does","did","doing","done",
]);

const MODALS = new Set([
  "can","could","may","might","shall","should","will","would",
  "must","ought","need","dare","used",
]);

const COMMON_ADVERBS = new Set([
  "not","never","always","often","usually","sometimes","rarely","seldom",
  "here","there","now","then","today","tomorrow","yesterday","already","still","yet",
  "very","quite","rather","fairly","somewhat","slightly","highly","strongly",
  "however","therefore","thus","hence","moreover","furthermore","nevertheless",
  "nonetheless","accordingly","consequently","otherwise","indeed","instead",
  "perhaps","probably","possibly","certainly","definitely","actually","really",
  "truly","simply","merely","largely","mostly","mainly","primarily",
  "especially","particularly","specifically","generally","clearly","obviously",
  "apparently","evidently",
]);

// Common irregular verb forms worth knowing
const VERB_FORMS = new Set([
  "be","is","are","was","were","been","being","am",
  "have","has","had","having",
  "do","does","did","done","doing",
  "go","goes","went","gone","going",
  "say","says","said","saying",
  "get","gets","got","gotten","getting",
  "make","makes","made","making",
  "see","sees","saw","seen","seeing",
  "know","knows","knew","known","knowing",
  "take","takes","took","taken","taking",
  "come","comes","came","coming",
  "give","gives","gave","given","giving",
  "find","finds","found","finding",
  "think","thinks","thought","thinking",
  "show","shows","showed","shown","showing",
  "tell","tells","told","telling",
  "ask","asks","asked","asking",
  "seem","seems","seemed","seeming",
  "feel","feels","felt","feeling",
  "try","tries","tried","trying",
  "leave","leaves","left","leaving",
  "put","puts","putting",
  "keep","keeps","kept","keeping",
  "let","lets","letting",
  "begin","begins","began","begun","beginning",
  "bring","brings","brought","bringing",
  "run","runs","ran","running",
  "move","moves","moved","moving",
  "write","writes","wrote","written","writing",
  "sit","sits","sat","sitting",
  "stand","stands","stood","standing",
  "lose","loses","lost","losing",
  "hold","holds","held","holding",
  "consider","considers","considered","considering",
  "include","includes","included","including",
  "continue","continues","continued","continuing",
  "require","requires","required","requiring",
  "suggest","suggests","suggested","suggesting",
  "indicate","indicates","indicated","indicating",
  "imply","implies","implied","implying",
  "argue","argues","argued","arguing",
  "claim","claims","claimed","claiming",
  "propose","proposes","proposed","proposing",
  "observe","observes","observed","observing",
  "examine","examines","examined","examining",
  "investigate","investigates","investigated","investigating",
  "assume","assumes","assumed","assuming",
  "prove","proves","proved","proven","proving",
  "demonstrate","demonstrates","demonstrated","demonstrating",
  "establish","establishes","established","establishing",
  "construct","constructs","constructed","constructing",
  "analyze","analyzes","analyzed","analyzing",
  "evaluate","evaluates","evaluated","evaluating",
  "measure","measures","measured","measuring",
  "compute","computes","computed","computing",
  "derive","derives","derived","deriving",
  "describe","describes","described","describing",
  "define","defines","defined","defining",
  "reveal","reveals","revealed","revealing",
  "reflect","reflects","reflected","reflecting",
  "affect","affects","affected","affecting",
  "cause","causes","caused","causing",
  "relate","relates","related","relating",
  "depend","depends","depended","depending",
  "differ","differs","differed","differing",
  "vary","varies","varied","varying",
  "compare","compares","compared","comparing",
  "contrast","contrasts","contrasted","contrasting",
  "represent","represents","represented","representing",
  "identify","identifies","identified","identifying",
]);

// ─── POS suffix heuristics ──────────────────────────────────────────────────

function posFromSuffix(w: string): POS | null {
  // Adverbs
  if (w.endsWith("ly") && w.length > 3) return "adv";
  // Adjectives
  if (
    w.endsWith("able") || w.endsWith("ible") || w.endsWith("ful") ||
    w.endsWith("less") || w.endsWith("ous") || w.endsWith("ive") ||
    w.endsWith("ant") || w.endsWith("ent") || w.endsWith("ish") ||
    w.endsWith("al") || w.endsWith("ical") || w.endsWith("ic") ||
    w.endsWith("ary") || w.endsWith("ory") || w.endsWith("ory")
  ) return "adj";
  // Noun suffixes
  if (
    w.endsWith("tion") || w.endsWith("sion") || w.endsWith("ment") ||
    w.endsWith("ness") || w.endsWith("ity") || w.endsWith("ance") ||
    w.endsWith("ence") || w.endsWith("ship") || w.endsWith("dom") ||
    w.endsWith("hood") || w.endsWith("ology") || w.endsWith("ism") ||
    w.endsWith("ist") || w.endsWith("age") || w.endsWith("ure")
  ) return "noun";
  // Verb suffixes (less reliable)
  if (w.endsWith("ize") || w.endsWith("ise") || w.endsWith("ify") ||
      w.endsWith("ate") || w.endsWith("en")) return "verb";
  // Present participle — could be verb or adj; usually verb
  if (w.endsWith("ing") && w.length > 5) return "verb";
  // Past participle
  if (w.endsWith("ed") && w.length > 3) return "verb";
  return null;
}

function classifyPOS(token: string): POS {
  const w = token.toLowerCase();
  // punctuation
  if (/^[^\w\s]+$/.test(token)) return "punct";
  if (/^\d[\d.,]*$/.test(token)) return "num";

  if (PRONOUNS.has(w)) return "pron";
  if (DETERMINERS.has(w)) return "det";
  if (MODALS.has(w)) return "modal";
  if (AUXILIARIES.has(w)) return "aux";
  if (PREPOSITIONS.has(w)) return "prep";
  if (CONJUNCTIONS.has(w)) return "conj";
  if (COMMON_ADVERBS.has(w)) return "adv";
  if (VERB_FORMS.has(w)) return "verb";

  const suf = posFromSuffix(w);
  if (suf) return suf;

  // Capitalized in mid-sentence → likely proper noun
  // (can't easily tell from this function; default to noun)
  return "noun";
}

// ─── Tokenizer ──────────────────────────────────────────────────────────────

/** Split sentence into tokens; preserves char offsets. */
function tokenize(sentence: string): Array<{ text: string; charStart: number; charEnd: number }> {
  const tokens: Array<{ text: string; charStart: number; charEnd: number }> = [];
  // Match: word-like runs (including hyphens/apostrophes) | single punctuation
  const re = /[A-Za-z][A-Za-z0-9'’-]*|\d[\d.,]*|[^\s\w]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence)) !== null) {
    tokens.push({ text: m[0], charStart: m.index, charEnd: m.index + m[0].length });
  }
  return tokens;
}

// ─── Chunk labeling (heuristic) ─────────────────────────────────────────────

/**
 * Very rough S/V/O/Modifier labeler:
 *   - First noun/pron before main verb = subject
 *   - Main verb = first non-aux/non-modal verb
 *   - Nouns/prons after main verb (not in a prep phrase) = object
 *   - Everything else → modifier
 */
function labelChunks(toks: AnalyzedToken[]): void {
  // Find main verb: first verb that isn't aux/modal, else first aux/modal.
  let mainVerbIdx = -1;
  for (let i = 0; i < toks.length; i++) {
    const p = toks[i]!.pos;
    if (p === "verb") { mainVerbIdx = i; break; }
  }
  if (mainVerbIdx < 0) {
    for (let i = 0; i < toks.length; i++) {
      const p = toks[i]!.pos;
      if (p === "aux" || p === "modal") { mainVerbIdx = i; break; }
    }
  }

  // Subject: first noun/pron/det-noun before main verb
  let subjAssigned = false;
  for (let i = 0; i < (mainVerbIdx < 0 ? toks.length : mainVerbIdx); i++) {
    const t = toks[i]!;
    if ((t.pos === "noun" || t.pos === "pron") && !subjAssigned) {
      t.role = "subject";
      subjAssigned = true;
    } else if (t.pos === "det" || t.pos === "adj") {
      // attach to subject head
      t.role = subjAssigned ? "modifier" : "modifier";
    } else {
      t.role = "modifier";
    }
  }

  // Main verb
  if (mainVerbIdx >= 0) toks[mainVerbIdx]!.role = "verb";

  // Object(s): first noun/pron after main verb that isn't in a prep phrase
  if (mainVerbIdx >= 0) {
    let inPrep = false;
    let objAssigned = false;
    for (let i = mainVerbIdx + 1; i < toks.length; i++) {
      const t = toks[i]!;
      if (t.pos === "prep") { inPrep = true; t.role = "modifier"; continue; }
      if (t.pos === "punct") { inPrep = false; t.role = "other"; continue; }
      if (t.pos === "conj") { inPrep = false; t.role = "other"; continue; }
      if (!inPrep && (t.pos === "noun" || t.pos === "pron") && !objAssigned) {
        t.role = "object";
        objAssigned = true;
      } else if (inPrep) {
        t.role = "modifier";
      } else {
        t.role = "modifier";
      }
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Analyze a sentence and return per-token POS + chunk roles.
 * `target` should be the displayed (case-preserving) form of the clicked word.
 */
export function analyzeSentence(sentence: string, target?: string): Analysis {
  const tokens = tokenize(sentence);
  const tgtLower = target?.toLowerCase();

  const analyzed: AnalyzedToken[] = tokens.map((t, i) => ({
    text: t.text,
    lower: t.text.toLowerCase(),
    pos: classifyPOS(t.text),
    role: "other" as ChunkRole,
    index: i,
    charStart: t.charStart,
    charEnd: t.charEnd,
    isTarget: !!tgtLower && t.text.toLowerCase() === tgtLower,
  }));

  labelChunks(analyzed);

  const targetIndex = analyzed.findIndex((t) => t.isTarget);
  return { tokens: analyzed, targetIndex };
}

/** Human-readable Chinese POS label. */
export function posLabel(pos: POS): string {
  switch (pos) {
    case "noun": return "名詞";
    case "verb": return "動詞";
    case "adj": return "形容詞";
    case "adv": return "副詞";
    case "pron": return "代名詞";
    case "det": return "限定詞";
    case "prep": return "介係詞";
    case "conj": return "連接詞";
    case "aux": return "助動詞";
    case "modal": return "情態動詞";
    case "num": return "數詞";
    case "punct": return "標點";
    default: return "其他";
  }
}

/** Human-readable Chinese chunk role label. */
export function roleLabel(role: ChunkRole): string {
  switch (role) {
    case "subject": return "主語";
    case "verb": return "謂語";
    case "object": return "賓語";
    case "modifier": return "修飾語";
    default: return "";
  }
}
