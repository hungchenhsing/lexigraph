/**
 * Full local backup of Lexigraph user data.
 *
 * Merge never deletes a record that exists only on this device.
 * Replace throws unless the caller passes the exact confirmation text, so an
 * import cannot wipe the library by accident.
 */
import type { Book, LLMExplanation, Page, PhraseBookmark, WordState } from "../../data/types";
import { presentGloss } from "../dict/gloss";
import type { GlossScript, ReaderSettings } from "../readerSettings";

export const BACKUP_FORMAT = "lexigraph-backup" as const;
export const BACKUP_VERSION = 1;
export const REPLACE_CONFIRMATION = "REPLACE";

export interface BackupBlob {
  key: string;
  mime: string;
  base64: string;
}

export interface BackupPage {
  key: string;
  page: Page;
}

export interface BackupSettings {
  llm?: unknown;
  theme?: string | undefined;
  pdfScale?: string | undefined;
  reader?: ReaderSettings | undefined;
}

export interface UserDataDump {
  wordStates: WordState[];
  books: Book[];
  phrases: PhraseBookmark[];
  pages: BackupPage[];
  llm: LLMExplanation[];
  blobs: BackupBlob[];
}

export interface LexigraphBackup extends UserDataDump {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  includesApiKeys: boolean;
  includesPdfs: boolean;
  settings: BackupSettings;
}

export interface BuildBackupInput extends UserDataDump {
  settings?: BackupSettings | undefined;
}

export interface BuildBackupOptions {
  includeApiKeys?: boolean | undefined;
  includePdfs?: boolean | undefined;
  exportedAt?: number | undefined;
}

function glossText(value: string | undefined, script: GlossScript): string | undefined {
  if (value === undefined) return undefined;
  return presentGloss(value, script) ?? value;
}

/** Dictionary-style Chinese in the LLM cache follows the reader's gloss script. */
function localizeExportedGlosses(
  items: LLMExplanation[],
  script: GlossScript | undefined,
): LLMExplanation[] {
  if (script === "zh-CN") return items;
  const tw: GlossScript = "zh-TW";
  return items.map((item) => ({
    ...item,
    senseInContext: glossText(item.senseInContext, tw) ?? item.senseInContext,
    syntacticRole: glossText(item.syntacticRole, tw) ?? item.syntacticRole,
    domainNuance: glossText(item.domainNuance, tw),
    paraphrase: glossText(item.paraphrase, tw),
    levelHint: glossText(item.levelHint, tw),
    collocations: item.collocations.map((line) => glossText(line, tw) ?? line),
  }));
}

export function buildBackup(input: BuildBackupInput, options: BuildBackupOptions = {}): LexigraphBackup {
  const includeApiKeys = options.includeApiKeys === true;
  const includePdfs = options.includePdfs !== false;
  const settings = includeApiKeys
    ? clone(input.settings ?? {})
    : redactSecrets(input.settings ?? {});
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: options.exportedAt ?? Date.now(),
    includesApiKeys: includeApiKeys,
    includesPdfs: includePdfs,
    wordStates: clone(input.wordStates),
    books: clone(input.books),
    phrases: clone(input.phrases),
    pages: clone(input.pages),
    llm: localizeExportedGlosses(clone(input.llm), input.settings?.reader?.glossScript),
    blobs: includePdfs ? clone(input.blobs) : [],
    settings,
  };
}

export function parseBackup(raw: unknown): LexigraphBackup {
  if (!raw || typeof raw !== "object") throw new Error("Backup file is not a JSON object");
  const data = raw as Partial<LexigraphBackup>;
  if (data.format !== BACKUP_FORMAT) throw new Error("Not a Lexigraph backup file");
  if (data.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${String(data.version)}`);
  const wordStates = expectArray<WordState>(data.wordStates, "wordStates");
  for (const state of wordStates) {
    if (!state || typeof state.normalized !== "string" || !state.normalized) {
      throw new Error("Backup word state is missing its key");
    }
    if (typeof state.level !== "number" || state.level < 0 || state.level > 6) {
      throw new Error(`Backup word "${state.normalized}" has an invalid level`);
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === "number" ? data.exportedAt : 0,
    includesApiKeys: data.includesApiKeys === true,
    includesPdfs: data.includesPdfs !== false,
    wordStates,
    books: expectArray<Book>(data.books, "books"),
    phrases: expectArray<PhraseBookmark>(data.phrases, "phrases"),
    pages: expectArray<BackupPage>(data.pages, "pages"),
    llm: expectArray<LLMExplanation>(data.llm, "llm"),
    blobs: expectArray<BackupBlob>(data.blobs, "blobs"),
    settings: data.settings && typeof data.settings === "object" ? data.settings : {},
  };
}

export interface BackupSummary {
  words: number;
  notes: number;
  books: number;
  phrases: number;
  pages: number;
  llm: number;
  pdfs: number;
  includesApiKeys: boolean;
}

export function summarizeBackup(backup: LexigraphBackup): BackupSummary {
  return {
    words: backup.wordStates.length,
    notes: backup.wordStates.filter((w) => !!w.note?.trim()).length,
    books: backup.books.length,
    phrases: backup.phrases.length,
    pages: backup.pages.length,
    llm: backup.llm.length,
    pdfs: backup.blobs.length,
    includesApiKeys: backup.includesApiKeys,
  };
}

/**
 * Union of local and incoming data. On key conflicts the local record wins,
 * except word states, where the more recently seen record wins and an empty
 * note does not erase a saved note.
 */
export function mergeUserData(existing: UserDataDump, incoming: UserDataDump): UserDataDump {
  return {
    wordStates: mergeWords(existing.wordStates, incoming.wordStates),
    books: mergeBy(existing.books, incoming.books, (b) => b.id),
    phrases: mergeBy(existing.phrases, incoming.phrases, (p) => p.id),
    pages: mergeBy(existing.pages, incoming.pages, (p) => p.key),
    llm: mergeBy(existing.llm, incoming.llm, (e) => e.cacheKey),
    blobs: mergeBy(existing.blobs, incoming.blobs, (b) => b.key),
  };
}

/**
 * Replace local collections with the file. Refuses to run without the exact
 * confirmation string so a caller cannot wipe data implicitly.
 */
export function replaceUserData(incoming: UserDataDump, confirmation: string): UserDataDump {
  if (confirmation !== REPLACE_CONFIRMATION) {
    throw new Error("Refusing to replace existing data without confirmation");
  }
  return {
    wordStates: clone(incoming.wordStates),
    books: clone(incoming.books),
    phrases: clone(incoming.phrases),
    pages: clone(incoming.pages),
    llm: clone(incoming.llm),
    blobs: clone(incoming.blobs),
  };
}

export function redactSecrets(settings: BackupSettings): BackupSettings {
  const copy = clone(settings);
  const llm = copy.llm;
  if (llm && typeof llm === "object") {
    const record = llm as { gemini?: { apiKey?: string }; groq?: { apiKey?: string } };
    if (record.gemini) record.gemini.apiKey = "";
    if (record.groq) record.groq.apiKey = "";
  }
  return copy;
}

/**
 * Apply backed-up settings without letting an empty or omitted key erase a
 * key that is already stored on this device.
 */
export function mergeSettings(
  current: BackupSettings,
  incoming: BackupSettings,
  includesApiKeys: boolean,
): BackupSettings {
  const next = clone(current);
  if (incoming.theme) next.theme = incoming.theme;
  if (incoming.pdfScale) next.pdfScale = incoming.pdfScale;
  if (incoming.reader) next.reader = { ...next.reader, ...incoming.reader } as ReaderSettings;
  if (incoming.llm && typeof incoming.llm === "object") {
    const base = (next.llm && typeof next.llm === "object" ? clone(next.llm) : {}) as {
      gemini?: { apiKey?: string };
      groq?: { apiKey?: string };
    };
    const inc = clone(incoming.llm) as typeof base;
    const keptGemini = base.gemini?.apiKey ?? "";
    const keptGroq = base.groq?.apiKey ?? "";
    next.llm = { ...base, ...inc };
    const merged = next.llm as typeof base;
    if (!includesApiKeys) {
      if (merged.gemini) merged.gemini.apiKey = keptGemini;
      if (merged.groq) merged.groq.apiKey = keptGroq;
    } else {
      if (merged.gemini && !merged.gemini.apiKey) merged.gemini.apiKey = keptGemini;
      if (merged.groq && !merged.groq.apiKey) merged.groq.apiKey = keptGroq;
    }
  }
  return next;
}

function mergeWords(existing: WordState[], incoming: WordState[]): WordState[] {
  const map = new Map<string, WordState>();
  for (const state of existing) map.set(state.normalized, clone(state));
  for (const state of incoming) {
    const current = map.get(state.normalized);
    if (!current) {
      map.set(state.normalized, clone(state));
      continue;
    }
    map.set(state.normalized, preferWord(current, state));
  }
  return [...map.values()];
}

function preferWord(local: WordState, incoming: WordState): WordState {
  const incomingNewer = incoming.lastSeenAt > local.lastSeenAt
    || (incoming.lastSeenAt === local.lastSeenAt && incoming.level > local.level);
  const winner = incomingNewer ? incoming : local;
  const other = incomingNewer ? local : incoming;
  const surfaces = new Set<string>([
    ...(local.surfaces ?? []),
    ...(incoming.surfaces ?? []),
  ]);
  surfaces.delete(winner.normalized);
  const note = winner.note?.trim() ? winner.note : other.note;
  const next: WordState = {
    ...winner,
    firstSeenAt: Math.min(local.firstSeenAt, incoming.firstSeenAt),
    reviewCount: Math.max(local.reviewCount, incoming.reviewCount),
  };
  if (note?.trim()) next.note = note;
  else delete next.note;
  if (surfaces.size > 0) next.surfaces = [...surfaces].sort();
  return next;
}

function mergeBy<T>(existing: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of existing) map.set(keyOf(item), clone(item));
  for (const item of incoming) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, clone(item));
  }
  return [...map.values()];
}

function expectArray<T>(value: unknown, label: string): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Backup field ${label} is not a list`);
  return value as T[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
