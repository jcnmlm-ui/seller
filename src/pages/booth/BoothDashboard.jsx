import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, LogOut, ChevronRight, Edit2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PAYMENT_LABELS, STORE } from '../../config/store'
import { toast } from '../../components/StatusBadge'

export default function BoothDashboard() {
  const [query, setQuery]           = useState('')
  const [order, setOrder]           = useState(null)
  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [payMethod, setPayMethod]   = useState('cash')
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 })
  // 修改付款方式（已收款後）
  const [editingPayment, setEditingPayment] = useState(false)
  const [editPayMethod, setEditPayMethod]   = useState('cash')
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
      .neq('status', 'pending')
      .gte('created_at', today)
    if (data) {
      setTodayStats({
        count: data.length,
        total: data.reduce((s, r) => s + r.total_amount, 0),
      })
    }
  }

  function handleClear() {
  setQuery('')
  setOrder(null)
  setItems([])
  setEditingPayment(false)
  inputRef.current?.focus()
  }
  
  // ── 搜尋 / 確認收款（Enter 兩用）────────────────────────
  async function handleSearch(e) {
    e.preventDefault()

    // 若已有待收款訂單 → Enter = 確認收款
    if (order?.status === 'pending' && !confirming) {
      await confirmPayment()
      return
    }

    const q = query.trim().toUpperCase()
    if (!q) return
    setLoading(true)
    setOrder(null)
    setItems([])
    setEditingPayment(false)

    const { data: ord } = await supabase
      .from('orders')
      .select('*')
      .eq('order_no', q)
      .single()

    if (ord) {
      setOrder(ord)
      setPayMethod('cash')  // 每次查到訂單重設為現金
      const { data: its } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', ord.id)
      setItems(its ?? [])
    } else {
      toast('查無此訂單，請確認訂單號碼', 'error')
    }
    setLoading(false)
  }

  // ── 確認收款 ─────────────────────────────────────────────
  async function confirmPayment() {
    if (!order) return
    if (order.status !== 'pending') {
      toast('此訂單已結帳', 'error')
      return
    }
    setConfirming(true)
    const { error } = await supabase
      .from('orders')
      .update({
        status:         'paid',
        payment_method: payMethod,
        paid_at:        new Date().toISOString(),
      })
      .eq('id', order.id)

    if (error) {
      toast('更新失敗：' + error.message, 'error')
    } else {
      toast(`✓ 已確認收款（${PAYMENT_LABELS[payMethod]}）`, 'success')
      setOrder(prev => ({ ...prev, status: 'paid', payment_method: payMethod }))
      loadTodayStats()
      setTimeout(() => {
        setQuery('')
        setOrder(null)
        setItems([])
        inputRef.current?.focus()
      }, 1500)
    }
    setConfirming(false)
  }

  // ── 修改付款方式（已收款後）──────────────────────────────
  function startEditPayment() {
    setEditPayMethod(order.payment_method)
    setEditingPayment(true)
  }

  async function saveEditPayment() {
    if (editPayMethod === order.payment_method) {
      setEditingPayment(false)
      return
    }
    const logEntry = {
      at:   new Date().toISOString(),
      from: order.payment_method,
      to:   editPayMethod,
    }
    const newLog = [...(order.payment_log ?? []), logEntry]
    const { error } = await supabase
      .from('orders')
      .update({ payment_method: editPayMethod, payment_log: newLog })
      .eq('id', order.id)

    if (error) {
      toast('修改失敗：' + error.message, 'error')
    } else {
      toast(`✓ 付款方式已改為 ${PAYMENT_LABELS[editPayMethod]}`, 'success')
      setOrder(prev => ({ ...prev, payment_method: editPayMethod, payment_log: newLog }))
      setEditingPayment(false)
    }
  }

  // ── 搜尋框提示文字 ────────────────────────────────────────
  const inputHint = order?.status === 'pending'
    ? '💡 確認付款方式後按 ↵ Enter 或條碼槍確認收款'
    : order
    ? '💡 輸入下一筆訂單號或掃描 QR Code'
    : '💡 掃描顧客手機上的 QR Code 後，條碼槍會自動填入訂單號'

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-stone-900 text-white px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-black text-lg">{STORE.name}</h1>
          <p className="text-xs text-stone-400">攤位收款介面</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-stone-400">
            <p>今日 {todayStats.count} 筆</p>
            <p className="text-white font-bold">NT${todayStats.total.toLocaleString()}</p>
          </div>
          <button onClick={signOut} className="text-stone-400 hover:text-white p-2">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 fade-up">

        {/* 搜尋框 */}
        <form onSubmit={handleSearch} className="mb-5">
          <label className="label">掃描或輸入訂單號碼</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input flex-1 font-mono"
              placeholder="ORD-20240602-0001"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
            {/* 清除按鈕：有內容時才顯示 */}
            {(query || order) && (
              <button
                type="button"
                onClick={handleClear}
                className="px-3 rounded-xl bg-stone-200 text-stone-500 hover:bg-stone-300 hover:text-stone-700 transition-colors"
                title="清除"
              >
                <X size={18} />
              </button>
            )}
            <button type="submit" disabled={loading} className="btn-primary px-4">
              {loading
                ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin block" />
                : <Search size={18} />
              }
            </button>
          </div>
          <p className="text-xs text-stone-400 mt-1.5">{inputHint}</p>
        </form>

        {/* 訂單卡片 */}
        {order && (
          <div className="card overflow-hidden fade-up">
            {/* 狀態 Banner */}
            <div className={`px-4 py-3 flex items-center justify-between text-sm font-bold
              ${order.status === 'pending' ? 'bg-amber-400 text-amber-900' : 'bg-green-400 text-green-900'}`}>
              <span>{order.status === 'pending' ? '⏳ 待收款' : '✅ 已結帳'}</span>
              <span className="font-mono text-xs">{order.order_no}</span>
            </div>

            <div className="p-5 space-y-4">
              {/* 收件人 */}
              <div>
                <p className="label">收件人</p>
                <p className="font-bold text-stone-900">{order.receiver_name}</p>
                <p className="text-sm text-stone-500">{order.receiver_phone}</p>
                <p className="text-sm text-stone-500">{order.receiver_address}</p>
              </div>

              {/* 商品清單 */}
              <div>
                <p className="label">訂購商品</p>
                <div className="bg-stone-50 rounded-xl divide-y divide-stone-100">
                  {items.map(item => (
                    <div key={item.id} className="flex justify-between items-center px-3 py-2.5 text-sm">
                      <div>
                        <span className="font-medium text-stone-800">{item.product_name}</span>
                        {item.product_barcode && (
                          <span className="text-xs text-stone-400 font-mono ml-2">{item.product_barcode}</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-stone-500">×{item.quantity}</span>
                        <span className="font-bold text-stone-900 ml-2">
                          NT${(item.unit_price * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-2 px-1">
                  <span className="text-stone-500 text-sm">合計應收</span>
                  <span className="font-black text-2xl text-red-500">
                    NT${order.total_amount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* ── 待收款：付款方式選擇 + 確認 ── */}
              {order.status === 'pending' ? (
                <div>
                  <p className="label">付款方式</p>
                  <div className="flex gap-2 mb-4">
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPayMethod(k)}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all
                          ${payMethod === k
                            ? 'bg-stone-900 border-stone-900 text-white'
                            : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
                          }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={confirmPayment}
                    disabled={confirming}
                    className="btn-primary w-full py-4 text-base"
                  >
                    {confirming ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        確認中…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        確認收款 NT${order.total_amount.toLocaleString()}
                        <kbd className="bg-white/20 text-white/90 text-xs px-1.5 py-0.5 rounded font-mono">
                          ↵ Enter
                        </kbd>
                      </span>
                    )}
                  </button>
                </div>
              ) : (
                /* ── 已收款：顯示 + 可修改付款方式 ── */
                <div>
                  {!editingPayment ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold">✅ 已收款（{PAYMENT_LABELS[order.payment_method]}）</p>
                          <p className="text-xs text-green-600 mt-0.5">
                            {order.paid_at && new Date(order.paid_at).toLocaleString('zh-TW')}
                          </p>
                        </div>
                        <button
                          onClick={startEditPayment}
                          className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 border border-green-300 px-2 py-1 rounded-lg transition-colors"
                        >
                          <Edit2 size={11} /> 修改
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 修改付款方式 UI */
                    <div className="border border-amber-300 bg-amber-50 rounded-xl p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-amber-800">修改付款方式</p>
                        <button onClick={() => setEditingPayment(false)}
                          className="text-amber-600 hover:text-amber-900">
                          <X size={16} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setEditPayMethod(k)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all
                              ${editPayMethod === k
                                ? 'bg-stone-900 border-stone-900 text-white'
                                : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
                              }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={saveEditPayment}
                        className="btn-primary w-full py-2.5 text-sm"
                      >
                        儲存修改
                      </button>
                    </div>
                  )}

                  {/* 修改紀錄時間戳記 */}
                  {(order.payment_log ?? []).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
                      <p className="text-xs font-semibold text-stone-400 tracking-widest">修改紀錄</p>
                      {(order.payment_log).map((log, i) => (
                        <div key={i} className="text-xs text-stone-400 flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-stone-300">
                            {new Date(log.at).toLocaleString('zh-TW', {
                              month:'2-digit', day:'2-digit',
                              hour:'2-digit', minute:'2-digit',
                            })}
                          </span>
                          <span>
                            付款方式由
                            <strong className="text-stone-500 mx-1">{PAYMENT_LABELS[log.from]}</strong>
                            改為
                            <strong className="text-stone-500 ml-1">{PAYMENT_LABELS[log.to]}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 後台連結 */}
        <div className="mt-8 flex flex-col gap-2">
          <Link to="/admin" className="flex items-center justify-between bg-white border border-stone-200 rounded-xl p-4 hover:border-stone-400 transition-colors">
            <span className="font-semibold text-stone-700">🖥️ 出貨管理後台</span>
            <ChevronRight size={18} className="text-stone-400" />
          </Link>
        </div>
      </div>
    </div>
  )
}
