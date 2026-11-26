import { h } from '../lib/dom.js';
import { store, resolveNames } from '../data.js';
import { chip, nameLink, disclaimer } from '../lib/ui.js';
import { CONFIG } from '../config.js';

export const THEORY_SECTIONS = [
  ['development', '本草發展'], ['harvesting', '採集'], ['processing', '炮製'],
  ['properties', '性味歸經'], ['compat', '配伍規則'], ['parts', '部位拉丁名'],
];

const ul = (arr) => h('ul', null, (arr || []).map(x => h('li', null, x)));
const pg = (o) => o?.source_page?.length ? h('span', { class: 'muted small' }, `講義 p.${o.source_page.join('、')}`) : null;

/** 把一串藥名（可含括弧、頓號）轉成連結或純文字 */
export function nameList(str) {
  const parts = resolveNames(str);
  return parts.flatMap((p, i) => [i ? '、' : null, nameLink(p.name, p.id)]);
}

function development(t) {
  return [h('div', { class: 'card' }, h('h2', null, t.title), pg(t),
    // tbl-stack：手機上每一列改成一張小卡片（欄位名稱寫在左邊），不再被擠成一字一行
    h('div', { class: 'table-wrap' }, h('table', { class: 'tbl tbl-stack' },
      h('thead', null, h('tr', null, ['書名', '朝代', '作者', '卷數', '藥數', '重點'].map(x => h('th', null, x)))),
      h('tbody', null, t.classics.map(c => h('tr', null,
        h('td', { class: 'stack-title' }, h('strong', null, c.title)), h('td', { 'data-label': '朝代' }, c.dynasty), h('td', { 'data-label': '作者' }, c.author),
        h('td', { 'data-label': '卷數' }, c.volumes), h('td', { 'data-label': '藥數' }, c.herb_count),
        h('td', { 'data-label': '重點' }, ul(c.content), c.exam_markers?.length ? h('div', { class: 'muted small' }, `考題標記：${c.exam_markers.join('、')}`) : null)))))))];
}
function harvesting(t) {
  return [h('div', { class: 'card' }, h('h2', null, t.title), pg(t), h('h3', null, '原則'), ul(t.principles)),
    h('div', { class: 'card' }, h('h3', null, '依部位'), h('div', { class: 'table-wrap' }, h('table', { class: 'tbl tbl-stack' }, h('thead', null, h('tr', null, h('th', null, '部位'), h('th', null, '採集時機'))),
      h('tbody', null, t.by_part.map(r => h('tr', null, h('td', { class: 'stack-title' }, h('strong', null, r.part)), h('td', { class: 'stack-full' }, ul(r.rules))))))))];
}
function processing(t) {
  return [h('div', { class: 'card' }, h('h2', null, t.title), pg(t), h('h3', null, '目的'), t.purposes.map(p => h('div', null, h('strong', null, p.category), ul(p.items)))),
    h('div', { class: 'card' }, h('h3', null, '方法'), t.methods.map(p => h('div', null, h('strong', null, p.category), ul(p.items))))];
}
function properties(t) {
  return [h('div', { class: 'card' }, h('h2', null, t.title), pg(t),
    h('h3', null, '四氣'), h('div', { class: 'chips' }, ...t.four_natures.types.map(x => chip(x))), ul(t.four_natures.notes),
    h('h3', null, '五味'), h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('tbody', null, t.five_flavors.map(f => h('tr', null, h('th', null, f.flavor), h('td', null, ul(f.items))))))),
    h('h3', null, '歸經'), h('p', null, t.meridians.definition), h('div', { class: 'chips' }, ...t.meridians.list.map(x => chip(x)))),
  h('div', { class: 'card' }, h('h3', null, '升降浮沉'),
    h('strong', null, '升浮'), ul(t.directionality.ascending_floating), h('strong', null, '沉降'), ul(t.directionality.descending_sinking), h('strong', null, '雙向'), ul(t.directionality.bidirectional),
    h('h3', null, '毒性'), ul(t.toxicity))];
}
function compat(t) {
  const r = t;
  return [h('div', { class: 'card' }, h('h2', null, '配伍規則'), pg(r), h('p', null, h('a', { class: 'btn btn-primary', href: '#/compat' }, '到配伍禁忌查詢頁')),
    h('h3', null, '七情'), h('div', { class: 'table-wrap' }, h('table', { class: 'tbl tbl-stack' }, h('thead', null, h('tr', null, ['類型', '舉例', '藥'].map(x => h('th', null, x)))),
      h('tbody', null, r.seven_emotions.map(e => h('tr', null, h('td', { class: 'stack-title' }, h('strong', null, e.type)), h('td', { 'data-label': '舉例' }, e.example, e.exam_markers?.length ? h('div', { class: 'muted small' }, `考題標記：${e.exam_markers.join('、')}`) : null),
        h('td', { 'data-label': '藥' }, ...(e.herbs || []).flatMap((n, i) => [i ? '、' : null, ...nameList(n)]))))))),
    h('h3', null, '十八反'), h('ul', null, r.eighteen_incompatibles.map(g => h('li', null, h('strong', null, ...nameList(g.base)), ' 反 ', ...g.incompatible_with.flatMap((n, i) => [i ? '、' : null, ...nameList(n)])))),
    h('h3', null, '十九畏'), h('ul', null, r.nineteen_antagonisms.map(g => h('li', null, ...nameList(g.herb_a), ' 畏 ', ...nameList(g.herb_b)))),
    h('h3', null, '妊娠'), h('div', null, h('strong', { class: 'danger' }, '禁服：'), ...r.pregnancy_contraindications.forbidden.flatMap((n, i) => [i ? '、' : null, ...nameList(n)])),
    h('div', null, h('strong', { class: 'warn' }, '慎用：'), ...r.pregnancy_contraindications.caution.flatMap((n, i) => [i ? '、' : null, ...nameList(n)])),
    disclaimer(CONFIG.clinicalDisclaimer))];
}
function parts(t) {
  return [h('div', { class: 'card' }, h('h2', null, t.title), pg(t), h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '使用部位'), h('th', null, '拉丁名'))),
    h('tbody', null, t.items.map(i => h('tr', null, h('td', null, i.zh), h('td', null, i.latin)))))))];
}

export function renderTheory(section) {
  const sec = THEORY_SECTIONS.find(s => s[0] === section) ? section : 'development';
  const t = store.theory;
  const body = { development: () => development(t.development), harvesting: () => harvesting(t.harvesting), processing: () => processing(t.processing),
    properties: () => properties(t.properties_theory), compat: () => compat(t.compatibility_rules), parts: () => parts(t.parts_latin_map) }[sec]();
  return { node: h('div', { class: 'theory-view' },
    h('div', { class: 'tabs', role: 'tablist' }, THEORY_SECTIONS.map(([k, l]) => h('a', { class: 'tab', role: 'tab', href: `#/theory/${k}`, 'aria-selected': String(k === sec) }, l))),
    ...body), title: '總論' };
}
