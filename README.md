# Lexigraph

**Live demo / 線上示範：** [https://read.zhenxinghong.com](https://read.zhenxinghong.com)

Lexigraph is a static academic PDF reader. It keeps the original page layout, tracks English vocabulary as 認識 or 學習中 (plus a separate ignore flag), and explains words in context with a local dictionary or your own AI key.

It is built for a Mandarin-speaking reader working through English papers: click a word on the PDF, see a Chinese gloss and CEFR / Academic Word List tags when the bundled data has them, and keep the known-state of inflected forms together (`study` / `studies` / `studied`).

Lexigraph 是一套靜態的學術 PDF 閱讀器。它保留原本的頁面排版，以「認識」或「學習中」追蹤英文詞彙（另外還有獨立的忽略標記），並用本機詞典或你自己的 AI 金鑰，依上下文解釋單字。

它是為閱讀英文論文的華語使用者而做的：在 PDF 上點一個單字，就能看到中文釋義；如果內建資料有對應項目，也會看到 CEFR 與學術詞彙表（Academic Word List）標記。屈折變化的詞形共用同一個熟悉度（`study` / `studies` / `studied`）。

## Features

- PDF pages rendered with pdf.js, with clickable word boxes over the original layout
- Two-column reading order for typical papers, with running headers, footers, and page numbers left out of the text sent to explanations
- Sentence splitting that keeps abbreviations such as `e.g.`, `i.e.`, `et al.`, `Fig.`, and `pp.` inside the sentence
- Familiarity is 認識 or 學習中. Learning words are pink (`pink-300`, `#f9a8d4`) on the PDF overlay and in reflow. Known and ignored stay uncolored. Saved levels 1–4 are learning.
- Per-page learning / known ratio in the reader header
- After a page turn, words you did not click become 認識. The confirm list opts words into 學習中; unchecked words on that list are still marked known. Reference pages, author-like names, email local-parts, all-caps place abbreviations, citations, and numbers are skipped. Undo covers the known marks.
- Inflected forms share one known-state. Existing browser data is migrated once, after a backup is stored
- Offline ECDICT glosses, a curated academic seed, phrase underlines, browser TTS, simplified FSRS review, and CSV / Anki export
- Optional AI explanations through Gemini, Groq, or a local Ollama server
- Full JSON backup and restore (merge or replace). Replace asks you to type `REPLACE` and stores a safety copy first
- Collapsible library and word-card drawers below the desktop width
- Service worker caches the app shell and the pdf.js worker. The dictionary is cached on first fetch and is not on the first-paint path

## 功能

- 以 pdf.js 繪製 PDF 頁面，並在原本的排版上放可點擊的單字框
- 一般論文採雙欄閱讀順序；頁首、頁尾與頁碼不會送去產生解釋
- 斷句時會把 `e.g.`、`i.e.`、`et al.`、`Fig.`、`pp.` 這類縮寫留在同一句裡
- 熟悉度是「認識」或「學習中」。學習中的單字在 PDF 覆蓋層與重排文字裡是粉紅色（`pink-300`，`#f9a8d4`）。認識與忽略維持不著色。已儲存的等級 1–4 都算學習中
- 閱讀器頁首會顯示每一頁的學習中／認識比例
- 翻頁之後，你沒有點過的單字會變成認識。確認清單用來把單字改成學習中；清單上沒有勾選的單字仍會標成認識。參考文獻頁、看起來像作者姓名的字串、電子郵件 @ 前面的部分、全大寫的地名縮寫、引用與數字會略過。這些標成認識的動作可以復原
- 屈折變化的詞形共用同一個熟悉度。既有的瀏覽器資料會在先存一份備份之後，遷移一次
- 離線 ECDICT 釋義、整理過的學術種子詞、片語底線、瀏覽器語音合成、簡化的 FSRS 複習，以及 CSV／Anki 匯出
- 可選的 AI 解釋，經由 Gemini、Groq，或本機的 Ollama 伺服器
- 完整的 JSON 備份與還原（合併或取代）。取代前要輸入 `REPLACE`，而且會先存一份安全複本
- 寬度低於桌面版面時，書庫與單字卡抽屜可以收合
- Service Worker 會快取應用程式外殼與 pdf.js worker。詞典在第一次取得時快取，不在第一次畫面出現前的路徑上

## Privacy

Everything you read stays in this browser.

- PDFs, word states, notes, review schedules, and phrase bookmarks are stored in IndexedDB
- Gemini and Groq API keys are stored in `localStorage` and are omitted from backups unless you check “Include API keys”
- Explanations are requested from the provider you configure, directly from the browser. There is no Lexigraph server
- Ollama talks to `http://localhost:11434` on your machine. A site served over HTTPS will be blocked by the browser until Ollama’s `OLLAMA_ORIGINS` includes that site’s origin

## 隱私

你閱讀的內容都留在這個瀏覽器裡。PDF、單字資料，以及選用的 AI 金鑰都只存在瀏覽器中。Lexigraph 沒有自己的伺服器。

- PDF、單字狀態、筆記、複習排程與片語書籤存在 IndexedDB
- Gemini 與 Groq 的 API 金鑰存在 `localStorage`。除非你勾選「Include API keys」，否則備份不會帶出這些金鑰
- 解釋是由瀏覽器直接向你設定的提供者請求的。沒有 Lexigraph 伺服器
- Ollama 連的是你這台電腦上的 `http://localhost:11434`。如果網站以 HTTPS 提供，瀏覽器會擋住這段連線，直到 Ollama 的 `OLLAMA_ORIGINS` 包含該網站的來源（origin）

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run build        # tsc + vite build → dist/
npm run preview      # serve dist/
```

Node 20+ is enough. The app is React 18, TypeScript, Vite 5, and Tailwind.

Windows double-click launchers are documented in [LAUNCH.md](LAUNCH.md).

## 開發

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run build        # tsc + vite build → dist/
npm run preview      # serve dist/
```

Node 20 或更新版本即可。應用程式是 React 18、TypeScript、Vite 5 與 Tailwind。

`npm install` 安裝相依套件。`npm run dev` 在本機 `http://localhost:5173` 啟動開發伺服器。`npm test` 用 vitest 跑測試。`npm run typecheck` 執行 `tsc --noEmit`。`npm run build` 先做型別檢查，再用 Vite 建置到 `dist/`。`npm run preview` 用來預覽 `dist/`。

Windows 的雙擊啟動器寫在 [LAUNCH.md](LAUNCH.md)。

## Deploy as a static site

`npm run build` writes `dist/`. Upload that directory to any static host. The asset URLs are relative (`base: "./"`), so the site can live at a domain root or in a subfolder.

The live demo is [read.zhenxinghong.com](https://read.zhenxinghong.com), hosted as static files on Cloudflare. Publish `dist/` as a static asset; do not add a Worker unless you later want one. No secrets belong in the repository or in the deployed files.

After the first online visit the service worker caches the shell. The dictionary (`dict/ecdict-core.json.gz`, about 13 MB) downloads once the browser is idle and is then available offline. Cloudflare’s static asset limit is above that file size; if a host rejects it, put the gzip on object storage and point the app at it.

A double-clickable single file can still be built for local use:

```bash
npm run build
node scripts/make-singlefile.mjs dist Lexigraph.html
```

That file embeds the dictionary and the pdf.js worker so it can open under `file://`. The service worker is not used in that mode.

## 以靜態網站部署

`npm run build` 會寫出 `dist/`。把這個目錄上傳到任何靜態網站主機即可。資源網址是相對路徑（`base: "./"`），所以網站可以放在網域根目錄，也可以放在子資料夾。

線上示範是 [read.zhenxinghong.com](https://read.zhenxinghong.com)，以靜態檔案放在 Cloudflare。把 `dist/` 當成靜態資源發布；除非你之後真的需要，否則不要加 Worker。儲存庫與部署出去的檔案裡都不應放密鑰。

第一次在線上開啟之後，Service Worker 會快取應用程式外殼。詞典（`dict/ecdict-core.json.gz`，大約 13 MB）會在瀏覽器閒置時下載一次，之後就可以離線使用。Cloudflare 的靜態資源大小上限高於這個檔案；如果某個主機拒絕它，把 gzip 放到物件儲存，再讓應用程式指向那個位址。

本機仍可做成一個雙擊就能開的單一檔案：

```bash
npm run build
node scripts/make-singlefile.mjs dist Lexigraph.html
```

那個檔案會嵌入詞典與 pdf.js worker，因此可以用 `file://` 開啟。這個模式不會使用 Service Worker。

## Credits and licenses

Project code is [MIT](LICENSE), copyright Zhenxing Hong. See [NOTICE](NOTICE).

| Piece | License |
|---|---|
| [ECDICT](https://github.com/skywind3000/ECDICT) | MIT (skywind3000) |
| [pdf.js](https://github.com/mozilla/pdf.js) | Apache-2.0 |
| Academic phrase list in `src/lib/dict/phrases.ts` | Original glosses written for this app |
| Academic Word List families in `src/lib/dict/awl-coxhead.json` | CC0 transcription of Coxhead (2000); see below |

The Academic Word List is Averil Coxhead's 570 word families (Coxhead, A. (2000). A new academic word list. *TESOL Quarterly, 34*(2), 213–238; Victoria University of Wellington). The family members shipped here are the CC0 JSON from [lpmi-13/machine_readable_wordlists](https://github.com/lpmi-13/machine_readable_wordlists) (`Academic/AWL/AWL.json`), which cites that list. Sublist numbers come from that file. The `optimise` / `optimize` family is not one of the 570; it is an app supplement because computer-science papers use it. CEFR labels on seed entries are editorial. CEFR labels that come from ECDICT are a rough map from its exam tags and frequency bands (`scripts/prepare-ecdict.mjs`), not an official CEFR word list.

## 致謝與授權

專案程式碼為 [MIT](LICENSE)，著作權人 Zhenxing Hong。另見 [NOTICE](NOTICE)。

| 項目 | 授權 |
|---|---|
| [ECDICT](https://github.com/skywind3000/ECDICT) | MIT（skywind3000） |
| [pdf.js](https://github.com/mozilla/pdf.js) | Apache-2.0 |
| `src/lib/dict/phrases.ts` 裡的學術片語表 | 為此應用撰寫的原創釋義 |
| `src/lib/dict/awl-coxhead.json` 裡的學術詞彙表詞族 | Coxhead（2000）的 CC0 轉錄；見下文 |

學術詞彙表（Academic Word List）是 Averil Coxhead 的 570 個詞族（Coxhead, A. (2000). A new academic word list. *TESOL Quarterly, 34*(2), 213–238; Victoria University of Wellington）。這裡附上的詞族成員，來自 [lpmi-13/machine_readable_wordlists](https://github.com/lpmi-13/machine_readable_wordlists) 的 CC0 JSON（`Academic/AWL/AWL.json`），該檔案引用了這份詞表。子表編號來自那個檔案。`optimise` / `optimize` 這個詞族不在那 570 個之內；因為電腦科學論文會用到，所以由本應用另外補充。種子詞上的 CEFR 標記是編輯上的判斷。來自 ECDICT 的 CEFR 標記，是依它的考試標籤與詞頻帶所做的粗略對應（`scripts/prepare-ecdict.mjs`），不是官方的 CEFR 詞表。
