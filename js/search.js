// 中文搜尋：全庫資料量小，直接對正規化後的欄位做子字串比對（不需要外部套件、不需要建置）。
// 比對順序：完全相符 > 開頭相符 > 包含；沒有任何結果時才退到「近似」（雙字詞重疊、拉丁字母差一字）。
import { store } from './data.js';
import { normText, compoundKey, stripParen, isCommonHerb } from './lib/derive.js';

export const SCOPES = [
  { key: 'all', label: '全部' },
  { key: 'name', label: '藥名' },
  { key: 'ingredient', label: '成分' },
  { key: 'effect', label: '功效' },
  { key: 'formula', label: '方劑' },
];
const SCOPE_FIELDS = {
  all: null,
  name: new Set(['name', 'latin', 'sci']),
  ingredient: new Set(['ingredient', 'tree', 'thp5_assay']),
  effect: new Set(['effect', 'thp5_func']),
  formula: new Set(['formula']),
};
export const FIELD_LABEL = {
  name: '藥名', latin: '拉丁／英文名', sci: '學名', formula: '方劑', ingredient: '成分', tree: '成分類別',
  effect: '功效', family: '科名', related: '附藥與近緣品', misc: '炮製／備註／標籤',
  thp5_assay: '指標成分（五版）', thp5_func: '藥典功能（五版）', thp5_desc: '藥典性狀（五版）',
};
const WEIGHT = {
  name: 10, latin: 6, sci: 6, formula: 4, ingredient: 4, thp5_assay: 3.5, tree: 3,
  effect: 3, family: 3, related: 3, thp5_func: 2.5, misc: 1.5, thp5_desc: 1.5,
};

let docs = null;

function item(field, text, extra) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const norm = normText(t, store.variantPairs);
  const key = (field === 'ingredient' || field === 'thp5_assay') ? compoundKey(t) : '';
  return { field, text: t, norm, key, ...extra };
}

function thp5EntriesOf(h) {
  if (Array.isArray(h.thp5_list) && h.thp5_list.length) return h.thp5_list;
  return h.thp5 ? [h.thp5] : [];
}

export function buildDocs() {
  const out = [];
  for (const h of store.herbs) {
    const items = [];
    const add = (f, t, extra) => { const it = item(f, t, extra); if (it) items.push(it); };
    add('name', h.name_zh);
    for (const n of String(h.name_zh).split(/[／/]/)) if (n.trim() !== h.name_zh) add('name', n);
    for (const a of h.aliases || []) add('name', a);
    for (const s of h.sources || []) { add('name', s.trade_name); }
    for (const l of String(h.name_latin || '').split(/\s*[;/]\s*/)) add('latin', l);
    for (const l of h.name_latin_legacy || []) add('latin', l);
    for (const s of h.sources || []) { add('sci', s.scientific_name); add('sci', s.scientific_name_legacy); }
    for (const f of h.formulas || []) {
      const name = stripParen(f);
      add('formula', name, { show: f });
      const m = String(f).match(/[（(]([^）)]*)[）)]/);
      if (m) add('formula', m[1], { show: f });
    }
    for (const g of h.ingredients || []) {
      add('ingredient', g.category_raw, { show: g.category_raw });
      for (const c of g.compounds || []) {
        const show = `${g.category_raw}：${c.name}`;
        add('ingredient', c.name, { show });
        for (const a of c.aliases || []) add('ingredient', a, { show });
      }
    }
    for (const e of h.effects || []) {
      for (const it of e.items || []) add('effect', it, { show: e.group && e.group !== '一般' ? `${e.group}：${it}` : it });
    }
    add('family', h.family_zh); add('family', h.family_latin);
    for (const f of h.family_legacy || []) add('family', f);
    for (const r of h.related_herbs || []) {
      const show = `${r.name_zh}${r.relation ? `（${r.relation}）` : ''}${r.notes ? `：${r.notes}` : ''}`;
      add('related', r.name_zh, { show }); add('related', r.notes, { show });
    }
    for (const p of h.processing || []) add('misc', p);
    for (const n of h.notes || []) add('misc', n);
    for (const t of h.tags || []) add('misc', t);
    // 臺灣中藥典第五版欄位索引
    for (const th of thp5EntriesOf(h)) {
      if (th.name_zh && th.name_zh !== h.name_zh) add('name', th.name_zh);
      if (th.name_en) add('latin', th.name_en);
      if (th.assay_summary) add('thp5_assay', th.assay_summary, { show: th.assay_summary });
      for (const mk of th.assay_markers || []) {
        if (mk.marker && !/抽提物$/.test(mk.marker)) {
          const show = mk.limit ? `${mk.marker} ${mk.limit}` : mk.marker;
          add('thp5_assay', mk.marker, { show });
        }
      }
      if (th.functions && isCommonHerb(h)) add('thp5_func', th.functions, { show: th.functions });
      if (th.general_description) add('thp5_desc', th.general_description, { show: th.general_description });
    }
    // 成分樹節點名稱（讓「生物鹼」也能直接比對到該藥的歸類）
    for (const id of store.cls.byHerb.get(h.id).direct) {
      const n = store.taxo.nodes.get(id);
      if (n) { add('tree', n.name_zh, { show: store.taxo.path(id).join(' > ') }); add('tree', n.name_en, { show: store.taxo.path(id).join(' > ') }); }
    }
    out.push({ herb: h, items });
  }
  docs = out;
}

// ---- 查詢展開 ----
function expandTerm(term) {
  const variants = new Set([term]);
  const nk = normText(term, store.variantPairs);
  variants.add(nk);
  const g = store.nameGroups.get(nk);
  if (g) for (const n of g) variants.add(normText(n, store.variantPairs));
  const syn = store.taxo.synKeys(compoundKey(term));
  const synKeys = new Set(syn);
  for (const f of store.alias.botanical_families || []) {
    const all = [f.canonical_zh, f.canonical_latin, ...(f.aliases || [])].map(x => normText(x, store.variantPairs));
    if (all.includes(nk)) all.forEach(x => variants.add(x));
  }
  return { variants: [...variants].filter(Boolean), synKeys: [...synKeys].filter(k => k && k !== compoundKey(term)) };
}

function quality(text, v) {
  if (!v) return 0;
  if (text === v) return 1;
  if (text.startsWith(v)) return 0.8;
  const i = text.indexOf(v);
  if (i < 0) return 0;
  return 0.6;
}

function bigrams(s) { const a = [...s.replace(/\s+/g, '')]; const out = []; for (let i = 0; i < a.length - 1; i++) out.push(a[i] + a[i + 1]); return out; }
function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i);
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1);
}

function scoreTerm(doc, term, ex, scopeSet, strict) {
  const hits = [];
  for (const it of doc.items) {
    if (scopeSet && !scopeSet.has(it.field)) continue;
    let q = 0, matched = null, via = '';
    for (const v of ex.variants) { const x = quality(it.norm, v); if (x > q) { q = x; matched = v; } }
    if (it.key) {
      const ck = compoundKey(term); const x = quality(it.key, ck); if (x > q) { q = x; matched = term; }
      for (const sk of ex.synKeys) { const y = quality(it.key, sk) * 0.9; if (y > q) { q = y; matched = sk; via = '同義詞'; } }
    }
    if (q === 0 && !strict) {
      const nt = normText(term, store.variantPairs);
      if (/[㐀-鿿]/.test(nt) && [...nt].length >= 3) {
        const bg = bigrams(nt); const has = bg.filter(b => it.norm.includes(b)).length;
        if (bg.length && has / bg.length >= 0.67) { q = 0.4 * (has / bg.length); matched = null; via = '近似'; }
      } else if (/^[a-z0-9 .\-]+$/.test(nt) && nt.length >= 5) {
        for (const tok of it.norm.split(/[^a-z0-9]+/)) if (tok.length >= 4 && lev1(tok, nt.replace(/\s/g, ''))) { q = 0.4; via = '近似'; matched = tok; break; }
      }
    }
    if (q > 0) hits.push({ field: it.field, text: it.text, show: it.show || it.text, q, score: q * WEIGHT[it.field], matched: matched ? [matched] : [], via });
  }
  return hits;
}

function treeHits(term, scopeSet) {
  if (scopeSet && !scopeSet.has('tree') && !scopeSet.has('ingredient')) return new Map();
  const nk = normText(term, store.variantPairs);
  const nodeId = store.taxo.termIndex.get(nk);
  const out = new Map();
  if (!nodeId) return out;
  const desc = store.taxo.descendants(nodeId);
  for (const h of store.herbs) {
    const direct = store.cls.byHerb.get(h.id).direct;
    let best = null;
    for (const d of direct) if (desc.has(d)) { best = d; break; }
    if (best) out.set(h.id, { field: 'tree', text: store.taxo.path(best).join(' > '), show: store.taxo.path(best).join(' > '), q: 0.7, score: 0.7 * WEIGHT.tree + 1, matched: [term], via: '成分類別展開' });
  }
  return out;
}

export function runSearch(query, scope = 'all') {
  if (!docs) buildDocs();
  const raw = String(query || '').trim();
  if (!raw) return { terms: [], results: store.herbs.map(h => ({ herb: h, score: 0, hits: [], exact: false })), fuzzy: false, empty: true };
  const terms = raw.split(/\s+/).filter(Boolean);
  const scopeSet = SCOPE_FIELDS[scope] || null;
  const exps = terms.map(expandTerm);
  const trees = terms.map(t => treeHits(t, scopeSet));

  const run = (strict) => {
    const res = [];
    for (const d of docs) {
      let total = 0, ok = true, hits = [];
      for (let i = 0; i < terms.length; i++) {
        const hs = scoreTerm(d, terms[i], exps[i], scopeSet, strict);
        const th = trees[i].get(d.herb.id);
        if (th) hs.push(th);
        if (!hs.length) { ok = false; break; }
        hs.sort((a, b) => b.score - a.score);
        total += hs[0].score + Math.min(2, (hs.length - 1) * 0.2);
        hits.push(...hs.slice(0, 3).map(x => ({ ...x, term: terms[i] })));
      }
      if (!ok) continue;
      const exact = terms.length === 1 && d.items.some(it => it.field === 'name' && exps[0].variants.some(v => it.norm === v));
      res.push({ herb: d.herb, score: total + (exact ? 1000 : 0), hits, exact });
    }
    res.sort((a, b) => b.score - a.score || store.herbs.indexOf(a.herb) - store.herbs.indexOf(b.herb));
    return res;
  };
  let results = run(true), fuzzy = false;
  if (!results.length) { results = run(false); fuzzy = results.length > 0; }
  return { terms, results, fuzzy, empty: false, suggestions: results.length ? [] : suggest(raw) };
}

export function suggest(raw, limit = 5) {
  const q = normText(raw, store.variantPairs).replace(/\s+/g, '');
  if (!q) return [];
  const qb = new Set(bigrams(q)); const qc = new Set([...q]);
  const scored = [];
  for (const h of store.herbs) {
    const names = [h.name_zh, ...(h.aliases || [])];
    let best = 0;
    for (const n of names) {
      const nn = normText(n, store.variantPairs);
      const nb = bigrams(nn);
      const shareB = nb.filter(b => qb.has(b)).length;
      const shareC = [...nn].filter(c => qc.has(c)).length;
      const sc = shareB * 2 + shareC / Math.max(1, nn.length);
      if (sc > best) best = sc;
    }
    if (best > 0.34) scored.push([best, h]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
}

export function pickSnippets(result, limit = 2) {
  const seen = new Set(); const out = [];
  const hits = [...result.hits].sort((a, b) => b.score - a.score);
  for (const h of hits) {
    const k = h.field + '|' + h.show;
    if (seen.has(k)) continue;
    seen.add(k); out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
