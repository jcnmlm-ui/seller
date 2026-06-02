import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, LogOut, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PAYMENT_LABELS, STORE } from '../../config/store'
import { toast } from '../../components/StatusBadge'

export default function BoothDashboard() {
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [payMethod, setPayMethod] = useState('cash')
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 })
  const inputRef = useRef(null)
  const { signOut } = useAuth()

  // 自動聚焦搜尋框（方便 QR 掃描槍輸入）
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

  async function handleSearch(e) {
    e.preventDefault()
    const q = query.trim().toUpperCase()
    if (!q) return
    setLoading(true)
    setOrder(null)
    setItems([])

    const { data: ord } = await supabase
      .from('orders')
      .select('*')
      .eq('order_no', q)
      .single()

    if (ord) {
      setOrder(ord)
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
        status: 'paid',
        payment_method: payMethod,
        paid_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    if (error) {
      toast('更新失敗：' + error.message, 'error')
    } else {
      toast(`✓ 已確認收款（${PAYMENT_LABELS[payMethod]}）`, 'success')
      setOrder(prev => ({ ...prev, status: 'paid', payment_method: payMethod }))
      loadTodayStats()
      // 清空搜尋，準備下一筆
      setTimeout(() => {
        setQuery('')
        setOrder(null)
        setItems([])
        inputRef.current?.focus()
      }, 1500)
    }
    setConfirming(false)
  }

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
            <button type="submit" disabled={loading} className="btn-primary px-4">
              {loading
                ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin block" />
                : <Search size={18} />
              }
            </button>
          </div>
          <p className="text-xs text-stone-400 mt-1.5">
            💡 掃描顧客手機上的 QR Code 後，條碼槍會自動填入訂單號
          </p>
        </form>

        {/* 訂單卡片 */}
        {order && (
          <div className="card overflow-hidden fade-up">
            {/* 狀態 Banner */}
            <div className={`px-4 py-3 flex items-center justify-between text-sm font-bold
              ${order.status === 'pending' ? 'bg-amber-400 text-amber-900' : 'bg-green-400 text-green-900'}`}>
              <span>
                {order.status === 'pending' ? '⏳ 待收款' : '✅ 已結帳'}
              </span>
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

              {/* 已付款顯示 */}
              {order.status !== 'pending' ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
                  ✅ 已收款（{PAYMENT_LABELS[order.payment_method]}）
                  <br />
                  <span className="text-xs text-green-600">
                    {order.paid_at && new Date(order.paid_at).toLocaleString('zh-TW')}
                  </span>
                </div>
              ) : (
                /* 收款確認 */
                <div>
                  <p className="label">付款方式</p>
                  <div className="flex gap-2 mb-4">
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                      <button
                        key={k}
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
                    {confirming
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          確認中…
                        </span>
                      : `確認收款 NT${order.total_amount.toLocaleString()}`
                    }
                  </button>
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
