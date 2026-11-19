// 衍生資料計算（純函式；瀏覽器與 Node 驗證腳本共用）
// 原則：只從原資料「算出」對照表，絕不寫回、不補資料。

const GREEK = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ω': 'omega', 'κ': 'kappa' };

/** 去掉括弧備註：款冬花（止咳平喘） -> 款冬花 */
export function stripParen(s) {
  return String(s ?? '').replace(/[（(][^）)]*[）)]/g, '').trim();
}

/** 拆開名稱：皂莢／皂角刺 -> [皂莢, 皂角刺]（同時去括弧備註） */
export function splitNames(s) {
  return stripParen(s).split(/[／/、，,;；]/).map(x => x.trim()).filter(Boolean);
}

/** 單字異體字替換表（如 袪->祛、痹->痺）；多字的別名（丹皮、元胡）另走名稱群組，不做字串替換 */
export function buildVariantPairs(aliasDict) {
  const pairs = [];
  for (const g of aliasDict.herb_and_char_variants || []) {
    if ([...g.canonical].length !== 1) continue;
    for (const a of g.aliases || []) if ([...a].length === 1 && a !== g.canonical) pairs.push([a, g.canonical]);
  }
  return pairs;
}

/** 藥名別名群組：任一寫法（正規化後）-> 同群組全部寫法。用於查詢展開與藥名對照。 */
export function buildNameGroups(aliasDict, variantPairs = []) {
  const map = new Map();
  for (const g of aliasDict.herb_and_char_variants || []) {
    if ([...g.canonical].length === 1) continue;
    const names = [g.canonical, ...(g.aliases || [])];
    for (const n of names) {
      const k = normText(n, variantPairs);
      if (!map.has(k)) map.set(k, new Set());
      for (const m of names) map.get(k).add(m);
    }
  }
  return map;
}

/** 通用正規化：全半形統一、小寫、希臘字母轉英文、異體字統一、空白壓縮 */
export function normText(s, variantPairs = []) {
  let t = String(s ?? '').normalize('NFKC').toLowerCase();
  t = t.replace(/[αβγδωκ]/g, c => GREEK[c] || c);
  for (const [a, c] of variantPairs) if (t.includes(a)) t = t.split(a).join(c);
  return t.replace(/\s+/g, ' ').trim();
}

/** 成分名稱用的鍵：小寫、去空白與常見符號，讓 "l-Ephedrine" 與 "L-ephedrine" 相同 */
export function compoundKey(s) {
  return normText(s).replace(/[\s ]+/g, '').replace(/[()（）\[\]]/g, '');
}

/** 建立成分分類樹的查表 */
export function buildTaxonomy(tax, aliasDict) {
  const nodes = new Map();
  const topIds = [];
  const walk = (n, parent, depth) => {
    const node = { id: n.id, name_zh: n.name_zh, name_en: n.name_en || '', parent, depth, children: [], compounds: n.compounds || [] };
    nodes.set(n.id, node);
    for (const c of n.children || []) { node.children.push(c.id); walk(c, n.id, depth + 1); }
  };
  for (const t of tax.tree) { topIds.push(t.id); walk(t, null, 0); }

  // 同義詞群組：任一寫法 -> 群組內全部寫法鍵
  const synGroups = new Map();
  for (const g of aliasDict.compound_synonyms || []) {
    const keys = [g.canonical, ...(g.aliases || [])].map(compoundKey);
    const set = new Set(keys);
    for (const k of keys) synGroups.set(k, set);
  }
  const synKeys = (key) => synGroups.get(key) || new Set([key]);

  // 化合物鍵 -> 節點 id 清單（直接掛在該節點的化合物）
  const compoundIndex = new Map();
  for (const n of nodes.values()) {
    for (const c of n.compounds) {
      const k = compoundKey(c);
      if (!compoundIndex.has(k)) compoundIndex.set(k, []);
      compoundIndex.get(k).push(n.id);
    }
  }

  // 類別詞 -> 節點 id（化學類別對照 49 項 + 樹節點自己的中英文名）
  const termIndex = new Map();
  const addTerm = (t, id) => { const k = normText(t); if (k && nodes.has(id) && !termIndex.has(k)) termIndex.set(k, id); };
  for (const g of aliasDict.chemical_categories || []) for (const t of g.terms || []) addTerm(t, g.target_id);
  for (const n of nodes.values()) { addTerm(n.name_zh, n.id); addTerm(n.name_en, n.id); }

  const descendants = (id) => {
    const out = new Set([id]);
    const stack = [id];
    while (stack.length) { const x = nodes.get(stack.pop()); if (!x) continue; for (const c of x.children) { out.add(c); stack.push(c); } }
    return out;
  };
  const ancestors = (id) => { const out = []; let p = nodes.get(id)?.parent; while (p) { out.push(p); p = nodes.get(p)?.parent; } return out; };
  const path = (id) => [...ancestors(id).reverse(), id].map(x => nodes.get(x)?.name_zh).filter(Boolean);

  return { nodes, topIds, compoundIndex, termIndex, synKeys, descendants, ancestors, path };
}

/** 單一化合物對應到哪些樹節點（空陣列＝未歸類） */
export function matchCompound(taxo, compound) {
  const names = [compound.name, ...(compound.aliases || [])];
  const hit = new Set();
  for (const nm of names) {
    for (const k of taxo.synKeys(compoundKey(nm))) {
      for (const id of taxo.compoundIndex.get(k) || []) hit.add(id);
    }
  }
  return [...hit];
}

/** 一味藥的成分歸類：直接節點、每個成分的歸類結果、未歸類清單 */
export function classifyHerb(taxo, herb) {
  const direct = new Set();
  const perCompound = new Map(); // "groupIdx:compIdx" -> nodeIds
  const unmatched = [];
  let total = 0;
  (herb.ingredients || []).forEach((g, gi) => {
    // 類別原文若本身就是已知類別詞，也算直接節點（例如只有類別、沒有化合物的情形）
    const catKey = normText(g.category_raw);
    const catNode = taxo.termIndex.get(catKey);
    if (catNode) direct.add(catNode);
    (g.compounds || []).forEach((c, ci) => {
      total++;
      const ids = matchCompound(taxo, c);
      perCompound.set(`${gi}:${ci}`, ids);
      if (ids.length) ids.forEach(i => direct.add(i)); else unmatched.push({ group: g.category_raw, name: c.name });
    });
  });
  return { direct, perCompound, unmatched, total };
}

/** 全部藥材的成分歸類統計 */
export function classifyAll(taxo, herbs) {
  const byHerb = new Map();
  let total = 0, matched = 0, herbsWithMatch = 0;
  const unmatchedAll = [];
  for (const h of herbs) {
    const r = classifyHerb(taxo, h);
    byHerb.set(h.id, r);
    total += r.total;
    matched += r.total - r.unmatched.length;
    if (r.total - r.unmatched.length > 0) herbsWithMatch++;
    for (const u of r.unmatched) unmatchedAll.push({ herb_id: h.id, herb: h.name_zh, ...u });
  }
  return { byHerb, total, matched, herbsWithMatch, unmatchedAll };
}

/** 四氣篩選用值：去括弧備註；微寒->寒、大熱->熱 的「基本氣」。顯示仍用原文。 */
export function baseNature(v) {
  const t = stripParen(v).replace(/^(微|大)/, '');
  return ['寒', '涼', '平', '溫', '熱'].includes(t) ? t : null;
}

/** 五味篩選用值：回傳字串中出現的所有基本味 */
export function baseFlavors(v) {
  const t = stripParen(v);
  return ['辛', '甘', '酸', '苦', '鹹', '淡', '澀'].filter(f => t.includes(f));
}

/** 品級：以 herb_grade 為準 */
export function gradeOf(herb) { return herb.herb_grade || null; }

/** 科別（可含「A / B」兩科） */
export function familiesOf(herb) {
  return String(herb.family_zh || '').split(/\s*[\/／]\s*/).map(s => s.trim()).filter(Boolean);
}

/** 分類路徑：「解表藥>辛溫解表藥」-> ['解表藥','辛溫解表藥']；次分類去掉括弧備註 */
export function categoryPaths(herb) {
  const out = [];
  if (herb.category) out.push(stripParen(herb.category).split('>').map(s => s.trim()));
  for (const s of herb.secondary_categories || []) out.push(stripParen(s).split('>').map(x => x.trim()));
  return out;
}

/** 小重點標籤：合併重複寫法（種子類（小重點）-> 種子類），不含品級（品級另有篩選） */
export function highlightTags(herb) {
  const set = new Set();
  for (const t of herb.tags || []) {
    const k = stripParen(t) || t;
    if (['上品', '中品', '下品'].includes(k)) continue;
    set.add(k);
  }
  if (herb.ed3_updated) set.add('第三版修改');
  return [...set];
}
