import { h } from '../lib/dom.js';
import { store } from '../data.js';
import { herbCard } from './card.js';
import { empty } from '../lib/ui.js';

export function renderCategory(id) {
  const cat = store.catById.get(id);
  if (!cat) return { node: h('div', { class: 'card' }, h('h1', null, '找不到這個分類'), h('p', null, h('a', { href: '#/herbs' }, '回到藥材總覽'))), title: '找不到分類' };
  const root = h('div', { class: 'cat-view' });
  const path = cat.category_path.split('>');
  root.append(h('div', { class: 'card' },
    h('div', { class: 'muted small' }, path.length > 1 ? `${path[0]} > ` : '', cat.source_page?.length ? `常用中藥講義 p.${cat.source_page.join('、')}` : ''),
    h('h1', null, cat.title || path.at(-1)),
    h('p', null, h('a', { class: 'btn', href: `#/herbs?cat=${encodeURIComponent(cat.category_path)}` }, '用篩選查看這一類'))));

  if (cat.characteristics?.length) root.append(h('div', { class: 'card' }, h('h2', null, '特性'), h('ul', null, cat.characteristics.map(x => h('li', null, x)))));
  for (const sec of cat.sections || []) {
    root.append(h('details', { class: 'card sec', open: true }, h('summary', null, h('span', { class: 'sec-title' }, sec.heading)),
      h('div', { class: 'sec-body' }, (sec.subsections || []).map(sub => h('div', { class: 'subsec' }, sub.subheading ? h('h3', null, sub.subheading) : null, h('ul', null, (sub.items || []).map(x => h('li', null, x))))))));
  }
  const subs = store.categories.filter(c => c.category_path.startsWith(cat.category_path + '>'));
  if (subs.length) {
    root.append(h('div', { class: 'card' }, h('h2', null, '子分類'),
      h('div', { class: 'chips' }, ...subs.map(c => {
        const cnt = store.herbs.filter(hh => store.facets.get(hh.id).cat.has(c.category_path)).length;
        return h('a', { class: 'chip', href: `#/cat/${encodeURIComponent(c.id)}` }, `${c.title || c.category_path.split('>').at(-1)}（${cnt}）`);
      }))));
  }

  const herbs = store.herbs.filter(hh => store.facets.get(hh.id).cat.has(cat.category_path));
  root.append(h('h2', { class: 'list-h' }, `藥材（${herbs.length} 味）`));
  if (!herbs.length) root.append(empty('這一類目前沒有收載藥材。'));
  for (const herb of herbs) root.append(herbCard({ herb }));
  return { node: root, title: cat.title };
}
