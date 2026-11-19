// Service Worker：離線使用。
// - data/*.json：網路優先（有網路時永遠拿最新資料），失敗才用快取
// - 其他檔案（網頁、程式、樣式）：先用快取、背景更新（stale-while-revalidate）
const VERSION = new URL(self.location).searchParams.get('v') || '1';
const CACHE = `tcm-${VERSION}`;
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/config.js', 'js/data.js', 'js/router.js', 'js/search.js', 'js/filters.js',
  'js/lib/dom.js', 'js/lib/ui.js', 'js/lib/derive.js',
  'js/views/home.js', 'js/views/list.js', 'js/views/card.js', 'js/views/herb.js', 'js/views/category.js',
  'js/views/ingredients.js', 'js/views/theory.js', 'js/views/compat.js', 'js/views/about.js', 'js/views/report.js',
  'data/meta.json', 'data/herbs.json', 'data/general_theory.json', 'data/categories.json', 'data/exam_highlights.json',
  'data/ingredient_taxonomy.json', 'data/alias_dictionary.json', 'data/derived/part_groups.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tcm-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // 回報（POST、跨網域）不經過快取
  const isData = url.pathname.includes('/data/');
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = isData ? url.pathname : req; // 資料檔忽略 ?v= 參數，離線時仍能命中
    if (isData) {
      try { const res = await fetch(req); if (res.ok) cache.put(url.pathname, res.clone()); return res; }
      catch { const hit = await cache.match(url.pathname); if (hit) return hit; throw new Error('offline'); }
    }
    const hit = await cache.match(key, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
