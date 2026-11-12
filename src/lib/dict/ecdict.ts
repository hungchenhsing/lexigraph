/**
 * ECDICT offline dictionary loader.
 *
 * Load path:
 *   1. IndexedDB cache (~50ms) — returns immediately on 2nd+ launch
 *   2. fetch /dict/ecdict-core.json.gz (first launch, ~8 MB gzipped)
 *   3. Smart decompress: check gzip magic bytes first.
 *   4. Persist unpacked array back to IndexedDB for next launch.
 */
import type { DictEntry, CEFR } from "../../data/types";
import { resolveDictFetchUrl } from "./dictUrl";

interface PackedEntry {
  w: string;
  t?: string;
  p?: string;
  s?: string[];
  g?: string;
  c?: CEFR;
  b?: number;
  d?: string;
}

type EcdictStatus = "idle" | "loading" | "ready" | "error";

const IDB_DB = "lexigraph-dict";
const IDB_DB_VERSION = 3; // bump above any pre-existing version (some users have v2 from earlier builds)
const IDB_STORE = "ecdict";
const IDB_KEY = "core-v2";
// Resolved at runtime so one bundle serves two deploy modes:
//   • website build  → relative path under BASE_URL ("./dict/...")
//   • single-file build → injected data: URL on globalThis (works under file://)
const DICT_URL =
  (globalThis as unknown as { __LEXIGRAPH_DICT_URL__?: string }).__LEXIGRAPH_DICT_URL__ ??
  `${import.meta.env.BASE_URL}dict/ecdict-core.json.gz`;

let _map: Map<string, DictEntry> | null = null;
let _status: EcdictStatus = "idle";
let _loadPromise: Promise<void> | null = null;
const _listeners = new Set<(s: EcdictStatus) => void>();

function notify() {
  for (const fn of _listeners) {
    try { fn(_status); } catch { /* swallow */ }
  }
}

export function onEcdictStatus(fn: (s: EcdictStatus) => void): () => void {
  _listeners.add(fn);
  fn(_status);
  return () => { _listeners.delete(fn); };
}

export function getEcdictStatus(): EcdictStatus { return _status; }
export function getEcdictSize(): number { return _map?.size ?? 0; }

function unpack(e: PackedEntry): DictEntry {
  const out: DictEntry = { word: e.w };
  if (e.t) out.translation = e.t;
  if (e.d) out.definition = e.d;
  if (e.p) out.phonetic = e.p;
  if (e.s) out.pos = e.s;
  if (e.c) out.cefr = e.c;
  if (e.g) out.tags = e.g.split(/\s+/).filter(Boolean);
  return out;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, IDB_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<unknown> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbPut(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* best effort */ }
}

async function decompressGzip(buf: ArrayBuffer): Promise<string> {
  const Ctor = (globalThis as unknown as { DecompressionStream?: new (fmt: string) => unknown })
    .DecompressionStream;
  if (!Ctor) {
    throw new Error("DecompressionStream not supported; need Chrome 80+ / Safari 16.4+");
  }
  const ds = new Ctor("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>;
  const stream = new Blob([buf]).stream() as unknown as ReadableStream<Uint8Array>;
  const decompressed = stream.pipeThrough(ds as unknown as TransformStream<Uint8Array, Uint8Array>);
  return await new Response(decompressed as unknown as BodyInit).text();
}

async function fetchAndDecompress(url: string): Promise<PackedEntry[]> {
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    console.error("[ecdict] fetch threw:", e);
    throw new Error(`fetch failed: ${(e as Error).message}`);
  }
  if (!resp.ok) throw new Error(`ECDICT fetch HTTP ${resp.status}`);
  if (!resp.body) throw new Error("ECDICT fetch: no response body");

  const ce = resp.headers.get("content-encoding");
  const ct = resp.headers.get("content-type");
  const cl = resp.headers.get("content-length");
  console.info(`[ecdict] resp: ce=${ce} ct=${ct} cl=${cl}`);

  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  console.info(`[ecdict] ${bytes.length.toLocaleString()} bytes, gzip=${isGzip}`);

  let jsonText: string;
  if (isGzip) {
    try {
      jsonText = await decompressGzip(buf);
    } catch (e) {
      throw new Error(`gzip decompress failed: ${(e as Error).message}`);
    }
  } else {
    jsonText = new TextDecoder("utf-8").decode(buf);
  }

  try {
    return JSON.parse(jsonText) as PackedEntry[];
  } catch (e) {
    console.error("[ecdict] JSON.parse failed:", jsonText.slice(0, 200));
    throw new Error(`JSON parse failed: ${(e as Error).message}`);
  }
}

const INGEST_CHUNK = 2500;

async function ingestChunked(entries: PackedEntry[]): Promise<void> {
  if (!_map) _map = new Map();
  for (let i = 0; i < entries.length; i += INGEST_CHUNK) {
    const end = Math.min(entries.length, i + INGEST_CHUNK);
    for (let j = i; j < end; j++) {
      const entry = entries[j];
      if (entry?.w) _map.set(entry.w, unpack(entry));
    }
    if (end < entries.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

function loadInWorker(url: string): Promise<PackedEntry[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./ecdict.worker.ts", import.meta.url), { type: "module" });
    const all: PackedEntry[] = [];
    worker.onmessage = (event: MessageEvent<{ type: string; entries?: PackedEntry[]; done?: boolean; message?: string }>) => {
      const data = event.data;
      if (data.type === "error") {
        worker.terminate();
        reject(new Error(data.message || "dictionary worker failed"));
        return;
      }
      if (data.type === "chunk" && data.entries) {
        for (const entry of data.entries) {
          if (entry?.w && _map) _map.set(entry.w, unpack(entry));
          all.push(entry);
        }
        if (data.done) {
          worker.terminate();
          resolve(all);
        }
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "dictionary worker error"));
    };
    worker.postMessage({ url });
  });
}

export function ensureEcdictLoaded(): Promise<void> {
  if (_status === "ready") return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _status = "loading";
  notify();
  _loadPromise = (async () => {
    try {
      const cached = (await idbGet(IDB_KEY)) as PackedEntry[] | undefined;
      if (Array.isArray(cached) && cached.length > 1000) {
        console.info(`[ecdict] cache hit: ${cached.length.toLocaleString()} entries`);
        _map = new Map();
        await ingestChunked(cached);
        _status = "ready";
        notify();
        return;
      }
      const fetchUrl = resolveDictFetchUrl(DICT_URL, typeof location !== "undefined" ? location.href : "https://localhost/");
      console.info("[ecdict] cache miss, fetching off the main thread:", fetchUrl);
      _map = new Map();
      let entries: PackedEntry[];
      try {
        entries = await loadInWorker(fetchUrl);
      } catch (err) {
        console.warn(
          `[ecdict] worker failed for ${fetchUrl} (${(err as Error).message}). Falling back to main-thread parse of the same URL.`,
          err,
        );
        entries = await fetchAndDecompress(fetchUrl);
        await ingestChunked(entries);
      }
      _status = "ready";
      notify();
      void idbPut(IDB_KEY, entries);
      console.info(`[ecdict] ready, ${_map.size.toLocaleString()} entries`);
    } catch (err) {
      console.error("[ecdict] load failed:", err);
      _status = "error";
      notify();
    }
  })();
  return _loadPromise;
}

export function lookupEcdict(word: string): DictEntry | undefined {
  if (!_map) return undefined;
  return _map.get(word.toLowerCase());
}
