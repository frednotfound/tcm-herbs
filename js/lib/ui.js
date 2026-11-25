import { h, highlight } from './dom.js';
import { herbHref } from '../router.js';
import { store } from '../data.js';
import { isThp5OnlyHerb } from './derive.js';

export function chip(text, opts = {}) {
  const { href, kind, onClick, title } = opts;
  const cls = `chip${kind ? ' chip-' + kind : ''}`;
  if (href) return h('a', { class: cls, href, title }, text);
  if (onClick) return h('button', { class: cls, type: 'button', onClick, title }, text);
  return h('span', { class: cls, title }, text);
}

export function gradeChip(g) { return g ? chip(g, { kind: 'grade-' + (g === '上品' ? 'top' : g === '中品' ? 'mid' : 'low') }) : null; }
export function ed3Mark(on) { return on ? h('span', { class: 'ed3', title: '常用中藥第三版修改', 'aria-label': '常用中藥第三版修改' }, '★3版') : null; }
export function thp5OnlyMark(herb) {
  return isThp5OnlyHerb(herb)
    ? h('span', { class: 'thp5-badge', title: '僅出現在臺灣中藥典第五版', 'aria-label': '僅出現在臺灣中藥典第五版' }, '五版增補')
    : null;
}

/** 藥名連結：能對應到 id 就連結，否則純文字（不報錯） */
export function nameLink(name, id) {
  return id ? h('a', { href: herbHref(id), class: 'name-link' }, name) : h('span', { class: 'name-plain', title: '本資料庫未收載此條目' }, name);
}

export function section(id, title, bodyNodes, { open = true, count } = {}) {
  const d = h('details', { class: 'card sec', id }, h('summary', null, h('span', { class: 'sec-title' }, title), count != null ? h('span', { class: 'sec-count' }, String(count)) : null), h('div', { class: 'sec-body' }, bodyNodes));
  if (open) d.open = true;
  return d;
}

export function kv(label, ...val) { return h('div', { class: 'kv' }, h('dt', null, label), h('dd', null, ...val)); }

export function empty(msg) { return h('p', { class: 'muted' }, msg); }

export function disclaimer(text) { return h('p', { class: 'disclaimer' }, text); }

export function isNarrow() { return window.matchMedia('(max-width: 860px)').matches; }

export { highlight, store };
