import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function OrderQuery() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSearch(e) {
    e.preventDefault()
    if (!input.trim()) return
    setLoading(true)

    const q = input.trim()

    // 先試訂單號查詢
    const { data: byNo } = await supabase
      .from('orders')
      .select('order_no, status, total_amount, created_at, receiver_name')
      .eq('order_no', q.toUpperCase())

    if (byNo?.length) {
      setResults(byNo)
      setLoading(false)
      return
    }

    // 再試手機號查詢
    const { data: byPhone } = await supabase
      .from('orders')
      .select('order_no, status, total_amount, created_at, receiver_name')
      .eq('receiver_phone', q)
      .order('created_at', { ascending: false })
      .limit(10)

    setResults(byPhone ?? [])
    setLoading(false)
  }

  function goToOrder(orderNo) {
    navigate(`/order/${orderNo}`)
  }

  const STATUS_MAP = {
    pending:   { label: '待結帳', bg: 'bg-stone-100', text: 'text-stone-600' },
    paid:      { label: '已付款', bg: 'bg-yellow-100', text: 'text-yellow-700' },
    picking:   { label: '揀貨中', bg: 'bg-blue-100', text: 'text-blue-700' },
    packed:    { label: '已包裝', bg: 'bg-purple-100', text: 'text-purple-700' },
    shipped:   { label: '已出貨', bg: 'bg-green-100', text: 'text-green-700' },
    delivered: { label: '已送達', bg: 'bg-teal-100', text: 'text-teal-700' },
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="btn-ghost p-2"><ArrowLeft size={20} /></Link>
          <h1 className="font-bold text-stone-900">查詢訂單</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 fade-up">
        <form onSubmit={handleSearch} className="space-y-3 mb-6">
          <p className="text-sm text-stone-500">輸入訂單號碼或手機號碼查詢</p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="ORD-20240602-0001 或 0912345678"
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-4 py-3 flex items-center gap-1"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Search size={18} />
              }
            </button>
          </div>
        </form>

        {results !== null && (
          results.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-semibold">查無相關訂單</p>
              <p className="text-sm mt-1">請確認訂單號碼或手機號碼是否正確</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-stone-400">找到 {results.length} 筆訂單</p>
              {results.map(order => {
                const st = STATUS_MAP[order.status] ?? STATUS_MAP.pending
                return (
                  <button
                    key={order.order_no}
                    onClick={() => goToOrder(order.order_no)}
                    className="card w-full p-4 text-left hover:border-red-300 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono font-bold text-stone-900 text-sm">{order.order_no}</span>
                      <span className={`badge ${st.bg} ${st.text}`}>{st.label}</span>
                    </div>
                    <div className="flex justify-between text-sm text-stone-500">
                      <span>{order.receiver_name}</span>
                      <span className="font-semibold text-stone-700">
                        NT${order.total_amount.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1">
                      {new Date(order.created_at).toLocaleString('zh-TW')}
                    </p>
                  </button>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
