import { h } from '../lib/dom.js';
import { store } from '../data.js';
import { hrefOf } from '../router.js';
import { categoryTree } from '../filters.js';
import { chip } from '../lib/ui.js';
import { CONFIG } from '../config.js';

const SHORTCUTS = [
  ['上品', { grade: '上品' }], ['中品', { grade: '中品' }], ['下品', { grade: '下品' }],
  ['要藥', { tag: '要藥' }], ['聖藥', { tag: '聖藥' }], ['臺灣有產', { tag: '臺灣有產' }], ['含綠原酸', { tag: '含綠原酸' }],
  ['種子類', { tag: '種子類' }], ['四大淮藥', { tag: '四大淮藥' }], ['升陽四藥', { tag: '升陽四藥' }], ['焦三仙', { tag: '焦三仙' }],
  ['藥之四維', { tag: '藥之四維' }], ['第三版修改', { tag: '第三版修改' }],
];

export function renderHome() {
  const tree = categoryTree();
  const shortcuts = SHORTCUTS.filter(([, p]) => { const [k, v] = Object.entries(p)[0]; return store.herbs.some(hh => store.facets.get(hh.id)[k].has(v)); });
  const input = h('input', { type: 'search', class: 'home-search', placeholder: '搜尋藥名、成分、功效、方劑…', 'aria-label': '搜尋' });
  const form = h('form', { class: 'home-search-form', onSubmit: (e) => { e.preventDefault(); location.hash = hrefOf('/herbs', new URLSearchParams(input.value.trim() ? { q: input.value.trim() } : {})); } }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, '搜尋'));
  return { node: h('div', { class: 'home' },
    h('section', { class: 'hero card' }, h('h1', null, CONFIG.siteName), h('p', { class: 'muted' }, `收錄 ${store.herbs.length} 味中藥，可搜尋、篩選、反查成分、查配伍禁忌。`), form),
    h('section', { class: 'card' }, h('h2', null, '功能入口'), h('div', { class: 'entry-grid' },
      entry('#/herbs', '藥材總覽', '搜尋與多條件篩選'), entry('#/ingredients', '成分樹反查', '從成分類別找藥'),
      entry('#/compat', '配伍禁忌', '十八反、十九畏、妊娠'), entry('#/theory', '總論', '本草、採集、炮製、性味歸經'))),
    h('section', { class: 'card' }, h('h2', null, '依分類瀏覽'), h('div', { class: 'cat-grid' }, tree.map(t => {
      const catId = store.catByPath.get(t.path)?.id;
      return h('a', { class: 'cat-tile', href: catId ? `#/cat/${encodeURIComponent(catId)}` : hrefOf('/herbs', new URLSearchParams({ cat: t.path })) }, h('span', null, t.name), h('span', { class: 'muted small' }, `${store.herbs.filter(hh => store.facets.get(hh.id).cat.has(t.path)).length} 味`));
    }))),
    h('section', { class: 'card' }, h('h2', null, '小重點捷徑'), h('div', { class: 'chips' }, ...shortcuts.map(([label, p]) => chip(label, { href: hrefOf('/herbs', new URLSearchParams(p)) }))))), title: '' , focus: input };
}
function entry(href, title, sub) { return h('a', { class: 'entry', href }, h('strong', null, title), h('span', { class: 'muted small' }, sub)); }
