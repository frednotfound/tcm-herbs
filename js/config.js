// 網站設定。需要改的只有這個檔案（回報網址）與 data/meta.json（資料版本）。
export const CONFIG = {
  siteName: '中藥藥物學互動式學習網站',
  shortName: '中藥藥物學',
  // 部署 Google Apps Script 後，把「網頁應用程式網址」貼在這裡（見 docs/部署教學.md 第 4 步）。
  // 留空時，回報表單會改成「複製內容」模式，不會送出任何資料。
  reportEndpoint: 'https://script.google.com/macros/s/AKfycbwJ5zqCWQv2G2D8CcHjWlaHUXgoB32DT-i6XoaDUWCAhubTko_vCyKx_hDSU2NUT5GXYA/exec',
  // 選用：Cloudflare Turnstile 網站金鑰（第一階段先不啟用，留空即可）。
  // 注意：只要這裡有填任何字，回報表單就會要求先通過驗證；填錯（例如隨便打一個數字）會讓回報永遠送不出去。
  turnstileSiteKey: '',
  // 程式版本：改了程式碼（不是資料）要部署時，把這個數字加一，讓離線快取更新
  appVersion: '8',
  disclaimer: '整理自課程講義與《臺灣中藥典第五版》，僅供學習使用',
  clinicalDisclaimer: '僅為課程整理，非臨床用藥依據',
  report: { cooldownSec: 60, maxPerHour: 5, minLen: 10, maxLen: 500 },
};
