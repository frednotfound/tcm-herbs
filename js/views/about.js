import { h } from '../lib/dom.js';
import { store } from '../data.js';
import { CONFIG } from '../config.js';

export function renderAbout() {
  return { node: h('div', { class: 'card about' },
    h('h1', null, '關於本站'),
    h('p', null, `${CONFIG.disclaimer}。`),
    h('p', null, '內容整合課程《中華藥物學》講義（常用中藥）與《臺灣中藥典第五版》單味中藥材規範，用於藥師國考複習與中藥資料查詢；不是醫療建議，也不是臨床用藥依據。'),
    h('dl', { class: 'kvs' },
      h('div', { class: 'kv' }, h('dt', null, '資料版本'), h('dd', null, store.meta.data_version)),
      h('div', { class: 'kv' }, h('dt', null, '資料更新日'), h('dd', null, store.meta.updated || '—')),
      h('div', { class: 'kv' }, h('dt', null, '收錄藥材'), h('dd', null, `共 ${store.herbs.length} 味（常用中藥 ${store.commonCount} 味、臺灣中藥典第五版增補 ${store.thp5OnlyCount} 味）`)),
      h('div', { class: 'kv' }, h('dt', null, '程式版本'), h('dd', null, CONFIG.appVersion))),
    h('h2', null, '資料處理說明'),
    h('ul', null,
      h('li', null, '「常用中藥」以課程講義為底本，並對照《臺灣中藥典第五版》更新基原學名、性味歸經、使用部位與法定規範，差異明細收錄於各藥材頁的「第五版與原講義差異」區塊。'),
      h('li', null, '「僅出現在臺灣中藥典第五版」之增補品項，依中藥典第五版用途分類整理，供查詢法定基原、性味歸經、指標成分、一般性狀與雜質限量。'),
      h('li', null, '「使用部位」分組與成分分類樹歸類是為了篩選而衍生的對照，可能與講義寫法不同。'),
      h('li', null, '發現錯誤請用藥材頁的「回報錯誤」按鈕。')),
    h('h2', null, '尚未提供'),
    h('p', { class: 'muted' }, '歷屆國考題、藥材實拍照片（預留位置，之後階段處理）。'),
    h('p', null, h('a', { class: 'btn', href: '#/' }, '回首頁'))), title: '關於' };
}
