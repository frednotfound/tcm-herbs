import { h, highlight } from '../lib/dom.js';
import { herbHref } from '../router.js';
import { store } from '../data.js';
import { FIELD_LABEL, pickSnippets } from '../search.js';
import { gradeChip, ed3Mark } from '../lib/ui.js';
import { categoryPaths, familiesOf } from '../lib/derive.js';

function termsOf(hit) { return [hit.term, ...(hit.matched || [])].filter(Boolean); }

/** row: {herb, hits?}；有 hits 時顯示命中欄位片段並高亮 */
export function herbCard(row) {
  const herb = row.herb;
  const hits = row.hits || [];
  const nameHits = hits.filter(x => x.field === 'name');
  const nameTerms = nameHits.flatMap(termsOf);
  const snips = pickSnippets({ hits: hits.filter(x => x.field !== 'name') }, 2);
  const cats = categoryPaths(herb)[0] || [];
  const fam = familiesOf(herb).join(' / ');
  const body = [];
  if (snips.length) {
    for (const s of snips) {
      body.push(h('div', { class: 'snip' },
        h('span', { class: 'hit-label' }, `命中：${FIELD_LABEL[s.field] || s.field}${s.via ? '（' + s.via + '）' : ''}`),
        h('span', { class: 'snip-text' }, highlight(s.show, termsOf(s)))));
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
      ed3Mark(herb.ed3_updated), gradeChip(herb.herb_grade),
      h('span', { class: 'hc-latin' }, herb.name_latin || '')),
    h('div', { class: 'hc-meta muted' }, [cats.join('>'), fam].filter(Boolean).join(' · ')),
    ...body);
}
