import { h } from '../lib/dom.js';
import { store } from '../data.js';
import { herbHref, hrefOf } from '../router.js';
import { chip, empty, nameLink, thp5OnlyMark } from '../lib/ui.js';
import { isCommonHerb } from '../lib/derive.js';

export function renderIngredients(nodeId, params = new URLSearchParams()) {
  const taxo = store.taxo;
  const UNCL = 'unclassified';
  const onlyCommon = params?.get('src') === 'common';
  const selected = nodeId && (taxo.nodes.has(nodeId) || nodeId === UNCL) ? nodeId : null;
  const openIds = new Set(selected ? [selected, ...taxo.ancestors(selected)] : []);
  const activeHerbs = onlyCommon ? store.herbs.filter(isCommonHerb) : store.herbs;
  const activeSet = new Set(activeHerbs.map(hh => hh.id));

  const ingHref = (id, nextCommon = onlyCommon) => {
    const path = id ? `/ingredients/${encodeURIComponent(id)}` : '/ingredients';
    return hrefOf(path, nextCommon ? new URLSearchParams({ src: 'common' }) : new URLSearchParams());
  };

  function herbCountOf(id) {
    let n = 0;
    for (const hh of activeHerbs) if (store.facets.get(hh.id).ing.has(id)) n++;
    return n;
  }

  let totalComp = 0, matchedComp = 0;
  const unmatchedList = [];
  for (const hh of activeHerbs) {
    const r = store.cls.byHerb.get(hh.id);
    totalComp += r.total;
    matchedComp += r.total - r.unmatched.length;
    for (const u of r.unmatched) unmatchedList.push({ herb_id: hh.id, herb: hh.name_zh, ...u });
  }

  const toggleBar = h('div', { class: 'toggle-bar' },
    h('label', { class: 'toggle-pill' },
      h('input', {
        type: 'checkbox',
        checked: onlyCommon,
        onChange: (e) => { location.hash = ingHref(selected, e.target.checked); },
      }),
      h('span', null, `僅顯示常用中藥（${store.commonCount} 味）`)));

  const treeEl = h('nav', { class: 'ing-tree card', 'aria-label': '成分分類樹' }, toggleBar);
  const renderNode = (id) => {
    const n = taxo.nodes.get(id);
    const label = h('a', { href: ingHref(id), class: `tn-link${id === selected ? ' sel' : ''}`, 'aria-current': id === selected ? 'page' : null },
      n.label, h('span', { class: 'tn-count' }, String(herbCountOf(id))));
    if (!n.children.length) return h('li', null, label);
    const d = h('details', { class: 'tn' }, h('summary', null, label), h('ul', null, n.children.map(renderNode)));
    if (openIds.has(id)) d.open = true;
    return h('li', null, d);
  };
  treeEl.append(h('ul', { class: 'tn-root' }, taxo.topIds.map(renderNode),
    h('li', null, h('a', { href: ingHref(UNCL), class: `tn-link${selected === UNCL ? ' sel' : ''}` }, '未歸類成分', h('span', { class: 'tn-count' }, String(unmatchedList.length))))));

  const main = h('div', { class: 'ing-main' });
  if (!selected) {
    const pct = totalComp ? Math.round(matchedComp / totalComp * 100) : 0;
    main.append(h('div', { class: 'card' }, h('h1', null, '成分樹反查'),
      h('p', null, '從左側（手機在上方）的分類樹點選一類成分，會列出含有該類化合物的藥材。點父節點會自動包含所有子節點。'),
      h('p', { class: 'muted' }, `目前範圍（${onlyCommon ? `常用中藥 ${store.commonCount} 味` : `全部 ${store.herbs.length} 味`}）：成分共 ${totalComp} 筆，其中 ${matchedComp} 筆（${pct}%）能對應到分類樹；其餘列在「未歸類成分」。`)));
  } else if (selected === UNCL) {
    const byHerb = new Map();
    for (const u of unmatchedList) { if (!byHerb.has(u.herb_id)) byHerb.set(u.herb_id, []); byHerb.get(u.herb_id).push(u); }
    main.append(h('div', { class: 'card' }, h('h1', null, '未歸類成分'),
      h('p', { class: 'muted' }, `目前範圍共 ${unmatchedList.length} 筆，來自 ${byHerb.size} 味藥。這些名稱在成分分類樹或同義詞表裡找不到。若要歸類，請編輯 data/ingredient_taxonomy.json 或 data/alias_dictionary.json。`)));
    for (const [id, list] of byHerb) {
      const herb = store.herbById.get(id);
      main.append(h('div', { class: 'card' }, h('h3', null, nameLink(herb.name_zh, id), !onlyCommon ? thp5OnlyMark(herb) : null, h('span', { class: 'muted small' }, `　${list.length} 筆`)),
        h('div', { class: 'chips' }, ...list.map(u => chip(u.name, { title: u.group || '' })))));
    }
  } else {
    const n = taxo.nodes.get(selected);
    const desc = taxo.descendants(selected);
    const rows = [];
    for (const herb of activeHerbs) {
      if (!activeSet.has(herb.id) || !store.facets.get(herb.id).ing.has(selected)) continue;
      const names = [];
      const cls = store.cls.byHerb.get(herb.id);
      (herb.ingredients || []).forEach((g, gi) => (g.compounds || []).forEach((c, ci) => {
        const ids = cls.perCompound.get(`${gi}:${ci}`) || [];
        if (ids.some(i => desc.has(i))) names.push(c.name);
      }));
      rows.push({ herb, names });
    }
    main.append(h('div', { class: 'card' },
      h('div', { class: 'muted small' }, taxo.path(selected).join(' > ')),
      h('h1', null, n.label, n.name_zh ? h('span', { class: 'muted en' }, `　${n.name_zh}`) : null),
      n.children.length ? h('div', { class: 'chips' }, '子類：', ...n.children.map(c => chip(taxo.nodes.get(c).label, { href: ingHref(c) }))) : null,
      h('p', null, `含此類成分的藥材：${rows.length} 味${onlyCommon ? '（常用中藥）' : ''}`)));
    if (!rows.length) main.append(empty(`目前範圍（${onlyCommon ? '常用中藥' : '全部藥材'}）中沒有藥材歸入這一類。`));
    for (const { herb, names } of rows) {
      main.append(h('a', { class: 'herb-card', href: herbHref(herb.id) },
        h('div', { class: 'hc-top' }, h('span', { class: 'hc-name' }, herb.name_zh), !onlyCommon ? thp5OnlyMark(herb) : null, h('span', { class: 'hc-latin' }, herb.name_latin || '')),
        names.length ? h('div', { class: 'snip' }, h('span', { class: 'hit-label' }, '成分'), h('span', { class: 'snip-text' }, names.slice(0, 8).join('、') + (names.length > 8 ? `…等 ${names.length} 個` : ''))) : h('div', { class: 'snip muted' }, '（只列此類別，未列化合物）')));
    }
  }
  return { node: h('div', { class: 'ing-layout' }, treeEl, main), title: '成分樹反查' };
}
