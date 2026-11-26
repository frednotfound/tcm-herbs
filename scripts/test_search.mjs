// 在 Node 內測試搜尋與篩選查表（不需瀏覽器）。用法：node scripts/test_search.mjs
import { readFileSync } from 'node:fs';
globalThis.fetch = async (url) => {
  const p = new URL('../' + String(url).split('?')[0], import.meta.url);
  try { const t = readFileSync(p, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t) }; }
  catch { return { ok: false, status: 404, json: async () => null }; }
};
const { loadAll, store, resolveName } = await import('../js/data.js');
const { runSearch } = await import('../js/search.js');
await loadAll();
const show = (q, scope = 'all') => {
  const r = runSearch(q, scope);
  console.log(`「${q}」[${scope}] ${r.results.length} 筆${r.fuzzy ? '（近似）' : ''}:`,
    r.results.slice(0, 6).map(x => `${x.herb.name_zh}{${[...new Set(x.hits.map(h => h.field))].join('/')}}`).join(' '),
    r.suggestions?.length ? ' 建議:' + r.suggestions.map(h => h.name_zh).join(',') : '');
};
const qs = process.argv.slice(2);
if (qs.length) qs.forEach(q => show(q)); else {
  ['麻黃', '麻黄', '当归', '丹皮', '白术', '祛風', '生物鹼', 'alkaloid', '綠原酸', 'chlorogenic acid', 'ephedrine', 'ephedrin', '菊科', 'Compositae', '荊防敗毒散', '玉屏風散', 'α-pinene', 'beta', '祛風濕', '麻黄', '黃連素', 'Berberine', '解熱 止痛', '不存在的東西', '甘草酸', 'glycyrrhizin', '大棗 三萜'].forEach(q => show(q));
  show('防風', 'formula'); show('止痛', 'effect');
}
console.log('名稱解析：', ['烏頭', '半夏', '甘草', '水蛭', '丹皮', '川烏', '款冬花（止咳平喘）', '藜蘆', '貝母', '芍藥', '人參', '五靈脂', '附子'].map(n => `${n}->${resolveName(n)}`).join(' '));

// ---- 斷言：任何一項不符就以非 0 結束，GitHub Actions 會擋下部署 ----
let bad = 0;
const must = (name, cond) => { if (!cond) { console.error('✗ 失敗：' + name); bad++; } };
const names = (q, scope) => runSearch(q, scope).results.map(r => r.herb.name_zh);
must('搜「麻黃」第一筆是麻黃', names('麻黃')[0] === '麻黃');
must('異體字：白术 找得到白朮', names('白术').includes('白朮'));
must('別名：丹皮 找得到牡丹皮', names('丹皮').includes('牡丹皮'));
must('成分類別展開：生物鹼 有結果', names('生物鹼').length > 10);
must('同義詞：綠原酸 與 chlorogenic acid 結果相同', JSON.stringify(names('綠原酸').sort()) === JSON.stringify(names('chlorogenic acid').sort()));
must('藥名解析：烏頭 不可直接當成附子', resolveName('烏頭') === null);
must('藥名解析：甘草', resolveName('甘草') === 'herb_gancao');
must('簡體字：麻黄 找得到麻黃', names('麻黄')[0] === '麻黃');
must('簡體字：生物碱 與 生物鹼 結果相同', JSON.stringify(names('生物碱')) === JSON.stringify(names('生物鹼')));
must('簡體字：当归 找得到當歸', names('当归').includes('當歸'));
must('找不到時有建議', runSearch('麻皇').results.length === 0 && runSearch('麻皇').suggestions.length > 0);
if (bad) process.exit(1);
console.log('搜尋自我測試通過');
