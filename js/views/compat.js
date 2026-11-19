// 配伍禁忌查詢：合併「總論規則」與「各藥材頁的配伍資料」，並支援不在 162 味內的藥名（如烏頭、藜蘆）。
// 只呈現資料裡有的；沒命中不代表安全，頁面固定顯示免責聲明。
import { h, clear } from '../lib/dom.js';
import { store, resolveName } from '../data.js';
import { replaceParams, herbHref, hrefOf } from '../router.js';
import { normText, splitNames, stripParen } from '../lib/derive.js';
import { CONFIG } from '../config.js';
import { chip, nameLink, disclaimer } from '../lib/ui.js';

const REL = [['xiang_xu', '相須'], ['shi', '相使'], ['wei', '相畏'], ['wu', '相惡'], ['fan', '相反'], ['sha', '相殺']];
let cache = null;

function prep() {
  if (cache) return cache;
  const rules = store.theory.compatibility_rules;
  const nk = (s) => normText(stripParen(s), store.variantPairs);
  const pairs = [];
  for (const g of rules.eighteen_incompatibles) for (const o of g.incompatible_with) pairs.push({ kind: '十八反', a: [g.base], b: [o], label: `${g.base} 反 ${o}` });
  for (const g of rules.nineteen_antagonisms) pairs.push({ kind: '十九畏', a: splitNames(g.herb_a), b: splitNames(g.herb_b), label: `${g.herb_a} 畏 ${g.herb_b}` });
  const preg = { forbidden: rules.pregnancy_contraindications.forbidden, caution: rules.pregnancy_contraindications.caution };

  // 候選：162 味 + 規則裡出現但無法對應到 162 味的名稱
  const ruleNames = new Set();
  pairs.forEach(p => [...p.a, ...p.b].forEach(n => ruleNames.add(n)));
  [...preg.forbidden, ...preg.caution].forEach(n => ruleNames.add(n));
  const extras = [...ruleNames].filter(n => !resolveName(n));
  const entities = store.herbs.map(hh => ({ key: hh.id, name: hh.name_zh, herb: hh, names: nameSet(hh) }));
  for (const n of extras) entities.push({ key: `n:${n}`, name: n, herb: null, names: new Set([nk(n)]) });
  const byKey = new Map(entities.map(e => [e.key, e]));

  function nameSet(hh) {
    const set = new Set();
    const add = (s) => { for (const p of splitNames(s)) { const k = nk(p); set.add(k); const g = store.nameGroups.get(k); if (g) for (const m of g) set.add(nk(m)); } };
    add(hh.name_zh); (hh.aliases || []).forEach(add);
    return set;
  }
  const strict = (rn, e) => e.names.has(nk(rn)) || (e.herb && resolveName(rn) === e.herb.id);
  const possible = (rn, e) => !strict(rn, e) && e.herb && store.tradeMap.get(nk(rn))?.has(e.herb.id);
  cache = { pairs, preg, entities, byKey, strict, possible, nk, extras };
  return cache;
}

function entityFromKey(k) { return prep().byKey.get(k) || null; }

export function renderCompat(params) {
  const P = prep();
  const tab = params.get('tab') === 'rules' ? 'rules' : 'query';
  const root = h('div', { class: 'compat-view' });
  root.append(h('div', { class: 'tabs', role: 'tablist' },
    h('a', { class: 'tab', role: 'tab', href: '#/compat', 'aria-selected': String(tab === 'query') }, '查詢'),
    h('a', { class: 'tab', role: 'tab', href: '#/compat?tab=rules', 'aria-selected': String(tab === 'rules') }, '規則總表')));
  root.append(tab === 'rules' ? rulesTab(P) : queryTab(P, params));
  return { node: root, title: '配伍禁忌' };
}

function queryTab(P, params) {
  const wrap = h('div', null);
  let sel = (params.get('herbs') || '').split(',').filter(Boolean).map(entityFromKey).filter(Boolean);
  const dedupe = () => { const seen = new Set(); sel = sel.filter(e => !seen.has(e.key) && seen.add(e.key)); };
  dedupe();
  const chipsBox = h('div', { class: 'chips sel-chips' });
  const input = h('input', { type: 'search', class: 'compat-input', placeholder: '輸入藥名加入（如：烏頭、半夏、甘草）', 'aria-label': '加入藥名', autocomplete: 'off' });
  const sugBox = h('div', { class: 'sug-box', role: 'listbox' });
  const resultBox = h('div', { class: 'compat-results' });

  function add(e) { if (!sel.some(x => x.key === e.key)) sel.push(e); input.value = ''; clear(sugBox); render(); input.focus(); }
  function remove(key) { sel = sel.filter(e => e.key !== key); render(); }
  function matches(q) {
    const k = normText(q, store.variantPairs); if (!k) return [];
    const out = [];
    for (const e of P.entities) { if (sel.some(x => x.key === e.key)) continue; let sc = 0; for (const n of e.names) { if (n === k) sc = Math.max(sc, 3); else if (n.startsWith(k)) sc = Math.max(sc, 2); else if (n.includes(k)) sc = Math.max(sc, 1); } if (sc) out.push([sc, e]); }
    return out.sort((a, b) => b[0] - a[0]).slice(0, 8).map(x => x[1]);
  }
  input.addEventListener('input', () => {
    clear(sugBox);
    for (const e of matches(input.value)) sugBox.append(h('button', { type: 'button', role: 'option', class: 'sug', onClick: () => add(e) }, e.name, e.herb ? null : h('span', { class: 'muted small' }, '　（僅規則名單）')));
  });
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); const m = matches(input.value)[0]; if (m) add(m); } });

  function render() {
    replaceParams('/compat', sel.length ? new URLSearchParams({ herbs: sel.map(e => e.key).join(',') }) : new URLSearchParams());
    clear(chipsBox);
    for (const e of sel) chipsBox.append(h('button', { type: 'button', class: 'chip chip-active', onClick: () => remove(e.key), title: '移除' }, `${e.name} ×`));
    if (!sel.length) chipsBox.append(h('span', { class: 'muted' }, '尚未選擇藥材'));
    clear(resultBox);
    resultBox.append(...results(P, sel));
  }
  wrap.append(h('div', { class: 'card' }, h('h1', null, '配伍禁忌查詢'),
    h('p', { class: 'muted' }, '選 1 味以上。候選包含 162 味，以及總論十八反、十九畏、妊娠規則裡出現但本資料庫未收載的藥名。'),
    chipsBox, h('div', { class: 'compat-add' }, input, sugBox)), resultBox);
  render();
  return wrap;
}

function results(P, sel) {
  const out = [];
  if (!sel.length) { out.push(disclaimer(CONFIG.clinicalDisclaimer)); return out; }

  // 1. 衝突
  const conflicts = [], maybe = [];
  for (const p of P.pairs) {
    for (let i = 0; i < sel.length; i++) for (let j = 0; j < sel.length; j++) {
      if (i === j) continue;
      const ea = sel[i], eb = sel[j];
      if (p.kind === '十八反' && j < i) { /* 無方向配對，避免重複 */ }
      const aS = p.a.some(n => P.strict(n, ea)), bS = p.b.some(n => P.strict(n, eb));
      const aP = p.a.some(n => P.strict(n, ea) || P.possible(n, ea)), bP = p.b.some(n => P.strict(n, eb) || P.possible(n, eb));
      const key = [p.label, [ea.key, eb.key].sort().join('|')].join('#');
      if (aS && bS) { if (!conflicts.some(c => c.key === key)) conflicts.push({ key, p, ea, eb }); }
      else if (aP && bP) { if (!maybe.some(c => c.key === key) && !conflicts.some(c => c.key === key)) maybe.push({ key, p, ea, eb, via: [ea, eb].filter(e => e.herb) }); }
    }
  }
  const box1 = h('section', { class: 'card res-sec' }, h('h2', null, '衝突（十八反、十九畏）'));
  if (sel.length < 2) box1.append(h('p', { class: 'muted' }, '再加入第二味藥，才能比對兩兩之間的衝突。'));
  else if (!conflicts.length && !maybe.length) box1.append(h('p', null, '本次選擇中，總論的十八反、十九畏沒有命中的配對。'));
  for (const c of conflicts) box1.append(h('div', { class: 'alert alert-danger' }, h('strong', null, `${c.p.kind}命中　`), `${c.ea.name} ↔ ${c.eb.name}`, h('div', { class: 'small' }, `依據：總論「${c.p.label}」`)));
  for (const c of maybe) box1.append(h('div', { class: 'alert alert-warn' }, h('strong', null, `${c.p.kind}可能相關（待確認）　`), `${c.ea.name} ↔ ${c.eb.name}`,
    h('div', { class: 'small' }, `總論「${c.p.label}」的藥名與其中一味的基原商品名相同，但本資料庫未直接把它們視為同一味藥，請對照講義確認。`)));
  out.push(box1);

  // 2. 妊娠
  const box2 = h('section', { class: 'card res-sec' }, h('h2', null, '妊娠'));
  let anyPreg = false;
  for (const e of sel) {
    const f = P.preg.forbidden.some(n => P.strict(n, e)), c = P.preg.caution.some(n => P.strict(n, e));
    const pf = !f && P.preg.forbidden.some(n => P.possible(n, e)), pc = !c && P.preg.caution.some(n => P.possible(n, e));
    if (f) { anyPreg = true; box2.append(h('div', { class: 'alert alert-danger' }, h('strong', null, '妊娠禁服　'), e.name, h('span', { class: 'small' }, '　（總論）'))); }
    else if (c) { anyPreg = true; box2.append(h('div', { class: 'alert alert-warn' }, h('strong', null, '妊娠慎用　'), e.name, h('span', { class: 'small' }, '　（總論）'))); }
    else if (pf || pc) { anyPreg = true; box2.append(h('div', { class: 'alert alert-warn' }, h('strong', null, '妊娠規則可能相關（待確認）　'), e.name, h('span', { class: 'small' }, '　基原商品名與總論的名稱相同'))); }
  }
  if (!anyPreg) box2.append(h('p', null, '本次選擇中，總論的妊娠禁服、慎用名單沒有命中。'));
  out.push(box2);

  // 3. 各藥自身配伍
  const box3 = h('section', { class: 'card res-sec' }, h('h2', null, '各藥自身配伍（來自藥材頁）'));
  for (const e of sel) {
    if (!e.herb) { box3.append(h('div', { class: 'own' }, h('strong', null, e.name), h('span', { class: 'muted' }, '　本資料庫未收載（僅有規則名單）'))); continue; }
    const c = e.herb.compatibility || {};
    const lines = [];
    for (const [k, label] of REL) {
      if (!c[k]?.length) continue;
      const items = c[k].flatMap((n, i) => {
        const id = resolveName(n);
        const also = sel.find(x => x.key !== e.key && (x.herb ? x.herb.id === id : P.strict(n, x)));
        return [i ? '、' : null, nameLink(n, id), also ? h('span', { class: 'badge' }, '本次也選了') : null];
      });
      lines.push(h('div', null, h('strong', null, label + '：'), ...items));
    }
    if (c.taboo?.length) lines.push(h('div', null, h('strong', null, '禁忌：'), c.taboo.join('；')));
    if (c.clinical_pairs?.length) lines.push(h('div', null, h('strong', null, '臨床搭配：'), c.clinical_pairs.join('；')));
    box3.append(h('div', { class: 'own' }, h('h3', null, h('a', { href: herbHref(e.herb.id) }, e.name)), lines.length ? lines : h('span', { class: 'muted' }, '講義此味未列配伍資料。')));
  }
  out.push(box3, disclaimer(`${CONFIG.clinicalDisclaimer}。沒有命中不代表安全。`));
  return out;
}

function rulesTab(P) {
  const rules = store.theory.compatibility_rules;
  const nl = (n) => { const parts = splitNames(n); return parts.flatMap((p, i) => [i ? '、' : null, h('a', { href: hrefOf('/compat', new URLSearchParams({ herbs: resolveName(p) || 'n:' + p })), class: resolveName(p) ? 'name-link' : 'name-plain' }, p), resolveName(p) ? null : h('span', { class: 'muted small' }, '（未收載）')]); };
  const wrap = h('div', null);
  wrap.append(h('div', { class: 'card' }, h('h1', null, '規則總表'), h('p', { class: 'muted' }, '資料來自總論。名稱在 162 味內可點進配伍查詢，否則標示「未收載」。')),
    h('div', { class: 'card' }, h('h2', null, '十八反'), h('ul', null, rules.eighteen_incompatibles.map(g => h('li', null, h('strong', null, ...nl(g.base)), ' 反 ', ...g.incompatible_with.flatMap((n, i) => [i ? '、' : null, ...nl(n)]))))),
    h('div', { class: 'card' }, h('h2', null, '十九畏'), h('ul', null, rules.nineteen_antagonisms.map(g => h('li', null, ...nl(g.herb_a), ' 畏 ', ...nl(g.herb_b))))),
    h('div', { class: 'card' }, h('h2', null, '妊娠'), h('div', null, h('strong', { class: 'danger' }, '禁服：'), ...rules.pregnancy_contraindications.forbidden.flatMap((n, i) => [i ? '、' : null, ...nl(n)])),
      h('div', null, h('strong', { class: 'warn' }, '慎用：'), ...rules.pregnancy_contraindications.caution.flatMap((n, i) => [i ? '、' : null, ...nl(n)]))),
    disclaimer(CONFIG.clinicalDisclaimer));
  return wrap;
}
