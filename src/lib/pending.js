// 待收款訂單的自動取消時間（與 supabase/18_cancel_pending.sql 的 pending_cutoff() 一致）
// 每天台灣時間 19:00 清掉「19:00 以前下單、仍待收款」的預購訂單
// 例：10:00 下單 → 當天 19:00；20:00 下單 → 隔天 19:00
export const PENDING_EXPIRE_HOUR = 19

const TZ = 'Asia/Taipei'

// 該筆訂單的自動取消時間（Date）；台灣沒有夏令時間，固定 +08:00
export function pendingExpiresAt(createdIso) {
  const d = new Date(createdIso)
  const dateStr = d.toLocaleDateString('sv-SE', { timeZone: TZ })
  const hour = parseInt(d.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }), 10) % 24
  const h = String(PENDING_EXPIRE_HOUR).padStart(2, '0')
  const base = Date.parse(`${dateStr}T${h}:00:00+08:00`)
  return new Date(hour >= PENDING_EXPIRE_HOUR ? base + 86400000 : base)
}

export function isPendingExpired(createdIso, now = new Date()) {
  return pendingExpiresAt(createdIso) <= now
}

// 例：「11/14 19:00」
export function expiresLabel(createdIso) {
  const d = pendingExpiresAt(createdIso)
  const md = d.toLocaleDateString('zh-TW', { timeZone: TZ, month: 'numeric', day: 'numeric' })
  return `${md} ${String(PENDING_EXPIRE_HOUR).padStart(2, '0')}:00`
}
