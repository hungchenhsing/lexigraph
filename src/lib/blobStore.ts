/**
 * PDF blob 存取層。
 *
 * Round 12：schema 改由 src/data/idb.ts 集中管，這個檔只剩 blob 讀寫 API。
 * Key shape: "pdf:<uuid>" — Book.fileRef 指向這裡。
 */

import { STORE, idbGet, idbPut, idbDelete } from "../data/idb";

export async function putBlob(key: string, blob: Blob): Promise<void> {
  await idbPut(STORE.blobs, key, blob);
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return await idbGet<Blob>(STORE.blobs, key);
}

export async function deleteBlob(key: string): Promise<void> {
  await idbDelete(STORE.blobs, key);
}

/** Convenience: read as ArrayBuffer for pdfjs.getDocument({ data }). */
export async function getBlobAsArrayBuffer(key: string): Promise<ArrayBuffer | undefined> {
  const blob = await getBlob(key);
  if (!blob) return undefined;
  return await blob.arrayBuffer();
}

// UUID generator — prefer native, fall back to Math.random.
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return (
    "u-" +
    Math.random().toString(36).slice(2, 10) +
    "-" +
    Date.now().toString(36)
  );
}
