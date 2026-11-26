// 中文「以詞為單位」換行。
// 瀏覽器預設在任兩個漢字之間都能斷行，手機上常出現「頭｜暈」「資｜料版本」這種把一個詞拆開的換行。
// 做法：CSS 設 word-break: keep-all（漢字之間不隨便斷），再用瀏覽器內建的中文分詞（Intl.Segmenter）
// 在詞與詞之間插入 <wbr>（可斷行點）。標點後面本來就能斷。
// 沒有 Intl.Segmenter 的舊瀏覽器什麼都不做；超長沒有斷點的字串仍會被 overflow-wrap 斷開，不會撐破版面。
const seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('zh-Hant', { granularity: 'word' }) : null;
const HAN = /[㐀-鿿豈-﫿]/;
const HAN2 = /[㐀-鿿豈-﫿]{3}/;
const SKIP = 'input, textarea, select, script, style, code, .nw, .chip, .btn, .tab';

function accept(node) {
  const t = node.data;
  if (t.length < 4 || !HAN2.test(t)) return NodeFilter.FILTER_REJECT;
  const p = node.parentElement;
  if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
  return NodeFilter.FILTER_ACCEPT;
}

/** 處理 root 底下（或 root 本身是文字節點）所有的中文文字 */
export function phraseWrap(root) {
  if (!seg || !root) return;
  const nodes = [];
  if (root.nodeType === Node.TEXT_NODE) { if (accept(root) === NodeFilter.FILTER_ACCEPT) nodes.push(root); }
  else {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: accept });
    while (w.nextNode()) nodes.push(w.currentNode);
  }
  for (const n of nodes) {
    const parts = [];
    for (const s of seg.segment(n.data)) parts.push(s.segment);
    if (parts.length < 2) continue;
    const f = document.createDocumentFragment();
    let buf = parts[0], breaks = 0;
    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1], cur = parts[i];
      // 只在「漢字詞｜漢字詞」之間加斷點；英文、數字之間本來就有空白可斷
      if (HAN.test(prev[prev.length - 1]) && HAN.test(cur[0])) { f.append(buf, document.createElement('wbr')); buf = cur; breaks++; }
      else buf += cur;
    }
    // 沒有要加的斷點就不動這個節點（否則換掉節點會再觸發 MutationObserver，形成無限迴圈）
    if (!breaks) continue;
    f.append(buf);
    n.replaceWith(f);
  }
}

/** 持續處理 el 裡新加入的內容（換頁、搜尋結果更新、結構圖說明等） */
export function watchPhraseWrap(el) {
  if (!seg || !el) return;
  phraseWrap(el);
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) phraseWrap(n);
    }
  }).observe(el, { childList: true, subtree: true });
}
