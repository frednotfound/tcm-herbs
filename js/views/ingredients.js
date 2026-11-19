import { h } from '../lib/dom.js';
import { store } from '../data.js';
import { herbHref } from '../router.js';
import { chip, empty, nameLink } from '../lib/ui.js';

function herbCountOf(id) { let n = 0; for (const f of store.facets.values()) if (f.ing.has(id)) n++; return n; }

export function renderIngredients(nodeId) {
  const taxo = store.taxo;
  const UNCL = 'unclassified';
  const selected = nodeId && (taxo.nodes.has(nodeId) || nodeId === UNCL) ? nodeId : null;
  const openIds = new Set(selected ? [selected, ...taxo.ancestors(selected)] : []);

  const treeEl = h('nav', { class: 'ing-tree card', 'aria-label': '成分分類樹' });
  const renderNode = (id) => {
    const n = taxo.nodes.get(id);
    const label = h('a', { href: `#/ingredients/${encodeURIComponent(id)}`, class: `tn-link${id === selected ? ' sel' : ''}`, 'aria-current': id === selected ? 'page' : null },
      n.label, h('span', { class: 'tn-count' }, String(herbCountOf(id))));
    if (!n.children.length) return h('li', null, label);
    const d = h('details', { class: 'tn' }, h('summary', null, label), h('ul', null, n.children.map(renderNode)));
    if (openIds.has(id)) d.open = true;
    return h('li', null, d);
  };
  treeEl.append(h('ul', { class: 'tn-root' }, taxo.topIds.map(renderNode),
    h('li', null, h('a', { href: `#/ingredients/${UNCL}`, class: `tn-link${selected === UNCL ? ' sel' : ''}` }, '未歸類成分', h('span', { class: 'tn-count' }, String(store.cls.unmatchedAll.length))))));

  const main = h('div', { class: 'ing-main' });
  if (!selected) {
    main.append(h('div', { class: 'card' }, h('h1', null, '成分樹反查'),
      h('p', null, '從左側（手機在上方）的分類樹點選一類成分，會列出含有該類化合物的藥材。點父節點會自動包含所有子節點。'),
      h('p', { class: 'muted' }, `成分共 ${store.cls.total} 筆，其中 ${store.cls.matched} 筆（${Math.round(store.cls.matched / store.cls.total * 100)}%）能對應到分類樹；其餘列在「未歸類成分」。`)));
  } else if (selected === UNCL) {
    const byHerb = new Map();
    for (const u of store.cls.unmatchedAll) { if (!byHerb.has(u.herb_id)) byHerb.set(u.herb_id, []); byHerb.get(u.herb_id).push(u); }
    main.append(h('div', { class: 'card' }, h('h1', null, '未歸類成分'),
      h('p', { class: 'muted' }, `共 ${store.cls.unmatchedAll.length} 筆，來自 ${byHerb.size} 味藥。這些名稱在成分分類樹或同義詞表裡找不到。若要歸類，請編輯 data/ingredient_taxonomy.json 或 data/alias_dictionary.json（不要改 herbs.json）。`)));
    for (const [id, list] of byHerb) {
      const herb = store.herbById.get(id);
      main.append(h('div', { class: 'card' }, h('h3', null, nameLink(herb.name_zh, id), h('span', { class: 'muted small' }, `　${list.length} 筆`)),
        h('div', { class: 'chips' }, ...list.map(u => chip(u.name, { title: u.group || '' })))));
    }
  } else {
    const n = taxo.nodes.get(selected);
    const desc = taxo.descendants(selected);
    const rows = [];
    for (const herb of store.herbs) {
      if (!store.facets.get(herb.id).ing.has(selected)) continue;
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
      n.children.length ? h('div', { class: 'chips' }, '子類：', ...n.children.map(c => chip(.label, { href: `#/ingredients/${encodeURIComponent(c)}` }))) : null,
      h('p', null, `含此類成分的藥材：${rows.length} 味`)));
    if (!rows.length) main.append(empty('目前 162 味中沒有藥材歸入這一類。'));
    for (const { herb, names } of rows) {
      main.append(h('a', { class: 'herb-card', href: herbHref(herb.id) },
        h('div', { class: 'hc-top' }, h('span', { class: 'hc-name' }, herb.name_zh), h('span', { class: 'hc-latin' }, herb.name_latin || '')),
        names.length ? h('div', { class: 'snip' }, h('span', { class: 'hit-label' }, '成分'), h('span', { class: 'snip-text' }, names.slice(0, 8).join('、') + (names.length > 8 ? `…等 ${names.length} 個` : ''))) : h('div', { class: 'snip muted' }, '（講義只列此類別，未列化合物）')));
    }
  }
  return { node: h('div', { class: 'ing-layout' }, treeEl, main), title: '成分樹反查' };
}
