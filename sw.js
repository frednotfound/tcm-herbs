// Service Worker：離線使用。
// - 網頁、程式、樣式、資料（index.html、js/、css/、data/）：網路優先，每次向伺服器確認有沒有新版（沒變只回 304，很快）；
//   連不上或太慢才用快取。這樣部署後不會出現「新的樣式配舊的程式」這種新舊混搭、版面錯亂的情況。
// - 字型、結構圖、圖示（fonts/、structures/、icons/）：內容幾乎不變，先用快取，沒有才下載。
const VERSION = new URL(self.location).searchParams.get('v') || '1';
const CACHE = `tcm-${VERSION}`;
const NET_TIMEOUT_MS = 4000; // 網路超過這個時間沒回應就先用快取
const SHELL = ['./', 'index.html', 'css/style.css', 'fonts/fonts.css', 'fonts/serif-400-0.woff', 'fonts/serif-700-0.woff',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/pwa-192.png', 'icons/pwa-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'js/lib/install.js',
  'js/app.js', 'js/config.js', 'js/data.js', 'js/router.js', 'js/search.js', 'js/filters.js',
  'js/lib/dom.js', 'js/lib/ui.js', 'js/lib/derive.js', 'js/lib/wrap.js',
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

// 快取鍵：忽略 ?v= 之類的參數，離線時仍能命中
const keyOf = (url) => url.origin + url.pathname;

/** 重新下載並要求伺服器確認新舊（cache: 'no-cache'），跳過瀏覽器 HTTP 快取，避免拿到 10 分鐘內的舊檔 */
async function fetchFresh(req, url) {
  if (req.mode === 'navigate') {
    const res = await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
    // 導覽請求不能直接回傳「轉址後」的回應，要重新包一次
    return res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
  }
  return fetch(new Request(req, { cache: 'no-cache' }));
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // 回報（POST、跨網域）不經過快取
  const isStatic = /\/(fonts|structures|icons)\//.test(url.pathname);

  if (isStatic) {
    // 先用快取；沒有才下載並存起來
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(keyOf(url));
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') { const copy = res.clone(); e.waitUntil(cache.put(keyOf(url), copy)); }
      return res;
    })());
    return;
  }

  // 網路優先：成功就更新快取；失敗或逾時才用快取
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetchFresh(req, url).then((res) => {
      if (res.ok) { const copy = res.clone(); e.waitUntil(cache.put(req.mode === 'navigate' ? keyOf(new URL('./', self.location)) : keyOf(url), copy)); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    try {
      return await withTimeout(net, NET_TIMEOUT_MS);
    } catch {
      const key = req.mode === 'navigate' ? keyOf(new URL('./', self.location)) : keyOf(url);
      const hit = await cache.match(key) || await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match(keyOf(new URL('index.html', self.location))) : null);
      if (hit) return hit;
      // 快取也沒有：再等一下網路（逾時只是先試快取，不代表放棄）
      try { return await net; } catch { return Response.error(); }
    }
  })());
});
