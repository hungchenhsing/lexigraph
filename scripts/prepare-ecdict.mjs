#!/usr/bin/env node
/**
 * prepare-ecdict.mjs -- regenerate public/dict/ecdict-core.json.gz
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.resolve(ROOT, "node_modules", "ecdict", "assets", "ecdict.csv");
const OUT = path.resolve(ROOT, "public", "dict", "ecdict-core.json.gz");

function toCefr(tag, bnc) {
  const t = tag ?? "";
  if (/\bzk\b/.test(t)) return "A1";
  if (/\bgk\b|\bcet4\b/.test(t)) return "A2";
  if (/\bcet6\b/.test(t)) return "B1";
  if (/\btoefl\b|\bielts\b/.test(t)) return "B2";
  if (/\bky\b/.test(t)) return "B2";
  if (/\bgre\b|\bgmat\b/.test(t)) return "C1";
  if (typeof bnc === "number" && bnc > 0) {
    if (bnc <= 2000) return "A2";
    if (bnc <= 5000) return "B1";
    if (bnc <= 10000) return "B2";
    if (bnc <= 20000) return "C1";
    return "C2";
  }
  return undefined;
}

function parsePos(raw) {
  if (!raw) return undefined;
  const parts = raw.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  const codes = [];
  for (const p of parts) {
    const [code] = p.split(":");
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes.length > 0 ? codes : undefined;
}

const PHRASE_ALLOW = new Set([
  "according to", "based on", "due to", "such as", "in terms of",
  "as well as", "take advantage of", "in spite of", "on behalf of",
  "in contrast to", "as a result", "for instance", "for example",
  "at least", "at most", "at all", "at first", "on the other hand",
  "on the whole", "in order to", "in addition to",
]);

function shouldKeep(row) {
  const { word, translation, definition, bnc, tag, collins, oxford } = row;
  if (!word) return false;
  if (!translation && !definition) return false;
  if (/[0-9]/.test(word)) return false;
  if (/[^\x20-\x7e]/.test(word)) return false;
  if (word.startsWith("'")) return false;

  const spaces = (word.match(/ /g) ?? []).length;
  // All-caps short (likely abbrev or proper noun): drop
  if (word.length <= 5 && /^[A-Z][A-Z]+$/.test(word)) return false;
  // First-letter uppercase without rest lowercase pattern (proper nouns):
  // Drop if starts uppercase AND no bnc/tag/collins/oxford (= unknown proper noun)
  if (/^[A-Z]/.test(word) && !bnc && !tag && !collins && !oxford) return false;
  // Hyphen-heavy weird entries (>2 hyphens)
  if ((word.match(/-/g) ?? []).length >= 3) return false;

  if (spaces === 0) {
    // Single word: keep if has any signal OR translation is meaningful (>=2 chars)
    return true;
  }
  // Phrases: stricter
  if (spaces >= 5) return false;
  if (PHRASE_ALLOW.has(word.toLowerCase())) return true;
  if (tag && /(cet|toefl|ielts|gre|gmat|ky)/.test(tag)) return true;
  if (collins || oxford) return true;
  return false;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') { out.push(cur); cur = ""; }
      else if (ch === '"') inQuote = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function main() {
  if (!fs.existsSync(SRC)) { console.error(`ECDICT source not found at ${SRC}`); process.exit(1); }
  console.log(`Reading ${SRC}...`);
  const raw = fs.readFileSync(SRC, "utf8");
  const lines = raw.split(/\r?\n/);
  console.log(`  ${lines.length.toLocaleString()} lines`);

  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const kept = [];
  let phraseCount = 0, withDef = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = parseCsvLine(line);
    const word = (cols[idx.word] ?? "").trim();
    const translation = (cols[idx.translation] ?? "").trim();
    const definition = (cols[idx.definition] ?? "").trim();
    const phonetic = (cols[idx.phonetic] ?? "").trim();
    const posRaw = (cols[idx.pos] ?? "").trim();
    const tag = (cols[idx.tag] ?? "").trim();
    const bnc = Number((cols[idx.bnc] ?? "").trim()) || 0;
    const collins = Number((cols[idx.collins] ?? "").trim()) || 0;
    const oxford = Number((cols[idx.oxford] ?? "").trim()) || 0;

    const row = { word, translation, definition, phonetic, posRaw, tag, bnc, collins, oxford };
    if (!shouldKeep(row)) continue;

    if (word.includes(" ")) phraseCount += 1;
    // Lowercase key for canonical lookup.
    const packed = { w: word.toLowerCase() };
    if (translation) packed.t = translation;
    if (phonetic) packed.p = phonetic;
    const pos = parsePos(posRaw);
    if (pos) packed.s = pos;
    if (tag) packed.g = tag;
    const cefr = toCefr(tag, bnc);
    if (cefr) packed.c = cefr;
    if (bnc > 0) packed.b = bnc;
    if (definition) {
      const trimmed = definition.length > 200
        ? definition.slice(0, 197) + "..."
        : definition;
      packed.d = trimmed;
      withDef += 1;
    }
    kept.push(packed);
  }

  console.log(`  kept ${kept.length.toLocaleString()} entries (${phraseCount.toLocaleString()} phrases, ${withDef.toLocaleString()} with English def)`);

  const json = JSON.stringify(kept);
  const gz = zlib.gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, gz);
  console.log(`  wrote ${OUT}  (${(gz.length / 1024 / 1024).toFixed(2)} MB gzipped)`);
}

main();
