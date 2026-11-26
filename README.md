# 中藥藥物學互動式學習網站（第一階段）

依《中華藥物學》講義整理的互動式學習網站：藥材搜尋與多條件篩選、成分樹反查、配伍禁忌查詢、總論、回報錯誤。純靜態網站，部署在 GitHub Pages，可離線使用，手機優先。

> 整理自老師講義與公開資料，僅供學習使用。

## 文件

- [`docs/部署教學.md`](docs/部署教學.md)：從零開始上線（GitHub Pages ＋ Google Apps Script 回報）
- [`docs/資料維護說明.md`](docs/資料維護說明.md)：怎麼改藥材資料、檢查失敗怎麼辦、本機預覽

## 專案結構

```
index.html, manifest.webmanifest, sw.js   網站入口、PWA、離線快取
css/style.css                             樣式（淺色／深色／高對比三組變數）
js/                                       程式（ES modules，沒有建置步驟）
  config.js                               唯一需要手動設定的檔案（回報網址）
  data.js  search.js  filters.js          資料載入、搜尋、篩選
  lib/derive.js                           衍生資料計算（瀏覽器與 Node 共用）
  views/                                  各頁面
data/                                     所有藥學資料（只改這裡就能更新內容）
  compounds.json                          化合物結構式對照（圖檔在 structures/）
  derived/part_groups.json                衍生對照：使用部位分組（待審核）
gas/Code.gs                               回報錯誤的 Google Apps Script
structures/                               化學結構式 SVG
scripts/                                  資料檢查與測試（Node 22）
.github/workflows/pages.yml               推送時先檢查資料，通過才部署
docs/                                     部署與維護文件
```

## 設計重點

- **資料與程式完全分離**：改 `data/*.json` 即可更新內容，不需建置。
- **不補資料**：講義沒有的欄位（許多藥的四氣、五味、歸經、品級）顯示「未標示」；篩選時會提示因此未列入的數量。
- **搜尋**：藥名、拉丁名、學名、方劑、成分、功效、科名、附藥、炮製備註九類欄位加權；支援異體字與別名、常用簡體字（麻黄→麻黃）、化合物同義詞、科別別名、化學類別展開（搜「生物鹼」會找到含該類成分的藥）；結果顯示命中欄位並高亮。
- **篩選**：分類、四氣、五味、歸經、品級、成分類別、科別、使用部位、小重點；不同條件之間「且」，同條件內「或」；每個選項顯示目前條件下的藥材數；狀態寫在網址，可分享。
- **配伍禁忌**：合併總論規則（十八反、十九畏、妊娠）與各藥自身的七情資料，候選包含不在本資料庫內的規則藥名（如烏頭、藜蘆）。

## 技術選擇與原因

與 Step 3 規格不同之處：**未使用 Vite + Preact + TypeScript 與 MiniSearch／vite-plugin-pwa**，改用純原生 ES modules、自寫的搜尋與 Service Worker。原因：開發環境無法安裝套件（沒有網路）。附帶好處是沒有建置步驟，非工程人員改完資料就能上線。若之後頁面增多想改用框架，資料層與搜尋層（`js/data.js`、`js/search.js`、`js/filters.js`、`js/lib/derive.js`）不含 DOM，可原樣沿用。

## 新增 JS 模組時

`index.html` 用 `<link rel="modulepreload">` 預先平行下載所有模組；`sw.js` 的 `SHELL` 清單決定離線快取哪些檔案。新增 `js/views/xxx.js` 時兩處都要加一行（沒加也能運作，只是第一次開啟較慢、離線時缺檔），並把 `js/config.js` 的 `appVersion` 加一。

## 指令（需要 Node.js 22 以上）

```
node scripts/validate.mjs                 # 資料檢查
node scripts/test_search.mjs              # 搜尋自我測試
node scripts/merge_herbs.mjs a.json b.json c.json   # 把分段的藥材檔合併成 data/herbs.json
node scripts/make_part_groups.mjs --force           # 重新草擬使用部位分組（會覆蓋你已審核的檔案！）
python3 -m http.server 8000               # 本機預覽，開 http://localhost:8000
```

## 第一階段尚未提供（依專案決議）

歷屆國考題與答案、藥材實拍照片（`images` 保持空陣列）、考點整理頁與藥材比較頁（第二階段）。化學結構式圖已提供（`data/compounds.json` ＋ `structures/`）。
