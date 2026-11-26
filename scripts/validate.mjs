// 資料檢查：JSON 語法、藥材筆數、必要欄位、id 唯一、ref_id 與核心檔案之間的連結。
// 用法：node scripts/validate.mjs     （失敗時結束碼為 1，GitHub Actions 會因此擋下部署）
import { readFileSync, existsSync } from 'node:fs';
import * as D from '../js/lib/derive.js';

const root = new URL('../', import.meta.url);
const errors = [], warnings = [];
const err = (file, msg) => errors.push(`【錯誤】${file}：${msg}`);
const warn = (file, msg) => warnings.push(`【提醒】${file}：${msg}`);
const EXPECTED_HERBS = 360;
const REQUIRED = ['id', 'name_zh', 'aliases', 'name_latin', 'category', 'family_zh', 'sources', 'part_used', 'properties', 'ingredients', 'effects', 'compatibility', 'processing', 'formulas', 'related_herbs', 'notes', 'tags', 'images', 'source_page'];

function load(rel, required = true) {
  const path = new URL(rel, root);
  if (!existsSync(path)) { if (required) err(rel, '找不到檔案'); return null; }
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { err(rel, `JSON 語法錯誤：${e.message}`); return null; }
}

const herbs = load('data/herbs.json');
const theory = load('data/general_theory.json');
const cats = load('data/categories.json');
const hl = load('data/exam_highlights.json');
const tax = load('data/ingredient_taxonomy.json');
const alias = load('data/alias_dictionary.json');
const meta = load('data/meta.json');
const pg = load('data/derived/part_groups.json', false);
const compounds = load('data/compounds.json', false);

if (meta && !meta.data_version) err('data/meta.json', '缺少 data_version');

const ids = new Set();
if (herbs) {
  if (!Array.isArray(herbs)) err('data/herbs.json', '最外層必須是陣列');
  else {
    if (herbs.length !== EXPECTED_HERBS) err('data/herbs.json', `應有 ${EXPECTED_HERBS} 味，實際 ${herbs.length} 味（若是刻意增減，請修改 scripts/validate.mjs 的 EXPECTED_HERBS）`);
    herbs.forEach((h, i) => {
      const who = `data/herbs.json 第 ${i + 1} 筆（${h?.name_zh ?? '?'}／${h?.id ?? '?'}）`;
      for (const k of REQUIRED) if (!(k in h)) err(who, `缺少欄位 ${k}`);
      if (typeof h.id !== 'string' || !h.id) err(who, 'id 必須是非空字串');
      else if (ids.has(h.id)) err(who, `id 重複：${h.id}`); else ids.add(h.id);
      if (!h.name_zh) err(who, 'name_zh 是空的');
      for (const k of ['aliases', 'sources', 'ingredients', 'effects', 'processing', 'formulas', 'related_herbs', 'notes', 'tags', 'images', 'source_page'])
        if (k in h && !Array.isArray(h[k])) err(who, `${k} 必須是陣列`);
      for (const k of ['four_natures', 'five_flavors', 'meridians']) if (h.properties && !Array.isArray(h.properties[k])) err(who, `properties.${k} 必須是陣列`);
      (h.ingredients || []).forEach((g, gi) => { if (!Array.isArray(g.compounds)) err(who, `ingredients[${gi}].compounds 必須是陣列`); else g.compounds.forEach((c, ci) => { if (!c.name) err(who, `ingredients[${gi}].compounds[${ci}] 缺少 name`); }); });
      if (h.herb_grade && !['上品', '中品', '下品'].includes(h.herb_grade)) err(who, `herb_grade 只能是 上品／中品／下品，實際是「${h.herb_grade}」`);
    });
    for (const h of herbs) for (const r of h.related_herbs || []) if (r.ref_id && !ids.has(r.ref_id)) err(`data/herbs.json（${h.name_zh}）`, `related_herbs 的 ref_id「${r.ref_id}」不存在`);
  }
}
if (cats && herbs) {
  const seen = new Set();
  for (const c of cats) for (const id of c.herb_ids || []) { if (!ids.has(id)) err(`data/categories.json（${c.id}）`, `herb_ids 的「${id}」不存在`); seen.add(id); }
  for (const id of ids) if (!seen.has(id)) warn('data/categories.json', `藥材 ${id} 沒有出現在任何分類的 herb_ids`);
  const byPath = new Set(cats.map(c => c.category_path));
  const missingCat = new Map();
  for (const h of herbs) { const p = D.categoryPaths(h)[0]; if (p && !byPath.has(p.join('>'))) missingCat.set(p.join('>'), (missingCat.get(p.join('>')) || 0) + 1); }
  if (missingCat.size) warn('data/categories.json', `有 ${missingCat.size} 個二級分類沒有概論頁（網站改用「篩選」查看，不影響使用）：${[...missingCat].map(([k, n]) => `${k}(${n})`).join('、')}`);
}
if (hl && herbs) {
  const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if ('herb_id' in x) { if (x.herb_id === null) { /* 合法：藥材檔未收載 */ } else if (!ids.has(x.herb_id)) err('data/exam_highlights.json', `herb_id「${x.herb_id}」不存在`); } Object.values(x).forEach(walk); } };
  walk(hl);
}
if (tax && alias) {
  const taxo = D.buildTaxonomy(tax, alias);
  for (const g of alias.chemical_categories || []) if (!taxo.nodes.has(g.target_id)) warn('data/alias_dictionary.json', `chemical_categories 的 target_id「${g.target_id}」在成分分類樹裡不存在（網站會忽略這組別名）`);
  if (herbs) {
    const r = D.classifyAll(taxo, herbs);
    console.log(`成分比對：${r.matched}/${r.total} 筆（${(r.matched / r.total * 100).toFixed(1)}%）對得上分類樹；${r.herbsWithMatch} 味至少有一個成分可歸類；未歸類 ${r.unmatchedAll.length} 筆（網站會顯示為「未歸類」）。`);
  }
}
if (pg && herbs) {
  const map = pg.mapping || {};
  const missing = [...new Set(herbs.map(h => h.part_used).filter(Boolean))].filter(k => !map[k]);
  if (missing.length) warn('data/derived/part_groups.json', `有 ${missing.length} 種使用部位寫法沒有分組（會歸入「其他」）：${missing.slice(0, 5).join('、')}${missing.length > 5 ? '…' : ''}`);
  if (pg.status && /草稿|待/.test(pg.status)) warn('data/derived/part_groups.json', `狀態為「${pg.status}」，請審核後改成「已審核」`);
}
if (compounds) {
  if (!Array.isArray(compounds)) err('data/compounds.json', '最外層必須是陣列');
  else {
    const cid = new Set(), byName = new Map();
    for (const c of compounds) {
      if (!c?.id) { err('data/compounds.json', `有一筆缺少 id（${c?.name ?? '?'}）`); continue; }
      if (cid.has(c.id)) err('data/compounds.json', `id 重複：${c.id}`); cid.add(c.id);
      if (c.svg && !existsSync(new URL(c.svg, root))) err('data/compounds.json', `${c.id} 的結構圖不存在：${c.svg}`);
      const k = String(c.name || '').toLowerCase().replace(/\s+/g, '');
      if (!byName.has(k)) byName.set(k, []); byName.get(k).push(c);
    }
    const dups = [...byName.values()].filter(v => v.length > 1);
    if (dups.length) warn('data/compounds.json', `有 ${dups.length} 個化合物名稱對到多張結構（藥材頁會並排顯示並標 CID，請確認是否保留）：${dups.map(v => `${v[0].name}（CID ${v.map(x => x.pubchem_cid).join('／')}）`).join('、')}`);
  }
}
if (theory) for (const k of ['development', 'harvesting', 'processing', 'properties_theory', 'compatibility_rules', 'parts_latin_map']) if (!theory[k]) err('data/general_theory.json', `缺少 ${k}`);

warnings.forEach(w => console.log(w));
if (errors.length) { console.error(errors.join('\n')); console.error(`\n共 ${errors.length} 個錯誤，驗證失敗。`); process.exit(1); }
console.log(`驗證通過：${herbs?.length ?? 0} 味藥材，${warnings.length} 則提醒。`);
