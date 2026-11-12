/**
 * 集中 IndexedDB 管理層（Round 12）。
 *
 * 為什麼要這個檔：
 *   - blobStore 原本自己開一個 DB（"lexigraph" version 1，只有 "blobs"），
 *     IndexedDBRepo 要加五個 stores（books / pages / wordStates / phrases /
 *     llm），兩邊必須共用同一個 DB 才能一次 migration 到位。
 *   - ECDICT 單獨用另一個 DB（"lexigraph-dict"）— 因為那是純 read-only cache，
 *     獨立 migration 比較乾淨，不在這裡管。
 *
 * Schema 版本紀錄：
 *   v1 — "blobs" store（PDF 二進位）
 *   v2 — 加 "books" / "pages" / "wordStates" / "phrases" / "llm" store
 *   v3 — "meta" store（lemma migration backup、import 前的安全快照）
 */

const DB_NAME = "lexigraph";
const DB_VERSION = 3;

export const STORE = {
  blobs: "blobs",
  books: "books",
  pages: "pages",           // key = `${bookId}:${pageNo}`
  wordStates: "wordStates", // key = normalized
  phrases: "phrases",       // key = phrase id
  llm: "llm",               // key = cacheKey
  meta: "meta",             // key = string, migration backups and safety snapshots
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open (or upgrade) the shared Lexigraph DB. Idempotent — first call triggers
 * upgrade if needed, subsequent calls return the cached handle.
 */
export function openLexigraphDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const oldVersion = (ev as IDBVersionChangeEvent).oldVersion ?? 0;
      // v1 → blobs
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE.blobs)) {
          db.createObjectStore(STORE.blobs);
        }
      }
      // v2 → repo stores
      if (oldVersion < 2) {
        for (const name of [STORE.books, STORE.pages, STORE.wordStates, STORE.phrases, STORE.llm]) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      }
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(STORE.meta)) {
          db.createObjectStore(STORE.meta);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb open failed"));
    req.onblocked = () => {
      // Another tab is holding the DB at an older version. Surface it.
      console.warn("[idb] openLexigraphDb blocked — another tab holds an older version");
    };
  });
  return dbPromise;
}

// ─── Generic helpers ────────────────────────────────────────────────────────
// Each call opens its own transaction (cheap). Callers that need atomicity
// across multiple puts should open their own tx — but nothing in this app
// currently cares, so we keep the API tiny.

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openLexigraphDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error(`idbGet(${store}, ${String(key)}) failed`));
  });
}

export async function idbPut<T>(store: StoreName, key: IDBValidKey, value: T): Promise<void> {
  const db = await openLexigraphDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value as unknown as IDBValidKey, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`idbPut(${store}, ${String(key)}) failed`));
  });
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openLexigraphDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`idbDelete(${store}, ${String(key)}) failed`));
  });
}

/** Read every value in a store. Used for booting Maps into memory at init. */
export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openLexigraphDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error(`idbGetAll(${store}) failed`));
  });
}

/**
 * Read all [key, value] pairs. For stores where the key is part of the domain
 * identity (e.g. page key = "bookId:pageNo") we need both.
 */
export async function idbGetAllEntries<T>(store: StoreName): Promise<Array<[IDBValidKey, T]>> {
  const db = await openLexigraphDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);
    const keysReq = os.getAllKeys();
    const valsReq = os.getAll();
    let keys: IDBValidKey[] | null = null;
    let vals: T[] | null = null;
    const check = () => {
      if (keys !== null && vals !== null) {
        const out: Array<[IDBValidKey, T]> = [];
        const n = Math.min(keys.length, vals.length);
        for (let i = 0; i < n; i++) out.push([keys[i] as IDBValidKey, vals[i] as T]);
        resolve(out);
      }
    };
    keysReq.onsuccess = () => { keys = keysReq.result as IDBValidKey[]; check(); };
    valsReq.onsuccess = () => { vals = valsReq.result as T[]; check(); };
    keysReq.onerror = () => reject(keysReq.error ?? new Error(`idbGetAllEntries keys failed`));
    valsReq.onerror = () => reject(valsReq.error ?? new Error(`idbGetAllEntries vals failed`));
  });
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openLexigraphDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`idbClear(${store}) failed`));
  });
}
