// 草擬「使用部位 -> 分組」對照表，輸出 data/derived/part_groups.json
// 這只是依關鍵字做的草稿，需要人工審核；審核後直接編輯 JSON 即可，不必再執行本腳本。
// 用法：node scripts/make_part_groups.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const herbs = JSON.parse(readFileSync(new URL('data/herbs.json', root), 'utf8'));
const outPath = new URL('data/derived/part_groups.json', root);
if (existsSync(outPath) && !process.argv.includes('--force')) {
  console.error('data/derived/part_groups.json 已存在（可能已經過你審核）。要覆蓋請加 --force。');
  process.exit(1);
}
const GROUPS = ['根', '根莖', '皮', '莖', '葉', '花', '果實', '種子', '全草', '菌核', '其他'];
// 由長到短，比對到就從字串中拿掉，避免「根莖」又被算成「根」
const TOKENS = [
  ['根皮', '皮'], ['樹皮', '皮'], ['栓皮', null], ['周皮', null], ['外皮', null],
  ['地上部分', '全草'], ['地上部', '全草'], ['全草', '全草'], ['全株', '全草'],
  ['頭狀花序', '花'], ['花蕾', '花'], ['花序', '花'], ['花穗', '花'], ['花粉', '花'],
  ['菌核', '菌核'],
  ['塊根', '根'], ['根莖', '根莖'], ['塊莖', '根莖'], ['鱗莖', '根莖'],
  ['成熟果實', '果實'], ['果實', '果實'], ['果穗', '花'], ['果皮', '果實'], ['幼果', '果實'],
  ['種子', '種子'], ['種仁', '種子'],
  ['葉狀體', null], ['葉', '葉'], ['莖', '莖'], ['根', '根'], ['花', '花'], ['果', '果實'],
];
function classify(text) {
  let t = String(text || '');
  const review = /[（(；;或]/.test(t) || t.length > 12 || /發酵|滲出|濃縮|發芽|心材|中間層|葉狀體|麴/.test(t);
  t = t.replace(/(去除|除去|去)[^之]*之/g, ''); // 「去外皮之乾燥根莖」「除去周皮之根」
  t = t.replace(/[（(][^）)]*[）)]/g, m => m); // 括弧內容保留，交給人工審核
  const found = new Set();
  for (const [tok, g] of TOKENS) {
    if (t.includes(tok)) { if (g) found.add(g); t = t.split(tok).join(' '); }
  }
  // 明顯不是植物部位的（樹脂、動物、發酵品…）一律歸「其他」，交由人工確認
  if (/樹脂|滲出|熬煮|甲殼|幼角|蟲|殭|麴劑|濃縮|發芽/.test(text)) found.clear();
  const groups = GROUPS.filter(g => found.has(g));
  return { groups: groups.length ? groups : ['其他'], review: review || groups.length === 0 };
}
const mapping = {};
for (const h of herbs) {
  const k = h.part_used;
  if (k == null || k === '') continue;
  if (!mapping[k]) mapping[k] = { ...classify(k), herbs: [] };
  mapping[k].herbs.push(h.name_zh);
}
const out = {
  status: '草稿，待人工審核',
  note: '由關鍵字規則自動草擬。每筆 mapping 的 key 是 herbs.json 裡 part_used 的原文；groups 是篩選用分組；review 為 true 代表寫法複雜、特別需要你確認。herbs 欄只是方便你對照，網站不使用。',
  groups: GROUPS,
  mapping,
};
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
const n = Object.keys(mapping).length, r = Object.values(mapping).filter(m => m.review).length;
console.log(`寫入 ${n} 種寫法；其中 ${r} 種標記 review，其他組 ${Object.values(mapping).filter(m => m.groups.includes('其他')).length} 種`);
