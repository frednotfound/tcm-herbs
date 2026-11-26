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
  const commonTree = tree.filter(t => t.path !== '臺灣中藥典增補品項');
  const thp5Tree = tree.find(t => t.path === '臺灣中藥典增補品項');
  const shortcuts = SHORTCUTS.filter(([, p]) => { const [k, v] = Object.entries(p)[0]; return store.herbs.some(hh => store.facets.get(hh.id)[k].has(v)); });
  const input = h('input', { type: 'search', class: 'home-search', placeholder: '藥名、成分、功效、方劑…', 'aria-label': '搜尋藥名、成分、功效、方劑', enterkeyhint: 'search' });
  const form = h('form', { class: 'home-search-form', onSubmit: (e) => { e.preventDefault(); location.hash = hrefOf('/herbs', new URLSearchParams(input.value.trim() ? { q: input.value.trim() } : {})); } }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, '搜尋'));

  const thp5Section = thp5Tree ? h('details', { class: 'home-extra-cats' },
    h('summary', null,
      h('span', { class: 'sec-title' }, '臺灣中藥典第五版', h('wbr'), '增補分類'),
      h('span', { class: 'sec-count nw' }, `${store.thp5OnlyCount} 味 · ${thp5Tree.children.length} 類`)),
    h('div', { class: 'home-extra-body' },
      h('div', { class: 'cat-grid' }, thp5Tree.children.map(c => {
        const catId = store.catByPath.get(c.path)?.id;
        return h('a', { class: 'cat-tile', href: catId ? `#/cat/${encodeURIComponent(catId)}` : hrefOf('/herbs', new URLSearchParams({ cat: c.path })) },
          h('span', null, c.name), h('span', { class: 'muted small' }, `${c.count} 味`));
      })),
      h('p', { class: 'home-extra-foot' }, h('a', { class: 'btn', href: '#/herbs?src=thp5_only' }, `查看全部五版增補品項（${store.thp5OnlyCount} 味）`)))) : null;

  return { node: h('div', { class: 'home' },
    h('section', { class: 'hero card' },
      h('h1', null, CONFIG.siteName),
      h('p', { class: 'muted hero-sub' },
        h('span', { class: 'nw' }, `收錄 ${store.herbs.length} 味中藥`), '：',
        h('span', { class: 'nw' }, `常用中藥 ${store.commonCount} 味`), '、',
        h('span', { class: 'nw' }, `臺灣中藥典第五版增補 ${store.thp5OnlyCount} 味`), '。',
        h('span', { class: 'nw' }, '可搜尋、篩選、'), h('span', { class: 'nw' }, '反查成分、查配伍禁忌。')),
      form),
    h('section', { class: 'card' }, h('h2', null, '功能入口'), h('div', { class: 'entry-grid' },
      entry('#/herbs', '藥材總覽', `全部 ${store.herbs.length} 味／篩選`),
      entry('#/herbs?src=common', '常用中藥', `課程講義 ${store.commonCount} 味`),
      entry('#/ingredients', '成分樹反查', '從成分類別找藥'),
      entry('#/compat', '配伍禁忌', '十八反、十九畏、妊娠'),
      entry('#/theory', '總論', '本草、採集、炮製、性味'))),
    h('section', { class: 'card' },
      h('h2', null, '依分類瀏覽（常用中藥）'),
      h('div', { class: 'cat-grid' }, commonTree.map(t => {
        const catId = store.catByPath.get(t.path)?.id;
        const count = store.herbs.filter(hh => store.facets.get(hh.id).cat.has(t.path)).length;
        return h('a', { class: 'cat-tile', href: catId ? `#/cat/${encodeURIComponent(catId)}` : hrefOf('/herbs', new URLSearchParams({ cat: t.path })) },
          h('span', null, t.name), h('span', { class: 'muted small' }, `${count} 味`));
      })),
      thp5Section),
    h('section', { class: 'card' }, h('h2', null, '小重點捷徑'), h('div', { class: 'chips' }, ...shortcuts.map(([label, p]) => chip(label, { href: hrefOf('/herbs', new URLSearchParams(p)) }))))), title: '', focus: input };
}
function entry(href, title, sub) { return h('a', { class: 'entry', href }, h('strong', null, title), h('span', { class: 'muted small' }, sub)); }
