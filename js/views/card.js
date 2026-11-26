import { h, highlight } from '../lib/dom.js';
import { herbHref } from '../router.js';
import { FIELD_LABEL, pickSnippets } from '../search.js';
import { gradeChip, ed3Mark, thp5OnlyMark } from '../lib/ui.js';
import { categoryPaths, familiesOf } from '../lib/derive.js';

function termsOf(hit) { return [hit.term, ...(hit.matched || [])].filter(Boolean); }

function excerptAround(text, terms, maxLen = 96) {
  const s = String(text ?? '');
  if (s.length <= maxLen) return s;
  const low = s.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    if (!t) continue;
    const i = low.indexOf(String(t).toLowerCase());
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1) return s.slice(0, maxLen) + '…';
  const start = Math.max(0, pos - 24);
  const end = Math.min(s.length, start + maxLen);
  return (start > 0 ? '…' : '') + s.slice(start, end) + (end < s.length ? '…' : '');
}

export function herbCard(row) {
  const herb = row.herb;
  const hits = row.hits || [];
  const nameHits = hits.filter(x => x.field === 'name');
  const nameTerms = nameHits.flatMap(termsOf);
  const snips = pickSnippets({ hits: hits.filter(x => x.field !== 'name') }, 2);
  const cats = categoryPaths(herb)[0] || [];
  const catSegs = cats[0] === '臺灣中藥典增補品項' ? ['五版增補', ...cats.slice(1)] : cats;
  const fam = familiesOf(herb).join(' / ');
  // 每個片段不在中間斷行（只在「>」「·」之後換行），手機上不會出現「辛溫解|表藥」
  const meta = [];
  catSegs.forEach((seg, i) => { if (i) meta.push(h('span', { class: 'sep', 'aria-hidden': 'true' }, '›')); meta.push(h('span', { class: 'nw' }, seg)); });
  if (fam) { if (meta.length) meta.push(h('span', { class: 'sep', 'aria-hidden': 'true' }, '·')); meta.push(h('span', { class: 'nw' }, fam)); }
  const body = [];
  if (snips.length) {
    for (const s of snips) {
      const ts = termsOf(s);
      const shown = (s.field === 'thp5_desc' || s.field === 'thp5_assay') ? excerptAround(s.show, ts, 96) : s.show;
      body.push(h('div', { class: 'snip' },
        h('span', { class: 'hit-label' }, `命中：${FIELD_LABEL[s.field] || s.field}${s.via ? '（' + s.via + '）' : ''}`),
        h('span', { class: 'snip-text' }, highlight(shown, ts))));
    }
  } else if (nameHits.length && nameHits.some(x => x.text !== herb.name_zh)) {
    const x = nameHits.find(y => y.text !== herb.name_zh);
    body.push(h('div', { class: 'snip' }, h('span', { class: 'hit-label' }, '命中：藥名／別名'), h('span', { class: 'snip-text' }, highlight(x.text, termsOf(x)))));
  } else {
    const eff = (herb.effects || []).flatMap(e => e.items || []).slice(0, 4);
    if (eff.length) body.push(h('div', { class: 'snip muted' }, eff.join('、')));
  }
  return h('a', { class: 'herb-card', href: herbHref(herb.id) },
    h('div', { class: 'hc-top' },
      h('span', { class: 'hc-name' }, highlight(herb.name_zh, nameTerms)),
      ed3Mark(herb.ed3_updated), thp5OnlyMark(herb), gradeChip(herb.herb_grade),
      h('span', { class: 'hc-latin' }, herb.name_latin || '')),
    meta.length ? h('div', { class: 'hc-meta muted' }, meta) : null,
    ...body);
}
