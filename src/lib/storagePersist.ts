/**
 * Ask the browser to keep IndexedDB across storage pressure, and report
 * whether that request stuck.
 */

export interface StorageStatus {
  persistSupported: boolean;
  persisted: boolean;
  usage: number | null;
  quota: number | null;
}

export async function readStorageStatus(): Promise<StorageStatus> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage) {
    return { persistSupported: false, persisted: false, usage: null, quota: null };
  }
  let persisted = false;
  if (typeof storage.persisted === "function") {
    try { persisted = await storage.persisted(); } catch { persisted = false; }
  }
  let usage: number | null = null;
  let quota: number | null = null;
  if (typeof storage.estimate === "function") {
    try {
      const estimate = await storage.estimate();
      usage = typeof estimate.usage === "number" ? estimate.usage : null;
      quota = typeof estimate.quota === "number" ? estimate.quota : null;
    } catch { /* leave nulls */ }
  }
  return {
    persistSupported: typeof storage.persist === "function",
    persisted,
    usage,
    quota,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage || typeof storage.persist !== "function") return false;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
