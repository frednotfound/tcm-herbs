import { h } from '../lib/dom.js';
import { store } from '../data.js';
import { CONFIG } from '../config.js';

export function renderAbout() {
  return { node: h('div', { class: 'card about' },
    h('h1', null, '關於本站'),
    h('p', null, `${CONFIG.disclaimer}。`),
    h('p', null, '內容依課程《中華藥物學》講義整理，用於藥師國考複習與中藥資料查詢；不是醫療建議，也不是臨床用藥依據。'),
    h('dl', { class: 'kvs' },
      h('div', { class: 'kv' }, h('dt', null, '資料版本'), h('dd', null, store.meta.data_version)),
      h('div', { class: 'kv' }, h('dt', null, '資料更新日'), h('dd', null, store.meta.updated || '—')),
      h('div', { class: 'kv' }, h('dt', null, '收錄藥材'), h('dd', null, `${store.herbs.length} 味`)),
      h('div', { class: 'kv' }, h('dt', null, '程式版本'), h('dd', null, CONFIG.appVersion))),
    h('h2', null, '資料處理說明'),
    h('ul', null,
      h('li', null, '資料原文照講義呈現，網站不補寫、不推測藥理、成分、基原、劑量或考題答案。'),
      h('li', null, '講義沒有的欄位（例如許多藥的四氣、五味、歸經、品級）顯示為「未標示」，不自行填補。'),
      h('li', null, '「使用部位」分組、成分分類樹的歸類是為了篩選而衍生的對照，可能與講義寫法不同，頁面上以「衍生」標示。'),
      h('li', null, '發現錯誤請用藥材頁的「回報錯誤」按鈕。')),
    h('h2', null, '尚未提供'),
    h('p', { class: 'muted' }, '歷屆國考題、化學結構式圖、藥材實拍照片（預留位置，之後階段處理）。'),
    h('p', null, h('a', { class: 'btn', href: '#/' }, '回首頁'))), title: '關於' };
}
