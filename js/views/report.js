// 回報錯誤表單（對話框）。資料送到 Google Apps Script，再寫入 Google 試算表。
import { h, safeStorage } from '../lib/dom.js';
import { CONFIG } from '../config.js';
import { store } from '../data.js';

const KINDS = ['成分', '功效', '配伍', '基原', '其他'];
const LOG_KEY = 'tcm_report_log';
const ls = safeStorage();
const TS_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let tsLoader = null;
/** Turnstile 腳本整個網站只載入一次（之前每開一次對話框就多插一個 <script>） */
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!tsLoader) {
    tsLoader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TS_SRC; s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
      s.onerror = () => { tsLoader = null; s.remove(); reject(new Error('turnstile')); };
      document.head.append(s);
    });
  }
  return tsLoader;
}

function readLog() { try { return JSON.parse(ls.get(LOG_KEY) || '[]').filter(t => Number.isFinite(t)); } catch { return []; } }
function pushLog() { const now = Date.now(); const log = readLog().filter(t => now - t < 3600e3); log.push(now); ls.set(LOG_KEY, JSON.stringify(log)); }

/** 前端限速：冷卻 60 秒、每小時最多 5 筆。這只擋誤觸，不是安全機制（真正的限制在 GAS 端）。 */
export function checkLimit() {
  const now = Date.now();
  const log = readLog().filter(t => now - t < 3600e3);
  const last = log.length ? Math.max(...log) : 0;
  if (now - last < CONFIG.report.cooldownSec * 1000) return `請等 ${Math.ceil((CONFIG.report.cooldownSec * 1000 - (now - last)) / 1000)} 秒後再送出。`;
  if (log.length >= CONFIG.report.maxPerHour) return `這個裝置一小時內最多送出 ${CONFIG.report.maxPerHour} 筆，請稍後再試。`;
  return '';
}

export function openReport({ type = '藥材', id = '', name = '' } = {}) {
  const dlg = h('dialog', { class: 'report-dlg', 'aria-labelledby': 'rp-title' });
  const msg = h('div', { class: 'rp-msg', role: 'status', 'aria-live': 'polite' });
  const kindSel = h('select', { id: 'rp-kind', required: true }, KINDS.map(k => h('option', { value: k }, k)));
  const text = h('textarea', { id: 'rp-text', rows: 6, maxlength: CONFIG.report.maxLen, required: true, placeholder: `請寫下你覺得哪裡不對、對照的來源（${CONFIG.report.minLen}–${CONFIG.report.maxLen} 字）` });
  const contact = h('input', { id: 'rp-contact', type: 'text', maxlength: 100, placeholder: '選填；不要填身分證字號等敏感資料' });
  const hp = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }); // honeypot：人看不到，機器人才會填
  const hpWrap = h('div', { class: 'hp', 'aria-hidden': 'true' }, h('label', null, '請勿填寫', hp));
  const counter = h('span', { class: 'muted small' }, `0／${CONFIG.report.maxLen}`);
  text.addEventListener('input', () => { counter.textContent = `${text.value.length}／${CONFIG.report.maxLen}`; });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, '送出回報');
  const copyBtn = h('button', { type: 'button', class: 'btn', hidden: true, onClick: copy }, '複製內容');
  let turnstileToken = '';
  const tsBox = h('div', { class: 'ts-box' });

  const payloadOf = () => ({
    type, target_id: id, target_name: name, kind: kindSel.value, text: text.value.trim(), contact: contact.value.trim(),
    page_url: location.href, data_version: store.meta?.data_version || '', website: hp.value, turnstile: turnstileToken,
  });
  async function copy() {
    const p = payloadOf();
    const t = `【回報】${p.type}｜${p.target_name}（${p.target_id}）\n問題所在：${p.kind}\n說明：${p.text}\n聯絡：${p.contact || '（無）'}\n網址：${p.page_url}\n資料版本：${p.data_version}`;
    try { await navigator.clipboard.writeText(t); setMsg('已複製，可以貼到訊息或信件裡傳給管理者。', 'ok'); }
    catch { text.focus(); setMsg('無法自動複製，請手動選取說明欄的文字。', 'err'); }
  }
  function setMsg(t, kind) { msg.textContent = t; msg.className = `rp-msg ${kind || ''}`; }

  const form = h('form', { class: 'rp-form', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const len = text.value.trim().length;
    if (len < CONFIG.report.minLen) { setMsg(`說明至少 ${CONFIG.report.minLen} 個字。`, 'err'); text.focus(); return; }
    if (len > CONFIG.report.maxLen) { setMsg(`說明最多 ${CONFIG.report.maxLen} 個字。`, 'err'); return; }
    const lim = checkLimit();
    if (lim) { setMsg(lim, 'err'); return; }
    if (!CONFIG.reportEndpoint) { setMsg('管理者還沒有設定回報網址，所以不會送出。你可以先複製內容，另外傳給管理者。', 'err'); copyBtn.hidden = false; return; }
    if (CONFIG.turnstileSiteKey && !turnstileToken) { setMsg('請先完成驗證。', 'err'); return; }
    submit.disabled = true; setMsg('送出中…');
    try {
      // text/plain 是「簡單請求」，不會觸發跨網域預檢（GAS 不支援預檢）
      const res = await fetch(CONFIG.reportEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payloadOf()), redirect: 'follow' });
      if (!res.ok) throw new Error(`伺服器錯誤 ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '伺服器回報失敗');
      pushLog();
      setMsg('已送出，謝謝你。管理者會檢查並更新資料。', 'ok');
      text.value = ''; counter.textContent = `0／${CONFIG.report.maxLen}`;
      setTimeout(() => dlg.close(), 1800);
    } catch (err) {
      // 失敗時保留使用者輸入，並提供「複製內容」
      const why = err instanceof SyntaxError ? '伺服器回應格式不對' : (err.message || '網路問題');
      setMsg(`送出失敗（${why}）。你的內容還在，可以再試一次，或先複製內容。`, 'err');
      copyBtn.hidden = false;
    } finally { submit.disabled = false; }
    // 送出後重設驗證（Turnstile 的 token 只能用一次）
    if (CONFIG.turnstileSiteKey && window.turnstile) { try { window.turnstile.reset(tsBox); } catch { /* 忽略 */ } turnstileToken = ''; }
  } },
    h('p', { class: 'muted small' }, `對象：${type}「${name || id || '（未指定）'}」`),
    h('label', { for: 'rp-kind' }, '問題所在'), kindSel,
    h('label', { for: 'rp-text' }, '說明（必填）'), text, h('div', { class: 'rp-counter' }, counter),
    h('label', { for: 'rp-contact' }, '聯絡方式（選填）'), contact, hpWrap, tsBox, msg,
    h('p', { class: 'muted small' }, '本站不收集帳號。請不要在表單中填寫個人敏感資訊。'),
    h('div', { class: 'rp-actions' }, h('button', { type: 'button', class: 'btn', onClick: () => dlg.close() }, '取消'), copyBtn, submit));

  dlg.append(h('h2', { id: 'rp-title' }, '回報錯誤'), form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  text.focus();

  if (CONFIG.turnstileSiteKey) {
    loadTurnstile().then(ts => {
      if (!dlg.isConnected) return;
      ts.render(tsBox, {
        sitekey: CONFIG.turnstileSiteKey,
        callback: (t) => { turnstileToken = t; },
        'expired-callback': () => { turnstileToken = ''; },
        'error-callback': () => { turnstileToken = ''; setMsg('驗證元件發生錯誤。你可以先複製內容，另外傳給管理者。', 'err'); copyBtn.hidden = false; },
      });
    }).catch(() => { setMsg('驗證元件載入失敗（可能是網路或擋廣告外掛）。你可以先複製內容，另外傳給管理者。', 'err'); copyBtn.hidden = false; });
  }
}
