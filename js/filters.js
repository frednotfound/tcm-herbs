// 多條件篩選：不同篩選之間是「且」，同一篩選內多選是「或」；小重點可切換成「全部符合」。
import { store } from './data.js';
import { runSearch, SCOPES } from './search.js';
import { isCommonHerb, isThp5OnlyHerb } from './lib/derive.js';

export const SOURCES = [
  { key: 'all', label: '全部', short: '全部' },
  { key: 'common', label: '常用中藥', short: '常用中藥' },
  { key: 'thp5_only', label: '僅出現在臺灣中藥典第五版', short: '五版增補' },
];

export const DIMS = [
  { key: 'cat', label: '分類', blank: false },
  { key: 'nat', label: '四氣', blank: true },
  { key: 'fla', label: '五味', blank: true },
  { key: 'mer', label: '歸經', blank: true },
  { key: 'grade', label: '品級', blank: true },
  { key: 'ing', label: '成分類別', blank: true },
  { key: 'fam', label: '科別', blank: false },
  { key: 'part', label: '使用部位', blank: false },
  { key: 'tag', label: '小重點', blank: false },
];
const MULTI = ['cat', 'nat', 'fla', 'mer', 'grade', 'ing', 'fam', 'part', 'tag'];
const SORT_KEYS = ['rel', 'name', 'lecture'];

export function matchSource(herb, src) {
  if (src === 'common') return isCommonHerb(herb);
  if (src === 'thp5_only') return isThp5OnlyHerb(herb);
  return true;
}

export function emptyState() {
  const s = { q: '', scope: 'all', src: 'all', tagmode: 'any', sort: 'rel' };
  for (const k of MULTI) s[k] = [];
  return s;
}

export function stateFromParams(params) {
  const s = emptyState();
  s.q = params.get('q') || '';
  const rawScope = params.get('scope') || 'all';
  s.scope = SCOPES.some(x => x.key === rawScope) ? rawScope : 'all';
  const rawSrc = params.get('src') || 'all';
  s.src = SOURCES.some(x => x.key === rawSrc) ? rawSrc : 'all';
  s.tagmode = params.get('tagmode') === 'all' ? 'all' : 'any';
  const rawSort = params.get('sort') || 'rel';
  s.sort = SORT_KEYS.includes(rawSort) ? rawSort : 'rel';
  for (const k of MULTI) {
    const v = params.get(k);
    s[k] = v ? v.split(',').filter(Boolean) : [];
  }
  return s;
}

export function stateToParams(s) {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.scope && s.scope !== 'all') p.set('scope', s.scope);
  if (s.src && s.src !== 'all') p.set('src', s.src);
  if (s.tagmode === 'all') p.set('tagmode', 'all');
  if (s.sort && s.sort !== 'rel') p.set('sort', s.sort);
  for (const k of MULTI) if (s[k].length) p.set(k, s[k].join(','));
  return p;
}

export function activeFilterCount(s) { return MULTI.reduce((n, k) => n + s[k].length, 0); }

function matchDim(s, dimKey, facet) {
  const sel = s[dimKey];
  if (!sel.length) return true;
  if (dimKey === 'tag' && s.tagmode === 'all') return sel.every(v => facet.has(v));
  return sel.some(v => facet.has(v));
}

export function applyFilters(s) {
  const result = runSearch(s.q, s.scope);
  const searched = result.results;
  const facetOf = (row) => store.facets.get(row.herb.id);
  const passAllExcept = (row, except) => MULTI.every(k => k === except || matchDim(s, k, facetOf(row)[k]));

  const srcPool = searched.filter(r => passAllExcept(r, null));
  const srcCounts = {
    all: srcPool.length,
    common: srcPool.filter(r => isCommonHerb(r.herb)).length,
    thp5_only: srcPool.filter(r => isThp5OnlyHerb(r.herb)).length,
  };

  const base = searched.filter(r => matchSource(r.herb, s.src));
  const rows = base.filter(r => passAllExcept(r, null));

  const counts = {};
  const unlisted = {};
  for (const d of DIMS) {
    const pool = base.filter(r => passAllExcept(r, d.key));
    const c = new Map();
    for (const r of pool) for (const v of facetOf(r)[d.key]) c.set(v, (c.get(v) || 0) + 1);
    counts[d.key] = c;
    if (d.blank && s[d.key].length && !s[d.key].includes(store.UNSET)) {
      unlisted[d.key] = pool.filter(r => facetOf(r)[d.key].has(store.UNSET)).length;
    }
  }
  return { rows: sortRows(rows, s), result, counts, unlisted, srcCounts };
}

function sortRows(rows, s) {
  const order = store.herbIndex;
  const out = [...rows];
  if (s.sort === 'name') out.sort((a, b) => a.herb.name_zh.localeCompare(b.herb.name_zh, 'zh-Hant'));
  else if (s.sort === 'lecture') out.sort((a, b) => order.get(a.herb.id) - order.get(b.herb.id));
  return out;
}

export function optionsFor(dimKey) {
  const s = store;
  const seen = new Map();
  for (const h of s.herbs) for (const v of s.facets.get(h.id)[dimKey]) seen.set(v, (seen.get(v) || 0) + 1);
  const total = seen;
  let list = [...seen.keys()];
  const U = s.UNSET;
  const orderOf = {
    nat: ['寒', '涼', '平', '溫', '熱'],
    fla: ['辛', '甘', '酸', '苦', '鹹', '淡', '澀'],
    grade: ['上品', '中品', '下品'],
    mer: ['肝', '心', '脾', '肺', '腎', '膽', '小腸', '胃', '大腸', '膀胱', '心包', '三焦'],
    part: s.partGroupList,
  }[dimKey];
  if (dimKey === 'fam') list.sort((a, b) => total.get(b) - total.get(a) || a.localeCompare(b, 'zh-Hant'));
  else if (dimKey === 'tag') list.sort((a, b) => total.get(b) - total.get(a) || a.localeCompare(b, 'zh-Hant'));
  else if (orderOf) list.sort((a, b) => (orderOf.indexOf(a) + 1 || 99) - (orderOf.indexOf(b) + 1 || 99));
  else list.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  list = list.filter(v => v !== U);
  if (seen.has(U)) list.push(U);
  return list.map(v => ({ value: v, total: total.get(v) }));
}

export function categoryTree(herbsSubset = store.herbs) {
  const top = new Map();
  for (const h of herbsSubset) {
    const f = store.facets.get(h.id).cat;
    for (const v of f) {
      const [a, b] = v.split('>');
      if (!top.has(a)) top.set(a, { name: a, path: a, count: 0, children: new Map() });
      if (!b) top.get(a).count++;
      else {
        const t = top.get(a);
        if (!t.children.has(v)) t.children.set(v, { name: b, path: v, count: 0 });
        t.children.get(v).count++;
      }
    }
  }
  const order = store.categories.filter(c => !c.category_path.includes('>')).map(c => c.category_path);
  const subOrder = store.categories.filter(c => c.category_path.includes('>')).map(c => c.category_path);
  const arr = [...top.values()].sort((x, y) => (order.indexOf(x.name) + 1 || 99) - (order.indexOf(y.name) + 1 || 99));
  return arr.map(t => ({
    ...t,
    children: [...t.children.values()].sort((x, y) => (subOrder.indexOf(x.path) + 1 || 99) - (subOrder.indexOf(y.path) + 1 || 99)),
  }));
}
