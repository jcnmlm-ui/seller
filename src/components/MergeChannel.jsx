// 「合併其他通路訂單」共用元件：攤位收款（BoothDashboard）與現場收銀台（CashierPage）共用
//  · useMergeChannel：狀態與邏輯（含接收瀏覽器外掛「郵政商城訂單查詢」的查詢結果）
//  · MergeChannelRow：勾選列＋已加入清單
//  · MergeChannelModal：輸入單號／金額的面板
//  · GiftCard：滿額贈品提示卡
import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from './StatusBadge'
import { computeGifts, nextGiftStep, giftText } from '../lib/gifts'

export function useMergeChannel({ orderId = null } = {}) {
  const [enabled, setEnabled]     = useState(false)
  const [orders, setOrdersState]  = useState([])   // [{ order_no, amount, dupOf? }]
  const [showPanel, setShowPanel] = useState(false)
  const [no, setNo]               = useState('')
  const [amt, setAmt]             = useState('')
  const [warn, setWarn]           = useState('')

  // 外掛事件在 window 上收，用 ref 取最新值，避免重複綁定
  const ordersRef  = useRef([])
  const panelRef   = useRef(false)
  const orderIdRef = useRef(orderId)
  orderIdRef.current = orderId
  panelRef.current = showPanel

  const setOrders = useCallback(v => {
    const next = typeof v === 'function' ? v(ordersRef.current) : v
    ordersRef.current = next
    setOrdersState(next)
  }, [])

  const reset = useCallback((initial = []) => {
    setOrders(initial); setEnabled(initial.length > 0)
    setShowPanel(false); setNo(''); setAmt(''); setWarn('')
  }, [setOrders])

  function toggle(checked) {
    setEnabled(checked)
    if (checked) setShowPanel(true)
    else { setOrders([]); setWarn('') }
  }

  // auto = 外掛查詢後自動加入：成功就直接關閉面板（等同按「完成」）；有重複警示時留著讓人看
  const addOrder = useCallback(async (noRaw, amount, auto = false) => {
    const orderNo = String(noRaw ?? '').trim().toUpperCase()
    const amountN = Number(amount)
    if (!orderNo) { setWarn('請輸入其他通路的訂單編號'); return }
    if (!amountN || amountN <= 0) { setWarn('請輸入該筆訂單的金額（發票金額）'); return }
    if (ordersRef.current.some(m => m.order_no === orderNo)) { setWarn('這個單號已經加入了'); return }
    // 檢查這張單是否已被別筆訂單合併過（避免同一張單重複領贈品）
    let dupOf = null
    try {
      let q = supabase.from('orders').select('order_no').contains('merged_orders', [{ order_no: orderNo }])
      if (orderIdRef.current) q = q.neq('id', orderIdRef.current)
      const { data } = await q.limit(1)
      if (data?.length) dupOf = data[0].order_no
    } catch {}
    setOrders(prev => [...prev, { order_no: orderNo, amount: amountN, dupOf }])
    setNo(''); setAmt('')
    if (dupOf) { setWarn(`⚠️ 此單號已在 ${dupOf} 合併計算過，請確認是否重複領取`); return }
    setWarn('')
    if (auto) {
      toast(`✓ 已加入其他通路 ${orderNo}　NT$${amountN.toLocaleString()}`, 'success', 2500)
      setShowPanel(false)
    }
  }, [setOrders])

  function remove(orderNo) { setOrders(prev => prev.filter(m => m.order_no !== orderNo)) }

  function close() {
    setShowPanel(false); setWarn('')
    if (ordersRef.current.length === 0) setEnabled(false)   // 沒輸入任何單就關掉 → 取消勾選
  }

  // 瀏覽器外掛查完郵政商城單號後送出 topmall-order-result：面板開著才處理，成功就直接加入
  useEffect(() => {
    function onResult(e) {
      if (!panelRef.current) return
      let d
      try { d = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail } catch { return }
      if (!d?.orderNo) return
      if (d.ok && Number(d.amount) > 0) {
        addOrder(d.orderNo, d.amount, true)
      } else {
        setNo(String(d.orderNo)); setAmt('')
        setWarn(`⚠️ ${d.orderNo}：${d.reason || '查無金額'}，未帶入金額`)
      }
    }
    window.addEventListener('topmall-order-result', onResult)
    return () => window.removeEventListener('topmall-order-result', onResult)
  }, [addOrder])

  // 通知外掛的查詢面板：合併面板開啟時展開，關閉時收折
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('seller-merge-panel', { detail: JSON.stringify({ open: showPanel }) }))
  }, [showPanel])
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('seller-merge-panel', { detail: JSON.stringify({ open: false }) }))
  }, [])

  const sum = orders.reduce((s, m) => s + Number(m.amount || 0), 0)

  return {
    enabled, setEnabled, orders, setOrders, showPanel, setShowPanel,
    no, setNo, amt, setAmt, warn, sum,
    toggle, add: () => addOrder(no, amt), remove, close, reset,
  }
}

// ── 勾選列＋已加入清單 ───────────────────────────────────────
export function MergeChannelRow({ merge }) {
  return (
    <div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" className="w-4 h-4 accent-red-500"
          checked={merge.enabled} onChange={e => merge.toggle(e.target.checked)} />
        <span className="text-sm font-semibold text-stone-700">合併其他通路購買訂單（一併計算滿額）</span>
      </label>
      {merge.orders.length > 0 && (
        <div className="mt-2 bg-white border border-stone-200 rounded-xl px-4 py-3 space-y-1">
          {merge.orders.map(m => (
            <div key={m.order_no} className="flex items-center justify-between text-sm gap-2">
              <span className="font-mono text-stone-600 truncate">
                {m.order_no}{m.dupOf && <span className="text-amber-600 font-sans text-xs ml-2">⚠ 已用於 {m.dupOf}</span>}
              </span>
              <span className="font-bold text-stone-800 flex-shrink-0">NT${Number(m.amount).toLocaleString()}</span>
            </div>
          ))}
          <button type="button" onClick={() => merge.setShowPanel(true)}
            className="text-xs text-red-500 hover:text-red-700 font-semibold pt-1">＋ 新增／編輯</button>
        </div>
      )}
    </div>
  )
}

// ── 輸入面板 ─────────────────────────────────────────────────
export function MergeChannelModal({ merge, giftBase, giftList }) {
  if (!merge.showPanel) return null
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <h2 className="font-black text-lg text-stone-900">合併其他通路訂單</h2>
          <button onClick={merge.close} className="text-stone-400 hover:text-stone-600"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-xs text-stone-400">輸入客人在其他通路（例如網路商店）購買的訂單編號與發票金額，會與本單合併計算滿額（郵票金額不計入）。</p>

          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-sm" placeholder="其他通路訂單編號" autoFocus
              value={merge.no} onChange={e => merge.setNo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('merge-amt')?.focus() } }} />
            <input id="merge-amt" className="input w-28 text-sm" type="number" min="1" placeholder="金額"
              value={merge.amt} onChange={e => merge.setAmt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); merge.add() } }} />
            <button type="button" id="merge-add" onClick={merge.add} className="btn-primary px-4 text-sm">加入</button>
          </div>
          {merge.warn && (
            <p className="text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2">{merge.warn}</p>
          )}

          {merge.orders.length > 0 && (
            <div className="space-y-1.5">
              {merge.orders.map(m => (
                <div key={m.order_no} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2 text-sm gap-2">
                  <span className="font-mono text-stone-700 truncate">{m.order_no}</span>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    <b>NT${Number(m.amount).toLocaleString()}</b>
                    <button type="button" onClick={() => merge.remove(m.order_no)} className="text-stone-400 hover:text-red-500"><X size={14} /></button>
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-1 border-t border-stone-100">
                <span className="text-stone-500">其他通路合計</span>
                <b>NT${merge.sum.toLocaleString()}</b>
              </div>
            </div>
          )}

          {/* 即時顯示合併後的贈品結果 */}
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm">
            <p className="text-xs text-stone-500">合併後滿額金額 <b className="text-stone-800">NT${giftBase.toLocaleString()}</b></p>
            <p className="font-black text-red-700 mt-0.5">
              {giftList.length
                ? `應送 ${giftList.length} 項：${giftText(giftList)}`
                : '尚未達到任何滿額門檻'}
            </p>
          </div>
        </div>
        <div className="px-5 pb-5 pt-3 border-t border-stone-100 flex-shrink-0">
          <button onClick={merge.close} className="btn-primary w-full py-3 text-sm font-bold">完成</button>
        </div>
      </div>
    </div>
  )
}

// ── 滿額贈品提示卡 ───────────────────────────────────────────
export function GiftCard({ tiers, invoice, mergedSum = 0, children }) {
  if (!tiers?.length) return null
  const base = invoice + mergedSum
  const calc = computeGifts(tiers, base)
  const list = calc.gifts
  const pieces = list.reduce((s, g) => s + g.qty, 0)
  const step = nextGiftStep(tiers, base)
  const minThreshold = Math.min(...tiers.map(t => Number(t.threshold)))
  return (
    <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="text-sm font-black text-red-700">🎁 滿額贈品</p>
        <p className="text-xs text-stone-500">
          發票 NT${invoice.toLocaleString()}
          {mergedSum > 0 && <> ＋ 其他通路 NT${mergedSum.toLocaleString()}</>}
          {' '}＝ <b className="text-stone-800">NT${base.toLocaleString()}</b>
        </p>
      </div>

      {list.length > 0 ? (
        <>
          <p className="text-lg font-black text-stone-900">應送 {list.length} 項／共 {pieces} 個</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {list.map((g, i) => (
              <span key={i} className="px-4 py-2 rounded-full bg-white border border-red-200 text-red-700 text-base font-black">
                {g.name} <span className="text-red-500">×{g.qty}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-stone-400 mt-2">
            {calc.cycles > 0 && <>滿 NT${Number(calc.topTier.threshold).toLocaleString()} ×{calc.cycles} 組</>}
            {calc.cycles > 0 && calc.remTier && '，'}
            {calc.remTier && <>餘 NT${calc.rem.toLocaleString()}（滿 NT${Number(calc.remTier.threshold).toLocaleString()} 加送「{calc.remTier.reward}」）</>}
          </p>
          {calc.soldOut.length > 0 && (
            <p className="mt-2 text-sm font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
              ⚠ 「{calc.soldOut.map(t => t.reward).join('、')}」已送完，請改送替代贈品
            </p>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-stone-500">
          未達最低門檻（NT${minThreshold.toLocaleString()}），本單無滿額贈品
        </p>
      )}

      {step && step.adds.length > 0 && (
        <p className="text-xs text-stone-500 mt-2">
          再 <b className="text-red-500">NT${step.need.toLocaleString()}</b> 可多送：{giftText(step.adds)}
        </p>
      )}
      {children}
    </div>
  )
}
