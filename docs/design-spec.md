# 學術 PDF 閱讀學習工具 — 完整設計方案 v1.0

> 代號建議：**Lexigraph**（Lexicon + Paragraph，強調學術論文的單詞 × 語境）
> 文件日期：2026-04-22
> 作者：Claude（Meta-Cognitive Reasoning Expert 模式）

---

## 0. 關於本文件

本文件採用「**明示信心度**」的風格：每個關鍵設計決策標註 0.0–1.0 的信心度。信心度 < 0.8 的項目在 §12 列出，並附上驗證計畫。

目標讀者：產品負責人（你）+ 後續接手實作的工程師。

---

## 1. 產品定位

### 1.1 一句話定位

> 一個針對**學術論文與專業書籍**優化的 PC 端沉浸式閱讀+詞彙積累工具，保留原 PDF 排版，支援單詞/短語/學術表達三個粒度的釋義、等級化與漸進記憶。

### 1.2 目標用戶

主要：研究生、博士生、科研人員、準備托福/雅思/GRE 的學術閱讀者、翻譯工作者。

次要：英語 B2+ 想突破學術寫作的學習者、讀原版專業書的自學者。

### 1.3 與 LingQ / Migaku 的差異化（這是這個產品能不能成立的關鍵）

| 維度 | LingQ | Migaku | **Lexigraph（本方案）** |
|---|---|---|---|
| 核心場景 | 通用閱讀/聽力 | 動漫/影視 + Anki | **學術 PDF / 專業書** |
| PDF 原版排版 | ❌（純文字模式） | ❌ | ✅ **保留 layout、公式、圖表位置** |
| 粒度 | 單詞 | 單詞 | **單詞 / 短語 / 學術表達** 三層 |
| 等級體系 | 自訂 1–5 熟悉度 | Anki 間隔 | **CEFR × AWL/NGSL 雙標籤 + 用戶熟悉度 0–5** |
| 語境解釋 | 句內翻譯（粗） | 字幕對齊 | **LLM 生成「在此句中的含義 / 句法角色 / 學科語義」** |
| 記憶系統 | LingQ 的 5 級 | SRS (Anki) | **可選 LingQ 模式或 SRS (FSRS) 模式** |
| 短語識別 | 手動 | 手動 | **自動偵測（統計+規則）+ 手動補充** |
| 學術專屬 | 無 | 無 | **引用偵測、公式跳過、術語表、學科詞表** |
| 離線 | 部分 | 部分 | **核心功能 100% 離線**（LLM 可選） |

信心度：**0.85**。LingQ/Migaku 對 academic PDF 的支援確實薄弱，但要警惕的是學術閱讀者群體相對小眾（詳見 §12）。

---

## 2. 核心功能清單（按優先級排序）

### P0（MVP 必備）

1. **開啟 PDF 並保留原排版**：縮放、翻頁、大綱、搜尋。
2. **點擊單詞**：彈出 popover 顯示釋義、詞性、音標、CEFR 等級、AWL 標記。
3. **選取短語**：拖選多詞可建立短語卡片。
4. **手動狀態切換**：New / Learning 1–4 / Known / Ignored（LingQ 邏輯）。
5. **本地資料庫**：所有卡片、閱讀進度、筆記本地儲存。
6. **三層高亮**：根據熟悉度漸變底色（藍 → 黃 → 透明）。
7. **基本搜尋**：在當前 PDF 中跨頁搜索原文。

### P1（核心差異化）

8. **句中含義解析**（LLM）：右鍵或雙擊 → 生成「此句脈絡下的含義 + 句法角色」。
9. **自動短語偵測**：基於 PMI / t-score + 學術常用 pattern 預掃整篇文章。
10. **學科詞表/術語表**：首次開啟新領域論文時自動提取高頻專業詞，供批量標記。
11. **引用與公式識別**：`[12]`、`(Smith et al., 2020)`、`$...$` 不納入生詞流程。
12. **跨文檔詞庫**：一個詞在不同 PDF 中出現時，繼承已有狀態與筆記。
13. **閱讀進度面板**：新詞數、已知詞占比、預估難度、每日學習 streak。

### P2（進階/加分項）

14. **FSRS 複習佇列**：對 Learning 狀態卡片排程今日複習。
15. **匯出 Anki**（.apkg）與 Markdown。
16. **雙語對照視圖**（LLM 生成段落翻譯，僅在使用者呼叫時生成）。
17. **TTS 朗讀**（本地 + 音標校對）。
18. **學習報告週報**。
19. **雲端同步**（選配，需另外設計後端，P2 暫緩）。

---

## 3. 系統架構

```
┌──────────────────────────────────────────────────────────────┐
│                    Electron Main Process                      │
│   - 視窗管理  - 檔案系統存取  - SQLite (better-sqlite3)       │
│   - Python 子進程橋 (NLP/短語偵測)                             │
│   - LLM 代理（集中管理 API key、rate limit、快取）              │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ IPC (contextBridge)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   Renderer Process (React)                    │
│  ┌───────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ PDF Viewer│  │ Word Overlay │  │ Sidebar               │  │
│  │ (PDF.js)  │  │ (canvas+DOM) │  │ - 詞庫 / 進度 / 複習  │  │
│  └───────────┘  └──────────────┘  └───────────────────────┘  │
│       ▲                ▲                      ▲               │
│       └────────── Zustand / Redux Store ──────┘               │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │
          ┌───────────────────┴──────────────────────┐
          ▼                                          ▼
┌──────────────────────┐                  ┌────────────────────┐
│  Python Side-car     │                  │  LLM Gateway       │
│  - spaCy (tokenize,  │                  │  - Gemini Free     │
│    POS, lemma, NER)  │                  │  - Groq (Llama)    │
│  - 短語統計           │                  │  - 本地 Ollama     │
│  - 學術詞表匹配       │                  │  - 結果快取         │
└──────────────────────┘                  └────────────────────┘
          │                                          │
          ▼                                          ▼
┌──────────────────────────────────────────────────────────────┐
│                  Data Layer (local, SQLite)                   │
│  documents / pages / tokens / lemmas / phrases / cards /      │
│  reviews / highlights / notes / settings / llm_cache          │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 進程模型

* **Main process（Node.js）**：管理 SQLite、檔案、Python 子進程、LLM API key。
* **Renderer process（Chromium）**：React UI + PDF.js。
* **Python side-car（子進程）**：spaCy 這類套件用 Python 比 JS 生態成熟，透過 stdin/stdout JSON 或本地 HTTP (127.0.0.1) 溝通。**信心度 0.8**——也可以全用 JS 的 `wink-nlp`，但 spaCy 在學術文本上的 POS/NER 準確度仍較優。

### 3.2 資料流（點擊單詞的典型路徑）

```
用戶點擊 "derivation" 的 span
  → Renderer 查 IndexedDB 快取（<5ms）
  → 無快取則 IPC to Main
  → Main 查 SQLite lemmas/cards 表
  → 組裝 payload：{ 釋義, POS, CEFR, AWL, 熟悉度, 同句上下文 }
  → Renderer 渲染 popover
  → （若用戶點「句中含義」按鈕）
      → Main → LLM Gateway → 快取檢查 → 呼叫 API → 串流回 UI
```

---

## 4. 技術棧決策

| 層 | 選型 | 信心度 | 備註 |
|---|---|---|---|
| 外殼 | Electron 30+ | 0.9 | 符合你指定 |
| UI | React 18 + TypeScript | 0.95 | |
| 狀態管理 | Zustand | 0.85 | 比 Redux 輕；複雜度中等適用 |
| 路由 | React Router v6 | 0.9 | |
| 樣式 | Tailwind CSS + shadcn/ui | 0.85 | popover、keyboard navigation 開箱即用 |
| PDF 渲染 | **PDF.js 4.x** | 0.95 | 唯一合理選擇；見 §7.1 |
| 資料庫 | **better-sqlite3** | 0.95 | 同步 API、效能極佳、單檔 |
| 本地詞典 | **ECDICT**（英漢）+ **WordNet 3.1**（英英/同義詞） | 0.9 | ECDICT 含頻率、COCA、BNC、CEFR |
| NLP | **spaCy 3.7**（en_core_web_sm / trf） | 0.85 | 見 §7.2 |
| 短語偵測 | spaCy matcher + 自訂 PMI | 0.75 | 需調參；見 §7.3 |
| LLM | **Google Gemini Flash**（免費額度）主力；Groq Llama 3 fallback | 0.8 | 免費額度有 rate limit；需快取 |
| SRS 演算法 | **FSRS 4.5**（開源、比 SM-2 精準） | 0.85 | |
| 打包 | electron-builder | 0.9 | |
| 測試 | Vitest + Playwright | 0.85 | |

### 4.1 為什麼不選另一些熱門選項

* **Tauri**：你已選 Electron，跳過。
* **pdfjs-dist 作為 npm import** vs 直接嵌入：推薦 import，便於 tree-shaking。
* **Dexie / IndexedDB**：前端快取層可用（加速 popover），但真相源仍是 SQLite。
* **OpenAI API**：成本高。免費層幾乎沒有。作為 P2 可選後端。

---

## 5. 資料模型（SQLite schema）

關鍵表設計。全部使用 `INTEGER PRIMARY KEY` 自增 id，時間戳用 unix seconds。

```sql
-- 文件
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  file_hash TEXT UNIQUE NOT NULL,      -- SHA-256，用於跨路徑識別同一 PDF
  file_path TEXT NOT NULL,             -- 最近一次的路徑
  title TEXT,
  authors TEXT,                        -- JSON array
  domain TEXT,                         -- 推斷的學科領域（如 "cs.CL"）
  page_count INTEGER,
  created_at INTEGER,
  last_opened_at INTEGER,
  reading_position TEXT                -- JSON: { page, scrollY, scale }
);

-- 頁面（用於持久化 tokenize 結果，避免每次重算）
CREATE TABLE pages (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  page_num INTEGER NOT NULL,
  text_layout_json TEXT,               -- PDF.js 的 text items，含 transform matrix
  tokens_json TEXT,                    -- 預計算的 tokens 陣列
  UNIQUE(document_id, page_num)
);

-- 詞元（lemma = 詞彙單元，跨文檔共享）
CREATE TABLE lemmas (
  id INTEGER PRIMARY KEY,
  lemma TEXT NOT NULL,                 -- 原型，如 "derive"
  pos TEXT NOT NULL,                   -- VERB / NOUN / ADJ...
  cefr TEXT,                           -- A1..C2 | NULL
  awl_sublist INTEGER,                 -- 1..10 | NULL
  ngsl_rank INTEGER,                   -- 在 NGSL 中的排名 | NULL
  coca_rank INTEGER,
  is_academic INTEGER DEFAULT 0,       -- 是否屬於學術詞表
  ipa TEXT,                            -- 音標
  UNIQUE(lemma, pos)
);

-- 短語/表達（可跨詞，如 "with respect to", "it is worth noting that"）
CREATE TABLE phrases (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,                  -- 'collocation' | 'academic_formula' | 'idiom' | 'custom'
  is_academic INTEGER DEFAULT 0,
  notes TEXT
);

-- 使用者卡片（Lemma 或 Phrase 的學習狀態）
CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  target_type TEXT NOT NULL,           -- 'lemma' | 'phrase'
  target_id INTEGER NOT NULL,
  state INTEGER NOT NULL DEFAULT 0,    -- 0=New, 1..4=Learning, 5=Known, -1=Ignored
  user_meaning TEXT,                   -- 使用者自訂釋義
  user_note TEXT,
  srs_state_json TEXT,                 -- FSRS: { stability, difficulty, due, lapses, reps }
  first_seen_at INTEGER,
  last_reviewed_at INTEGER,
  exposures INTEGER DEFAULT 0,         -- 在閱讀中出現並看到的次數
  UNIQUE(target_type, target_id)
);

-- 出現位置（用於「回到上次看到這個詞的地方」）
CREATE TABLE occurrences (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  document_id INTEGER NOT NULL REFERENCES documents(id),
  page_num INTEGER NOT NULL,
  char_start INTEGER,
  char_end INTEGER,
  sentence TEXT,                       -- 該句上下文（快取）
  llm_sense_json TEXT                  -- LLM 對此處該詞的句中含義解析（快取）
);

-- 複習紀錄
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  rating INTEGER NOT NULL,             -- FSRS: 1=Again, 2=Hard, 3=Good, 4=Easy
  reviewed_at INTEGER NOT NULL,
  elapsed_days REAL,
  next_due INTEGER
);

-- LLM 呼叫快取（避免重複 billing / rate limit）
CREATE TABLE llm_cache (
  id INTEGER PRIMARY KEY,
  prompt_hash TEXT UNIQUE NOT NULL,    -- SHA-256(model + prompt + context)
  model TEXT,
  response_json TEXT,
  created_at INTEGER,
  token_cost INTEGER
);

-- 設定
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX idx_cards_state ON cards(state);
CREATE INDEX idx_cards_srs_due ON cards(json_extract(srs_state_json, '$.due'));
CREATE INDEX idx_occ_card ON occurrences(card_id);
CREATE INDEX idx_occ_doc ON occurrences(document_id, page_num);
```

**信心度 0.85**。實際 migration 時可能需要調整索引。

---

## 6. 關鍵模組設計

### 6.1 PDF 渲染與 Layout 保留（§7.1）

**核心策略**：用 PDF.js 的 **canvas 層 + text 層雙層疊加**。

* **canvas 層**：原始 PDF 的視覺渲染（字、圖、公式一切照舊）。
* **text 層**：PDF.js 生成的可選擇透明文字，每個 `TextItem` 對應一個絕對定位的 `<span>`。這些 span 本來用於選取/搜尋，我們在其上再掛事件與高亮樣式。
* **互動層**：我們把 text 層的 span 進一步拆分到**單詞粒度**（PDF.js 的 textItem 常常是整段或整行），並為每個 word span 掛 `data-lemma-id`、`data-state`。

關鍵坑：
* PDF 中英文單詞可能被**連字符斷行**（如 "algo-\nrithm"）。需要在 tokenize 前跨 textItem 合併。
* **雙欄論文**：PDF.js textItem 的順序 ≠ 閱讀順序，需用 x/y 座標重排。
* **數學公式/特殊字元**：OCR-free 的 PDF 裡這些可能是 glyph 而非文字，應標記為「非詞」跳過。

**信心度 0.75**（此處是最大技術風險之一，見 §12）。

### 6.2 文字抽取與 Tokenize

**管線**：

```
raw textItems (PDF.js)
  → 跨 item 拼接行、處理斷字
  → 段落/句子切分 (blank-line + punctuation)
  → spaCy.tokenize → (token, lemma, POS, is_stop, is_punct)
  → 過濾掉：引用 [12], (Smith, 2020), URL, email, 數字, 單字母
  → 合併多詞 NER (spaCy 的 ents，如 "United Nations")
  → 輸出 tokens[] 寫入 pages.tokens_json
```

**學術專屬過濾規則**（regex）：

```
CITATION_NUM    = /\[\d+(?:,\s*\d+)*\]/g
CITATION_AUTHOR = /\([A-Z][a-zA-Z]+(?:\s+et\s+al\.?)?(?:,\s*\d{4}[a-z]?)\)/g
EQUATION_INLINE = /\$[^$]+\$/g  (若是 LaTeX 源)
FIGURE_REF      = /(?:Fig(?:ure)?|Table|Eq(?:uation)?|Sec(?:tion)?)\.?\s*\d+/g
```

### 6.3 短語與學術表達偵測

**三種來源疊加**：

1. **硬編碼學術公式表**（~300 個高頻）：`"it is well known that"`, `"with respect to"`, `"as a consequence"`, `"on the one hand ... on the other hand"` 等。來自 Academic Phrasebank（Manchester 大學免費資源）。
2. **spaCy Matcher 規則**：`Verb + Prep + Noun`、`Adj + Noun` 高頻搭配。
3. **統計學習（t-score / PMI）**：對使用者讀過的所有文檔做 bigram / trigram 統計，閾值以上的高頻搭配自動進入候選。

```python
# 概念代碼
def detect_phrases(doc):
    phrases = []
    # 1. 規則匹配
    for m in academic_phrasebank_matcher(doc):
        phrases.append(('academic_formula', m.text))
    # 2. 依存結構的搭配
    for verb in [t for t in doc if t.pos_ == 'VERB']:
        for child in verb.children:
            if child.dep_ in ('dobj', 'prep') and child.pos_ in ('NOUN', 'ADP'):
                phrases.append(('collocation', f"{verb.lemma_} {child.text}"))
    # 3. 統計（離線批次，non-realtime）
    return dedup(phrases)
```

**信心度 0.7**——短語品質跟語料量強相關，需要實際跑一批論文調閾值。

### 6.4 詞典與釋義管線

優先順序（快 → 慢）：

```
1. cards / lemmas 本地 (<1ms)
2. ECDICT（英漢，包含 CEFR/COCA/BNC） (<5ms)
3. WordNet（英英、同義詞、hyponym） (<10ms)
4. spaCy POS/lemma 推斷（若詞典沒有）
5. LLM（句中含義、僅在用戶呼叫時）
```

Popover 第一次打開只要 1–3，延遲 < 20ms。LLM 用 lazy + 按鈕觸發。

### 6.5 LLM 整合（句中含義 / 句法角色 / 學科語義）

**Prompt 範本**（傳給 Gemini Flash）：

```
你是學術英語閱讀助教。給定下列句子與目標詞，請輸出 JSON：

句子："{sentence}"
目標："{token}"（在句中的字元區間 {start}-{end}）
文檔領域："{domain}"   // 例：cs.CL
使用者母語："{user_native_lang}"  // 例：zh-TW

輸出格式（嚴格 JSON）：
{
  "sense_in_context": "...",       // 此句脈絡下的最精準中文釋義，一行
  "syntactic_role": "...",         // 主語/賓語/定語/修飾...，含句法樹簡述
  "domain_nuance": "...",          // 在該學科下是否有特殊意涵
  "paraphrase": "...",             // 用簡單英文改寫該詞在此句中的意思
  "level_hint": "A2|B1|B2|C1|C2",  // 該詞在學術語境中的難度（不是通用 CEFR）
  "collocations": ["...", "..."]   // 1-3 個同句可積累的搭配
}
```

**關鍵工程細節**：

* **Streaming**：UI 用 SSE 漸進渲染，避免等待 1-2 秒。
* **Cache key**：`SHA256(model + sentence + token + start + end + domain)`，儲存在 `llm_cache`。
* **Rate limit**：Gemini Free 有 15 RPM / 1M TPM。做 client 側排隊。
* **離線降級**：無網時顯示「點擊生成」，跳過此功能但不影響閱讀。

信心度 **0.8**——Gemini 免費額度目前夠，但條款可能變。建議設計上允許用戶切換/加入自己的 API key。

### 6.6 等級分類系統（CEFR × AWL/NGSL 雙標籤）

每個 lemma 有三條元資料：

| 標籤 | 來源 | 用途 |
|---|---|---|
| CEFR (A1–C2) | ECDICT / English Vocabulary Profile | 通用難度（顯示用） |
| AWL sublist (1–10) | Coxhead 2000 原版 | 標記「這是學術常用詞」 |
| NGSL rank | NGSL 開放資料 | 通用高頻對照 |

**UI 呈現**：單詞 popover 右上角顯示 `B2 · AWL3`。過濾面板可以「顯示所有 C1+ 未知詞」或「只看 AWL」。

**使用者熟悉度 0–5**（LingQ 風格）獨立於難度標籤。

### 6.7 記憶系統（雙模式）

**模式 A：LingQ 風格**（預設，低門檻）

```
0 = New（藍底）
1 = Learning 初見
2 = Learning 眼熟
3 = Learning 基本懂
4 = Learning 流暢
5 = Known（無高亮）
-1 = Ignored（名字、數字、不學的詞）
```

**模式 B：FSRS 風格**（進階）

啟用後，狀態為 1–4 的卡片會進入複習佇列，每日根據 FSRS 演算法計算 due。Rating 仍沿用 Again / Hard / Good / Easy。

**切換**：設定頁可以切換，切換時 state 做對應映射。

**FSRS 4.5 簡化版公式**（參考，實作用 `ts-fsrs` 套件）：

```typescript
import { FSRS, createEmptyCard, Rating } from 'ts-fsrs';
const fsrs = new FSRS({});
const card = cards.find(...) ?? createEmptyCard(now);
const scheduling = fsrs.repeat(card, now);
const next = scheduling[Rating.Good];
// next.card.due 即為下次到期時間
```

---

## 7. UI / UX 設計

### 7.1 主要視圖（三欄布局）

```
┌───────────────────────────────────────────────────────────────┐
│  Top bar: 檔名 / 搜尋 / 領域 / 統計 / 設定                     │
├─────┬─────────────────────────────────────────┬───────────────┤
│ 大  │                                          │ Sidebar       │
│ 綱  │                                          │ (切換標籤)    │
│     │            PDF 原版渲染                  │  · 本文詞庫    │
│ 縮  │        （高亮疊加 overlay）              │  · 複習佇列    │
│ 略  │                                          │  · 統計        │
│ 圖  │                                          │  · 筆記        │
├─────┴─────────────────────────────────────────┴───────────────┤
│  Bottom: 頁碼 / 縮放 / 模式切換 / 進度條                       │
└───────────────────────────────────────────────────────────────┘
```

### 7.2 互動細節

* **單擊詞** → popover（釋義 + 當前狀態按鈕 1/2/3/4/5/X）。
* **雙擊詞** → popover + 自動呼叫 LLM 句中含義。
* **選取多詞** → 彈出「建立短語卡片」按鈕。
* **右鍵** → 上下文選單：加註、跳到其他出現位置、搜尋、忽略、加入學科詞表。
* **鍵盤快捷鍵**（全可重綁）：
  * `1..5` / `x` = 切換當前高亮詞狀態
  * `j / k` = 下一個/上一個未知詞
  * `/` = 搜尋
  * `Cmd/Ctrl+K` = 指令面板
  * `Space` = 翻頁
* **高亮漸變色**：
  * New = 藍底 (`hsl(210,100%,90%)`)
  * Learning 1–4 = 黃 → 淡黃（飽和度遞減）
  * Known / Ignored = 無底
  * 短語用下劃虛線而非底色

### 7.3 首次開啟新 PDF 的流程

```
選擇 PDF
  → 計算 hash，查是否已處理過
  → 若無：
     · 背景 tokenize 所有頁（進度條）
     · 領域推斷（LLM 或 keyword matching）
     · 提取 top 30 高頻專業詞 → 彈窗讓用戶批次標記：
        「這篇文章出現以下專業詞，快速標記你的熟悉度：」
  → 進入閱讀視圖
```

這個批次標記是**學術場景的關鍵優化**——科研人員對「attention mechanism」這類詞早已熟悉，不想每次點一下標為 Known。

### 7.4 無干擾原則

* popover 滑鼠離開 500ms 自動消失。
* 不彈廣告、不打擾、預設不朗讀。
* 護眼：提供深色主題 + 紙黃主題。
* 專注模式：隱藏側邊欄，只剩 PDF + 當前 popover。

---

## 8. 學術論文專用優化

這節把散落各處的學術優化集中列出，方便驗證差異化是否成立。

| 優化項 | 實作位置 | 為什麼 LingQ/Migaku 沒有 |
|---|---|---|
| 保留原 PDF layout（雙欄、圖表、公式） | §6.1 | 它們只處理線性純文字 |
| 引用不進生詞流程 | §6.2 regex | 通用閱讀沒這個需求 |
| AWL/NGSL 雙詞表標籤 | §6.6 | 通用 CEFR 就夠了 |
| 首次批次標記專業詞 | §7.3 | 一般閱讀詞量分佈不同 |
| 句中含義 LLM 特別考慮「學科語義」 | §6.5 prompt | 一般翻譯夠用 |
| 學術表達短語庫（with respect to…） | §6.3 | |
| 跨論文術語表繼承 | §5 lemmas 跨文檔 | LingQ 以「課程」為單位，跨度較碎 |
| 匯出可含引用資訊（BibTeX） | P2 | 學術寫作工作流才需 |

---

## 9. 專案目錄結構建議

```
lexigraph/
├── package.json
├── electron/
│   ├── main.ts                 # Electron 主進程入口
│   ├── ipc/                    # IPC handler
│   │   ├── documents.ts
│   │   ├── cards.ts
│   │   ├── llm.ts
│   │   └── python-bridge.ts
│   ├── db/
│   │   ├── schema.sql
│   │   ├── migrations/
│   │   └── client.ts           # better-sqlite3 wrapper
│   └── services/
│       ├── llm-gateway.ts
│       └── dict-local.ts       # ECDICT + WordNet
├── python/
│   ├── requirements.txt        # spacy, scikit-learn
│   ├── server.py               # FastAPI 127.0.0.1:xxxx
│   ├── tokenize_page.py
│   ├── detect_phrases.py
│   └── vocab_lists/
│       ├── awl.csv
│       ├── ngsl.csv
│       └── academic_formulas.txt
├── src/ (renderer)
│   ├── main.tsx
│   ├── App.tsx
│   ├── views/
│   │   ├── Library.tsx         # 我的文檔列表
│   │   ├── Reader.tsx          # 閱讀視圖
│   │   ├── Review.tsx          # 複習頁
│   │   └── Stats.tsx
│   ├── components/
│   │   ├── PdfViewer/
│   │   ├── WordOverlay/
│   │   ├── WordPopover/
│   │   ├── PhraseSelector/
│   │   └── Sidebar/
│   ├── store/
│   │   ├── document.ts         # zustand
│   │   ├── cards.ts
│   │   └── ui.ts
│   ├── hooks/
│   ├── lib/
│   │   ├── pdfjs/
│   │   ├── tokenize.ts         # 前端輕量 tokenize (fallback)
│   │   └── highlight.ts
│   └── styles/
├── resources/
│   ├── ecdict.db
│   └── wordnet/
├── tests/
└── electron-builder.yml
```

---

## 10. 開發階段規劃

### Phase 0：技術驗證（1 週）

目標：在動手做產品前，先確認三個技術風險可解。

- [ ] **POC-A**: PDF.js 載入論文 + 把 textItem 切到單詞粒度 + 可點擊
- [ ] **POC-B**: spaCy side-car 跑通，對 10 篇論文測試 POS 正確率
- [ ] **POC-C**: Gemini Flash 免費 API 呼叫 10k 次測 rate limit 是否夠日常使用

**出口標準**：三項都能解決 → 進 Phase 1；任一項有問題 → 回本文件調整方案。

### Phase 1：MVP（3–4 週）

- [ ] 專案骨架、Electron + React + SQLite 串通
- [ ] PDF 渲染、text 層、word 粒度事件
- [ ] ECDICT 整合、基本 popover
- [ ] LingQ 模式的狀態切換 + 高亮
- [ ] 最小側邊欄：本文詞庫列表
- [ ] 匯入/匯出設定
- [ ] 單機打包成 .exe / .dmg

完成標準：能用它讀一篇論文並標記 100 個生詞，再次開啟能保留狀態。

### Phase 2：核心差異化（3–4 週）

- [ ] Python side-car + spaCy tokenize
- [ ] 短語偵測 + 選取建立短語卡片
- [ ] LLM gateway + 句中含義
- [ ] AWL / NGSL 等級雙標籤
- [ ] 首次開啟的批次標記流程
- [ ] 引用/公式跳過
- [ ] 跨文檔詞庫繼承

完成標準：能讀第二篇同領域論文時，「我已經認識的詞」不再高亮。

### Phase 3：記憶與完善（2–3 週）

- [ ] FSRS 模式 + 複習頁
- [ ] 統計儀表板
- [ ] Anki 匯出
- [ ] 快捷鍵系統
- [ ] 深/淺/紙黃三主題
- [ ] 設定頁、LLM key 管理
- [ ] 效能優化（大 PDF 測試：1000 頁）
- [ ] 自動更新

### Phase 4（P2，按需）

- TTS、週報、雲同步、雙語對照等。

**總計時程估計**：9–14 週全職單人開發到 P1 完成。信心度 **0.7**（時程是最容易低估的）。

---

## 11. 效能與規模預期

| 指標 | 目標 | 說明 |
|---|---|---|
| 點擊詞 → popover 顯示 | < 50ms | 本地詞典 |
| LLM 句中含義首字元 | < 1.5s | Gemini Flash streaming |
| 開啟 100 頁 PDF | < 3s | 首次含 tokenize；之後 < 1s |
| 開啟 1000 頁書 | < 15s | 用 worker + 增量 tokenize |
| 詞庫規模 | 50k+ lemmas 下仍 < 20ms 查詢 | SQLite 索引即可 |
| 安裝體積 | < 250MB | Electron 150 + spaCy model 50 + 詞典 30 |
| 記憶體 | < 600MB 讀 500 頁 PDF | PDF.js 有頁面快取管理 |

---

## 12. 風險與緩解（信心度 < 0.8 的項目）

| 風險 | 信心度 | 緩解 |
|---|---|---|
| **PDF layout 保留 × 單詞點擊的工程複雜度**。雙欄、斷字、公式會打亂 textItem。 | 0.75 | Phase 0 POC-A 先驗證；已有開源案例（NAPS2、Zotero 選取）證明可行但有 edge case。 |
| **spaCy 在學術文本 POS 準確度**，尤其稀有術語、連字符詞。 | 0.75 | 評估 `en_core_web_trf`（transformer，慢但準）；允許使用者在 settings 切換。 |
| **免費 LLM 額度長期穩定性**。Gemini Flash 條款未來可能變。 | 0.7 | 抽象 LLM gateway，支援多後端；提供「自帶 API key」選項；核心功能（釋義、等級、SRS）完全不依賴 LLM。 |
| **短語自動偵測品質**。可能噪音多，打擾閱讀。 | 0.7 | 預設只做**建議**（淺色下劃虛線），點擊後才入庫；用戶可關閉。 |
| **開發時程**。單人 9–14 週是樂觀估計。 | 0.65 | Phase 切分明確；每個 Phase 產出都是可用產品；Phase 4 可無限延後。 |
| **市場**。學術閱讀者比通用語言學習者少一個數量級，能否回本要看商業模式（開源免費？訂閱？）。 | 0.6 | 本文件不覆蓋商業模式；建議開源+捐贈 / 訂閱 LLM 額度作為思考方向。 |
| **跨平台字型/中文渲染**。Linux 下某些 PDF 字型可能缺。 | 0.8 | PDF.js 有 fallback；必要時內嵌 Noto 字型。 |

---

## 13. 附錄 A：關鍵演算法偽代碼

### A.1 PDF textItem → word span 拆分

```typescript
async function splitTextLayerToWords(pdfPage) {
  const textContent = await pdfPage.getTextContent();
  const mergedLines = mergeItemsByBaseline(textContent.items);  // 依 y 合併同行
  const dehyphenated = removeLineBreakHyphens(mergedLines);     // 處理 "algo-\nrithm"
  const sentences = splitSentences(dehyphenated);

  return sentences.flatMap(sent => {
    const tokens = tokenize(sent.text);  // 輕量版，或呼叫 spaCy
    return tokens.map(tok => ({
      text: tok.text,
      lemma: tok.lemma,
      pos: tok.pos,
      bbox: computeBBoxFromOriginalItems(sent, tok),  // 還原像素座標
      sentenceId: sent.id,
    }));
  });
}
```

### A.2 跨文檔 lemma 狀態繼承

```typescript
// 開啟新 PDF 時
function applyExistingStatesToNewDoc(docId) {
  const tokens = getAllTokensOf(docId);
  const lemmaKeys = [...new Set(tokens.map(t => `${t.lemma}|${t.pos}`))];
  const existing = db.prepare(
    `SELECT l.lemma, l.pos, c.state, c.user_meaning
     FROM lemmas l JOIN cards c ON c.target_type='lemma' AND c.target_id=l.id
     WHERE (l.lemma || '|' || l.pos) IN (${placeholders(lemmaKeys.length)})`
  ).all(lemmaKeys);
  return existing;  // 前端直接套用高亮
}
```

### A.3 短語候選打分

```python
from math import log
def pmi(a, b, bigram_freq, unigram_freq, N):
    p_ab = bigram_freq[(a, b)] / N
    p_a = unigram_freq[a] / N
    p_b = unigram_freq[b] / N
    return log(p_ab / (p_a * p_b), 2) if p_ab > 0 else -inf

# 閾值 PMI > 5 且 bigram_freq >= 5
```

---

## 14. 附錄 B：推薦的開源資源

| 資源 | 授權 | 用途 |
|---|---|---|
| [ECDICT](https://github.com/skywind3000/ECDICT) | MIT | 英漢詞典，含 CEFR/COCA/BNC/OXFORD |
| [WordNet 3.1](https://wordnet.princeton.edu/) | Princeton license | 英英釋義、同義詞、上下位 |
| [spaCy models](https://spacy.io/models/en) | MIT | tokenize / POS / lemma / NER |
| [NGSL](https://www.newgeneralservicelist.com/) | CC BY-SA | 通用高頻詞表 |
| [AWL](https://www.wgtn.ac.nz/lals/resources/academicwordlist) | CC | 學術詞表 |
| [Academic Phrasebank](https://www.phrasebank.manchester.ac.uk/) | CC BY-NC-SA | 學術表達庫（純研究用途 OK，商用需授權） |
| [PDF.js](https://github.com/mozilla/pdf.js) | Apache 2.0 | PDF 渲染 |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT | FSRS 複習演算法 |

⚠️ Academic Phrasebank 是 CC BY-NC-SA，**商用需另洽授權**。可自建一個類似結構的無版權表替代。

---

## 15. 元認知評估總結

**整體方案信心度：0.82**

**分項**：
* 技術可行性：**0.85**（Electron + PDF.js + SQLite 都是成熟堆疊）
* 差異化定位：**0.85**（學術場景確有空白，但窄）
* 時程估計：**0.65**（保守起見 ×1.5）
* 商業成立：**0.60**（不是本文件範圍，僅提醒）

**主要偏誤檢查**：
* ✅ 是否過度樂觀？PDF layout 這塊在 §12 已降級 0.75。
* ✅ 是否錯過替代方案？有考慮 Tauri / Python-only，依你需求排除。
* ✅ 是否混淆「我想要」和「使用者要」？學術批次標記、AWL 標籤、引用跳過都來自真實學術閱讀痛點。
* ⚠️ 尚未做的：實際找 2–3 位研究生做 user interview 驗證需求強度。建議 Phase 0 期間做。

**下一步建議**：

1. 看完本文件，針對 §12 風險或 §2 功能清單給我調整意見。
2. 我可以直接用 Phase 0 的三個 POC 去驗證關鍵風險（尤其 POC-A：PDF.js 單詞粒度點擊）。
3. 或如果你已有信心，下一輪對話我可以開始搭 MVP 骨架（Electron + React + PDF.js + SQLite 串通）。

---

*— 文件結束 —*
