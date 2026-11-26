// 安裝成 App（PWA）。
// - Android／電腦版 Chrome、Edge：瀏覽器會發出 beforeinstallprompt，我們先攔下來，改由網站上的「安裝」按鈕觸發。
// - iOS：沒有安裝事件，只能教使用者「分享 → 加入主畫面」。
// - 已經用 App 開啟（standalone）時，什麼都不顯示。
import { h, safeStorage } from './dom.js';

const ls = safeStorage();
const DISMISS_KEY = 'tcm_install_dismissed';
const DISMISS_DAYS = 30; // 關掉提示後，30 天內首頁不再出現
let deferred = null;
const listeners = new Set();
const notify = () => { for (const fn of [...listeners]) fn(); };

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initInstall() {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  addEventListener('appinstalled', () => { deferred = null; notify(); });
}

/** installed：已用 App 開啟；prompt：可以一鍵安裝；ios：要手動加入主畫面；manual：其他瀏覽器 */
export function installState() {
  if (isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return 'manual';
}

export async function promptInstall() {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  ev.prompt();
  const choice = await ev.userChoice.catch(() => null);
  notify();
  return choice?.outcome === 'accepted';
}

function dismissedRecently() {
  const t = Number(ls.get(DISMISS_KEY) || 0);
  return t && Date.now() - t < DISMISS_DAYS * 864e5;
}

const shareIcon = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'inline-ico'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7');
  svg.append(p);
  return svg;
};

function body(state, { compact }) {
  if (state === 'prompt') {
    return {
      text: compact ? '加到主畫面，像 App 一樣開啟，沒有網路也能查。' : '安裝後會出現在主畫面／桌面，用獨立視窗開啟，沒有網路也能查詢已下載的資料。',
      action: h('button', { type: 'button', class: 'btn btn-primary', onClick: async (e) => { e.currentTarget.disabled = true; await promptInstall(); } }, '安裝'),
    };
  }
  if (state === 'ios') {
    return {
      text: h('span', null, '點瀏覽器的「分享」', shareIcon(), '，選「加入主畫面」，就能從主畫面直接開啟。'),
      action: null,
    };
  }
  if (state === 'installed') return { text: '你正在使用 App 版本。有新版時會自動更新，並提示你重新整理。', action: null };
  return { text: '用 Android 或電腦版的 Chrome、Edge 開啟本站，網址列或選單會出現「安裝應用程式」；Mac 的 Safari 可用「檔案 → 加入 Dock」。', action: null };
}

/**
 * 安裝提示卡。
 * banner: true 用在首頁，可以關掉（30 天內不再出現），已安裝或不支援時不顯示；
 * banner: false 用在「關於」頁，永遠顯示目前狀態與做法。
 */
export function installCard({ banner = false } = {}) {
  const wrap = h('div', { class: 'install-slot' });
  const render = () => {
    if (!wrap.isConnected && wrap.dataset.rendered) { listeners.delete(render); return; }
    wrap.dataset.rendered = '1';
    const state = installState();
    wrap.replaceChildren();
    if (banner && (state === 'installed' || state === 'manual' || dismissedRecently())) return;
    const { text, action } = body(state, { compact: banner });
    const close = banner ? h('button', { type: 'button', class: 'btn btn-ghost icon-btn install-close', 'aria-label': '不要再顯示', onClick: () => { ls.set(DISMISS_KEY, String(Date.now())); wrap.replaceChildren(); listeners.delete(render); } }, '×') : null;
    wrap.append(h('section', { class: `install-card${banner ? ' card install-banner' : ''}` },
      h('img', { class: 'install-icon', src: 'icons/pwa-192.png', alt: '', width: 48, height: 48 }),
      h('div', { class: 'install-text' },
        h('strong', null, state === 'installed' ? '已安裝為 App' : '安裝成 App'),
        h('p', null, text)),
      action ? h('div', { class: 'install-actions' }, action) : null,
      close));
  };
  listeners.add(render);
  render();
  return wrap;
}
