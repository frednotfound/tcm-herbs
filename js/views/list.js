import { h, clear } from '../lib/dom.js';
import { store } from '../data.js';
import { SOURCES, DIMS, applyFilters, stateFromParams, stateToParams, optionsFor, categoryTree, activeFilterCount, emptyState } from '../filters.js';
import { SCOPES, suggest } from '../search.js';
import { replaceParams, herbHref } from '../router.js';
import { herbCard } from './card.js';
import { chip, isNarrow } from '../lib/ui.js';

const SORTS = [['rel', '預設排序'], ['name', '依藥名筆畫'], ['lecture', '依講義順序']];

export function renderList(params) {
  const s = stateFromParams(params);
  const dimLabel = Object.fromEntries(DIMS.map(d => [d.key, d.label]));
  const srcLabel = Object.fromEntries(SOURCES.map(x => [x.key, x.label]));
  const optionEls = new Map();
  const srcBtns = new Map();

  const root = h('div', { class: 'list-view' });
  // 這兩排是「單選切換鈕」而不是分頁（沒有對應的 tabpanel），用 aria-pressed 讓螢幕閱讀器正確唸出
  const sourceRow = h('div', { class: 'source-row', role: 'group', 'aria-label': '收錄來源' });
  const scopeRow = h('div', { class: 'scope-row', role: 'group', 'aria-label': '搜尋範圍' });
  const sortSel = h('select', { class: 'sort-sel', 'aria-label': '排序方式', title: '預設排序：有搜尋時依相關度，沒有時依常用中藥講義順序', onChange: (e) => { s.sort = e.target.value; commit(); } },
    SORTS.map(([v, l]) => h('option', { value: v }, l)));
  sortSel.value = s.sort;
  const filterBtn = h('button', { type: 'button', class: 'btn filter-btn', 'aria-expanded': 'false', onClick: () => toggleSheet(true) }, '篩選');
  const panel = h('div', { class: 'filter-panel', role: 'group', 'aria-label': '篩選條件' });
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: () => toggleSheet(false) });
  const activeRow = h('div', { class: 'active-row' });
  const noticeBox = h('div', { class: 'notices' });
  const summary = h('div', { class: 'result-summary', 'aria-live': 'polite' });
  const results = h('div', { class: 'results' });
  const applyBtn = h('button', { type: 'button', class: 'btn btn-primary sheet-apply', onClick: () => toggleSheet(false) }, '套用');
  const clearBtn = h('button', { type: 'button', class: 'btn', onClick: () => { const q = s.q, sc = s.scope, src = s.src; Object.assign(s, emptyState(), { q, scope: sc, src }); syncInputs(); commit(); } }, '清除全部篩選');

  // ---- 收錄來源三態切換 ----
  for (const sr of SOURCES) {
    const countSpan = h('span', { class: 'src-count' }, '');
    const btn = h('button', {
      type: 'button', class: 'src-btn', dataset: { src: sr.key },
      'aria-pressed': String(s.src === sr.key), title: sr.label,
      onClick: () => { s.src = sr.key; commit(); },
    }, h('span', { class: 'lbl-long' }, sr.label), h('span', { class: 'lbl-short', 'aria-hidden': 'true' }, sr.short), countSpan);
    srcBtns.set(sr.key, { btn, countSpan });
    sourceRow.append(btn);
  }

  // ---- 搜尋範圍切換 ----
  for (const sc of SCOPES) {
    scopeRow.append(h('button', { type: 'button', class: 'scope-btn', dataset: { scope: sc.key }, 'aria-pressed': String(s.scope === sc.key), onClick: () => { s.scope = sc.key; commit(); } }, sc.label));
  }

  // ---- 篩選面板 ----
  function makeOption(dimKey, value, label, extraClass = '') {
    const input = h('input', { type: 'checkbox', value, onChange: () => { toggleValue(dimKey, value, input.checked); } });
    const countEl = h('span', { class: 'opt-count' }, '');
    const lab = h('label', { class: `opt ${extraClass}` }, input, h('span', { class: 'opt-label' }, label), countEl);
    if (!optionEls.has(dimKey)) optionEls.set(dimKey, new Map());
    optionEls.get(dimKey).set(value, { lab, countEl, input });
    return lab;
  }
  function dimBody(d) {
    if (d.key === 'cat') {
      const wrap = h('div', { class: 'opts' });
      for (const t of categoryTree()) {
        const extraCls = t.path === '臺灣中藥典增補品項' ? 'opt-top opt-blank' : 'opt-top';
        wrap.append(makeOption('cat', t.path, t.name, extraCls));
        for (const c of t.children) wrap.append(makeOption('cat', c.path, c.name, 'opt-sub'));
      }
      return wrap;
    }
    if (d.key === 'ing') {
      const wrap = h('div', { class: 'opts' });
      const walk = (id, depth) => {
        const n = store.taxo.nodes.get(id);
        wrap.append(makeOption('ing', id, n.label, `opt-d${Math.min(depth, 3)}`));
        for (const c of n.children) walk(c, depth + 1);
      };
      for (const id of store.taxo.topIds) walk(id, 0);
      wrap.append(makeOption('ing', store.UNSET, '未歸類／未標示', 'opt-blank'));
      return wrap;
    }
    const wrap = h('div', { class: 'opts' });
    let finder = null;
    if (d.key === 'fam') {
      finder = h('input', { type: 'search', class: 'opt-find', placeholder: '找科別…', 'aria-label': '找科別', onInput: (e) => {
        const q = e.target.value.trim();
        for (const [v, o] of optionEls.get('fam')) o.lab.hidden = q && !v.includes(q);
      } });
    }
    if (finder) wrap.append(finder);
    for (const o of optionsFor(d.key)) wrap.append(makeOption(d.key, o.value, o.value === store.UNSET ? '未標示' : o.value, o.value === store.UNSET ? 'opt-blank' : ''));
    if (d.key === 'tag') {
      const mode = h('label', { class: 'opt opt-mode' }, h('input', { type: 'checkbox', onChange: (e) => { s.tagmode = e.target.checked ? 'all' : 'any'; commit(); } }), h('span', { class: 'opt-label' }, '須全部符合'));
      mode.firstChild.checked = s.tagmode === 'all';
      wrap.prepend(mode);
    }
    return wrap;
  }
  for (const d of DIMS) {
    const sum = h('summary', { class: 'dd-sum' }, h('span', { class: 'dd-name' }, d.label), h('span', { class: 'dd-n', dataset: { dim: d.key } }, ''));
    const body = dimBody(d);
    const dd = h('details', { class: 'dd', dataset: { dim: d.key } }, sum, body);
    // 電腦版下拉選單：快超出視窗右緣時改成靠右對齊
    dd.addEventListener('toggle', () => {
      if (!dd.open || isNarrow()) return;
      body.classList.remove('opts-right');
      if (body.getBoundingClientRect().right > document.documentElement.clientWidth - 8) body.classList.add('opts-right');
    });
    panel.append(dd);
  }
  panel.append(h('div', { class: 'sheet-foot' }, clearBtn, applyBtn));
  const sheetHead = h('div', { class: 'sheet-head' }, h('strong', null, '篩選'), h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => toggleSheet(false) }, '關閉'));
  panel.prepend(sheetHead);

  function toggleValue(dim, value, on) {
    const arr = s[dim];
    const i = arr.indexOf(value);
    if (on && i < 0) arr.push(value);
    if (!on && i >= 0) arr.splice(i, 1);
    commit();
  }
  function syncInputs() {
    for (const [dim, m] of optionEls) for (const [v, o] of m) o.input.checked = s[dim].includes(v);
    sortSel.value = s.sort;
    const globalInput = document.getElementById('global-search');
    if (globalInput && globalInput.value !== s.q) globalInput.value = s.q;
  }
  function toggleSheet(on) {
    root.classList.toggle('sheet-open', on);
    document.body.classList.toggle('no-scroll', on && isNarrow());
    filterBtn.setAttribute('aria-expanded', String(on));
    if (on && isNarrow()) sheetHead.querySelector('button')?.focus({ preventScroll: true });
    else if (!on && isNarrow() && panel.contains(document.activeElement)) filterBtn.focus({ preventScroll: true });
  }

  function chipLabel(dim, v) {
    if (dim === 'ing') return store.taxo.nodes.get(v)?.label || (v === store.UNSET ? '未歸類' : v);
    if (v === store.UNSET) return `${dimLabel[dim]}：未標示`;
    if (dim === 'cat') return v.replace('>', ' > ');
    return v;
  }

  function update() {
    const { rows, result, counts, unlisted, srcCounts } = applyFilters(s);
    for (const [k, { btn, countSpan }] of srcBtns) {
      btn.setAttribute('aria-pressed', String(s.src === k));
      countSpan.textContent = String(srcCounts[k] ?? 0);
    }
    for (const b of scopeRow.children) b.setAttribute('aria-pressed', String(b.dataset.scope === s.scope));
    for (const [dim, m] of optionEls) {
      for (const [v, o] of m) {
        const n = counts[dim].get(v) || 0;
        o.countEl.textContent = String(n);
        o.lab.classList.toggle('zero', n === 0 && !s[dim].includes(v));
        o.input.checked = s[dim].includes(v);
      }
    }
    for (const el of panel.querySelectorAll('.dd-n')) { const k = el.dataset.dim; el.textContent = s[k].length ? `（${s[k].length}）` : ''; }
    const nActive = activeFilterCount(s);
    filterBtn.textContent = nActive ? `篩選（${nActive}）` : '篩選';
    applyBtn.textContent = `套用（${rows.length} 味）`;

    clear(activeRow);
    for (const d of DIMS) for (const v of s[d.key]) {
      activeRow.append(h('button', { type: 'button', class: 'chip chip-active', title: `移除「${chipLabel(d.key, v)}」`, onClick: () => { toggleValue(d.key, v, false); syncInputs(); } }, `${d.key === 'ing' || d.key === 'cat' ? '' : dimLabel[d.key] + '：'}${chipLabel(d.key, v)} ×`));
    }
    if (nActive) activeRow.append(h('button', { type: 'button', class: 'btn btn-link', onClick: () => clearBtn.click() }, '清除全部'));

    clear(noticeBox);
    for (const d of DIMS) {
      if (unlisted[d.key]) {
        noticeBox.append(h('div', { class: 'notice' },
          `另有 ${unlisted[d.key]} 味未標示${d.label}，未列入。`,
          h('button', { type: 'button', class: 'btn btn-link', onClick: () => { s[d.key].push(store.UNSET); commit(); } }, `加入「未標示」`)));
      }
    }
    if (s.q && result.fuzzy) noticeBox.append(h('div', { class: 'notice' }, '沒有完全符合的結果，以下是近似結果。'));

    const srcHint = s.src === 'all' ? '' : `（${srcLabel[s.src]}）`;
    summary.textContent = s.q ? `搜尋「${s.q}」共 ${rows.length} 味${srcHint}` : `共 ${rows.length} 味${srcHint}`;

    clear(results);
    if (!rows.length) {
      const sug = s.q ? (result.suggestions?.length ? result.suggestions : suggest(s.q)) : [];
      const hasOtherSrc = s.src !== 'all' && srcCounts.all > 0;
      results.append(h('div', { class: 'empty-box' },
        h('p', null, hasOtherSrc
          ? `目前在「${srcLabel[s.src]}」範圍內沒有符合的藥材（全部範圍共有 ${srcCounts.all} 味）。`
          : (nActive && !result.empty && result.results.length ? '目前的篩選條件下沒有符合的藥材。' : '找不到符合的藥材。')),
        hasOtherSrc ? h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { s.src = 'all'; commit(); } }, `切回全部（${srcCounts.all} 味）`) : null,
        nActive ? h('button', { type: 'button', class: 'btn', onClick: () => clearBtn.click() }, '清除篩選') : null,
        sug.length ? h('p', null, '你是不是要找：', ...sug.map(x => chip(x.name_zh, { href: herbHref(x.id) }))) : null));
    } else {
      const frag = document.createDocumentFragment();
      for (const r of rows) frag.append(herbCard(r));
      results.append(frag);
    }
  }

  function commit() {
    replaceParams('/herbs', stateToParams(s));
    update();
  }

  root.append(
    sourceRow,
    h('div', { class: 'list-head' }, h('div', { class: 'scope-wrap' }, scopeRow), h('div', { class: 'list-tools' }, filterBtn, sortSel)),
    backdrop, panel, activeRow, noticeBox, summary, results);
  syncInputs();
  update();

  const onQuery = (e) => { s.q = e.detail; commit(); };
  document.addEventListener('tcm:query', onQuery);
  const onDocClick = (e) => {
    if (isNarrow()) return;
    for (const d of panel.querySelectorAll('details.dd[open]')) if (!d.contains(e.target)) d.open = false;
  };
  document.addEventListener('click', onDocClick);
  // Esc：手機關閉篩選面板；電腦關閉展開中的下拉選單
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (root.classList.contains('sheet-open')) { toggleSheet(false); return; }
    const openDd = panel.querySelector('details.dd[open]');
    if (openDd) { openDd.open = false; openDd.querySelector('summary')?.focus(); }
  };
  document.addEventListener('keydown', onKey);
  return {
    node: root,
    destroy() { document.removeEventListener('tcm:query', onQuery); document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); },
    query: s.q,
  };
}
