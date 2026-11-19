// 暫停預購下單（臨時封鎖）
// 在 ORDER_LOCK_UNTIL 之前，預購網站不能加入購物車、不能送出訂單。時間一到自動解除，不需再改程式。
// 伺服器端另有同樣的封鎖（supabase/22_order_lock.sql 的 decrement_stock），舊頁面或有人繞過前端也下不了單。
// 現場收銀台（CashierPage）與後台收款不受影響。
import { useEffect, useState } from 'react'

export const ORDER_LOCK_UNTIL = new Date('2026-11-20T00:00:00+08:00')
export const ORDER_LOCK_MESSAGE = '系統調整中，暫停預購下單，將於 11/20 00:00 重新開放，造成不便敬請見諒。'

export function isOrderLocked(now = new Date()) {
  return now < ORDER_LOCK_UNTIL
}

// 在畫面上用：到時間會自動解除（每 15 秒檢查一次）
export function useOrderLock() {
  const [locked, setLocked] = useState(isOrderLocked())
  useEffect(() => {
    const t = setInterval(() => setLocked(isOrderLocked()), 15000)
    return () => clearInterval(t)
  }, [])
  return locked
}
