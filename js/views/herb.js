import { h, frag } from '../lib/dom.js';
import { store, resolveName, resolveNames } from '../data.js';
import { hrefOf, herbHref } from '../router.js';
import { chip, gradeChip, ed3Mark, nameLink, section, kv, empty, disclaimer, isNarrow } from '../lib/ui.js';
import { CONFIG } from '../config.js';
import { categoryPaths, familiesOf, stripParen, highlightTags } from '../lib/derive.js';
import { suggest } from '../search.js';
import { openReport } from './report.js';

const RELATIONS = [
  ['xiang_xu', '相須'], ['shi', '相使'], ['wei', '相畏'], ['wu', '相惡'], ['fan', '相反'], ['sha', '相殺'],
];

// ===== 化學結構圖：讀 data/compounds.json，SVG 放在 structures/ =====
// 檔案不存在或載入失敗時靜默略過，網站維持原樣。
let structPromise = null;
const normName = (s) => String(s || '').toLowerCase().replace(/[\s\u3000_\-‐‑–—'’′`"]/g, '');

function loadStructures() {
  if (!structPromise) {
    structPromise = fetch('data/compounds.json')
      .then(r => (r.ok ? r.json() : []))
      .catch(() => [])
      .then(list => {
        const idx = new Map();
        for (const c of Array.isArray(list) ? list : []) {
          const keys = new Set([c.name, ...(c.aliases || []), ...(c.match_names || [])].map(normName).filter(Boolean));
          for (const k of keys) { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(c); }
        }
        return idx;
      });
  }
  return structPromise;
}

function structuresFor(idx, comp) {
  const found = new Map();
  for (const key of [comp.name, ...(comp.aliases || [])].map(normName)) {
    for (const c of idx.get(key) || []) found.set(c.id, c);
  }
  return [...found.values()];
}

function ensureStructStyle() {
  if (document.getElementById('struct-style')) return;
  const st = document.createElement('style');
  st.id = 'struct-style';
  st.textContent = `
.struct-row{display:flex;flex-wrap:wrap;gap:.5rem;margin:.4rem 0 .2rem}
.struct-thumb{display:block;background:#fff;border:1px solid rgba(128,128,128,.35);border-radius:8px;padding:4px;cursor:zoom-in}
.struct-thumb img{display:block;width:150px;height:120px;object-fit:contain}
.struct-dialog{max-width:min(92vw,560px);width:100%;border:1px solid rgba(128,128,128,.4);border-radius:12px;padding:1rem;background:var(--card,Canvas);color:inherit}
.struct-dialog::backdrop{background:rgba(0,0,0,.55)}
.struct-dialog .sd-img{background:#fff;border-radius:8px;padding:8px;margin:.6rem 0}
.struct-dialog .sd-img img{display:block;width:100%;max-height:60vh;object-fit:contain}
.struct-dialog code{display:block;word-break:break-all;font-size:.8rem;margin:.4rem 0}
.struct-dialog .sd-top{display:flex;justify-content:space-between;align-items:center;gap:.5rem}
`;
  document.head.append(st);
}

function openStructure(c) {
  ensureStructStyle();
  const dlg = h('dialog', { class: 'struct-dialog' },
    h('div', { class: 'sd-top' }, h('strong', null, c.name),
      h('button', { type: 'button', class: 'btn', onClick: () => dlg.close() }, '關閉')),
    c.class ? h('div', { class: 'muted small' }, c.class) : null,
    h('div', { class: 'sd-img' }, h('img', { src: c.svg, alt: `${c.name} 化學結構式` })),
    c.smiles ? h('code', null, `SMILES：${c.smiles}`) : null,
    c.pubchem_cid ? h('a', { href: `https://pubchem.ncbi.nlm.nih.gov/compound/${c.pubchem_cid}`, target: '_blank', rel: 'noopener' }, '在 PubChem 查看 ↗') : null);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

function structThumb(c) {
  return h('button', { type: 'button', class: 'struct-thumb', title: `${c.name}（點擊放大）`, onClick: () => openStructure(c) },
    h('img', { src: c.svg, alt: `${c.name} 化學結構式`, loading: 'lazy' }));
}

function listLinks(names) {
  const out = [];
  names.forEach((n, i) => {
    if (i) out.push('、');
    const parts = resolveNames(n);
    // 一個字串可能含多味（如「川烏、草烏」已被拆開）；整串無法對應時顯示原文
    if (parts.length === 1 && parts[0].name === stripParen(n)) out.push(nameLink(n, parts[0].id));
    else parts.forEach((p, j) => { if (j) out.push('、'); out.push(nameLink(p.name, p.id)); });
  });
  return out;
}

export function renderHerb(id) {
  const herb = store.herbById.get(id);
  if (!herb) return renderNotFound(id);
  const narrow = isNarrow();
  const root = h('article', { class: 'herb-view' });

  // 1. 標題列
  const tags = highlightTags(herb).filter(t => t !== '第三版修改');
  const titleBox = h('header', { class: 'herb-head card' },
    h('div', { class: 'hh-top' },
      h('a', { class: 'back-link', href: '#/herbs', onClick: (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, '‹ 返回'),
      h('button', { type: 'button', class: 'btn btn-report', onClick: () => openReport({ type: '藥材', id: herb.id, name: herb.name_zh }) }, '回報錯誤')),
    h('h1', null, herb.name_zh, ed3Mark(herb.ed3_updated)),
    herb.aliases?.length ? h('div', { class: 'aliases' }, '別名：', herb.aliases.join('、')) : null,
    h('div', { class: 'latin' }, herb.name_latin || '', herb.name_latin_legacy?.length ? h('span', { class: 'muted' }, `（舊：${herb.name_latin_legacy.join('；')}）`) : null),
    h('div', { class: 'chips' }, gradeChip(herb.herb_grade),
      ...tags.map(t => chip(t, { href: hrefOf('/herbs', new URLSearchParams({ tag: t })), title: `看所有「${t}」` }))),
    herb.source_page?.length ? h('div', { class: 'muted small' }, `講義 p.${herb.source_page.join('、')}`) : null);
  root.append(titleBox);

  // 2. 基本資料
  const basics = [];
  const paths = categoryPaths(herb);
  if (paths.length) {
    basics.push(kv('分類', ...paths.flatMap((p, i) => [i ? '；' : null, ...p.flatMap((seg, j) => {
      const full = p.slice(0, j + 1).join('>');
      const cat = store.catByPath.get(full);
      return [j ? ' > ' : null, h('a', { href: cat ? `#/cat/${encodeURIComponent(cat.id)}` : hrefOf('/herbs', new URLSearchParams({ cat: full })) }, seg)];
    })])));
  }
  if (herb.secondary_categories?.length) basics.push(kv('次分類', herb.secondary_categories.join('；')));
  const fam = familiesOf(herb);
  if (fam.length || herb.family_latin) basics.push(kv('科別', [herb.family_zh, herb.family_latin].filter(Boolean).join('　'), herb.family_legacy?.length ? h('span', { class: 'muted' }, `（舊：${herb.family_legacy.join('；')}）`) : null));
  if (herb.part_used) basics.push(kv('使用部位', herb.part_used, h('span', { class: 'chips inline' }, ...store.partGroupsOf(herb).map(g => chip(g, { kind: 'derived', title: '篩選用分組（衍生，待審核）', href: hrefOf('/herbs', new URLSearchParams({ part: g })) })))));
  const p = herb.properties || {};
  if (p.four_natures?.length) basics.push(kv('四氣', p.four_natures.join('、')));
  if (p.five_flavors?.length) basics.push(kv('五味', p.five_flavors.join('、')));
  if (p.meridians?.length) basics.push(kv('歸經', p.meridians.join('、')));
  if (!p.four_natures?.length && !p.five_flavors?.length && !p.meridians?.length) basics.push(kv('性味歸經', h('span', { class: 'muted' }, '講義未標示')));
  root.append(section('basic', '基本資料', h('dl', { class: 'kvs' }, basics)));

  // 3. 基原
  if (herb.sources?.length) {
    root.append(section('source', '基原', herb.sources.map(src => h('div', { class: 'src' },
      h('div', null, h('strong', null, src.trade_name || '（未列商品名）'), ed3Mark(src.ed3_updated)),
      src.scientific_name ? h('div', { class: 'sci' }, src.scientific_name, src.author ? ` ${src.author}` : '') : null,
      src.scientific_name_legacy ? h('div', { class: 'muted small' }, `舊學名：${src.scientific_name_legacy}`) : null,
      src.origin_region ? h('div', { class: 'muted small' }, `產地：${src.origin_region}`) : null)), { count: herb.sources.length }));
  }

  // 4. 成分
  const cls = store.cls.byHerb.get(herb.id);
  const ingBody = [];
  const structJobs = [];
  if (!herb.ingredients?.length) ingBody.push(empty('講義未列成分。'));
  (herb.ingredients || []).forEach((g, gi) => {
    const head = h('div', { class: 'ing-head' }, h('strong', null, g.category_raw || '（未分類）'), g.subgroup ? h('span', { class: 'muted' }, `　${g.subgroup}`) : null,
      g.group_spec ? h('span', { class: 'muted' }, `　${g.group_spec}`) : null);
    const gp = g.group_pharmacology?.length ? h('div', { class: 'ing-pharm' }, '藥理：', g.group_pharmacology.join('、')) : null;
    const comps = (g.compounds || []).map((c, ci) => {
      const ids = cls.perCompound.get(`${gi}:${ci}`) || [];
      const nodeChips = ids.length ? ids.map(nid => chip(store.taxo.nodes.get(nid).label, { kind: 'tree', href: `#/ingredients/${encodeURIComponent(nid)}`, title: store.taxo.path(nid).join(' > ') })) : [chip('未歸類', { kind: 'unclassified', title: '成分分類樹尚未收錄這個名稱' })];
      const structRow = h('div', { class: 'struct-row' });
      structRow.hidden = true;
      structJobs.push({ comp: c, row: structRow });
      return h('li', null,
        h('span', { class: 'compound' }, c.name),
        c.aliases?.length ? h('span', { class: 'muted' }, `（${c.aliases.join('、')}）`) : null,
        c.content_spec ? h('span', { class: 'spec' }, ` ${c.content_spec}`) : null,
        c.pharmacology?.length ? h('span', { class: 'pharm' }, ` ‧ ${c.pharmacology.join('、')}`) : null,
        c.note ? h('span', { class: 'muted' }, ` ‧ ${c.note}`) : null,
        h('span', { class: 'chips inline' }, ...nodeChips),
        structRow);
    });
    ingBody.push(h('div', { class: 'ing-group' }, head, gp, comps.length ? h('ul', { class: 'compounds' }, comps) : h('p', { class: 'muted small' }, '（講義只列類別，未列化合物）')));
  });
  const structNote = h('p', { class: 'muted small placeholder' }, herb.images?.length ? '' : '化學結構式：預留（第二階段以後提供）');
  ingBody.push(structNote);
  loadStructures().then(idx => {
    if (!idx.size) return;
    ensureStructStyle();
    let hits = 0;
    for (const { comp, row } of structJobs) {
      const list = structuresFor(idx, comp);
      if (!list.length) continue;
      hits += list.length;
      list.forEach(c => row.append(structThumb(c)));
      row.hidden = false;
    }
    if (hits) structNote.textContent = `本頁已收錄 ${hits} 個化合物的結構式，點圖可放大。`;
  });
  root.append(section('ingredients', '成分', ingBody, { count: herb.ingredients?.reduce((n, g) => n + (g.compounds?.length || 0), 0) || 0 }));

  // 5. 功效
  const effBody = (herb.effects || []).length ? herb.effects.map(e => h('div', { class: 'eff-group' },
    e.group && e.group !== '一般' ? h('div', { class: 'eff-title' }, e.group) : null,
    h('div', { class: 'chips' }, ...(e.items || []).map(it => chip(it, { href: hrefOf('/herbs', new URLSearchParams({ q: stripParen(it), scope: 'effect' })), title: '找有同樣功效的藥' }))))) : [empty('講義未列功效。')];
  root.append(section('effects', '功效', effBody));

  // 6. 配伍禁忌
  const c = herb.compatibility || {};
  const compBody = [];
  for (const [key, label] of RELATIONS) if (c[key]?.length) compBody.push(kv(label, ...listLinks(c[key])));
  if (c.taboo?.length) compBody.push(kv('禁忌', c.taboo.join('；')));
  if (c.clinical_pairs?.length) compBody.push(kv('臨床常用搭配', c.clinical_pairs.join('；')));
  const hasCompat = compBody.length > 0;
  root.append(section('compat', '配伍禁忌', hasCompat ? [h('dl', { class: 'kvs' }, compBody),
    h('p', null, h('a', { class: 'btn', href: `#/compat?herbs=${herb.id}` }, '到配伍禁忌頁查詢（含總論十八反、十九畏）')), disclaimer(CONFIG.clinicalDisclaimer)]
    : [empty('講義此味未列配伍資料。'), h('p', null, h('a', { href: `#/compat?herbs=${herb.id}` }, '到配伍禁忌頁查詢總論規則'))], { open: true }));

  // 7. 炮製、方劑、附藥、備註
  if (herb.processing?.length) root.append(section('processing', '炮製', h('ul', null, herb.processing.map(x => h('li', null, x))), { open: !narrow }));
  if (herb.formulas?.length) root.append(section('formulas', '方劑', h('ul', { class: 'formula-list' }, herb.formulas.map(f => h('li', null,
    h('a', { href: hrefOf('/herbs', new URLSearchParams({ q: stripParen(f), scope: 'formula' })), title: '看含這個方劑名的藥' }, stripParen(f)),
    f !== stripParen(f) ? h('span', { class: 'muted' }, f.slice(stripParen(f).length)) : null))), { count: herb.formulas.length, open: !narrow }));
  if (herb.related_herbs?.length) root.append(section('related', '附藥與近緣品', h('ul', null, herb.related_herbs.map(r => h('li', null,
    r.ref_id && store.herbById.has(r.ref_id) ? h('a', { href: herbHref(r.ref_id) }, r.name_zh) : h('strong', null, r.name_zh),
    r.relation ? h('span', { class: 'muted' }, `（${r.relation}）`) : null,
    r.part_used ? h('span', { class: 'muted' }, ` 部位：${r.part_used}`) : null,
    r.notes ? h('span', null, `：${r.notes}`) : null))), { count: herb.related_herbs.length, open: !narrow }));
  if (herb.notes?.length) root.append(section('notes', '備註', h('ul', null, herb.notes.map(x => h('li', null, x))), { open: !narrow }));

  // 8. 頁尾
  root.append(h('footer', { class: 'herb-foot card' },
    h('div', { class: 'muted small' }, herb.source_page?.length ? `講義 p.${herb.source_page.join('、')}　` : '', herb.herb_grade_source ? `品級來源：${herb.herb_grade_source}` : ''),
    h('div', null, h('button', { type: 'button', class: 'btn', onClick: () => openReport({ type: '藥材', id: herb.id, name: herb.name_zh }) }, '回報錯誤')),
    h('p', { class: 'disclaimer' }, CONFIG.disclaimer)));

  // 桌面版：頁內目錄
  const toc = h('nav', { class: 'toc card', 'aria-label': '本頁目錄' }, h('strong', null, '本頁目錄'),
    ...[['basic', '基本資料'], ['source', '基原'], ['ingredients', '成分'], ['effects', '功效'], ['compat', '配伍禁忌'], ['processing', '炮製'], ['formulas', '方劑'], ['related', '附藥與近緣品'], ['notes', '備註']]
      .filter(([k]) => root.querySelector('#' + k)).map(([k, l]) => h('a', { href: `#`, onClick: (e) => { e.preventDefault(); const t = root.querySelector('#' + k); t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, l)));
  const wrap = h('div', { class: 'herb-layout' }, root, toc);
  return { node: wrap, title: herb.name_zh };
}

export function renderNotFound(id) {
  const sug = suggest(id.replace(/^herb_/, ''));
  return { node: h('div', { class: 'card' }, h('h1', null, '找不到這味藥'),
    h('p', null, `沒有編號為「${id}」的藥材。`),
    sug.length ? h('p', null, '你是不是要找：', ...sug.map(x => chip(x.name_zh, { href: herbHref(x.id) }))) : null,
    h('p', null, h('a', { class: 'btn', href: '#/herbs' }, '回到藥材總覽'))), title: '找不到這味藥' };
}
