// 逐日釋放庫存的計算（與 supabase/17_daily_release.sql 規則一致，供後台預覽使用）
// 累計開放量(第 d 天) = floor(總量 × 累計% / 100)；最後一天 = 100% = 總量；每天新增 = 與前一天累計的差

export function weightsSum(weights) {
  return Math.round(weights.reduce((s, w) => s + (Number(w) || 0), 0) * 100) / 100
}

export function weightsValid(weights) {
  return weights.length >= 1
    && weights.every(w => Number(w) >= 0)
    && Math.abs(weightsSum(weights) - 100) <= 0.01
}

// 回傳 { cumulative: [...], daily: [...] }
export function releasePlan(total, weights) {
  const n = weights.length
  const cumulative = []
  let pct = 0
  for (let i = 0; i < n; i++) {
    pct += Number(weights[i]) || 0
    cumulative.push(i === n - 1 ? total : Math.floor((total * pct) / 100 + 1e-9))
  }
  const daily = cumulative.map((c, i) => c - (i === 0 ? 0 : cumulative[i - 1]))
  return { cumulative, daily }
}

// 台灣今天的日期字串 YYYY-MM-DD
export function taipeiToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
}

// 今天是第幾天（1 起算；開始日之前＝1；超過天數＝天數）
export function taipeiDayIndex(startDate, days) {
  const a = Date.parse(taipeiToday() + 'T00:00:00Z')
  const b = Date.parse(startDate + 'T00:00:00Z')
  const d = Math.floor((a - b) / 86400000) + 1
  return Math.min(Math.max(d, 1), days)
}
