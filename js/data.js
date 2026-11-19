// 資料載入與查表。啟動時一次載入全部 JSON，之後全在記憶體內查詢。
import {
  buildTaxonomy, classifyAll, buildVariantPairs, buildNameGroups, normText, splitNames, stripParen,
  baseNature, baseFlavors, familiesOf, categoryPaths, highlightTags,
} from './lib/derive.js';

const FILES = ['herbs', 'general_theory', 'categories', 'exam_highlights', 'ingredient_taxonomy', 'alias_dictionary', 'derived/part_groups'];

async function getJSON(path, v) {
  const res = await fetch(`data/${path}.json${v ? `?v=${encodeURIComponent(v)}` : ''}`);
  if (!res.ok) throw new Error(`讀取 data/${path}.json 失敗（${res.status}）`);
  return res.json();
}

export const store = {};

export async function loadAll() {
  let meta = { data_version: '?', updated: '', source_note: '' };
  try { meta = await getJSON('meta'); } catch { /* meta 缺少時仍可運作 */ }
  const v = meta.data_version;
  const loaded = await Promise.all(FILES.map(f => getJSON(f, v).catch(e => { if (f.startsWith('derived/')) return null; throw e; })));
  const [herbs, theory, categories, highlights, taxonomy, alias, partGroups] = loaded;
  Object.assign(store, { meta, herbs, theory, categories, highlights, taxonomy, alias, partGroups });
  build();
  return store;
}

function build() {
  const s = store;
  s.variantPairs = buildVariantPairs(s.alias);
  s.nameGroups = buildNameGroups(s.alias, s.variantPairs);
  s.herbById = new Map(s.herbs.map(h => [h.id, h]));
  s.taxo = buildTaxonomy(s.taxonomy, s.alias);
  s.cls = classifyAll(s.taxo, s.herbs);

  // ---- 藥名 -> 藥材 id 查表 ----
  const nameMap = new Map();
  const addName = (name, id) => {
    const k = normText(stripParen(name), s.variantPairs);
    if (k && !nameMap.has(k)) nameMap.set(k, id);
  };
  for (const h of s.herbs) {
    for (const n of splitNames(h.name_zh)) addName(n, h.id);
    addName(h.name_zh, h.id);
    for (const a of h.aliases || []) for (const n of splitNames(a)) addName(n, h.id);
  }
  // 基原商品名（sources.trade_name）另外建表：只用於「可能相關」提示，不當成同一味藥
  // （例：附子的基原商品名是「烏頭」，但附子不等於烏頭，不能直接對應）
  const tradeMap = new Map();
  for (const h of s.herbs) {
    for (const src of h.sources || []) {
      if (!src.trade_name) continue;
      for (const n of splitNames(src.trade_name)) {
        const k = normText(n, s.variantPairs);
        if (!tradeMap.has(k)) tradeMap.set(k, new Set());
        tradeMap.get(k).add(h.id);
      }
    }
  }
  s.tradeMap = tradeMap;
  // 別名群組（丹皮 -> 牡丹皮…）：只在名稱尚未被占用時補上
  for (const [k, set] of s.nameGroups) {
    if (nameMap.has(k)) continue;
    for (const n of set) { const id = nameMap.get(normText(n, s.variantPairs)); if (id) { nameMap.set(k, id); break; } }
  }
  s.nameMap = nameMap;

  // ---- 分類 ----
  s.catById = new Map(s.categories.map(c => [c.id, c]));
  s.catByPath = new Map(s.categories.map(c => [c.category_path, c]));

  // ---- 使用部位分組（衍生；缺檔時全部歸「其他」）----
  const map = s.partGroups?.mapping || {};
  s.partGroupsOf = (herb) => {
    const m = map[herb.part_used];
    return m && m.groups && m.groups.length ? m.groups : ['其他'];
  };
  s.partGroupList = s.partGroups?.groups || ['根', '根莖', '皮', '莖', '葉', '花', '果實', '種子', '全草', '菌核', '其他'];

  // ---- 每味藥的篩選面向 ----
  const UNSET = '未標示';
  s.UNSET = UNSET;
  s.facets = new Map();
  for (const h of s.herbs) {
    const cat = new Set();
    for (const p of categoryPaths(h)) { cat.add(p[0]); if (p.length > 1) cat.add(p.slice(0, 2).join('>')); }
    const nat = new Set((h.properties?.four_natures || []).map(baseNature).filter(Boolean));
    const fla = new Set((h.properties?.five_flavors || []).flatMap(baseFlavors));
    const mer = new Set((h.properties?.meridians || []).map(x => stripParen(x)).filter(Boolean));
    const grade = new Set(h.herb_grade ? [h.herb_grade] : []);
    const direct = s.cls.byHerb.get(h.id).direct;
    const ing = new Set();
    for (const id of direct) { ing.add(id); for (const a of s.taxo.ancestors(id)) ing.add(a); }
    const part = new Set(s.partGroupsOf(h));
    const fam = new Set(familiesOf(h));
    const tag = new Set(highlightTags(h));
    for (const set of [nat, fla, mer, grade, ing]) if (!set.size) set.add(UNSET);
    s.facets.set(h.id, { cat, nat, fla, mer, grade, ing, part, fam, tag });
  }
}

/** 藥名（可含括弧備註、用「、」連接多個）-> [{name, id|null}] */
export function resolveNames(str) {
  return splitNames(str).map(name => ({ name, id: store.nameMap.get(normText(name, store.variantPairs)) || null }));
}
export function resolveName(name) {
  return store.nameMap.get(normText(stripParen(name), store.variantPairs)) || null;
}
