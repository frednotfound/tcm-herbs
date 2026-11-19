/**
 * 中藥藥物學學習網站：回報錯誤接收器（Google Apps Script）
 *
 * 做三件事：
 *   1. 接收網站送來的回報（POST，內容為 JSON 字串）
 *   2. 擋掉機器人與洪水（honeypot、字數、每分鐘／每日上限、可選 Cloudflare Turnstile）
 *   3. 寫進 Google 試算表的「回報」工作表
 *
 * 部署步驟請看 docs/部署教學.md 第 4 節。
 */

// ======== 設定（要改的只有這一區） ========
var SHEET_NAME = '回報';
var MAX_PER_MINUTE = 10;    // 全站每分鐘最多收幾筆
var MAX_PER_DAY = 200;      // 全站每天最多收幾筆
var MIN_LEN = 10;           // 說明最少字數
var MAX_LEN = 500;          // 說明最多字數
var TYPES = ['藥材', '考題'];
var KINDS = ['成分', '功效', '配伍', '基原', '其他'];
var STATUSES = ['待處理', '已確認', '已修正', '不處理'];
var HEADERS = ['時間', '類型', '對象 id', '對象名稱', '問題所在', '說明', '聯絡方式', '頁面網址', '資料版本', '狀態', '處理備註'];
// 試算表編號：若這支 Script 是從試算表「擴充功能 > Apps Script」開啟的（綁定式），留空即可；
// 若是獨立的 Script，請到「專案設定 > 指令碼屬性」新增 SPREADSHEET_ID。
// 選用：Cloudflare Turnstile 密鑰請放在指令碼屬性 TURNSTILE_SECRET（不要寫在程式碼裡）。
// ==========================================

function doGet() {
  return ContentService.createTextOutput('回報接收器運作中').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    if (raw.length > 5000) return reply_(false, '內容過長');
    var p;
    try { p = JSON.parse(raw); } catch (err) { return reply_(false, '格式錯誤'); }

    // 1. honeypot：有填就假裝成功並丟棄，不讓機器人知道被擋
    if (p.website) return reply_(true);

    // 2. 欄位檢查
    var text = clean_(p.text, MAX_LEN + 50);
    if (text.length < MIN_LEN || text.length > MAX_LEN) return reply_(false, '說明字數需在 ' + MIN_LEN + '–' + MAX_LEN + ' 字之間');
    var type = TYPES.indexOf(p.type) >= 0 ? p.type : '藥材';
    var kind = KINDS.indexOf(p.kind) >= 0 ? p.kind : '其他';

    // 3. 可選：Turnstile 驗證
    var secret = PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET');
    if (secret) {
      if (!p.turnstile) return reply_(false, '缺少驗證');
      var v = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'post', payload: { secret: secret, response: String(p.turnstile) }, muteHttpExceptions: true
      });
      var vr = JSON.parse(v.getContentText() || '{}');
      if (!vr.success) return reply_(false, '驗證未通過');
    }

    // 4. 全站限速（CacheService，不是精確計數，但足夠擋洪水）
    if (!allow_()) return reply_(false, '目前收到的回報太多，請稍後再試');

    // 5. 寫入試算表（加鎖避免同時寫入互相覆蓋）
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = getSheet_();
      sheet.appendRow([
        new Date(), type, clean_(p.target_id, 80), clean_(p.target_name, 80), kind, text,
        clean_(p.contact, 100), clean_(p.page_url, 300), clean_(p.data_version, 40), '待處理', ''
      ]);
    } finally { lock.releaseLock(); }
    return reply_(true);
  } catch (err) {
    console.error(err);
    return reply_(false, '伺服器錯誤');
  }
}

/** 第一次部署前，在編輯器手動執行一次：建立工作表、標題列與「狀態」下拉選單 */
function setup() {
  var sheet = getSheet_();
  sheet.setFrozenRows(1);
  console.log('已準備好工作表：' + sheet.getName());
}

// ---------- 內部函式 ----------
function getSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
    sheet.getRange(2, HEADERS.indexOf('狀態') + 1, 1000, 1).setDataValidation(rule);
  }
  return sheet;
}

/** 去掉控制字元、截長；開頭是 = + - @ 的加上單引號，避免被試算表當成公式執行 */
function clean_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (s.length > max) s = s.substring(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function allow_() {
  var cache = CacheService.getScriptCache();
  var now = new Date();
  var kMin = 'm:' + Math.floor(now.getTime() / 60000);
  var kDay = 'd:' + Utilities.formatDate(now, 'Asia/Taipei', 'yyyyMMdd');
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var m = Number(cache.get(kMin) || 0), d = Number(cache.get(kDay) || 0);
    if (m >= MAX_PER_MINUTE || d >= MAX_PER_DAY) return false;
    cache.put(kMin, String(m + 1), 120);
    cache.put(kDay, String(d + 1), 86400);
    return true;
  } finally { lock.releaseLock(); }
}

function reply_(ok, error) {
  var body = ok ? { ok: true } : { ok: false, error: error || '失敗' };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
