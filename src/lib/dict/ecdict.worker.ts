/**
 * Decompress and parse the ECDICT bundle off the main thread.
 * Entries are posted in small chunks so the UI thread can index them
 * without one multi-second task.
 */

interface PackedEntry {
  w: string;
  t?: string;
  p?: string;
  s?: string[];
  g?: string;
  c?: string;
  d?: string;
}

const CHUNK = 2500;

self.onmessage = (event: MessageEvent<{ url: string }>) => {
  const { url } = event.data;
  void load(url);
};

async function load(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buf = await response.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    let jsonText: string;
    if (gzip) {
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
      jsonText = await new Response(stream).text();
    } else {
      jsonText = new TextDecoder("utf-8").decode(buf);
    }
    const entries = JSON.parse(jsonText) as PackedEntry[];
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      const done = i + CHUNK >= entries.length;
      self.postMessage({ type: "chunk", entries: slice, done, total: entries.length });
    }
    if (entries.length === 0) self.postMessage({ type: "chunk", entries: [], done: true, total: 0 });
  } catch (err) {
    self.postMessage({ type: "error", message: (err as Error).message });
  }
}
