import { useEffect, useState, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { STATUS_CONFIG, STORE } from '../../config/store'
import { StatusBadge, toast } from '../../components/StatusBadge'
import ShippingSlipA4 from '../../components/print/ShippingSlipA4'
import WaybillA6 from '../../components/print/WaybillA6'
import {
  LogOut, Package, Search, Printer, ChevronDown, ChevronUp,
  RefreshCw, X, Truck, Edit2, CheckSquare, Square,
} from 'lucide-react'

const TABS = ['paid', 'picking', 'packed', 'shipped']
const LOCAL_PRINT_API = 'http://127.0.0.1:3001'
const TAB_LABELS = { paid: '待揀貨', picking: '揀貨中', packed: '已包裝', shipped: '已出貨' }
const BATCH_TABS = ['paid', 'picking', 'shipped']


// ── 揀貨清單 Modal ───────────────────────────────────────
function PickingListModal({ orders, items, onClose }) {
  const printRef = useRef(null)
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const now = new Date().toLocaleString('zh-TW', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit'
  })

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    pageStyle: '@page { size: A4 portrait; margin: 15mm; }',
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-stone-900 text-lg">揀貨清單</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {orders.length} 筆訂單 · 共 {totalQty} 件商品
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="btn-primary text-sm py-2 flex items-center gap-1.5">
              <Printer size={14} /> 列印揀貨清單
            </button>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 可列印區域 */}
          <div ref={printRef}>
            {/* 列印頁眉 */}
            <div className="mb-4 pb-3 border-b-2 border-stone-900">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="font-black text-xl text-stone-900">{STORE.name}</h1>
                  <p className="text-sm font-bold text-stone-600 mt-0.5">揀貨清單　Picking List</p>
                </div>
                <div className="text-right text-xs text-stone-500">
                  <p>列印時間：{now}</p>
                  <p className="mt-0.5">共 <strong>{orders.length}</strong> 筆訂單</p>
                </div>
              </div>
              {/* 訂單號標籤 */}
              <div className="flex flex-wrap gap-1 mt-2">
                {orders.map(o => (
                  <span key={o.id}
                    className="font-mono bg-stone-100 text-stone-500 px-1.5 py-0 rounded-full"
                    style={{ fontSize: '9px' }}>
                    {o.order_no}
                  </span>
                ))}
              </div>
            </div>

            {/* 商品彙整表格 */}
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="bg-stone-900 text-white">
                  <th className="text-left px-3 py-2 rounded-tl-lg font-bold">商品名稱</th>
                  <th className="text-center px-3 py-2 font-bold w-32">條碼</th>
                  <th className="text-center px-3 py-2 rounded-tr-lg font-bold w-24">需備數量</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.name}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                    <td className="px-3 py-1 font-medium text-stone-900">{item.name}</td>
                    <td className="px-3 py-1 text-center font-mono text-xs text-stone-400">
                      {item.barcode || '—'}
                    </td>
                    <td className="px-3 py-1 text-center text-stone-900">
                      {item.qty} 件
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-900 text-white">
                  <td className="px-3 py-2.5 font-bold rounded-bl-lg">合計</td>
                  <td className="px-3 py-2.5 text-center text-stone-400 text-xs">
                    {items.length} 種商品
                  </td>
                  <td className="px-3 py-1.5 text-center rounded-br-lg font-bold">
                    {totalQty} 件
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* 撿貨確認欄（手動打勾用）*/}
            <div className="border border-stone-200 rounded-xl p-4">
              <p className="text-xs font-bold text-stone-500 mb-3 tracking-widest">
                撿貨確認欄　（取貨後手動打勾）
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {items.map(item => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border-2 border-stone-300 flex-shrink-0" />
                    <span className="text-sm text-stone-700 truncate">
                      {item.name}
                      <span className="text-stone-400 ml-1">×{item.qty}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 列印頁尾 */}
            <p className="text-center text-xs text-stone-400 mt-4">
              {STORE.name} · 本表由系統自動產生 · {now}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 追蹤號碼 Modal ────────────────────────────────────────────
function TrackingModal({ order, mode, continuousMode, onContinuousModeChange, onConfirm, onClose }) {
  const [trackingNo, setTrackingNo] = useState(order.tracking_no ?? '')
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])
  const isEdit = mode === 'edit'

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm(trackingNo.trim())
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-green-500" />
            <h2 className="font-bold text-stone-900">
              {isEdit ? '編輯追蹤號碼' : '輸入包裹追蹤號碼'}
            </h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* 訂單資訊（確認是哪一筆）*/}
          <div className="bg-stone-50 rounded-xl px-3 py-2 flex items-center gap-2 text-sm flex-wrap">
            <span className="font-mono text-stone-500 text-xs">{order.order_no}</span>
            <span className="text-stone-300">·</span>
            <span className="font-bold text-stone-800">{order.receiver_name}</span>
            <span className="text-stone-300">·</span>
            <span className="text-stone-500 truncate">{order.receiver_phone}</span>
          </div>

          {/* 追蹤號碼輸入 */}
          <div>
            <label className="label">追蹤號碼（選填）</label>
            <input
              ref={inputRef}
              className="input font-mono tracking-widest"
              placeholder="例：RO123456789TW"
              value={trackingNo}
              onChange={e => setTrackingNo(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
            />
            <p className="text-xs text-stone-400 mt-1">
              條碼槍刷讀後按{' '}
              <kbd className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-500 font-mono text-xs">Enter</kbd>
              {' '}自動送出
            </p>
          </div>

          {isEdit && order.tracking_no && (
            <button onClick={() => setTrackingNo('')}
              className="text-xs text-red-400 hover:text-red-600">
              清除現有追蹤號碼
            </button>
          )}

          {/* 連續出貨模式（僅出貨時顯示）*/}
          {!isEdit && (
            <label className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all
              ${continuousMode
                ? 'bg-green-50 border-green-300'
                : 'bg-stone-50 border-stone-200 hover:border-stone-300'}`}>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={e => onContinuousModeChange(e.target.checked)}
                className="w-4 h-4 rounded accent-green-500 flex-shrink-0"
              />
              <div className="flex-1">
                <p className={`text-sm font-semibold ${continuousMode ? 'text-green-700' : 'text-stone-600'}`}>
                  連續出貨模式
                </p>
                <p className="text-xs text-stone-400">確認後自動跳下一筆已包裝訂單</p>
              </div>
              {continuousMode && (
                <span className="text-green-500 text-xs font-bold flex-shrink-0">開啟中</span>
              )}
            </label>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">取消</button>
          <button onClick={() => onConfirm(trackingNo.trim())} className="btn-primary flex-1 text-sm">
            {isEdit ? '儲存' : '確認出貨'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主元件 ───────────────────────────────────────────────────
export default function OrderDashboard() {
  const [orders, setOrders]             = useState([])
  const [filter, setFilter]             = useState('paid')
  const [search, setSearch]             = useState('')
  const [expanded, setExpanded]         = useState(null)
  const [orderItems, setOrderItems]     = useState({})
  const [newAlert, setNewAlert]         = useState(false)
  const [printTarget, setPrintTarget]   = useState(null)
  const [printType, setPrintType]       = useState('a4')
  const [trackingModal, setTrackingModal] = useState(null)
  const [continuousMode, setContinuousMode] = useState(false)
  const [selected, setSelected]         = useState(new Set())
  const [printMode, setPrintMode]       = useState('checking')
  const [senderSettings, setSenderSettings] = useState(null)
  const [pickingList, setPickingList]   = useState(null) // { orders, items }
  const printRef  = useRef(null)
  const autoPrint = useRef({ active: false })
  const { signOut } = useAuth()

  // ── 音效 + 系統通知 ─────────────────────────────────────
  function playAlert() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
    } catch {}
  }

  function sendNotification(title, body, tag) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/seller/favicon.ico', tag })
    }
  }

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders').select('*')
      .order('created_at', { ascending: false }).limit(200)
    setOrders(data ?? [])
  }, [])

  useEffect(() => {
    // 申請瀏覽器通知權限
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    loadOrders()
    // 讀取寄件人設定
    supabase.from('settings').select('*').eq('id', 'main').single()
      .then(({ data }) => { if (data) setSenderSettings(data) })
    const channel = supabase.channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        if (payload.eventType === 'INSERT') {
          setNewAlert(true); setTimeout(() => setNewAlert(false), 5000)
          toast('🔔 新訂單到了！', 'success', 5000)
          playAlert()
          sendNotification('🔔 新訂單', '有新的預購訂單進來了！', 'new-order')
        }
        loadOrders()
      }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadOrders])


  // ── Broadcast：接收攤位收款通知（所有後台同步收到）──
  useEffect(() => {
    const payChannel = supabase.channel('payment-events')
      .on('broadcast', { event: 'payment_confirmed' }, ({ payload }) => {
        const name   = payload.receiver_name ?? ''
        const amount = payload.total_amount  ?? 0
        const method = { cash:'現金', card:'刷卡', taiwan_pay:'台灣PAY' }[payload.payment_method] ?? ''
        toast(`💰 ${name} 已付款 NT$${Number(amount).toLocaleString()}（${method}）`, 'success', 6000)
        sendNotification('💰 新收款', `${name}  NT$${Number(amount).toLocaleString()}（${method}）`, payload.order_no)
        playAlert()
        loadOrders()
      })
      .subscribe()
    return () => supabase.removeChannel(payChannel)
  }, [loadOrders])

  // 偵測本地列印伺服器
  useEffect(() => {
    fetch(`${LOCAL_PRINT_API}/health`, { signal: AbortSignal.timeout(2000) })
      .then(r => r.ok ? setPrintMode('local') : setPrintMode('browser'))
      .catch(() => setPrintMode('browser'))
  }, [])

  function handleFilterChange(f) {
    setFilter(f)
    setSelected(new Set())
  }

  async function loadItems(orderId) {
    if (orderItems[orderId]) return
    const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId)
    setOrderItems(prev => ({ ...prev, [orderId]: data ?? [] }))
  }

  async function toggleExpand(orderId) {
    if (expanded === orderId) { setExpanded(null); return }
    setExpanded(orderId); await loadItems(orderId)
  }

  async function updateStatus(order, nextStatus, extra = {}) {
    const updates = {
      status: nextStatus, ...extra,
      ...(nextStatus === 'shipped' ? { shipped_at: new Date().toISOString() } : {}),
    }
    const { error } = await supabase.from('orders').update(updates).eq('id', order.id)
    if (error) toast('更新失敗', 'error')
    else { toast(`✓ 已更新為「${STATUS_CONFIG[nextStatus]?.label}」`, 'success'); loadOrders() }
  }

  // ── 勾選邏輯 ────────────────────────────────────────────
  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(displayed.map(o => o.id)))
  }

  function clearSelection() { setSelected(new Set()) }

  // ── 批次更新 ─────────────────────────────────────────────
  async function handleBulkUpdate() {
    const nextStatus = filter === 'paid' ? 'picking' : filter === 'picking' ? 'packed' : 'delivered'
    const ids = [...selected]
    let successCount = 0
    for (const id of ids) {
      const order = orders.find(o => o.id === id)
      if (!order) continue
      const { error } = await supabase.from('orders')
        .update({ status: nextStatus }).eq('id', id)
      if (!error) successCount++
    }
    toast(`✓ 已批次更新 ${successCount} 筆訂單為「${STATUS_CONFIG[nextStatus]?.label}」`, 'success', 4000)
    clearSelection()
    loadOrders()
  }


  // ── 揀貨清單：彙整所選訂單的商品 ────────────────────────
  async function openPickingList() {
    const selectedOrderObjs = orders.filter(o => selected.has(o.id))
    const ids = selectedOrderObjs.map(o => o.id)
    const { data: allItems } = await supabase
      .from('order_items').select('*').in('order_id', ids)
    const agg = {}
    for (const item of (allItems ?? [])) {
      if (!agg[item.product_name]) {
        agg[item.product_name] = {
          name: item.product_name,
          barcode: item.product_barcode ?? '',
          qty: 0,
        }
      }
      agg[item.product_name].qty += item.quantity
    }
    setPickingList({
      orders: selectedOrderObjs,
      items: Object.values(agg).sort((a, b) => b.qty - a.qty),
    })
  }

  // ── 列印 ─────────────────────────────────────────────────
  const printA4 = useReactToPrint({
    content: () => printRef.current,
    pageStyle: '@page { size: A4 portrait; margin: 12mm; }',
    onAfterPrint: () => {
      if (autoPrint.current.active) {
        flushSync(() => setPrintType('a6'))
        setTimeout(() => printA6(), 150)
      } else {
        setPrintTarget(null)
      }
    },
  })

  const printA6 = useReactToPrint({
    content: () => printRef.current,
    pageStyle: '@page { size: 100mm 150mm; margin: 5mm; }',
    onAfterPrint: () => {
      autoPrint.current.active = false
      setPrintTarget(null)
    },
  })

  async function handlePrint(order, type) {
    autoPrint.current.active = false
    await loadItems(order.id)
    const items = orderItems[order.id] ?? []
    const baseUrl = window.location.origin + window.location.pathname

    if (printMode === 'local') {
      const template = type === 'a4' ? 'shipping_slip_a4' : 'label'
      try {
        const res = await fetch(`${LOCAL_PRINT_API}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template,
            data: {
              order_no:             order.order_no,
              sender_name:          senderSettings?.sender_name        ?? '',
              sender_phone:         senderSettings?.sender_phone       ?? '',
              sender_postal_code:   senderSettings?.sender_postal_code ?? '',
              sender_address:       senderSettings?.sender_address     ?? '',
              status:               order.status,
              payment_method:       order.payment_method,
              created_at:           order.created_at,
              paid_at:              order.paid_at,
              receiver_name:        order.receiver_name,
              receiver_phone:       order.receiver_phone,
              receiver_postal_code: order.receiver_postal_code,
              receiver_address:     order.receiver_address,
              receiver_landline:    order.receiver_landline || '',
              ibox_full_address:    order.ibox_full_address || '',
              note:                 order.note,
              total_amount:         order.total_amount,
              order_url:            `${baseUrl}#/order/${order.order_no}`,
              items: items.map(i => ({
                product_name:    i.product_name,
                product_barcode: i.product_barcode,
                quantity:        i.quantity,
                unit_price:      i.unit_price,
              })),
            },
          }),
        })
        const result = await res.json()
        if (result.success) {
          toast(`✓ 已送印（${type === 'a4' ? 'A4 出貨單' : '託運單標籤'}）`, 'success')
        } else {
          throw new Error(result.error)
        }
      } catch (err) {
        toast(`列印失敗：${err.message}`, 'error')
      }
    } else {
      flushSync(() => { setPrintType(type); setPrintTarget(order) })
      if (type === 'a4') printA4(); else printA6()
    }
  }

  // ── 開始揀貨（自動列印 A4 → A6）────────────────────────
  async function handleStartPicking(order) {
    await updateStatus(order, 'picking')
    await loadItems(order.id)
    const { data: fresh } = await supabase.from('orders').select('*').eq('id', order.id).single()
    const target = fresh ?? order

    if (printMode === 'local') {
      await handlePrint(target, 'a4')
      await new Promise(r => setTimeout(r, 500))
      await handlePrint(target, 'a6')
    } else {
      autoPrint.current.active = true
      flushSync(() => { setPrintType('a4'); setPrintTarget(target) })
      printA4()
    }
  }

  // ── 確認出貨 Modal ───────────────────────────────────────
  function handleConfirmShipClick(order) {
    setTrackingModal({ order, mode: 'ship' })
  }

  function handleEditTrackingClick(order) {
    setTrackingModal({ order, mode: 'edit' })
  }

  async function handleTrackingConfirm(trackingNo) {
    const { order, mode } = trackingModal
    setTrackingModal(null)

    if (mode === 'ship') {
      await updateStatus(order, 'shipped', { tracking_no: trackingNo || null })

      if (continuousMode) {
        // 找下一筆已包裝（最早下單的優先）
        const { data: nextOrders } = await supabase
          .from('orders')
          .select('*')
          .eq('status', 'packed')
          .order('created_at', { ascending: true })
          .limit(1)

        if (nextOrders && nextOrders.length > 0) {
          setTimeout(() => {
            setTrackingModal({ order: nextOrders[0], mode: 'ship' })
          }, 250)
        } else {
          toast('🎉 所有已包裝訂單已全部出貨！', 'success', 4000)
          loadOrders()
        }
      } else {
        loadOrders()
      }
    } else {
      const { error } = await supabase
        .from('orders').update({ tracking_no: trackingNo || null }).eq('id', order.id)
      if (!error) { toast('追蹤號碼已更新', 'success'); loadOrders() }
      else toast('更新失敗', 'error')
    }
  }

  // ── 顯示訂單列表 ─────────────────────────────────────────
  const displayed = orders
    .filter(o => o.status === filter)
    .filter(o => !search
      || o.order_no.includes(search.toUpperCase())
      || o.receiver_name.includes(search)
      || o.receiver_phone.includes(search)
    )

  const counts = TABS.reduce((acc, t) => ({ ...acc, [t]: orders.filter(o => o.status === t).length }), {})
  const isBatchTab  = BATCH_TABS.includes(filter)
  const allSelected = displayed.length > 0 && displayed.every(o => selected.has(o.id))
  const bulkNextLabel = filter === 'paid' ? '批次開始揀貨' : filter === 'picking' ? '批次完成包裝' : '批次標記送達'

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Header */}
      <header className="bg-stone-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-black text-lg">{STORE.name}</h1>
          <span className="text-stone-400 text-sm">出貨管理後台</span>
        </div>
        <div className="flex items-center gap-1">
          {/* 列印模式指示器 */}
          <span className={`text-xs px-2 py-1 rounded-full font-mono hidden sm:inline mr-2
            ${printMode === 'local' ? 'bg-green-800 text-green-300' : printMode === 'browser' ? 'bg-stone-700 text-stone-400' : 'text-stone-600'}`}>
            {printMode === 'local' ? '直接列印' : printMode === 'browser' ? '瀏覽器列印' : '偵測中...'}
          </span>
        
          <button onClick={loadOrders}
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-stone-800">
            <RefreshCw size={15} />
            <span className="text-[10px]">重新整理</span>
          </button>
        
          <Link to="/admin/products"
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-stone-800">
            <Package size={15} />
            <span className="text-[10px]">商品管理</span>
          </Link>
        
          <Link to="/booth"
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-stone-800">
            <span className="text-sm leading-none">🏪</span>
            <span className="text-[10px]">攤位收款</span>
          </Link>
        
          <Link to="/admin/reports"
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-stone-800">
            <span className="text-sm leading-none">📊</span>
            <span className="text-[10px]">銷售報表</span>
          </Link>
        
          <Link to="/admin/settings"
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-stone-800">
            <span className="text-sm leading-none">⚙️</span>
            <span className="text-[10px]">系統設定</span>
          </Link>

          <button onClick={signOut}
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-stone-800">
            <LogOut size={15} />
            <span className="text-[10px]">登出</span>
          </button>
        </div>
      </header>

      {newAlert && (
        <div className="bg-green-400 text-green-900 px-6 py-3 font-bold text-center animate-pulse">
          🔔 有新訂單！請查看「待揀貨」分頁
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-5 pb-28">
        {/* 狀態分頁 */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-stone-200 mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => handleFilterChange(t)}
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

        {/* 搜尋 + 全選 */}
        <div className="flex gap-3 mb-4 items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="input pl-9 text-sm" placeholder="搜尋訂單號、姓名、電話…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isBatchTab && displayed.length > 0 && (
            <button
              onClick={allSelected ? clearSelection : selectAll}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all flex-shrink-0
                ${allSelected
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'
                }`}
            >
              {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
              {allSelected ? '取消全選' : `全選 (${displayed.length})`}
            </button>
          )}
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
                isSelected={selected.has(order.id)}
                showCheckbox={isBatchTab}
                onToggleSelect={e => { e.stopPropagation(); toggleSelect(order.id) }}
                onToggle={() => toggleExpand(order.id)}
                onStartPicking={() => handleStartPicking(order)}
                onUpdateStatus={next => updateStatus(order, next)}
                onConfirmShip={() => handleConfirmShipClick(order)}
                onEditTracking={() => handleEditTrackingClick(order)}
                onPrint={type => handlePrint(order, type)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 批次操作浮動列 */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-30">
          <div className="max-w-4xl mx-auto">
            <div className="bg-stone-900 text-white rounded-2xl px-5 py-4 flex items-center justify-between shadow-2xl">
              <div>
                <p className="font-bold">已勾選 {selected.size} 筆訂單</p>
                <p className="text-xs text-stone-400 mt-0.5">
                  {filter === 'paid' ? '批次更新為「揀貨中」' : '批次更新為「已包裝」'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clearSelection}
                  className="text-stone-400 hover:text-white px-3 py-2 rounded-lg text-sm">
                  取消
                </button>
                {filter === 'picking' && (
                  <button onClick={openPickingList}
                    className="flex items-center gap-1.5 bg-stone-700 hover:bg-stone-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                    <Printer size={14} /> 揀貨清單
                  </button>
                )}
                <button onClick={handleBulkUpdate}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                  {bulkNextLabel} →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 隱藏列印元件 */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={printRef}>
          {printTarget && (
            printType === 'a4'
              ? <ShippingSlipA4 order={printTarget} items={orderItems[printTarget.id] ?? []} senderInfo={senderSettings} />
              : <WaybillA6 order={printTarget} items={orderItems[printTarget.id] ?? []} senderInfo={senderSettings} />
          )}
        </div>
      </div>

      {/* 揀貨清單 Modal */}
      {pickingList && (
        <PickingListModal
          orders={pickingList.orders}
          items={pickingList.items}
          onClose={() => setPickingList(null)}
        />
      )}

      {/* 追蹤號碼 Modal */}
      {trackingModal && (
        <TrackingModal
          order={trackingModal.order}
          mode={trackingModal.mode}
          continuousMode={continuousMode}
          onContinuousModeChange={setContinuousMode}
          onConfirm={handleTrackingConfirm}
          onClose={() => setTrackingModal(null)}
        />
      )}
    </div>
  )
}

// ── 訂單卡片 ─────────────────────────────────────────────────
function OrderCard({
  order, items, isExpanded, isSelected, showCheckbox,
  onToggleSelect, onToggle, onStartPicking, onUpdateStatus,
  onConfirmShip, onEditTracking, onPrint,
}) {
  const PAYMENT_LABELS = { cash: '💵 現金', card: '💳 刷卡', taiwan_pay: '📱 台灣PAY' }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-colors
      ${isSelected ? 'border-red-400 ring-1 ring-red-300' : 'border-stone-200'}`}>

      <div className="flex items-center gap-2 px-3 py-3">
        {showCheckbox && (
          <button onClick={onToggleSelect}
            className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors
              ${isSelected ? 'text-red-500' : 'text-stone-300 hover:text-stone-500'}`}>
            {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
          </button>
        )}

        <div className="flex-1 flex items-center gap-3 cursor-pointer hover:bg-stone-50 rounded-lg px-2 py-1 -mx-2 transition-colors"
             onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-stone-900 text-sm">{order.order_no}</span>
              <StatusBadge status={order.status} />
              {order.payment_method && (
                <span className="text-xs text-stone-400">{PAYMENT_LABELS[order.payment_method]}</span>
              )}
              {order.tracking_no && (
              <span className="text-xs font-mono text-blue-500 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
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
          {isExpanded
            ? <ChevronUp size={16} className="text-stone-400 flex-shrink-0" />
            : <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />
          }
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-stone-100 px-4 py-4 space-y-4">
          <div className="text-sm space-y-1">
            <div>
              <span className="text-stone-400">收件地址：</span>
              <span className="text-stone-700">{order.receiver_address}</span>
              {order.note && <span className="text-stone-400 ml-2">（備註：{order.note}）</span>}
            </div>
            {(order.status === 'shipped' || order.status === 'delivered') && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-stone-400">追蹤號碼：</span>
                {order.tracking_no ? (
                  <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs">
                    {order.tracking_no}
                  </span>
                ) : (
                  <span className="text-stone-400 text-xs italic">尚未填寫</span>
                )}
                <button onClick={onEditTracking}
                  className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors">
                  <Edit2 size={12} />
                  {order.tracking_no ? '編輯' : '補填追蹤號碼'}
                </button>
              </div>
            )}
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

          {/* 雙金額小結（有郵票才顯示）*/}
          {items && (() => {
            const stampTotal = items.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.quantity, 0)
            if (stampTotal === 0) return null
            const invoiceAmount = order.total_amount - stampTotal
            return (
              <div className="flex justify-end items-center gap-3 text-sm bg-blue-50 rounded-xl px-4 py-2">
                <span className="text-stone-400 text-xs">實收</span>
                <span className="font-black text-stone-900">NT${order.total_amount.toLocaleString()}</span>
                <span className="text-stone-300">|</span>
                <span className="text-stone-400 text-xs">發票</span>
                <span className="font-bold text-stone-600">NT${invoiceAmount.toLocaleString()}</span>
                <span className="text-xs text-blue-400">含郵票 NT${stampTotal.toLocaleString()}</span>
              </div>
            )
          })()}

          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => onPrint('a4')}
              className="flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-stone-200 transition-colors">
              <Printer size={14} /> A4 出貨單
            </button>
            <button onClick={() => onPrint('a6')}
              className="flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-stone-200 transition-colors">
              <Printer size={14} /> A6 託運單
            </button>

            <div className="ml-auto">
              {order.status === 'paid' && (
                <button onClick={onStartPicking}
                  className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5">
                  <Printer size={14} /> 開始揀貨（自動列印）
                </button>
              )}
              {order.status === 'picking' && (
                <button onClick={() => onUpdateStatus('packed')}
                  className="btn-primary text-sm py-2 px-4">完成包裝 →</button>
              )}
              {order.status === 'packed' && (
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
