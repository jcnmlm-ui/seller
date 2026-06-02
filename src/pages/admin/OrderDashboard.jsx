import { useEffect, useState, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { STATUS_CONFIG, STORE } from '../../config/store'
import { StatusBadge, toast } from '../../components/StatusBadge'
import ShippingSlipA4 from '../../components/print/ShippingSlipA4'
import WaybillA5 from '../../components/print/WaybillA5'
import { LogOut, Package, Search, Printer, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

const TABS = ['paid', 'picking', 'packed', 'shipped']
const TAB_LABELS = { paid: '待揀貨', picking: '揀貨中', packed: '已包裝', shipped: '已出貨' }

export default function OrderDashboard() {
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('paid')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [orderItems, setOrderItems] = useState({})
  const [newAlert, setNewAlert] = useState(false)
  const [printTarget, setPrintTarget] = useState(null)
  const [printType, setPrintType] = useState('a4')
  const printRef = useRef(null)
  const { signOut } = useAuth()

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setOrders(data ?? [])
  }, [])

  useEffect(() => {
    loadOrders()
    const channel = supabase.channel('orders-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setNewAlert(true)
          setTimeout(() => setNewAlert(false), 5000)
          toast('🔔 新訂單到了！', 'success', 5000)
        }
        loadOrders()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadOrders])

  async function loadItems(orderId) {
    if (orderItems[orderId]) return
    const { data } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
    setOrderItems(prev => ({ ...prev, [orderId]: data ?? [] }))
  }

  async function toggleExpand(orderId) {
    if (expanded === orderId) {
      setExpanded(null)
    } else {
      setExpanded(orderId)
      await loadItems(orderId)
    }
  }

  async function updateStatus(order, nextStatus) {
    const updates = {
      status: nextStatus,
      ...(nextStatus === 'shipped' ? { shipped_at: new Date().toISOString() } : {}),
    }
    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', order.id)
    if (error) {
      toast('更新失敗', 'error')
    } else {
      toast(`✓ 已更新為「${STATUS_CONFIG[nextStatus]?.label}」`, 'success')
      loadOrders()
    }
  }

  // 列印 A4
  const printA4 = useReactToPrint({
    content: () => printRef.current,
    pageStyle: '@page { size: A4 portrait; margin: 12mm; }',
    onAfterPrint: () => setPrintTarget(null),
  })

  // 列印 A5
  const printA5 = useReactToPrint({
    content: () => printRef.current,
    pageStyle: '@page { size: A5 portrait; margin: 8mm; }',
    onAfterPrint: () => setPrintTarget(null),
  })

  // flushSync 強制 React 同步更新 DOM，確保 printRef 有內容後才呼叫列印
  async function handlePrint(order, type) {
    await loadItems(order.id)
    flushSync(() => {
      setPrintType(type)
      setPrintTarget(order)
    })
    // DOM 已同步更新，直接列印
    if (type === 'a4') printA4()
    else printA5()
  }

  const displayed = orders
    .filter(o => o.status === filter)
    .filter(o =>
      !search || o.order_no.includes(search.toUpperCase())
        || o.receiver_name.includes(search)
        || o.receiver_phone.includes(search)
    )

  const counts = TABS.reduce((acc, t) => {
    acc[t] = orders.filter(o => o.status === t).length
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Header */}
      <header className="bg-stone-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-black text-lg">{STORE.name}</h1>
          <span className="text-stone-400 text-sm">出貨管理後台</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadOrders} className="text-stone-400 hover:text-white p-2" title="重新整理">
            <RefreshCw size={16} />
          </button>
          <Link to="/admin/products" className="text-stone-400 hover:text-white text-sm">
            <Package size={18} />
          </Link>
          <Link to="/booth" className="text-stone-400 hover:text-white text-sm">攤位</Link>
          <button onClick={signOut} className="text-stone-400 hover:text-white p-2">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* 新訂單提示 */}
      {newAlert && (
        <div className="bg-green-400 text-green-900 px-6 py-3 font-bold text-center animate-pulse">
          🔔 有新訂單！請查看「待揀貨」分頁
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-5">
        {/* 狀態分頁 */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-stone-200 mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold whitespace-nowrap transition-all
                ${filter === t
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }`}
            >
              {TAB_LABELS[t]}
              {counts[t] > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs
                  ${filter === t ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'}`}>
                  {counts[t]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 搜尋 */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="搜尋訂單號、姓名、電話…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* 訂單列表 */}
        {displayed.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <p className="text-4xl mb-3">📭</p>
            <p>目前沒有{TAB_LABELS[filter]}的訂單</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                items={orderItems[order.id]}
                isExpanded={expanded === order.id}
                onToggle={() => toggleExpand(order.id)}
                onUpdateStatus={(next) => updateStatus(order, next)}
                onPrint={(type) => handlePrint(order, type)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 列印元件 — ref 永遠掛在 DOM，只有內容是條件式 */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={printRef}>
          {printTarget && (
            printType === 'a4'
              ? <ShippingSlipA4 order={printTarget} items={orderItems[printTarget.id] ?? []} />
              : <WaybillA5 order={printTarget} items={orderItems[printTarget.id] ?? []} />
          )}
        </div>
      </div>
    </div>
  )
}

function OrderCard({ order, items, isExpanded, onToggle, onUpdateStatus, onPrint }) {
  const cfg = STATUS_CONFIG[order.status]
  const PAYMENT_LABELS = { cash: '💵 現金', card: '💳 刷卡', taiwan_pay: '📱 台灣PAY' }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-stone-900 text-sm">{order.order_no}</span>
            <StatusBadge status={order.status} />
            {order.payment_method && (
              <span className="text-xs text-stone-400">{PAYMENT_LABELS[order.payment_method]}</span>
            )}
          </div>
          <p className="text-sm text-stone-500 mt-0.5">
            {order.receiver_name} · {order.receiver_phone}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-black text-stone-900">NT${order.total_amount.toLocaleString()}</p>
          <p className="text-xs text-stone-400">
            {new Date(order.created_at).toLocaleString('zh-TW', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            })}
          </p>
        </div>
        {isExpanded
          ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" />
          : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />
        }
      </div>

      {isExpanded && (
        <div className="border-t border-stone-100 px-4 py-4 space-y-4">
          <div className="text-sm">
            <span className="text-stone-400">收件地址：</span>
            <span className="text-stone-700">{order.receiver_address}</span>
            {order.note && <span className="text-stone-400 ml-2">（備註：{order.note}）</span>}
          </div>

          {items ? (
            <div className="bg-stone-50 rounded-lg divide-y divide-stone-100">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-stone-800">{item.product_name}</span>
                    {item.product_barcode && (
                      <span className="text-xs text-stone-400 font-mono ml-2 bg-stone-200 px-1.5 py-0.5 rounded">
                        {item.product_barcode}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-stone-500">×{item.quantity}</span>
                    <span className="font-bold w-20 text-right">
                      NT${(item.unit_price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center py-4">
              <span className="w-5 h-5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onPrint('a4')}
              className="flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-stone-200 transition-colors"
            >
              <Printer size={14} /> A4 出貨單
            </button>
            <button
              onClick={() => onPrint('a5')}
              className="flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-stone-200 transition-colors"
            >
              <Printer size={14} /> A5 託運單
            </button>

            {cfg?.next && (
              <button
                onClick={() => onUpdateStatus(cfg.next)}
                className="ml-auto btn-primary text-sm py-2 px-4"
              >
                {cfg.nextLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
