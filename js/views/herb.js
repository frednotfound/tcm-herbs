import { h } from '../lib/dom.js';
import { store, resolveNames } from '../data.js';
import { hrefOf, herbHref, cameFromInside } from '../router.js';
import { chip, gradeChip, ed3Mark, thp5OnlyMark, nameLink, section, kv, empty, disclaimer, isNarrow } from '../lib/ui.js';
import { CONFIG } from '../config.js';
import { categoryPaths, familiesOf, stripParen, highlightTags, isCommonHerb, isThp5ExtractItem } from '../lib/derive.js';
import { suggest } from '../search.js';
import { openReport } from './report.js';

const RELATIONS = [
  ['xiang_xu', '相須'], ['shi', '相使'], ['wei', '相畏'], ['wu', '相惡'], ['fan', '相反'], ['sha', '相殺'],
];
const DIFF_FIELD_LABEL = {
  name_latin: '拉丁生藥名',
  family: '科別',
  sources: '基原',
  part_used: '使用部位',
  properties: '性味歸經',
  自訂補充: '補充說明',
};

// ===== 化學結構圖：讀 data/compounds.json，SVG 放在 structures/ =====
let structPromise = null;
const normName = (s) => String(s || '').toLowerCase().replace(/[\s　_\-‐‑–—'’′`"]/g, '');

function loadStructures() {
  if (!structPromise) {
    structPromise = fetch('data/compounds.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : []))
      .catch(() => [])
      .then(list => {
        const idx = new Map();
        for (const c of Array.isArray(list) ? list : []) {
          if (!c || !c.svg) continue;
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

function openStructure(c) {
  const closeBtn = h('button', { type: 'button', class: 'btn', onClick: () => dlg.close() }, '關閉');
  const dlg = h('dialog', { class: 'struct-dialog', 'aria-label': `${c.name} 化學結構式` },
    h('div', { class: 'sd-top' }, h('strong', null, c.name), closeBtn),
    c.class ? h('div', { class: 'muted small' }, c.class) : null,
    h('div', { class: 'sd-img' }, h('img', { src: c.svg, alt: `${c.name} 化學結構式` })),
    c.smiles ? h('code', null, `SMILES：${c.smiles}`) : null,
    c.pubchem_cid ? h('a', { href: `https://pubchem.ncbi.nlm.nih.gov/compound/${c.pubchem_cid}`, target: '_blank', rel: 'noopener' }, `在 PubChem 查看（CID ${c.pubchem_cid}）↗`) : null);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  closeBtn.focus();
}

/** withCid：同一個化合物名稱對到多張結構（例如不同立體異構）時，在縮圖下標出 PubChem CID 方便分辨 */
function structThumb(c, withCid) {
  return h('button', { type: 'button', class: 'struct-thumb', title: `${c.name}（點擊放大）`, 'aria-label': `放大 ${c.name} 化學結構式`, onClick: () => openStructure(c) },
    h('img', { src: c.svg, alt: `${c.name} 化學結構式`, loading: 'lazy', decoding: 'async', width: 150, height: 120 }),
    withCid && c.pubchem_cid ? h('span', { class: 'struct-cap' }, `CID ${c.pubchem_cid}`) : null);
}

function listLinks(names) {
  const out = [];
  names.forEach((n, i) => {
    if (i) out.push('、');
    const parts = resolveNames(n);
    if (parts.length === 1 && parts[0].name === stripParen(n)) out.push(nameLink(n, parts[0].id));
    else parts.forEach((p, j) => { if (j) out.push('、'); out.push(nameLink(p.name, p.id)); });
  });
  return out;
}

// ===== 臺灣中藥典第五版資料整理工具 =====
function thp5EntriesOf(herb) {
  if (Array.isArray(herb.thp5_list) && herb.thp5_list.length) return herb.thp5_list;
  return herb.thp5 ? [herb.thp5] : [];
}

function splitDosage(dosage, caution) {
  let d = String(dosage || '').trim();
  let c = String(caution || '').trim();
  const m = d.match(/(?:注意事項|注意)[：:]\s*(.*)$/);
  if (m) {
    c = (c ? `${c}；` : '') + m[1].trim();
    d = d.slice(0, m.index).trim();
  }
  return { dosage: d, caution: c };
}

function dedupeMarkers(markers) {
  if (!Array.isArray(markers) || !markers.length) return [];
  const diluteLimits = new Set();
  for (const m of markers) {
    const mk = String(m.marker || '').trim();
    const lm = String(m.limit || '').replace(/\s+/g, '');
    if (mk === '稀乙醇抽提物' && lm) diluteLimits.add(lm);
  }
  const seen = new Set();
  const out = [];
  for (const m of markers) {
    const mk = String(m.marker || '').trim();
    const lm = String(m.limit || '').trim();
    if (!mk) continue;
    const normLm = lm.replace(/\s+/g, '');
    if (mk === '乙醇抽提物' && diluteLimits.has(normLm)) continue;
    const key = `${mk}|${normLm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ marker: mk, limit: lm });
  }
  return out;
}

function splitDescriptionParagraphs(raw) {
  const text = String(raw || '').trim().replace(/^[1lI]\.\s*一般性狀(?:――|——|—)+\s*/, '');
  if (!text) return [];
  const parts = text.split(/(?=\(\d+\)\s*)/).map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

function parseImpurities(impObj) {
  if (!impObj || typeof impObj !== 'object') return [];
  const merged = [];
  for (const [k, v] of Object.entries(impObj)) {
    const kStr = String(k).trim();
    const vStr = String(v).trim();
    if (merged.length && /^[\d.]/.test(kStr)) {
      merged[merged.length - 1][1] += ` ${kStr}：${vStr}`;
    } else {
      merged.push([kStr, vStr]);
    }
  }
  const rows = [];
  for (const [rawK, rawVal] of merged) {
    let firstK = rawK;
    let body = rawVal;
    const brokenK = firstK.match(/^(.*?[。.%）)])\s*(\d+\.\s*[^――—]+)$/);
    if (brokenK) {
      rows.push(['檢查項目', brokenK[1].trim()]);
      firstK = brokenK[2].replace(/^\d+\.\s*/, '').trim();
    }
    let note = '';
    const mNote = body.match(/[。.]?\s*(※註[：:].*)$/);
    if (mNote) {
      note = mNote[1].trim();
      body = body.slice(0, mNote.index).trim();
    }
    const parts = body.split(/(?<=[。.%m）)])\s*(?=\d+\.\s*(?:[^――—。\d]{1,22}(?:――|——)|本品不得檢出))/);
    parts.forEach((p, idx) => {
      const clean = p.trim().replace(/^。+/, '').trim();
      if (!clean) return;
      if (idx === 0 && !/^\d+\.\s*(?:[^――—。\d]{1,22}(?:――|——)|本品不得檢出)/.test(clean)) {
        rows.push([firstK, clean]);
        return;
      }
      const m = clean.match(/^\d+\.\s*([^――—]+?)(?:――|——)+\s*(.*)$/);
      if (m) {
        rows.push([m[1].trim(), m[2].trim()]);
      } else if (/^\d+\.\s*本品不得檢出/.test(clean)) {
        rows.push(['特殊檢驗', clean.replace(/^\d+\.\s*/, '')]);
      } else if (rows.length) {
        rows[rows.length - 1][1] += ' ' + clean;
      } else {
        rows.push([firstK, clean]);
      }
    });
    if (note) rows.push(['備註', note]);
  }
  return rows;
}

function renderThp5Panel(th) {
  const { dosage, caution } = splitDosage(th.dosage, th.caution);
  const kvs = [];
  if (th.name_zh || th.name_latin || th.name_en) {
    kvs.push(kv('法定品名',
      h('strong', null, th.name_zh || ''),
      th.name_latin ? h('span', { class: 'latin' }, `　${th.name_latin}`) : null,
      th.name_en ? h('span', { class: 'muted small' }, `（${th.name_en}）`) : null));
  }
  if (th.usage_category) kvs.push(kv('用途分類', th.usage_category));
  if (th.origin_text) kvs.push(kv('基原原文', th.origin_text));
  if (th.properties_text) kvs.push(kv('性味歸經', th.properties_text));
  if (th.functions) kvs.push(kv('功能', th.functions));
  if (dosage) kvs.push(kv('用法用量', dosage));
  if (th.storage) kvs.push(kv('貯藏法', th.storage));
  if (th.source_page) kvs.push(kv('藥典頁碼', `臺灣中藥典第五版 第 ${th.source_page} 頁`));

  const markers = dedupeMarkers(th.assay_markers);
  const assayNode = (th.assay_summary || markers.length) ? h('div', { class: 'thp5-block' },
    h('h3', null, '抽提物與指標成分標準'),
    th.assay_summary ? h('p', { class: 'thp5-text' }, th.assay_summary) : null,
    markers.length ? h('div', { class: 'chips thp5-markers' }, ...markers.map(m => chip(`${m.marker}：${m.limit}`))) : null) : null;

  const descParas = splitDescriptionParagraphs(th.general_description);
  const descNode = descParas.length ? h('details', { class: 'sub-sec' },
    h('summary', null, '一般性狀'),
    h('div', { class: 'sub-sec-body' }, descParas.map(p => h('p', null, p)))) : null;

  const impRows = parseImpurities(th.impurity_limits);
  const impNode = impRows.length ? h('details', { class: 'sub-sec' },
    h('summary', null, `雜質檢查與限量（${impRows.length} 項）`),
    h('div', { class: 'sub-sec-body table-wrap' },
      h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, '檢驗項目'), h('th', null, '限量基準'))),
        h('tbody', null, impRows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v))))))) : null;

  return h('div', { class: 'thp5-panel' },
    h('dl', { class: 'kvs' }, kvs),
    caution ? h('div', { class: 'alert alert-warn' }, h('strong', null, '注意事項：'), caution) : null,
    assayNode,
    descNode,
    impNode);
}

export function renderHerb(id) {
  const herb = store.herbById.get(id);
  if (!herb) return renderNotFound(id);
  const narrow = isNarrow();
  const common = isCommonHerb(herb);
  const thp5Entries = thp5EntriesOf(herb);
  const root = h('article', { class: 'herb-view' });

  // 1. 標題列
  const tags = highlightTags(herb).filter(t => t !== '第三版修改');
  const enName = thp5Entries[0]?.name_en || '';
  const nonEnAliases = (herb.aliases || []).filter(a => a !== enName);
  const pageRefs = [];
  if (herb.source_page?.length) pageRefs.push(`常用中藥講義 p.${herb.source_page.join('、')}`);
  const thp5Pages = [...new Set(thp5Entries.map(x => x.source_page).filter(Boolean))];
  if (thp5Pages.length) pageRefs.push(`臺灣中藥典第五版 p.${thp5Pages.join('、')}`);

  const titleBox = h('header', { class: 'herb-head card' },
    h('div', { class: 'hh-top' },
      // 只有從站內點進來才用「上一頁」；從分享連結、書籤直接開啟時改回藥材總覽，避免被帶離本站
      h('a', { class: 'back-link', href: '#/herbs', onClick: (e) => { if (cameFromInside()) { e.preventDefault(); history.back(); } } }, '‹ 返回'),
      h('button', { type: 'button', class: 'btn btn-report', onClick: () => openReport({ type: '藥材', id: herb.id, name: herb.name_zh }) }, '回報錯誤')),
    h('h1', null, herb.name_zh, ed3Mark(herb.ed3_updated), thp5OnlyMark(herb)),
    nonEnAliases.length ? h('div', { class: 'aliases' }, '別名：', nonEnAliases.join('、')) : null,
    enName && !common ? h('div', { class: 'aliases' }, '英文名：', enName) : null,
    h('div', { class: 'latin' }, herb.name_latin || '', herb.name_latin_legacy?.length ? h('span', { class: 'muted' }, `（舊：${herb.name_latin_legacy.join('；')}）`) : null),
    (herb.herb_grade || tags.length) ? h('div', { class: 'chips' }, gradeChip(herb.herb_grade),
      ...tags.map(t => chip(t, { href: hrefOf('/herbs', new URLSearchParams({ tag: t })), title: `看所有「${t}」` }))) : null,
    pageRefs.length ? h('div', { class: 'muted small' }, pageRefs.join(' · ')) : null);
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
  if (herb.part_used) basics.push(kv('使用部位', herb.part_used, h('span', { class: 'chips inline' }, ...store.partGroupsOf(herb).map(g => chip(g, { kind: 'derived', title: '篩選用分組', href: hrefOf('/herbs', new URLSearchParams({ part: g })) })))));
  const p = herb.properties || {};
  if (p.four_natures?.length) basics.push(kv('四氣', p.four_natures.join('、')));
  if (p.five_flavors?.length) basics.push(kv('五味', p.five_flavors.join('、')));
  if (p.meridians?.length) basics.push(kv('歸經', p.meridians.join('、')));
  if (!p.four_natures?.length && !p.five_flavors?.length && !p.meridians?.length) basics.push(kv('性味歸經', h('span', { class: 'muted' }, '未標示')));
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
  let visibleCompCount = 0;
  if (!herb.ingredients?.length) ingBody.push(empty(common ? '講義未列成分。' : '本條目未另列化學成分。'));
  (herb.ingredients || []).forEach((g, gi) => {
    const head = h('div', { class: 'ing-head' }, h('strong', null, g.category_raw || '（未分類）'), g.subgroup ? h('span', { class: 'muted' }, `　${g.subgroup}`) : null,
      g.group_spec ? h('span', { class: 'muted' }, `　${g.group_spec}`) : null);
    const gp = g.group_pharmacology?.length ? h('div', { class: 'ing-pharm' }, '藥理：', g.group_pharmacology.join('、')) : null;
    const diluteSpecs = new Set((g.compounds || []).filter(x => x.name === '稀乙醇抽提物').map(x => String(x.content_spec || '').replace(/\s+/g, '')));
    const comps = [];
    (g.compounds || []).forEach((c, ci) => {
      if (g.category_raw === '法定指標／抽提物' && c.name === '乙醇抽提物' && diluteSpecs.has(String(c.content_spec || '').replace(/\s+/g, ''))) return;
      visibleCompCount++;
      const isExt = isThp5ExtractItem(g, c);
      const ids = cls.perCompound.get(`${gi}:${ci}`) || [];
      const nodeChips = isExt
        ? []
        : (ids.length ? ids.map(nid => chip(store.taxo.nodes.get(nid).label, { kind: 'tree', href: `#/ingredients/${encodeURIComponent(nid)}`, title: store.taxo.path(nid).join(' > ') })) : [chip('未歸類', { kind: 'unclassified', title: '成分分類樹尚未收錄這個名稱' })]);
      const structRow = h('div', { class: 'struct-row' });
      structRow.hidden = true;
      if (!isExt) structJobs.push({ comp: c, row: structRow });
      comps.push(h('li', null,
        h('span', { class: 'compound' }, c.name),
        c.aliases?.length ? h('span', { class: 'muted' }, `（${c.aliases.join('、')}）`) : null,
        c.content_spec ? h('span', { class: 'spec' }, ` ${c.content_spec}`) : null,
        c.pharmacology?.length ? h('span', { class: 'pharm' }, ` ‧ ${c.pharmacology.join('、')}`) : null,
        c.note && c.note !== '臺灣中藥典第五版' ? h('span', { class: 'muted' }, ` ‧ ${c.note}`) : null,
        nodeChips.length ? h('span', { class: 'chips inline' }, ...nodeChips) : null,
        structRow));
    });
    ingBody.push(h('div', { class: 'ing-group' }, head, gp, comps.length ? h('ul', { class: 'compounds' }, comps) : h('p', { class: 'muted small' }, '（只列類別，未列化合物）')));
  });
  // 結構式說明：有找到結構圖才顯示（原本的「預留（第二階段以後提供）」字樣已過時）
  const structNote = h('p', { class: 'muted small struct-note', hidden: true });
  ingBody.push(structNote);
  if (structJobs.length) loadStructures().then(idx => {
    if (!idx.size || !structNote.isConnected) return;
    let hits = 0;
    for (const { comp, row } of structJobs) {
      const list = structuresFor(idx, comp);
      if (!list.length) continue;
      hits += list.length;
      list.forEach(c => row.append(structThumb(c, list.length > 1)));
      row.hidden = false;
    }
    if (hits) { structNote.hidden = false; structNote.textContent = `本頁已收錄 ${hits} 張化合物結構式，點圖可放大。`; }
  });
  root.append(section('ingredients', '成分', ingBody, { count: visibleCompCount }));

  // 5. 功效
  const effBody = (herb.effects || []).length ? herb.effects.map(e => h('div', { class: 'eff-group' },
    e.group && e.group !== '一般' ? h('div', { class: 'eff-title' }, e.group) : null,
    h('div', { class: 'chips' }, ...(e.items || []).map(it => chip(it, { href: hrefOf('/herbs', new URLSearchParams({ q: stripParen(it), scope: 'effect' })), title: '找有同樣功效的藥' }))))) : [empty('未列功效。')];
  root.append(section('effects', '功效', effBody));

  // 6. 配伍禁忌
  const c = herb.compatibility || {};
  const compBody = [];
  for (const [key, label] of RELATIONS) if (c[key]?.length) compBody.push(kv(label, ...listLinks(c[key])));
  if (c.taboo?.length) compBody.push(kv('禁忌', c.taboo.join('；')));
  if (c.clinical_pairs?.length) compBody.push(kv('臨床常用搭配', c.clinical_pairs.join('；')));
  const hasCompat = compBody.length > 0;
  root.append(section('compat', '配伍禁忌', hasCompat ? [h('dl', { class: 'kvs' }, compBody),
    h('p', null, h('a', { class: 'btn', href: `#/compat?herbs=${encodeURIComponent(herb.id)}` }, '到配伍禁忌頁查詢（含總論十八反、十九畏）')), disclaimer(CONFIG.clinicalDisclaimer)]
    : [empty(common ? '講義此味未列配伍資料。' : '本條目未另列配伍資料。'), h('p', null, h('a', { href: `#/compat?herbs=${encodeURIComponent(herb.id)}` }, '到配伍禁忌頁查詢總論規則（十八反、十九畏、妊娠）'))], { open: hasCompat || common }));

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

  // 8. 臺灣中藥典第五版規範（放在備註之後，預設收合）
  if (thp5Entries.length) {
    let thp5Body;
    if (thp5Entries.length === 1) {
      thp5Body = [renderThp5Panel(thp5Entries[0])];
    } else {
      const panels = thp5Entries.map((th, i) => {
        const panel = renderThp5Panel(th);
        panel.hidden = i !== 0;
        return panel;
      });
      const tabBtns = [];
      const tabBar = h('div', { class: 'tabs thp5-tabs', role: 'tablist', 'aria-label': '臺灣中藥典第五版品項' },
        thp5Entries.map((th, i) => {
          const btn = h('button', {
            type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(i === 0),
            onClick: () => {
              tabBtns.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
              panels.forEach((pn, j) => { pn.hidden = j !== i; });
            },
          }, th.name_zh || `品項 ${i + 1}`);
          tabBtns.push(btn);
          return btn;
        }));
      thp5Body = [tabBar, ...panels];
    }
    root.append(section('thp5', '臺灣中藥典第五版規範', thp5Body, { open: false, count: thp5Entries.length > 1 ? `${thp5Entries.length} 品項` : null }));
  }

  // 9. 第五版與原講義差異（緊接在後，預設收合）
  if (herb.thp5_changes?.length) {
    const diffTable = h('div', { class: 'table-wrap' },
      h('table', { class: 'tbl diff-tbl' },
        h('thead', null, h('tr', null, ['欄位', '原講義', '修正後', '備註'].map(x => h('th', null, x)))),
        h('tbody', null, herb.thp5_changes.map(ch => h('tr', null,
          h('th', null, DIFF_FIELD_LABEL[ch.field] || ch.field),
          h('td', null, ch.old || '—'),
          h('td', null, ch.new || '—'),
          h('td', { class: 'muted small' }, ch.note || ''))))));
    root.append(section('thp5-diff', '第五版與原講義差異', [diffTable], { open: false, count: herb.thp5_changes.length }));
  }

  // 10. 頁尾
  root.append(h('footer', { class: 'herb-foot card' },
    h('div', { class: 'muted small' }, pageRefs.join(' · '), herb.herb_grade_source ? `　品級來源：${herb.herb_grade_source}` : ''),
    h('div', null, h('button', { type: 'button', class: 'btn', onClick: () => openReport({ type: '藥材', id: herb.id, name: herb.name_zh }) }, '回報錯誤')),
    h('p', { class: 'disclaimer' }, CONFIG.disclaimer)));

  // 桌面版：頁內目錄
  const toc = h('nav', { class: 'toc card', 'aria-label': '本頁目錄' }, h('strong', null, '本頁目錄'),
    ...[['basic', '基本資料'], ['source', '基原'], ['ingredients', '成分'], ['effects', '功效'], ['compat', '配伍禁忌'], ['processing', '炮製'], ['formulas', '方劑'], ['related', '附藥與近緣品'], ['notes', '備註'], ['thp5', '臺灣中藥典第五版'], ['thp5-diff', '第五版差異']]
      .filter(([k]) => root.querySelector('#' + k)).map(([k, l]) => h('a', { href: '#', onClick: (e) => { e.preventDefault(); const t = root.querySelector('#' + k); t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, l)));
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
