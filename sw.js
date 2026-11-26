// Service Worker：離線使用。
// - data/*.json：網路優先（有網路時永遠拿最新資料），失敗才用快取
// - 其他檔案（網頁、程式、樣式、結構圖）：先用快取、背景更新（stale-while-revalidate）
const VERSION = new URL(self.location).searchParams.get('v') || '1';
const CACHE = `tcm-${VERSION}`;
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/config.js', 'js/data.js', 'js/router.js', 'js/search.js', 'js/filters.js',
  'js/lib/dom.js', 'js/lib/ui.js', 'js/lib/derive.js',
  'js/views/home.js', 'js/views/list.js', 'js/views/card.js', 'js/views/herb.js', 'js/views/category.js',
  'js/views/ingredients.js', 'js/views/theory.js', 'js/views/compat.js', 'js/views/about.js', 'js/views/report.js',
  'data/meta.json', 'data/herbs.json', 'data/general_theory.json', 'data/categories.json', 'data/exam_highlights.json',
  'data/ingredient_taxonomy.json', 'data/alias_dictionary.json', 'data/derived/part_groups.json', 'data/compounds.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tcm-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // 回報（POST、跨網域）不經過快取

  // 資料檔：網路優先。快取鍵用 pathname（忽略 ?v= 之類的參數），離線時仍能命中
  if (url.pathname.includes('/data/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) { const copy = res.clone(); e.waitUntil(cache.put(url.pathname, copy)); }
        return res;
      } catch {
        const hit = await cache.match(url.pathname, { ignoreSearch: true });
        if (hit) return hit;
        throw new Error('offline');
      }
    })());
    return;
  }

  // 其他檔案：先回快取，同時在背景更新。背景更新用 waitUntil 保住，避免回應後 SW 被瀏覽器停掉而更新沒完成
  const net = fetch(req).then((res) => {
    // clone 必須在回應內容被讀取前同步完成
    const copy = res.ok && res.type === 'basic' ? res.clone() : null;
    if (copy) e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
    return res;
  }).catch(() => null);
  e.waitUntil(net);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await net;
    if (res) return res;
    // 離線又沒有快取：網頁導覽一律回首頁殼（hash 路由由前端處理）
    if (req.mode === 'navigate') { const shell = await cache.match('index.html') || await cache.match('./'); if (shell) return shell; }
    return Response.error();
  })());
});
