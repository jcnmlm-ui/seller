import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, X, LogOut, Trash2, Plus, Minus, ShoppingCart, Monitor } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { STORE, PAYMENT_LABELS } from '../../config/store'
import { useEnabledPaymentMethods } from '../../hooks/useEnabledPaymentMethods'
import { toast } from '../../components/StatusBadge'
import { computeGifts, giftText } from '../../lib/gifts'
import { useMergeChannel, MergeChannelRow, MergeChannelModal, GiftCard } from '../../components/MergeChannel'

// 現場庫存提醒：booth_stock 為 null＝不追蹤；剩餘 ≤ 0 一律提醒，其餘低於 booth_low_alert 才提醒
function boothStockState(boothStock, lowAlert, qty) {
  if (boothStock == null) return null
  const remaining = boothStock - qty
  if (remaining <= 0) return { remaining, zero: true }
  if (lowAlert != null && remaining < lowAlert) return { remaining, zero: false }
  return null
}

// 每單限購（與預購共用後台「逐日釋放設定」裡的每單限購數字）；未啟用或讀不到＝不限
async function fetchPerOrderLimit() {
  try {
    const { data } = await supabase.from('release_schedule')
      .select('per_order_limit_enabled, per_order_limit').eq('id', 'main').maybeSingle()
    const n = Number(data?.per_order_limit)
    return data?.per_order_limit_enabled && n > 0 ? n : null
  } catch { return null }
}

export default function CashierPage() {
  const navigate = useNavigate()
  const enabledPayMethods = useEnabledPaymentMethods()
  const [cartItems, setCartItems]   = useState([])   // [{ id, name, barcode, price, qty }]
  const [barcodeInput, setBarcodeInput] = useState('')
  const [payMethod, setPayMethod]   = useState('cash')
  const [confirming, setConfirming] = useState(false)
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 })
  const [lastSale, setLastSale]     = useState(null)  // 上一筆成功紀錄
  const [tiers, setTiers]       = useState([])    // 滿額活動門檻
  const [redeemMode, setRedeemMode] = useState(false)  // 「預購領取滿額贈」：沒有購買商品，只拿其他通路訂單來領贈品
  const [redeemCount, setRedeemCount] = useState(0)    // 今日領贈品筆數
  const [perOrderLimit, setPerOrderLimit] = useState(null)   // 每單限購（只限逐日釋放商品）；null＝不限
  const merge = useMergeChannel()                 // 合併其他通路訂單（共用元件）
  const inputRef = useRef(null)
  const { signOut } = useAuth()

  useEffect(() => {
    inputRef.current?.focus()
    loadTodayStats()
    loadTiers()
    // 每單限購：開頁讀一次，之後每 60 秒更新（後台改數字不用重新整理）
    let alive = true
    const loadLimit = () => fetchPerOrderLimit().then(n => { if (alive) setPerOrderLimit(n) })
    loadLimit()
    const t = setInterval(loadLimit, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // 購物車清空（含逐項刪光）就把合併的其他通路訂單一併清掉，避免帶到下一位客人
  useEffect(() => {
    if (cartItems.length === 0 && !redeemMode) merge.reset([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.length === 0, redeemMode])

  // 滿額贈設定：開頁時讀一次，之後每完成一筆再重讀，後台改設定不用重新整理
  async function loadTiers() {
    const { data, error } = await supabase.from('promotion_tiers').select('*').eq('is_active', true)
      .order('threshold', { ascending: true })
    if (!error) setTiers(data ?? [])
  }

  // ── 快速鍵：F3 切換到攤位收款，方便全螢幕時免用滑鼠切換 ──
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'F3') { e.preventDefault(); navigate('/booth') }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  async function loadTodayStats() {
    // 以台灣時間 00:00 當每天起點（toISOString 是 UTC，早上 8 點前會算到前一天）
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }) + 'T00:00:00+08:00').toISOString()
    const { data } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('source', 'booth_cashier')
      .neq('status', 'pending')
      .gte('created_at', today)
    if (data) setTodayStats({
      count: data.length,
      total: data.reduce((s, r) => s + Number(r.total_amount), 0),
    })
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('source', 'gift_redeem').gte('created_at', today)
    setRedeemCount(count ?? 0)
  }

  // ── 刷讀條碼 ─────────────────────────────────────────────
  async function handleBarcodeScan(e) {
    e.preventDefault()
    const code = barcodeInput.trim()
    if (!code) return
    setBarcodeInput('')

    // 查詢商品（用條碼）
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, barcode, price, stamp_amount, stock, is_available, booth_stock, booth_low_alert, release_enabled')
      .eq('barcode', code)
      .eq('is_available', true)
      .limit(1)

    if (error || !products?.length) {
      toast(`找不到條碼「${code}」的商品`, 'error')
      inputRef.current?.focus()
      return
    }

    const p = products[0]

    // 每單限購（只限逐日釋放商品）：刷讀當下重新讀一次設定，超過就擋下、不加入
    const limit = await fetchPerOrderLimit()
    setPerOrderLimit(limit)
    const prevQty = cartItems.find(i => i.id === p.id)?.qty ?? 0
    if (p.release_enabled && limit != null && prevQty + 1 > limit) {
      toast(`「${p.name}」每單限購 ${limit} 件，已達上限，無法再刷讀`, 'error', 5000)
      inputRef.current?.focus()
      return
    }

    // 現場庫存提醒（只警告、不阻擋）：以「刷入後購物車數量」計算剩餘
    const newQty = (cartItems.find(i => i.id === p.id)?.qty ?? 0) + 1
    const st = boothStockState(p.booth_stock, p.booth_low_alert, newQty)
    addToCart(p)
    if (st) {
      toast(st.zero
        ? `「${p.name}」現場庫存已用完（系統剩 ${st.remaining} 件），仍可繼續銷售，請確認實際數量`
        : `「${p.name}」現場庫存剩 ${st.remaining} 件，低於提醒值 ${p.booth_low_alert}`,
        'warning', 6000)
    }
    inputRef.current?.focus()
  }

  function addToCart(product) {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id
          ? { ...i, qty: i.qty + 1, release_enabled: !!product.release_enabled, booth_stock: product.booth_stock ?? null, booth_low_alert: product.booth_low_alert ?? null }
          : i)
      }
      return [...prev, { id: product.id, name: product.name, barcode: product.barcode, price: product.price, stamp_amount: product.stamp_amount ?? 0,
        release_enabled: !!product.release_enabled,
        booth_stock: product.booth_stock ?? null, booth_low_alert: product.booth_low_alert ?? null, qty: 1 }]
    })
    toast(`✓ ${product.name} 已加入`, 'success', 1500)
  }

  function updateQty(id, delta) {
    // 每單限購：按「+」超過上限就擋下
    if (delta > 0 && perOrderLimit != null) {
      const cur = cartItems.find(i => i.id === id)
      if (cur?.release_enabled && cur.qty + delta > perOrderLimit) {
        toast(`「${cur.name}」每單限購 ${perOrderLimit} 件，已達上限`, 'error', 4000)
        return
      }
    }
    setCartItems(prev =>
      prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i)
        .filter(i => i.qty > 0)
    )
  }

  function removeItem(id) {
    setCartItems(prev => prev.filter(i => i.id !== id))
  }

  function clearCart() {
    setCartItems([])
    setPayMethod('cash')
    setLastSale(null)
    merge.reset([])
    inputRef.current?.focus()
  }

  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0)
  // 滿額贈品：本次現場購買的發票金額（扣郵票）＋ 合併的其他通路金額
  const stampSum   = cartItems.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.qty, 0)
  const invoiceAmt = total - stampSum
  const giftBase   = invoiceAmt + merge.sum
  const giftList   = computeGifts(tiers, giftBase).gifts

  // 寫入訂單；資料庫還沒執行 20 號 SQL（沒有 promo_gift_items）時只略過該欄，
  // 還沒執行 15 號 SQL（連 merged_orders／promo_gift 都沒有）時退回只存基本欄位，收款照常完成
  async function insertOrderCompat(row) {
    const ins = r => supabase.from('orders').insert(r).select('id, order_no').single()
    let res = await ins(row)
    if (res.error && /promo_gift_items/.test(res.error.message)) {
      const { promo_gift_items, ...rest } = row
      res = await ins(rest)
    }
    if (res.error && /merged_orders|promo_gift/.test(res.error.message)) {
      if (row.merged_orders?.length > 0) toast('資料庫尚未執行 15 號 SQL，合併訂單資訊未被記錄', 'error', 5000)
      const { merged_orders, promo_gift, promo_gift_items, ...base } = row
      res = await ins(base)
    }
    return res
  }

  // ── 預購領取滿額贈（沒有購買商品，只用其他通路訂單領贈品）──────────
  function startRedeem() {
    setRedeemMode(true)
    setLastSale(null)
    merge.reset([])
    merge.toggle(true)          // 勾選並打開輸入面板，查詢外掛也會跟著展開
  }
  function cancelRedeem() {
    setRedeemMode(false)
    merge.reset([])
    inputRef.current?.focus()
  }
  async function handleRedeem() {
    if (confirming) return
    if (merge.orders.length === 0) { toast('請先加入其他通路訂單', 'error'); return }
    if (giftList.length === 0) { toast('合併金額未達滿額門檻，沒有贈品可領', 'error'); return }
    setConfirming(true)
    try {
      const now = new Date().toISOString()
      const row = {
        receiver_name: '預購領贈品', receiver_phone: '—', receiver_address: '現場領取',
        total_amount: 0, status: 'delivered', payment_method: null,
        paid_at: now, shipped_at: now, source: 'gift_redeem',
        merged_orders:    merge.orders.map(m => ({ order_no: m.order_no, amount: m.amount })),
        promo_gift:       giftText(giftList),
        promo_gift_items: giftList.map(g => ({ name: g.name, qty: g.qty })),
      }
      const { data: order, error } = await insertOrderCompat(row)
      if (error) throw new Error(error.message)
      try { merge.notifyPaid?.(order.id, merge.orders) } catch {}   // 通知外掛把合併的商城單改成訂單處理中
      setLastSale({ order_no: order.order_no, total: 0, method: null, items: [], redeem: true,
        gift: giftText(giftList), merged: merge.orders.length })
      toast('✓ 已記錄領取滿額贈', 'success', 3000)
      setRedeemMode(false)
      merge.reset([])
      loadTodayStats()
    } catch (err) {
      toast('記錄失敗：' + err.message, 'error')
    }
    setConfirming(false)
  }

  // ── 確認收款 ─────────────────────────────────────────────
  async function handleConfirm() {
    if (cartItems.length === 0) { toast('購物車是空的', 'error'); return }
    setConfirming(true)

    try {
      // 每單限購：收款前再讀一次最新設定（可能剛被調低），有超過的品項就擋下、不建立訂單
      const limitNow = await fetchPerOrderLimit()
      setPerOrderLimit(limitNow)
      if (limitNow != null) {
        const over = cartItems.filter(i => i.release_enabled && i.qty > limitNow)
        if (over.length) {
          toast(`每單限購 ${limitNow} 件，請先減少：${over.map(i => `${i.name}（${i.qty}）`).join('、')}`, 'error', 7000)
          setConfirming(false)
          return
        }
      }

      // 建立已付款訂單（source = booth_cashier）
      const baseRow = {
        receiver_name:    '現場客戶',
        receiver_phone:   '—',
        receiver_address: '現場取貨',
        total_amount:     total,
        status:           'delivered',   // 現場交付，直接送達
        payment_method:   payMethod,
        paid_at:          new Date().toISOString(),
        shipped_at:       new Date().toISOString(),
        source:           'booth_cashier',
      }
      const mergeRow = {
        merged_orders:    merge.orders.map(m => ({ order_no: m.order_no, amount: m.amount })),
        promo_gift:       giftList.length ? giftText(giftList) : null,
        promo_gift_items: giftList.map(g => ({ name: g.name, qty: g.qty })),
      }
      let { data: order, error: orderErr } = await insertOrderCompat({ ...baseRow, ...mergeRow })

      if (orderErr) throw new Error(orderErr.message)

      // 寫入商品明細
      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(cartItems.map(i => ({
          order_id:        order.id,
          product_id:      i.id,
          product_name:    i.name,
          product_barcode: i.barcode,
          unit_price:      i.price,
          quantity:        i.qty,
          stamp_amount:    i.stamp_amount ?? 0,
        })))

      if (itemsErr) throw new Error(itemsErr.message)

      // 扣現場庫存（與預購庫存分開；失敗不影響這筆收款，只提醒）
      try {
        const { error: bsErr } = await supabase.rpc('booth_deduct_stock', { p_order_id: order.id })
        if (bsErr) throw bsErr
      } catch (e) {
        toast('現場庫存扣減失敗（這筆收款已完成）：' + (e.message ?? e), 'warning', 6000)
      }

      // 成功
      setLastSale({
        order_no: order.order_no,
        total,
        method: payMethod,
        items: [...cartItems],
        gift: giftList.length ? giftText(giftList) : '',
        merged: merge.orders.length,
      })
      toast(`✓ 收款完成！NT$${total.toLocaleString()}`, 'success', 4000)
      try { merge.notifyPaid?.(order.id, merge.orders) } catch {}   // 通知外掛把合併的商城單改成訂單處理中
      setCartItems([])
      setPayMethod('cash')
      merge.reset([])
      loadTodayStats()
      loadTiers()
      inputRef.current?.focus()

    } catch (err) {
      toast('收款失敗：' + err.message, 'error')
    }
    setConfirming(false)
  }

  // Enter 兩用：有輸入 = 查條碼，空白 = 確認收款
  async function handleKeyAction(e) {
    e.preventDefault()
    if (barcodeInput.trim()) {
      await handleBarcodeScan(e)
    } else if (cartItems.length > 0 && !confirming) {
      await handleConfirm()
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-stone-100">

      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-stone-900 text-white px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-black text-base leading-tight">{STORE.name}</h1>
          <p className="text-xs text-stone-400">現場收銀台</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/booth" title="快速鍵 F3"
            className="flex items-center gap-1.5 text-stone-300 hover:text-white text-xs border border-stone-700 hover:border-stone-500 rounded-lg px-3 py-2 transition-colors">
            攤位收款
            <span className="text-[10px] bg-stone-700 text-stone-300 px-1.5 py-0.5 rounded font-mono leading-none">F3</span>
          </Link>
          <Link to="/admin"
            className="flex items-center gap-1.5 text-stone-300 hover:text-white text-xs border border-stone-700 hover:border-stone-500 rounded-lg px-3 py-2 transition-colors">
            <Monitor size={13} /> 出貨管理後台
          </Link>
          <div className="text-right text-xs text-stone-400 border-l border-stone-700 pl-3 ml-1">
            <p>今日現場 {todayStats.count} 筆{redeemCount > 0 ? `・領贈品 ${redeemCount} 筆` : ''}</p>
            <p className="text-white font-bold text-sm">NT${todayStats.total.toLocaleString()}</p>
          </div>
          <button onClick={signOut} className="text-stone-400 hover:text-white p-2 ml-1">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ── 主體 ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ 左欄：條碼輸入 + 商品清單 ══════════════════════ */}
        <div className="flex flex-col bg-white border-r border-stone-200" style={{ width: '50%' }}>

          {/* 條碼輸入列 */}
          <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-stone-100 bg-stone-50">
            <form onSubmit={handleKeyAction} className="flex gap-2">
              <input
                ref={inputRef}
                className="input flex-1 font-mono text-sm"
                placeholder="刷讀商品條碼…"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                autoComplete="off"
              />
              {barcodeInput && (
                <button type="button" onClick={() => { setBarcodeInput(''); inputRef.current?.focus() }}
                  className="px-3 rounded-xl bg-stone-200 text-stone-500 hover:bg-stone-300 transition-colors">
                  <X size={16} />
                </button>
              )}
              <button type="submit" className="btn-primary px-4">
                <Search size={16} />
              </button>
            </form>
            <p className="text-xs text-stone-400 mt-1.5">
              {cartItems.length > 0
                ? '💡 輸入欄空白時按 ↵ Enter 可直接確認收款'
                : '💡 刷讀商品條碼加入清單，支援重複刷讀累加數量'}
            </p>
          </div>

          {/* 商品清單 */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-stone-300 gap-3">
                <ShoppingCart size={44} strokeWidth={1} />
                <p className="text-sm">刷讀條碼後商品會出現在這裡</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cartItems.map(item => (
                  <div key={item.id}
                    className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-900 text-sm truncate">{item.name}</p>
                      <div className="flex items-center gap-2">
                        {item.barcode && (
                          <p className="text-xs text-stone-400 font-mono">{item.barcode}</p>
                        )}
                        {item.stamp_amount > 0 && (
                          <p className="text-xs text-blue-500">📮 含郵票 NT${(item.stamp_amount * item.qty).toLocaleString()}</p>
                        )}
                      </div>
                      {item.release_enabled && perOrderLimit != null && item.qty >= perOrderLimit && (
                        <p className={`text-xs font-bold ${item.qty > perOrderLimit ? 'text-red-600' : 'text-amber-600'}`}>
                          🔒 每單限購 {perOrderLimit} 件{item.qty > perOrderLimit ? '，請減少數量' : '（已達上限）'}
                        </p>
                      )}
                      {(() => {
                        const st = boothStockState(item.booth_stock, item.booth_low_alert, item.qty)
                        return st && (
                          <p className="text-xs font-bold text-amber-600">
                            ⚠ {st.zero ? `現場庫存已用完（系統剩 ${st.remaining} 件）` : `現場庫存剩 ${st.remaining} 件（低於 ${item.booth_low_alert}）`}
                          </p>
                        )
                      })()}
                    </div>
                    {/* 數量調整 */}
                    <div className="flex items-center gap-1 bg-white rounded-xl border border-stone-200 px-1 py-1 flex-shrink-0">
                      <button onClick={() => updateQty(item.id, -1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 font-bold text-lg">
                        −
                      </button>
                      <span className="font-bold text-stone-800 w-6 text-center text-sm">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)}
                        disabled={item.release_enabled && perOrderLimit != null && item.qty >= perOrderLimit}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 font-bold text-lg disabled:opacity-30 disabled:cursor-not-allowed">
                        +
                      </button>
                    </div>
                    <span className="font-bold text-stone-900 w-20 text-right text-sm flex-shrink-0">
                      NT${(item.price * item.qty).toLocaleString()}
                    </span>
                    <button onClick={() => removeItem(item.id)}
                      className="text-stone-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 合計 + 清空 */}
          {cartItems.length > 0 && (
            <div className="flex-shrink-0 border-t border-stone-200 bg-white px-5 py-3 flex items-center justify-between">
              <button onClick={clearCart}
                className="text-xs text-stone-400 hover:text-red-400 transition-colors">
                清空清單
              </button>
              <div className="text-right">
                <p className="text-xs text-stone-400 mb-1">
                  共 {cartItems.reduce((s, i) => s + i.qty, 0)} 件
                </p>
                {(() => {
                  const stampTotal = cartItems.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.qty, 0)
                  const invoiceAmount = total - stampTotal
                  return (
                    <div>
                      <div className="flex items-center gap-2 justify-end">
                        {stampTotal > 0 && <span className="text-xs text-stone-400">實收</span>}
                        <span className="font-black text-3xl text-red-500">NT${total.toLocaleString()}</span>
                      </div>
                      {stampTotal > 0 && (
                        <div className="flex items-center gap-2 justify-end mt-0.5">
                          <span className="text-xs text-stone-400">發票</span>
                          <span className="font-semibold text-stone-500">NT${invoiceAmount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ══ 右欄：付款 ══════════════════════════════════════ */}
        <div className="flex flex-col overflow-y-auto bg-stone-50" style={{ width: '50%' }}>
          {cartItems.length === 0 && redeemMode ? (
            <div className="flex flex-col h-full px-8 py-6 gap-5">
              <div>
                <p className="font-black text-lg text-stone-800">🎁 預購領取滿額贈</p>
                <p className="text-xs text-stone-400 mt-0.5">客人沒有在現場購買，只用其他通路的訂單合併計算滿額領贈品</p>
              </div>
              <GiftCard tiers={tiers} invoice={0} mergedSum={merge.sum} />
              <MergeChannelRow merge={merge} />
              <button type="button" onClick={handleRedeem} disabled={confirming || merge.orders.length === 0 || giftList.length === 0}
                className="btn-primary w-full py-5 text-xl font-black rounded-2xl shadow-lg mt-auto disabled:opacity-40">
                <span className="flex items-center justify-start gap-3 pl-6">
                  {confirming ? '處理中…' : '確認領取（記錄並送出贈品）'}
                </span>
              </button>
              <button type="button" onClick={cancelRedeem} className="text-sm text-stone-400 hover:text-stone-600 -mt-2">取消</button>
            </div>
          ) : cartItems.length === 0 ? (
            // 空狀態：顯示上一筆紀錄
            <div className="flex flex-col items-center justify-center h-full px-8 gap-6">
              {lastSale ? (
                <div className="w-full bg-white rounded-2xl border border-green-200 p-6 text-center">
                  <div className="text-4xl mb-3">✅</div>
                  {lastSale.redeem
                    ? <p className="font-black text-2xl text-green-700 mb-1">已記錄領取</p>
                    : <p className="font-black text-2xl text-green-700 mb-1">NT${lastSale.total.toLocaleString()}</p>}
                  <p className="text-sm text-stone-500 mb-3">
                    {lastSale.redeem ? '預購領取滿額贈' : PAYMENT_LABELS[lastSale.method]} · {lastSale.order_no}
                  </p>
                  <div className="text-xs text-stone-400 space-y-0.5">
                    {lastSale.items.map(i => (
                      <p key={i.id}>{i.name} ×{i.qty}</p>
                    ))}
                  </div>
                  {lastSale.gift && (
                    <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                      🎁 應送：{lastSale.gift}{lastSale.merged > 0 ? `（含其他通路 ${lastSale.merged} 筆）` : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-stone-300 text-center">
                  <div className="text-6xl mb-3">🏪</div>
                  <p className="text-sm">刷讀商品後在這裡確認付款</p>
                </div>
              )}
              <button type="button" onClick={startRedeem}
                className="w-full max-w-sm border-2 border-dashed border-red-300 text-red-500 hover:bg-red-50 rounded-2xl py-3 text-sm font-bold">
                🎁 預購領取滿額贈（沒有購買商品）
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-full px-8 py-6 gap-5">

              {/* 付款方式 */}
              <div>
                <p className="text-xs font-semibold text-stone-400 tracking-widest mb-3">付款方式</p>
                <div className="flex gap-3">
                  {Object.entries(PAYMENT_LABELS)
                    .filter(([k]) => enabledPayMethods.includes(k))
                    .map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setPayMethod(k)}
                      className={`flex-1 py-4 rounded-2xl text-sm font-bold border-2 transition-all
                        ${payMethod === k
                          ? 'bg-stone-900 border-stone-900 text-white shadow-lg scale-105'
                          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
                        }`}>
                      <span className="block text-xl mb-1">{v.slice(0,2)}</span>
                      {v.slice(2)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 滿額贈品提示（現場購買＋其他通路合併）*/}
              <GiftCard tiers={tiers} invoice={invoiceAmt} mergedSum={merge.sum} />
              <MergeChannelRow merge={merge} />

              {/* 選了非現金付款、但購物車含郵票商品時，明顯提醒收款人員 */}
              {(() => {
                const stampTotal = cartItems.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.qty, 0)
                if (payMethod === 'cash' || stampTotal <= 0) return null
                return (
                  <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4 flex items-start gap-3 animate-pulse">
                    <span className="text-2xl flex-shrink-0">⚠️</span>
                    <div>
                      <p className="font-black text-amber-800 text-base leading-snug">
                        本筆含個人化郵票商品，郵票金額 NT${stampTotal.toLocaleString()} 須收現金！
                      </p>
                      <p className="text-amber-600 text-sm mt-1">
                        請向客人說明：{PAYMENT_LABELS[payMethod]?.slice(2)}僅能刷「NT${(total - stampTotal).toLocaleString()}」，郵票金額須另收現金 NT${stampTotal.toLocaleString()}。
                      </p>
                    </div>
                  </div>
                )
              })()}

              {/* 確認按鈕 */}
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="btn-primary w-full py-5 text-xl font-black rounded-2xl shadow-lg mt-auto"
              >
                {confirming ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    處理中…
                  </span>
                ) : (
                  <span className="flex items-center justify-start gap-3 pl-6">
                    確認收款 NT${total.toLocaleString()}
                    <kbd className="bg-white/20 text-white/90 text-sm px-2 py-1 rounded-lg font-mono">
                      ↵ Enter
                    </kbd>
                  </span>
                )}
              </button>

              {/* 來源標示 */}
              {(() => {
                const stampTotal = cartItems.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.qty, 0)
                const invoiceAmount = total - stampTotal
                return stampTotal > 0 ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-left text-xs text-blue-700">
                    <p>實收 <strong>NT${total.toLocaleString()}</strong> ／ 發票 <strong>NT${invoiceAmount.toLocaleString()}</strong></p>
                    <p className="text-blue-400 mt-0.5">含郵票 NT${stampTotal.toLocaleString()}</p>
                  </div>
                ) : (
                  <p className="text-left text-xs text-stone-400">此筆為現場銷售，將直接記錄為「已送達」</p>
                )
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 合併其他通路訂單面板（共用元件）*/}
      <MergeChannelModal merge={merge} giftBase={giftBase} giftList={giftList} />
    </div>
  )
}
