import { h, clear, safeStorage } from './lib/dom.js';
import { loadAll, store } from './data.js';
import { parseHash, hrefOf } from './router.js';
import { CONFIG } from './config.js';
import { categoryTree } from './filters.js';
import { renderHome } from './views/home.js';
import { renderList } from './views/list.js';
import { renderHerb } from './views/herb.js';
import { renderCategory } from './views/category.js';
import { renderIngredients } from './views/ingredients.js';
import { renderTheory } from './views/theory.js';
import { renderCompat } from './views/compat.js';
import { renderAbout } from './views/about.js';

const ls = safeStorage();
const $ = (id) => document.getElementById(id);
const main = $('main');
let current = null;

// ---------- 主題 ----------
const THEMES = [['auto', '跟隨系統'], ['light', '淺色'], ['dark', '深色'], ['contrast', '高對比']];
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const name = THEMES.find(x => x[0] === t)?.[1] || '';
  const btn = $('theme-btn'); if (btn) { clear(btn).append(h('span', { 'aria-hidden': 'true' }, '◐'), h('span', { class: 'tb-text' }, ` ${name}`)); btn.setAttribute('aria-label', `切換主題（目前：${name}）`); btn.title = `切換主題（目前：${name}）`; }
}
function initTheme() {
  let t = ls.get('tcm_theme') || 'auto';
  if (!THEMES.some(x => x[0] === t)) t = 'auto';
  applyTheme(t);
  $('theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || 'auto';
    const next = THEMES[(THEMES.findIndex(x => x[0] === cur) + 1) % THEMES.length][0];
    ls.set('tcm_theme', next); applyTheme(next);
  });
}

// ---------- 導覽 ----------
const NAV = [['herbs', '#/herbs', '藥材'], ['ingredients', '#/ingredients', '成分'], ['compat', '#/compat', '配伍'], ['theory', '#/theory', '總論']];
function buildNav() {
  const bottom = $('bottom-nav');
  for (const [key, href, label] of NAV) bottom.append(h('a', { href, class: 'bn', dataset: { nav: key } }, label));
  const side = $('side-nav');
  for (const [key, href, label] of NAV) side.append(h('a', { href, class: 'sn', dataset: { nav: key } }, label));
  side.append(h('a', { href: '#/about', class: 'sn', dataset: { nav: 'about' } }, '關於'));

  // 分類樹（電腦版側欄；手機版抽屜共用）
  const catBox = $('side-cats'); clear(catBox);
  const allTree = categoryTree();
  const commonTree = allTree.filter(t => t.path !== '臺灣中藥典增補品項');
  const thp5Tree = allTree.find(t => t.path === '臺灣中藥典增補品項');

  catBox.append(h('div', { class: 'side-h' }, '常用中藥分類'));
  const renderBranch = (t) => {
    const total = store.herbs.filter(hh => store.facets.get(hh.id).cat.has(t.path)).length;
    const top = h('a', { class: 'sc-top', href: hrefOf('/herbs', new URLSearchParams({ cat: t.path })) }, t.name, h('span', { class: 'muted small' }, ` ${total}`));
    if (!t.children.length) return h('div', { class: 'sc' }, top);
    return h('details', { class: 'sc' },
      h('summary', null, top),
      h('div', { class: 'sc-subs' }, t.children.map(c =>
        h('a', { class: 'sc-sub', href: hrefOf('/herbs', new URLSearchParams({ cat: c.path })) }, c.name, h('span', { class: 'muted small' }, ` ${c.count}`)))));
  };
  for (const t of commonTree) catBox.append(renderBranch(t));

  if (thp5Tree) {
    catBox.append(h('hr', { class: 'side-sep' }), h('div', { class: 'side-h' }, '臺灣中藥典第五版'));
    catBox.append(renderBranch(thp5Tree));
  }
}
function markNav(key) {
  for (const a of document.querySelectorAll('[data-nav]')) { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
}
const closeDrawer = () => document.body.classList.remove('drawer-open');

// ---------- 路由 ----------
function route() {
  closeDrawer();
  const { parts, params } = parseHash();
  if (current?.destroy) current.destroy();
  current = null;
  const top = parts[0] || '';
  let res, navKey = top;
  try {
    if (top === '') res = renderHome();
    else if (top === 'herbs') { res = renderList(params); current = res; }
    else if (top === 'herb') res = renderHerb(parts[1] || '');
    else if (top === 'cat') { res = renderCategory(parts[1] || ''); navKey = 'herbs'; }
    else if (top === 'ingredients') res = renderIngredients(parts[1], params);
    else if (top === 'theory') res = renderTheory(parts[1]);
    else if (top === 'compat') res = renderCompat(params);
    else if (top === 'about') res = renderAbout();
    else res = { node: h('div', { class: 'card' }, h('h1', null, '找不到這個頁面'), h('p', null, h('a', { class: 'btn', href: '#/' }, '回首頁'))), title: '找不到頁面' };
  } catch (err) {
    console.error(err);
    res = { node: h('div', { class: 'card' }, h('h1', null, '頁面發生錯誤'), h('p', { class: 'muted' }, String(err.message || err)), h('p', null, h('a', { class: 'btn', href: '#/' }, '回首頁'))), title: '錯誤' };
  }
  if (top === 'herb') navKey = 'herbs';
  clear(main); main.append(res.node);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  document.title = res.title ? `${res.title}｜${CONFIG.shortName}` : CONFIG.siteName;
  markNav(navKey);
  // 全站搜尋框與網址同步
  const gs = $('global-search');
  if (top === 'herbs') gs.value = params.get('q') || ''; else if (top !== 'herbs') gs.value = '';
  if (res.focus && matchMedia('(min-width: 861px)').matches) res.focus.focus();
}

function initSearchBox() {
  const gs = $('global-search');
  let timer = 0;
  const fire = () => {
    const q = gs.value.trim();
    const { parts } = parseHash();
    if (parts[0] === 'herbs') document.dispatchEvent(new CustomEvent('tcm:query', { detail: q }));
    else if (q) location.hash = hrefOf('/herbs', new URLSearchParams({ q }));
  };
  gs.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(fire, 160); });
  $('search-form').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); fire(); });
  $('menu-btn').addEventListener('click', () => document.body.classList.toggle('drawer-open'));
  $('drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); gs.focus(); } });
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register(`sw.js?v=${CONFIG.appVersion}`).then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showToast('網站有新版本。', '重新整理', () => location.reload());
      });
    });
  }).catch(() => {});
}
function showToast(text, action, fn) {
  const t = h('div', { class: 'toast', role: 'status' }, text, action ? h('button', { class: 'btn btn-link', type: 'button', onClick: fn }, action) : null, h('button', { class: 'btn btn-link', type: 'button', onClick: () => t.remove(), 'aria-label': '關閉' }, '×'));
  document.body.append(t);
}

async function start() {
  initTheme();
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    clear(main).append(h('div', { class: 'card' }, h('h1', null, '資料載入失敗'), h('p', null, String(err.message || err)),
      h('p', { class: 'muted' }, '如果你是用雙擊 index.html 開啟，瀏覽器會擋住讀取資料檔。請用本機伺服器開啟（見 docs/資料維護說明.md），或直接使用部署好的網址。'),
      h('p', null, h('button', { class: 'btn', onClick: () => location.reload() }, '重新載入'))));
    return;
  }
  buildNav();
  initSearchBox();
  $('foot-note').textContent = `${CONFIG.disclaimer}　資料版本 ${store.meta.data_version}`;
  window.addEventListener('hashchange', route);
  route();
  registerSW();
  window.__tcm = { store, ready: true };
}
start();
