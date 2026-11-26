// hash 路由：#/herb/herb_mahuang?x=1
export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const qi = raw.indexOf('?');
  const path = qi === -1 ? raw : raw.slice(0, qi);
  const params = new URLSearchParams(qi === -1 ? '' : raw.slice(qi + 1));
  const parts = path.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  return { path, parts, params };
}
export function hrefOf(path, params) {
  const q = params && [...params].length ? `?${params.toString()}` : '';
  return `#${path}${q}`;
}
export function go(path, params) { location.hash = hrefOf(path, params); }
/** 不新增歷史紀錄地更新網址參數（搜尋輸入、篩選用）。保留 history.state（返回時要靠它還原捲動位置）。 */
export function replaceParams(path, params) {
  const url = location.pathname + location.search + hrefOf(path, params);
  history.replaceState(history.state, '', url);
}
/** 這一頁是不是從站內連過來的（決定「返回」要用瀏覽器上一頁，還是回到總覽） */
export const cameFromInside = () => Boolean(history.state && history.state.inApp);
export const herbHref = (id) => `#/herb/${encodeURIComponent(id)}`;
