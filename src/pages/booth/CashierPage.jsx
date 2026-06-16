import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, LogOut, Trash2, Plus, Minus, ShoppingCart } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { STORE, PAYMENT_LABELS } from '../../config/store'
import { toast } from '../../components/StatusBadge'

export default function CashierPage() {
  const [cartItems, setCartItems]   = useState([])   // [{ id, name, barcode, price, qty }]
  const [barcodeInput, setBarcodeInput] = useState('')
  const [payMethod, setPayMethod]   = useState('cash')
  const [confirming, setConfirming] = useState(false)
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 })
  const [lastSale, setLastSale]     = useState(null)  // 上一筆成功紀錄
  const inputRef = useRef(null)
  const { signOut } = useAuth()

  useEffect(() => {
    inputRef.current?.focus()
    loadTodayStats()
  }, [])

  async function loadTodayStats() {
    const today = new Date().toISOString().slice(0, 10)
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
      .select('id, name, barcode, price, stock, is_available')
      .eq('barcode', code)
      .eq('is_available', true)
      .limit(1)

    if (error || !products?.length) {
      toast(`找不到條碼「${code}」的商品`, 'error')
      inputRef.current?.focus()
      return
    }

    const p = products[0]
    addToCart(p)
    inputRef.current?.focus()
  }

  function addToCart(product) {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { id: product.id, name: product.name, barcode: product.barcode, price: product.price, qty: 1 }]
    })
    toast(`✓ ${product.name} 已加入`, 'success', 1500)
  }

  function updateQty(id, delta) {
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
    inputRef.current?.focus()
  }

  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0)

  // ── 確認收款 ─────────────────────────────────────────────
  async function handleConfirm() {
    if (cartItems.length === 0) { toast('購物車是空的', 'error'); return }
    setConfirming(true)

    try {
      // 建立已付款訂單（source = booth_cashier）
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          receiver_name:    '現場客戶',
          receiver_phone:   '—',
          receiver_address: '現場取貨',
          total_amount:     total,
          status:           'delivered',   // 現場交付，直接送達
          payment_method:   payMethod,
          paid_at:          new Date().toISOString(),
          shipped_at:       new Date().toISOString(),
          source:           'booth_cashier',
        })
        .select('id, order_no')
        .single()

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

      // 成功
      setLastSale({
        order_no: order.order_no,
        total,
        method: payMethod,
        items: [...cartItems],
      })
      toast(`✓ 收款完成！NT$${total.toLocaleString()}`, 'success', 4000)
      setCartItems([])
      setPayMethod('cash')
      loadTodayStats()
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
          <Link to="/booth"
            className="flex items-center gap-1.5 text-stone-300 hover:text-white text-xs border border-stone-700 hover:border-stone-500 rounded-lg px-3 py-2 transition-colors">
            攤位收款
          </Link>
          <Link to="/admin"
            className="flex items-center gap-1.5 text-stone-300 hover:text-white text-xs border border-stone-700 hover:border-stone-500 rounded-lg px-3 py-2 transition-colors">
            出貨後台
          </Link>
          <div className="text-right text-xs text-stone-400 border-l border-stone-700 pl-3 ml-1">
            <p>今日現場 {todayStats.count} 筆</p>
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
                      {item.barcode && (
                        <p className="text-xs text-stone-400 font-mono">{item.barcode}</p>
                      )}
                    </div>
                    {/* 數量調整 */}
                    <div className="flex items-center gap-1 bg-white rounded-xl border border-stone-200 px-1 py-1 flex-shrink-0">
                      <button onClick={() => updateQty(item.id, -1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 font-bold text-lg">
                        −
                      </button>
                      <span className="font-bold text-stone-800 w-6 text-center text-sm">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 font-bold text-lg">
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
          {cartItems.length === 0 ? (
            // 空狀態：顯示上一筆紀錄
            <div className="flex flex-col items-center justify-center h-full px-8 gap-6">
              {lastSale ? (
                <div className="w-full bg-white rounded-2xl border border-green-200 p-6 text-center">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-black text-2xl text-green-700 mb-1">
                    NT${lastSale.total.toLocaleString()}
                  </p>
                  <p className="text-sm text-stone-500 mb-3">
                    {PAYMENT_LABELS[lastSale.method]} · {lastSale.order_no}
                  </p>
                  <div className="text-xs text-stone-400 space-y-0.5">
                    {lastSale.items.map(i => (
                      <p key={i.id}>{i.name} ×{i.qty}</p>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-stone-300 text-center">
                  <div className="text-6xl mb-3">🏪</div>
                  <p className="text-sm">刷讀商品後在這裡確認付款</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full px-8 py-6 gap-5">

              {/* 付款方式 */}
              <div>
                <p className="text-xs font-semibold text-stone-400 tracking-widest mb-3">付款方式</p>
                <div className="flex gap-3">
                  {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
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
                  <span className="flex items-center justify-center gap-3">
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
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center text-xs text-blue-700">
                    <p>實收 <strong>NT${total.toLocaleString()}</strong> ／ 發票 <strong>NT${invoiceAmount.toLocaleString()}</strong></p>
                    <p className="text-blue-400 mt-0.5">含郵票 NT${stampTotal.toLocaleString()}</p>
                  </div>
                ) : (
                  <p className="text-center text-xs text-stone-400">此筆為現場銷售，將直接記錄為「已送達」</p>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
