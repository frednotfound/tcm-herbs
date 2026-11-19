// 把 herbs_part1~3.json 依序串接成 data/herbs.json（不改任何欄位內容）
// 用法：node scripts/merge_herbs.mjs part1.json part2.json part3.json
import { readFileSync, writeFileSync } from 'node:fs';
const files = process.argv.slice(2);
if (files.length === 0) { console.error('用法：node scripts/merge_herbs.mjs part1.json part2.json ...'); process.exit(1); }
const all = [];
for (const f of files) {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  if (!Array.isArray(d)) throw new Error(`${f} 不是陣列`);
  all.push(...d);
}
writeFileSync(new URL('../data/herbs.json', import.meta.url), JSON.stringify(all, null, 1) + '\n');
console.log(`已合併 ${files.length} 個檔案，共 ${all.length} 筆 -> data/herbs.json`);
