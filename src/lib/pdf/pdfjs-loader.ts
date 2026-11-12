/**
 * PDF.js setup with Vite 5.
 *
 * Two deploy modes share this file:
 *  • website build      — the worker is emitted as a separate asset and loaded
 *    by its (relative) URL. The canonical Vite + pdfjs-dist recipe.
 *  • single-file build  — the worker is injected as a data: URL on globalThis.
 *    file:// blocks Worker() from data: URLs (module workers), so we convert it
 *    to a same-origin blob: URL before pdfjs uses it. loadPdf() awaits that.
 */
import * as pdfjsLib from "pdfjs-dist";
// eslint-disable-next-line import/no-unresolved
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const injectedWorker = (
  globalThis as unknown as { __LEXIGRAPH_PDF_WORKER_URL__?: string }
).__LEXIGRAPH_PDF_WORKER_URL__;

let workerReady: Promise<void> = Promise.resolve();

if (injectedWorker) {
  workerReady = fetch(injectedWorker)
    .then((r) => r.blob())
    .then((b) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(b);
    })
    .catch((e) => {
      console.error("[pdf] worker blob setup failed, using data URL directly:", e);
      pdfjsLib.GlobalWorkerOptions.workerSrc = injectedWorker;
    });
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
}

export { pdfjsLib };
export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

/** Load a PDF from a raw ArrayBuffer or Uint8Array. */
export async function loadPdf(data: ArrayBuffer | Uint8Array) {
  await workerReady;
  const task = pdfjsLib.getDocument({ data });
  return await task.promise;
}
