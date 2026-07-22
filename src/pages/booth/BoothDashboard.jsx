import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, LogOut, Edit2, X, Monitor } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PAYMENT_LABELS, STORE } from '../../config/store'
import { useEnabledPaymentMethods } from '../../hooks/useEnabledPaymentMethods'
import { toast } from '../../components/StatusBadge'

export default function BoothDashboard() {
  const enabledPayMethods = useEnabledPaymentMethods()
  const [query, setQuery]           = useState('')
  const [order, setOrder]           = useState(null)
  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [payMethod, setPayMethod]   = useState('cash')
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 })
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
      .from('orders').select('total_amount').neq('status', 'pending').gte('created_at', today)
    if (data) setTodayStats({
      count: data.length,
      total: data.reduce((s, r) => s + r.total_amount, 0),
    })
  }

  // ── 搜尋 / 確認收款（Enter 兩用）────────────────────────
    async function handleSearch(e) {
      e.preventDefault()
    
      // 如果輸入欄有內容（代表剛刷讀進來），優先查詢，不觸發確認收款
      if (query.trim()) {
        // 有內容就直接往下查詢，不管目前是否有待收款訂單
      } else if (order?.status === 'pending' && !confirming) {
        // 輸入欄是空的才代表人工按 Enter 確認
        await confirmPayment(); return
      } else {
        return
      }
    // 如果掃到的是完整網址，自動抽出訂單號
    const raw = query.trim()
    const match = raw.match(/ORD-[\d-]+/)
    const q = match ? match[0] : raw.toUpperCase()
    if (!q) return
    setLoading(true); setOrder(null); setItems([]); setEditingPayment(false)
    const { data: ord } = await supabase.from('orders').select('*').eq('order_no', q).single()
    if (ord) {
      setOrder(ord); setPayMethod('cash')
      const { data: its } = await supabase.from('order_items').select('*').eq('order_id', ord.id)
      setItems(its ?? [])
    } else {
      toast('查無此訂單，請確認訂單號碼', 'error')
    }
    setLoading(false)
  }

  function handleClear() {
    setQuery(''); setOrder(null); setItems([]); setEditingPayment(false)
    inputRef.current?.focus()
  }

  // ── 確認收款 ─────────────────────────────────────────────
  async function confirmPayment() {
    if (!order || order.status !== 'pending') return
    setConfirming(true)
    const { error } = await supabase.from('orders').update({
      status: 'paid', payment_method: payMethod, paid_at: new Date().toISOString(),
    }).eq('id', order.id)

    if (error) {
      toast('更新失敗：' + error.message, 'error')
    } else {
      toast(`✓ 已確認收款（${PAYMENT_LABELS[payMethod]}）`, 'success')
      setOrder(prev => ({ ...prev, status: 'paid', payment_method: payMethod }))
      loadTodayStats()

      // ── 廣播給所有開著後台的人 ──────────────────────────
      try {
        const ch = supabase.channel('payment-events')
        ch.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await ch.send({
              type: 'broadcast',
              event: 'payment_confirmed',
              payload: {
                order_no:       order.order_no,
                receiver_name:  order.receiver_name,
                total_amount:   order.total_amount,
                payment_method: payMethod,
              },
            })
            supabase.removeChannel(ch)
          }
        })
      } catch {}
      // ────────────────────────────────────────────────────

      setTimeout(() => {
        setQuery(''); setOrder(null); setItems([]); inputRef.current?.focus()
      }, 1800)
    }
    setConfirming(false)
  }

  // ── 修改付款方式 ──────────────────────────────────────────
  function startEditPayment() { setEditPayMethod(order.payment_method); setEditingPayment(true) }
  async function saveEditPayment() {
    if (editPayMethod === order.payment_method) { setEditingPayment(false); return }
    const logEntry = { at: new Date().toISOString(), from: order.payment_method, to: editPayMethod }
    const newLog = [...(order.payment_log ?? []), logEntry]
    const { error } = await supabase.from('orders')
      .update({ payment_method: editPayMethod, payment_log: newLog }).eq('id', order.id)
    if (error) { toast('修改失敗：' + error.message, 'error') }
    else {
      toast(`✓ 付款方式已改為 ${PAYMENT_LABELS[editPayMethod]}`, 'success')
      setOrder(prev => ({ ...prev, payment_method: editPayMethod, payment_log: newLog }))
      setEditingPayment(false)
    }
  }

  const inputHint = order?.status === 'pending'
    ? '💡 確認付款方式後按 ↵ Enter 或條碼槍確認收款'
    : order ? '💡 輸入下一筆訂單號或掃描 QR Code'
    : '💡 掃描顧客手機上的 QR Code 後，條碼槍會自動填入訂單號'

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-stone-100">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-stone-900 text-white px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-black text-base leading-tight">{STORE.name}</h1>
          <p className="text-xs text-stone-400">攤位收款介面</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/cashier"
            className="flex items-center gap-1.5 text-stone-300 hover:text-white text-xs border border-stone-700 hover:border-stone-500 rounded-lg px-3 py-2 transition-colors">
            🏪 現場收銀台
          </Link>

          <Link to="/admin"
            className="flex items-center gap-1.5 text-stone-300 hover:text-white text-xs border border-stone-700 hover:border-stone-500 rounded-lg px-3 py-2 transition-colors">
            <Monitor size={13} /> 出貨管理後台
          </Link>
          <div className="text-right text-xs text-stone-400 border-l border-stone-700 pl-3 ml-1">
            <p>今日 {todayStats.count} 筆</p>
            <p className="text-white font-bold text-sm">NT${todayStats.total.toLocaleString()}</p>
          </div>
          <button onClick={signOut} className="text-stone-400 hover:text-white p-2 ml-1">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ── 主體：左右兩欄 ──────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ 左欄：搜尋 + 商品清單 ══════════════════════════ */}
        <div className="flex flex-col bg-white border-r border-stone-200" style={{ width:'45%' }}>
          <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-stone-100 bg-stone-50">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input ref={inputRef} className="input flex-1 font-mono text-sm"
                placeholder="ORD-20240602-0001" value={query}
                onChange={e => setQuery(e.target.value)} autoComplete="off" />
              {(query || order) && (
                <button type="button" onClick={handleClear}
                  className="px-3 rounded-xl bg-stone-200 text-stone-500 hover:bg-stone-300 transition-colors">
                  <X size={16} />
                </button>
              )}
              <button type="submit" disabled={loading} className="btn-primary px-4">
                {loading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin block" />
                  : <Search size={16} />
                }
              </button>
            </form>
            <p className="text-xs text-stone-400 mt-1.5">{inputHint}</p>
          </div>

          {/* 商品清單（可捲動）*/}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!order ? (
              <div className="flex flex-col items-center justify-center h-full text-stone-300 gap-3">
                <Search size={40} strokeWidth={1} />
                <p className="text-sm">掃描或輸入訂單號碼</p>
              </div>
            ) : (
              <>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-4
                  ${order.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${order.status === 'pending' ? 'bg-amber-500' : 'bg-green-500'}`} />
                  {order.status === 'pending' ? '待收款' : '已結帳'}
                  <span className="font-mono text-xs opacity-70 ml-1">{order.order_no}</span>
                </div>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2.5 px-3 bg-stone-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-stone-900 text-sm truncate">{item.product_name}</p>
                        {item.product_barcode && (
                          <p className="text-xs text-stone-400 font-mono">{item.product_barcode}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2 text-sm">
                        <span className="text-stone-400">×{item.quantity}</span>
                        <span className="font-bold text-stone-900 w-20 text-right">
                          NT${(item.unit_price * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 合計 */}
          {order && (
            <div className="flex-shrink-0 border-t border-stone-200 bg-white px-5 py-4">
              {(() => {
                const stampTotal = items.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.quantity, 0)
                const invoiceAmount = order.total_amount - stampTotal
                return (
                  <div className="flex justify-between items-start">
                    <span className="text-stone-500 font-medium pt-1">合計應收</span>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {stampTotal > 0 && <span className="text-xs text-stone-400">實收</span>}
                        <span className="font-black text-3xl text-red-500">
                          NT${order.total_amount.toLocaleString()}
                        </span>
                      </div>
                      {stampTotal > 0 && (
                        <div className="flex items-center gap-2 justify-end mt-0.5">
                          <span className="text-xs text-stone-400">發票</span>
                          <span className="font-semibold text-stone-500">NT${invoiceAmount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* ══ 右欄：顧客資訊 + 付款 ══════════════════════════ */}
        <div className="flex flex-col overflow-y-auto bg-stone-50" style={{ width:'55%' }}>
          {!order ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-300 gap-4">
              <div className="text-6xl">🧾</div>
              <p className="text-sm font-medium">掃描訂單後顯示顧客資訊</p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-shrink-0 px-8 pt-6 pb-4 border-b border-stone-200 bg-white">
                <p className="text-xs font-semibold text-stone-400 tracking-widest mb-2">收件人</p>
                <p className="font-black text-3xl text-stone-900 mb-1">{order.receiver_name}</p>
                <p className="text-stone-500 text-sm">{order.receiver_phone}</p>
                <p className="text-stone-500 text-sm">{order.receiver_address}</p>
                {order.note && (
                  <p className="text-amber-600 text-xs mt-1.5 bg-amber-50 px-2 py-1 rounded-lg inline-block">
                    備註：{order.note}
                  </p>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-between px-8 py-6">
                {order.status === 'pending' ? (
                  <div className="flex flex-col h-full gap-5">
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
                    <button onClick={confirmPayment} disabled={confirming}
                      className="btn-primary w-full py-5 text-xl font-black rounded-2xl shadow-lg mt-auto">
                      {confirming ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          確認中…
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-3">
                          確認收款 NT${order.total_amount.toLocaleString()}
                          <kbd className="bg-white/20 text-white/90 text-sm px-2 py-1 rounded-lg font-mono">
                            ↵ Enter
                          </kbd>
                        </span>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!editingPayment ? (
                      <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-green-800 text-lg">
                              ✅ 已收款（{PAYMENT_LABELS[order.payment_method]}）
                            </p>
                            <p className="text-xs text-green-600 mt-0.5">
                              {order.paid_at && new Date(order.paid_at).toLocaleString('zh-TW')}
                            </p>
                          </div>
                          <button onClick={startEditPayment}
                            className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 border border-green-300 px-3 py-1.5 rounded-xl transition-colors">
                            <Edit2 size={12} /> 修改
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-amber-300 bg-amber-50 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-amber-800">修改付款方式</p>
                          <button onClick={() => setEditingPayment(false)}
                            className="text-amber-600 hover:text-amber-900"><X size={16} /></button>
                        </div>
                        <div className="flex gap-2">
                          {Object.entries(PAYMENT_LABELS)
                            .filter(([k]) => enabledPayMethods.includes(k))
                            .map(([k, v]) => (
                            <button key={k} type="button" onClick={() => setEditPayMethod(k)}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all
                                ${editPayMethod === k
                                  ? 'bg-stone-900 border-stone-900 text-white'
                                  : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
                                }`}>
                              {v}
                            </button>
                          ))}
                        </div>
                        <button onClick={saveEditPayment} className="btn-primary w-full py-2.5 text-sm">
                          儲存修改
                        </button>
                      </div>
                    )}
                    {(order.payment_log ?? []).length > 0 && (
                      <div className="pt-3 border-t border-stone-200 space-y-1.5">
                        <p className="text-xs font-semibold text-stone-400 tracking-widest">修改紀錄</p>
                        {order.payment_log.map((log, i) => (
                          <div key={i} className="text-xs text-stone-400 flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-stone-300">
                              {new Date(log.at).toLocaleString('zh-TW', {
                                month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
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
        </div>
      </div>
    </div>
  )
}
