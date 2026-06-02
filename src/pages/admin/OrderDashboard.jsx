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
import { LogOut, Package, Search, Printer, ChevronDown, ChevronUp, RefreshCw, X, Truck } from 'lucide-react'

const TABS = ['paid', 'picking', 'packed', 'shipped']
const TAB_LABELS = { paid: '待揀貨', picking: '揀貨中', packed: '已包裝', shipped: '已出貨' }

// ── 追蹤號碼輸入 Modal ───────────────────────────────────────
function TrackingModal({ order, onConfirm, onClose }) {
  const [trackingNo, setTrackingNo] = useState(order.tracking_no ?? '')
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-green-500" />
            <h2 className="font-bold text-stone-900">輸入包裹追蹤號碼</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-stone-500">
            輸入後顧客可在訂單頁面看到追蹤連結，方便至郵局官網查詢包裹狀態。
          </p>
          <div>
            <label className="label">追蹤號碼（選填）</label>
            <input
              ref={inputRef}
              className="input font-mono tracking-widest"
              placeholder="例：RO123456789TW"
              value={trackingNo}
              onChange={e => setTrackingNo(e.target.value.toUpperCase())}
            />
            <p className="text-xs text-stone-400 mt-1">
              不輸入也可直接確認出貨，之後可再編輯補充
            </p>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">取消</button>
          <button
            onClick={() => onConfirm(trackingNo.trim())}
            className="btn-primary flex-1 text-sm"
          >
            確認出貨
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主元件 ───────────────────────────────────────────────────
export default function OrderDashboard() {
  const [orders, setOrders]       = useState([])
  const [filter, setFilter]       = useState('paid')
  const [search, setSearch]       = useState('')
  const [expanded, setExpanded]   = useState(null)
  const [orderItems, setOrderItems] = useState({})
  const [newAlert, setNewAlert]   = useState(false)
  const [printTarget, setPrintTarget] = useState(null)
  const [printType, setPrintType] = useState('a4')
  const [trackingModal, setTrackingModal] = useState(null) // order 物件
  const printRef = useRef(null)
  // 自動列印旗標：active=true 代表印完A4後自動觸發A6
  const autoPrint = useRef({ active: false })
  const { signOut } = useAuth()

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders').select('*')
      .order('created_at', { ascending: false }).limit(200)
    setOrders(data ?? [])
  }, [])

  useEffect(() => {
    loadOrders()
    const channel = supabase.channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        if (payload.eventType === 'INSERT') {
          setNewAlert(true)
          setTimeout(() => setNewAlert(false), 5000)
          toast('🔔 新訂單到了！', 'success', 5000)
        }
        loadOrders()
      }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadOrders])

  async function loadItems(orderId) {
    if (orderItems[orderId]) return
    const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId)
    setOrderItems(prev => ({ ...prev, [orderId]: data ?? [] }))
  }

  async function toggleExpand(orderId) {
    if (expanded === orderId) { setExpanded(null); return }
    setExpanded(orderId)
    await loadItems(orderId)
  }

  async function updateStatus(order, nextStatus, extra = {}) {
    const updates = {
      status: nextStatus,
      ...extra,
      ...(nextStatus === 'shipped' ? { shipped_at: new Date().toISOString() } : {}),
    }
    const { error } = await supabase.from('orders').update(updates).eq('id', order.id)
    if (error) { toast('更新失敗', 'error') }
    else {
      toast(`✓ 已更新為「${STATUS_CONFIG[nextStatus]?.label}」`, 'success')
      loadOrders()
    }
  }

  // ── 列印（手動）──────────────────────────────────────────
  const printA4 = useReactToPrint({
    content: () => printRef.current,
    pageStyle: '@page { size: A4 portrait; margin: 12mm; }',
    onAfterPrint: () => {
      if (autoPrint.current.active) {
        // A4 印完 → 自動接著印 A6
        flushSync(() => setPrintType('a6'))
        setTimeout(() => printA6(), 150)
      } else {
        setPrintTarget(null)
      }
    },
  })

  const printA6 = useReactToPrint({
    content: () => printRef.current,
    pageStyle: '@page { size: A6 portrait; margin: 6mm; }',
    onAfterPrint: () => {
      autoPrint.current.active = false
      setPrintTarget(null)
    },
  })

  function handlePrint(order, type) {
    autoPrint.current.active = false
    loadItems(order.id).then(() => {
      flushSync(() => { setPrintType(type); setPrintTarget(order) })
      if (type === 'a4') printA4()
      else printA6()
    })
  }

  // ── 開始揀貨：先更新狀態，再自動連續列印 A4 + A6 ─────────
  async function handleStartPicking(order) {
    // 1. 更新狀態 paid → picking
    await updateStatus(order, 'picking')
    // 2. 載入商品
    await loadItems(order.id)
    // 重新取最新 order 資料（確保 picking 狀態寫入）
    const { data: fresh } = await supabase
      .from('orders').select('*').eq('id', order.id).single()
    // 3. 啟動自動列印：先 A4，onAfterPrint 後自動 A6
    autoPrint.current.active = true
    flushSync(() => { setPrintType('a4'); setPrintTarget(fresh ?? order) })
    printA4()
  }

  // ── 確認出貨：先輸入追蹤號，再更新 ───────────────────────
  function handleConfirmShipClick(order) {
    setTrackingModal(order)
  }

  async function handleConfirmShipWithTracking(trackingNo) {
    const order = trackingModal
    setTrackingModal(null)
    await updateStatus(order, 'shipped', { tracking_no: trackingNo || null })
  }

  const displayed = orders
    .filter(o => o.status === filter)
    .filter(o => !search
      || o.order_no.includes(search.toUpperCase())
      || o.receiver_name.includes(search)
      || o.receiver_phone.includes(search)
    )

  const counts = TABS.reduce((acc, t) => ({ ...acc, [t]: orders.filter(o => o.status === t).length }), {})

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
          <Link to="/admin/products" className="text-stone-400 hover:text-white"><Package size={18} /></Link>
          <Link to="/booth" className="text-stone-400 hover:text-white text-sm">攤位</Link>
          <button onClick={signOut} className="text-stone-400 hover:text-white p-2"><LogOut size={18} /></button>
        </div>
      </header>

      {newAlert && (
        <div className="bg-green-400 text-green-900 px-6 py-3 font-bold text-center animate-pulse">
          🔔 有新訂單！請查看「待揀貨」分頁
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-5">
        {/* 狀態分頁 */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-stone-200 mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold whitespace-nowrap transition-all
                ${filter === t ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'}`}>
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
          <input className="input pl-9 text-sm" placeholder="搜尋訂單號、姓名、電話…"
            value={search} onChange={e => setSearch(e.target.value)} />
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
              <OrderCard key={order.id}
                order={order}
                items={orderItems[order.id]}
                isExpanded={expanded === order.id}
                onToggle={() => toggleExpand(order.id)}
                onStartPicking={() => handleStartPicking(order)}
                onUpdateStatus={next => updateStatus(order, next)}
                onConfirmShip={() => handleConfirmShipClick(order)}
                onPrint={type => handlePrint(order, type)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 隱藏列印元件 */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={printRef}>
          {printTarget && (
            printType === 'a4'
              ? <ShippingSlipA4 order={printTarget} items={orderItems[printTarget.id] ?? []} />
              : <WaybillA5 order={printTarget} items={orderItems[printTarget.id] ?? []} />
          )}
        </div>
      </div>

      {/* 追蹤號碼 Modal */}
      {trackingModal && (
        <TrackingModal
          order={trackingModal}
          onConfirm={handleConfirmShipWithTracking}
          onClose={() => setTrackingModal(null)}
        />
      )}
    </div>
  )
}

// ── 訂單卡片 ─────────────────────────────────────────────────
function OrderCard({ order, items, isExpanded, onToggle, onStartPicking, onUpdateStatus, onConfirmShip, onPrint }) {
  const cfg = STATUS_CONFIG[order.status]
  const PAYMENT_LABELS = { cash: '💵 現金', card: '💳 刷卡', taiwan_pay: '📱 台灣PAY' }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* 訂單頭 */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
           onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-stone-900 text-sm">{order.order_no}</span>
            <StatusBadge status={order.status} />
            {order.payment_method && (
              <span className="text-xs text-stone-400">{PAYMENT_LABELS[order.payment_method]}</span>
            )}
            {/* 已出貨且有追蹤號碼 */}
            {order.tracking_no && (
              <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-mono">
                📦 {order.tracking_no}
              </span>
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
              month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
            })}
          </p>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" />
                    : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />}
      </div>

      {/* 展開內容 */}
      {isExpanded && (
        <div className="border-t border-stone-100 px-4 py-4 space-y-4">
          {/* 地址 */}
          <div className="text-sm">
            <span className="text-stone-400">收件地址：</span>
            <span className="text-stone-700">{order.receiver_address}</span>
            {order.note && <span className="text-stone-400 ml-2">（備註：{order.note}）</span>}
          </div>

          {/* 商品明細 */}
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

          {/* 操作按鈕 */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* 列印（手動） */}
            <button onClick={() => onPrint('a4')}
              className="flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-stone-200 transition-colors">
              <Printer size={14} /> A4 出貨單
            </button>
            <button onClick={() => onPrint('a6')}
              className="flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-stone-200 transition-colors">
              <Printer size={14} /> A6 託運單
            </button>

            {/* 狀態推進 */}
            <div className="ml-auto">
              {order.status === 'paid' && (
                // 待揀貨 → 開始揀貨：自動列印 A4+A6 後更新狀態
                <button onClick={onStartPicking}
                  className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5">
                  <Printer size={14} /> 開始揀貨（自動列印）
                </button>
              )}
              {order.status === 'picking' && (
                <button onClick={() => onUpdateStatus('packed')}
                  className="btn-primary text-sm py-2 px-4">
                  完成包裝 →
                </button>
              )}
              {order.status === 'packed' && (
                // 已包裝 → 確認出貨：先輸入追蹤號
                <button onClick={onConfirmShip}
                  className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5">
                  <Truck size={14} /> 確認出貨
                </button>
              )}
              {order.status === 'shipped' && (
                <button onClick={() => onUpdateStatus('delivered')}
                  className="bg-teal-500 text-white font-bold text-sm py-2 px-4 rounded-xl hover:bg-teal-600 transition-colors">
                  標記送達
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
