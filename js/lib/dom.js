// 極小的 DOM 建立工具。所有文字都以 textContent 寫入，不使用 innerHTML，避免資料裡的符號被當成 HTML。
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') throw new Error('不允許 html 屬性');
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function frag(...children) { const f = document.createDocumentFragment(); append(f, children); return f; }

/** 把 text 中符合 terms 的片段包上 <mark>。terms 為原字串（不分大小寫）。 */
export function highlight(text, terms) {
  text = String(text ?? '');
  const ts = [...new Set((terms || []).map(t => String(t).toLowerCase()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!ts.length) return document.createTextNode(text);
  const low = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  let any = false;
  for (const t of ts) {
    let i = 0;
    while ((i = low.indexOf(t, i)) !== -1) { for (let j = i; j < i + t.length; j++) marks[j] = true; any = true; i += t.length; }
  }
  if (!any) return document.createTextNode(text);
  const f = document.createDocumentFragment();
  let buf = '', cur = marks[0];
  const flush = () => { if (!buf) return; f.append(cur ? h('mark', null, buf) : document.createTextNode(buf)); buf = ''; };
  for (let i = 0; i < text.length; i++) { if (marks[i] !== cur) { flush(); cur = marks[i]; } buf += text[i]; }
  flush();
  return f;
}

export function safeStorage() {
  return {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };
}
