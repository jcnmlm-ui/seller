// ============================================================
// 滿額贈品計算（攤位收款頁、顧客購物車橫幅共用，確保兩邊算出來一樣）
// 所有金額、贈品名稱都來自後台「滿額贈設定」(promotion_tiers)，這裡沒有寫死任何數字。
// ============================================================

// 贈品文字 → 清單。「鑰匙圈+日期章」→ 2 項；「貼紙x2」→ 1 項 2 個
export function parseGifts(reward) {
  return String(reward || '').split(/[+＋]/).map(x => x.trim()).filter(Boolean).map(x => {
    const m = x.match(/^(.*?)\s*[x×*]\s*(\d+)$/i)
    return m && m[1] ? { name: m[1].trim(), qty: Number(m[2]) } : { name: x, qty: 1 }
  })
}

// 贈品合併：名稱互相包含視為同一項（例如「波波鴿搖搖樂鑰匙圈」與「鑰匙圈」），數量相加，名稱取較短者
function mergeGift(list, g) {
  const hit = list.find(x => x.name.includes(g.name) || g.name.includes(x.name))
  if (hit) { hit.qty += g.qty; if (g.name.length < hit.name.length) hit.name = g.name }
  else list.push({ ...g })
}

// 滿額贈品試算（循環制）：
//   以「最高一階門檻」為一個循環，每滿一個循環就送一整組最高階贈品；
//   不足一個循環的餘額，再依餘額能達到的最高一階，加送該階贈品。
//   例（門檻 500 / 1,000 / 1,500）：1,500 → 各 1；3,000 → 各 2；3,500 → 各 2，再加 500 那項 1 個。
export function computeGifts(tiers, amount) {
  const sorted = [...tiers].sort((a, b) => Number(a.threshold) - Number(b.threshold))
  const out = { gifts: [], cycles: 0, rem: amount, topTier: null, remTier: null, soldOut: [] }
  if (!sorted.length || amount <= 0) return out
  const top = sorted[sorted.length - 1]
  const cycle = Number(top.threshold)
  const cycles = Math.floor(amount / cycle)
  const rem = amount - cycles * cycle
  const remTier = sorted.reduce((hit, t) => (rem >= Number(t.threshold) ? t : hit), null)
  // 各階贈品名稱可能寫法不同（「波波鴿日期章」vs「日期章」），統一取最短的名稱顯示
  const allNames = sorted.flatMap(t => parseGifts(t.reward).map(g => g.name))
  const canon = n => allNames.filter(m => m.includes(n) || n.includes(m)).reduce((a, b) => (b.length < a.length ? b : a), n)
  const norm = g => ({ name: canon(g.name), qty: g.qty })
  if (cycles > 0) parseGifts(top.reward).map(norm).forEach(g => mergeGift(out.gifts, { name: g.name, qty: g.qty * cycles }))
  if (remTier) parseGifts(remTier.reward).map(norm).forEach(g => mergeGift(out.gifts, g))
  out.cycles = cycles; out.rem = rem; out.topTier = top; out.remTier = remTier
  out.soldOut = [cycles > 0 && top.is_sold_out ? top : null, remTier?.is_sold_out ? remTier : null].filter(Boolean)
  return out
}
export const giftText = list => list.map(g => `${g.name}×${g.qty}`).join('、')

// 下一個「會多送東西」的金額點：還差多少、屆時多送哪些、是哪一階觸發、進度條起訖
export function nextGiftStep(tiers, amount) {
  const sorted = [...tiers].sort((a, b) => Number(a.threshold) - Number(b.threshold))
  if (!sorted.length) return null
  const cycle = Number(sorted[sorted.length - 1].threshold)
  const n = Math.floor(amount / cycle)
  let best = Infinity, bestTier = null, prev = 0
  for (const k of [n - 1, n, n + 1]) {
    if (k < 0) continue
    if (k * cycle <= amount && k * cycle > prev) prev = k * cycle
    for (const t of sorted) {
      const v = k * cycle + Number(t.threshold)
      if (v > amount && v < best) { best = v; bestTier = t }
      if (v <= amount && v > prev) prev = v
    }
  }
  if (!isFinite(best)) return null
  const cur = computeGifts(tiers, amount).gifts
  const adds = computeGifts(tiers, best).gifts
    .map(g => ({ name: g.name, qty: g.qty - (cur.find(c => c.name === g.name)?.qty ?? 0) }))
    .filter(g => g.qty > 0)
  return { need: best - amount, at: best, prev, tier: bestTier, adds }
}
