import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, LogOut, Edit2, X, Monitor, Minus, Plus, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PAYMENT_LABELS, STORE } from '../../config/store'
import { useEnabledPaymentMethods } from '../../hooks/useEnabledPaymentMethods'
import { toast } from '../../components/StatusBadge'

export default function BoothDashboard() {
  const navigate = useNavigate()
  const enabledPayMethods = useEnabledPaymentMethods()
  const [query, setQuery]           = useState('')
  const [order, setOrder]           = useState(null)
  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [phoneResults, setPhoneResults] = useState([])  // 手機模糊搜尋的多筆結果，供人工預覽挑選
  const [phoneResultItems, setPhoneResultItems] = useState({}) // { [order_id]: [{product_name, quantity}] }，供預覽清單顯示購買品項
  const [confirming, setConfirming] = useState(false)
  const [payMethod, setPayMethod]   = useState('cash')
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 })
  const [editingPayment, setEditingPayment] = useState(false)
  const [editPayMethod, setEditPayMethod]   = useState('cash')
  // ── 退貨 / 退款 ──
  const [refundMode, setRefundMode]       = useState(false)
  const [refundQty, setRefundQty]         = useState({})   // { [order_item_id]: 退幾件 }
  const [refundRef, setRefundRef]         = useState('')   // 刷退單號 / 備註
  const [refundReason, setRefundReason]   = useState('')
  const [showRefundConfirm, setShowRefundConfirm] = useState(false)
  const [refunding, setRefunding]         = useState(false)
  const [refundHistory, setRefundHistory] = useState([])
  const [tiers, setTiers]                 = useState([])   // 滿額活動門檻（退款後提醒用）
  const [todayRefund, setTodayRefund]     = useState(0)
  const inputRef = useRef(null)
  const { signOut } = useAuth()

  useEffect(() => {
    inputRef.current?.focus()
    loadTodayStats()
    supabase.from('promotion_tiers').select('*').eq('is_active', true)
      .order('threshold', { ascending: true })
      .then(({ data }) => setTiers(data ?? []))
  }, [])

  // ── 快速鍵：F3 切換到現場收銀台，方便全螢幕時免用滑鼠切換 ──
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'F3') { e.preventDefault(); navigate('/cashier') }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  async function loadTodayStats() {
    const today = new Date().toISOString().slice(0, 10)
    // 待結帳、整筆退款的訂單不算營業額；部分退款的訂單 total_amount 已是退款後金額
    const { data } = await supabase
      .from('orders').select('total_amount').not('status', 'in', '(pending,refunded)').gte('created_at', today)
    if (data) setTodayStats({
      count: data.length,
      total: data.reduce((s, r) => s + r.total_amount, 0),
    })
    const { data: rf } = await supabase
      .from('order_refunds').select('refund_total').gte('created_at', today)
    setTodayRefund((rf ?? []).reduce((s, r) => s + Number(r.refund_total), 0))
  }

  // 把查到的訂單完整載入（含商品明細）
  async function loadOrderRecord(ord) {
    setOrder(ord); setPayMethod('cash'); setEditingPayment(false); setPhoneResults([]); setPhoneResultItems({})
    resetRefundState()
    const { data: its } = await supabase.from('order_items').select('*').eq('order_id', ord.id)
    setItems(its ?? [])
    const { data: rf } = await supabase.from('order_refunds').select('*')
      .eq('order_id', ord.id).order('created_at', { ascending: true })
    setRefundHistory(rf ?? [])
  }

  function resetRefundState() {
    setRefundMode(false); setRefundQty({}); setRefundRef(''); setRefundReason('')
    setShowRefundConfirm(false); setRefundHistory([])
  }

  // 從手機模糊搜尋的預覽清單中，點選其中一筆帶入
  async function selectPhoneResult(m) {
    setLoading(true)
    const { data: ord } = await supabase.from('orders').select('*').eq('id', m.id).single()
    setLoading(false)
    if (ord) { setQuery(ord.order_no); await loadOrderRecord(ord) }
  }

  // ── 搜尋 / 確認收款（Enter 兩用）────────────────────────
    async function handleSearch(e) {
      e.preventDefault()
    
      // 如果輸入欄有內容（代表剛刷讀進來或人工輸入），優先查詢，不觸發確認收款
      if (query.trim()) {
        // 有內容就直接往下查詢，不管目前是否有待收款訂單
      } else if (order?.status === 'pending' && !confirming) {
        // 輸入欄是空的才代表人工按 Enter 確認
        await confirmPayment(); return
      } else {
        return
      }
    const raw = query.trim()
    if (!raw) return

    // 如果掃到的是完整網址或看起來是訂單號（ORD-XXXXXXXX-XXXX），走原本的精確查詢
    const match = raw.match(/ORD-[\d-]+/i)
    const looksLikeOrderNo = !!match || /^ord-/i.test(raw)

    setLoading(true); setOrder(null); setItems([]); setEditingPayment(false); setPhoneResults([])

    if (looksLikeOrderNo) {
      const q = (match ? match[0] : raw).toUpperCase()
      const { data: ord } = await supabase.from('orders').select('*').eq('order_no', q).single()
      if (ord) await loadOrderRecord(ord)
      else toast('查無此訂單，請確認訂單號碼', 'error')
      setLoading(false)
      return
    }

    // 備用查詢：用收件人手機模糊搜尋（客人忘記訂單號時使用）
    const { data: matches } = await supabase
      .from('orders')
      .select('id, order_no, receiver_name, receiver_phone, total_amount, status, created_at')
      .ilike('receiver_phone', `%${raw}%`)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!matches || matches.length === 0) {
      toast('查無符合的訂單，請確認手機號碼或訂單號', 'error')
    } else if (matches.length === 1) {
      // 只有一筆，直接帶入
      const { data: ord } = await supabase.from('orders').select('*').eq('id', matches[0].id).single()
      if (ord) await loadOrderRecord(ord)
    } else {
      // 多筆訂單，先讓人工預覽再確認帶入哪一筆（含品項預覽）
      setPhoneResults(matches)
      const { data: itemRows } = await supabase
        .from('order_items')
        .select('order_id, product_name, quantity')
        .in('order_id', matches.map(m => m.id))
      const grouped = {}
      for (const it of itemRows ?? []) {
        (grouped[it.order_id] ??= []).push(it)
      }
      setPhoneResultItems(grouped)
    }
    setLoading(false)
  }

  function handleClear() {
    setQuery(''); setOrder(null); setItems([]); setEditingPayment(false); setPhoneResults([]); setPhoneResultItems({})
    resetRefundState()
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

  // ── 退貨 / 退款 ───────────────────────────────────────────
  function setItemRefundQty(item, qty) {
    const q = Math.max(0, Math.min(item.quantity, qty))
    setRefundQty(prev => ({ ...prev, [item.id]: q }))
  }
  function selectAllForRefund() {
    const all = {}
    items.forEach(i => { all[i.id] = i.quantity })
    setRefundQty(all)
  }
  function cancelRefundMode() { setRefundMode(false); setRefundQty({}); setRefundRef(''); setRefundReason(''); setShowRefundConfirm(false) }

  async function submitRefund() {
    if (!order || refundLines.length === 0) return
    setRefunding(true)
    const { data, error } = await supabase.rpc('refund_order', {
      p_order_id: order.id,
      p_items:    refundLines.map(l => ({ order_item_id: l.item.id, qty: l.qty })),
      p_ref:      refundRef.trim() || null,
      p_reason:   refundReason.trim() || null,
    })
    setRefunding(false)
    if (error) { toast('退款失敗：' + error.message, 'error'); return }

    toast(`✓ 已退款 NT$${Number(data?.refund_total ?? refundTotal).toLocaleString()}，庫存已回補`, 'success', 4000)
    setShowRefundConfirm(false)
    const { data: ord } = await supabase.from('orders').select('*').eq('id', order.id).single()
    if (ord) await loadOrderRecord(ord)
    loadTodayStats()
  }

  // ── 退款試算（每次 render 重新計算）──
  const itemStamp = i => Number(i.stamp_amount) || 0
  const stampTotalAll = items.reduce((s, i) => s + itemStamp(i) * i.quantity, 0)
  const curInvoice = (Number(order?.total_amount) || 0) - stampTotalAll
  const refundLines = items
    .map(i => ({ item: i, qty: Math.min(refundQty[i.id] || 0, i.quantity) }))
    .filter(l => l.qty > 0)
  const refundTotal   = refundLines.reduce((s, l) => s + Number(l.item.unit_price) * l.qty, 0)
  const refundStamp   = refundLines.reduce((s, l) => s + itemStamp(l.item) * l.qty, 0)
  const refundInvoice = refundTotal - refundStamp
  const refundQtySum  = refundLines.reduce((s, l) => s + l.qty, 0)
  const allQtySum     = items.reduce((s, i) => s + i.quantity, 0)
  const isFullRefund  = refundQtySum > 0 && refundQtySum === allQtySum
  const newTotal      = (Number(order?.total_amount) || 0) - refundTotal
  const newInvoice    = curInvoice - refundInvoice
  const canRefund     = !!order && ['paid', 'picking', 'packed'].includes(order.status)
  const isCashPay     = order?.payment_method === 'cash'
  const payName       = PAYMENT_LABELS[order?.payment_method]?.slice(2) ?? ''
  const refundVerb    = order?.payment_method === 'card' ? '刷退' : '退款'

  // 退款後發票金額若掉到較低的滿額門檻，提醒追回贈品
  const tierOf = amt => tiers.reduce((hit, t) => (amt >= Number(t.threshold) ? t : hit), null)
  const tierBefore = tierOf(curInvoice)
  const tierAfter  = tierOf(newInvoice)
  const tierDrop   = refundTotal > 0 && tierBefore && tierBefore.id !== tierAfter?.id

  // 現金：直接退現金；刷卡/電子支付：整筆刷退後重刷，郵票金額退現金
  const refundSteps = (() => {
    if (refundTotal <= 0) return []
    if (isCashPay) return [`退還現金 NT$${refundTotal.toLocaleString()}`]
    const steps = []
    if (curInvoice > 0) {
      steps.push(isFullRefund
        ? `${payName}整筆${refundVerb} NT$${curInvoice.toLocaleString()}`
        : `${payName}整筆${refundVerb}原金額 NT$${curInvoice.toLocaleString()}`)
      if (!isFullRefund && newInvoice > 0) steps.push(`重新${payName} NT$${newInvoice.toLocaleString()}（剩餘品項）`)
    }
    if (refundStamp > 0) steps.push(`郵票金額退還現金 NT$${refundStamp.toLocaleString()}`)
    return steps
  })()

  const inputHint = order?.status === 'pending'
    ? '💡 確認付款方式後按 ↵ Enter 或條碼槍確認收款'
    : order ? '💡 輸入下一筆訂單號或掃描 QR Code'
    : '💡 掃描顧客手機上的 QR Code；若客人忘記訂單號，也可輸入收件人手機號碼模糊搜尋（備用方式）'

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-stone-100">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex-shrink-0 text-white px-5 py-3 flex items-center justify-between" style={{ backgroundColor: '#33A6B8' }}>
        <div>
          <h1 className="font-black text-base leading-tight">{STORE.name}</h1>
          <p className="text-xs text-white/70">攤位收款介面</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/cashier" title="快速鍵 F3"
            className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs border border-white/25 hover:border-white/50 rounded-lg px-3 py-2 transition-colors">
            🏪 現場收銀台
            <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded font-mono leading-none">F3</span>
          </Link>

          <Link to="/admin"
            className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs border border-white/25 hover:border-white/50 rounded-lg px-3 py-2 transition-colors">
            <Monitor size={13} /> 出貨管理後台
          </Link>
          <div className="text-right text-xs text-white/70 border-l border-white/25 pl-3 ml-1">
            <p>今日 {todayStats.count} 筆</p>
            <p className="text-white font-bold text-sm">NT${todayStats.total.toLocaleString()}</p>
            {todayRefund > 0 && <p className="text-white/70" style={{ fontSize: '10px' }}>已扣退款 NT${todayRefund.toLocaleString()}</p>}
          </div>
          <button onClick={signOut} className="text-white/70 hover:text-white p-2 ml-1">
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
                placeholder="ORD-20240602-0001 或輸入手機號碼" value={query}
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
            {!order && phoneResults.length > 0 ? (
              // 手機模糊搜尋，多筆結果，先預覽再確認帶入
              <div>
                <p className="text-xs font-semibold text-stone-400 tracking-widest mb-3">
                  找到 {phoneResults.length} 筆符合的訂單，請確認要帶入哪一筆
                </p>
                <div className="space-y-2">
                  {phoneResults.map(m => {
                    const statusLabel = { pending:'待收款', paid:'已付款', picking:'揀貨中', packed:'已包裝', shipped:'已出貨', delivered:'已送達', refunded:'已退款' }[m.status] ?? m.status
                    return (
                      <button
                        key={m.id}
                        onClick={() => selectPhoneResult(m)}
                        className="w-full text-left bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl px-4 py-3 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-stone-500">{m.order_no}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                            ${m.status === 'pending' ? 'bg-amber-100 text-amber-700' : m.status === 'refunded' ? 'bg-stone-200 text-stone-500' : 'bg-green-100 text-green-700'}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div>
                            <p className="font-bold text-stone-900 text-sm">{m.receiver_name}</p>
                            <p className="text-xs text-stone-400">{m.receiver_phone}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-stone-900">NT${Number(m.total_amount).toLocaleString()}</p>
                            <p className="text-xs text-stone-400">
                              {new Date(m.created_at).toLocaleDateString('zh-TW', { month:'2-digit', day:'2-digit' })}
                            </p>
                          </div>
                        </div>
                        {(phoneResultItems[m.id]?.length > 0) && (
                          <p className="mt-1.5 pt-1.5 border-t border-stone-200 text-stone-400 truncate" style={{ fontSize: '8px' }}>
                            {phoneResultItems[m.id].map(it => `${it.product_name} x${it.quantity}`).join('、')}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : !order ? (
              <div className="flex flex-col items-center justify-center h-full text-stone-300 gap-3">
                <Search size={40} strokeWidth={1} />
                <p className="text-sm">掃描或輸入訂單號碼</p>
                <p className="text-xs text-stone-300">也可輸入手機號碼模糊搜尋</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4 gap-2">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold
                    ${order.status === 'pending' ? 'bg-amber-100 text-amber-700' : order.status === 'refunded' ? 'bg-stone-200 text-stone-500' : 'bg-green-100 text-green-700'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${order.status === 'pending' ? 'bg-amber-500' : order.status === 'refunded' ? 'bg-stone-400' : 'bg-green-500'}`} />
                    {order.status === 'pending' ? '待收款' : order.status === 'refunded' ? '已退款' : '已結帳'}
                    <span className="font-mono text-xs opacity-70 ml-1">{order.order_no}</span>
                  </div>
                  {refundMode && (
                    <button type="button" onClick={selectAllForRefund}
                      className="text-xs font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-colors">
                      整筆全選
                    </button>
                  )}
                </div>
                {order.status === 'refunded' && items.length === 0 && (
                  <p className="text-sm text-stone-400 text-center py-8">此訂單已整筆退款，品項已全數退出</p>
                )}
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id}
                      className={`flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors
                        ${refundMode && (refundQty[item.id] || 0) > 0 ? 'bg-red-50 ring-1 ring-red-200' : 'bg-stone-50'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-stone-900 text-sm truncate">{item.product_name}</p>
                        {item.product_barcode && (
                          <p className="text-xs text-stone-400 font-mono">{item.product_barcode}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2 text-sm">
                        {refundMode && (
                          <div className="flex items-center gap-1 bg-white border border-red-200 rounded-lg px-1 py-0.5">
                            <button type="button" onClick={() => setItemRefundQty(item, (refundQty[item.id] || 0) - 1)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"><Minus size={14} /></button>
                            <span className="w-10 text-center font-bold text-red-600 text-xs">
                              退 {refundQty[item.id] || 0}
                            </span>
                            <button type="button" onClick={() => setItemRefundQty(item, (refundQty[item.id] || 0) + 1)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"><Plus size={14} /></button>
                          </div>
                        )}
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

                    {/* 選了非現金付款、但訂單含郵票商品時，明顯提醒收款人員 */}
                    {(() => {
                      const stampTotal = items.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.quantity, 0)
                      if (payMethod === 'cash' || stampTotal <= 0) return null
                      return (
                        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4 flex items-start gap-3 animate-pulse">
                          <span className="text-2xl flex-shrink-0">⚠️</span>
                          <div>
                            <p className="font-black text-amber-800 text-base leading-snug">
                              本筆含個人化郵票商品，郵票金額 NT${stampTotal.toLocaleString()} 須收現金！
                            </p>
                            <p className="text-amber-600 text-sm mt-1">
                              請向客人說明：{PAYMENT_LABELS[payMethod]?.slice(2)}僅能刷「NT${(order.total_amount - stampTotal).toLocaleString()}」，郵票金額須另收現金 NT${stampTotal.toLocaleString()}。
                            </p>
                          </div>
                        </div>
                      )
                    })()}

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
                    {order.status === 'refunded' ? (
                      <div className="bg-stone-100 border border-stone-300 rounded-2xl p-4">
                        <p className="font-bold text-stone-700 text-lg">↩️ 此訂單已整筆退款</p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          累計退款 NT${Number(order.refunded_amount || 0).toLocaleString()}（原付款方式：{PAYMENT_LABELS[order.payment_method]}）
                        </p>
                      </div>
                    ) : refundMode ? null : !editingPayment ? (
                      <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-green-800 text-lg">
                              ✅ 已收款（{PAYMENT_LABELS[order.payment_method]}）
                            </p>
                            <p className="text-xs text-green-600 mt-0.5">
                              {order.paid_at && new Date(order.paid_at).toLocaleString('zh-TW')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={startEditPayment}
                              className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 border border-green-300 px-3 py-1.5 rounded-xl transition-colors">
                              <Edit2 size={12} /> 修改
                            </button>
                            {canRefund && (
                              <button onClick={() => setRefundMode(true)}
                                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 border border-red-300 bg-white px-3 py-1.5 rounded-xl transition-colors font-bold">
                                <RotateCcw size={12} /> 退貨／退款
                              </button>
                            )}
                          </div>
                        </div>
                        {!canRefund && (
                          <p className="text-xs text-stone-500 mt-2">此訂單已出貨／送達，無法在攤位退款，請至後台處理。</p>
                        )}
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

                        {/* 改選非現金付款、但訂單含郵票商品時，明顯提醒收款人員 */}
                        {(() => {
                          const stampTotal = items.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.quantity, 0)
                          if (editPayMethod === 'cash' || stampTotal <= 0) return null
                          return (
                            <div className="rounded-xl border-2 border-amber-400 bg-white px-4 py-3 flex items-start gap-2">
                              <span className="text-lg flex-shrink-0">⚠️</span>
                              <p className="text-sm text-amber-800 font-semibold leading-snug">
                                郵票金額 NT${stampTotal.toLocaleString()} 須另收現金，{PAYMENT_LABELS[editPayMethod]?.slice(2)}僅能刷 NT${(order.total_amount - stampTotal).toLocaleString()}。
                              </p>
                            </div>
                          )
                        })()}

                        <button onClick={saveEditPayment} className="btn-primary w-full py-2.5 text-sm">
                          儲存修改
                        </button>
                      </div>
                    )}
                    {refundMode && canRefund && (
                      <div className="border-2 border-red-300 bg-red-50 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-black text-red-700">退貨／退款</p>
                          <button onClick={cancelRefundMode} className="text-red-400 hover:text-red-700"><X size={16} /></button>
                        </div>

                        {(order.status === 'picking' || order.status === 'packed') && (
                          <p className="text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2">
                            ⚠️ 此訂單已進入{order.status === 'picking' ? '揀貨' : '包裝'}流程，退貨後請通知出貨端抽出商品、重印出貨單。
                          </p>
                        )}

                        {refundTotal === 0 ? (
                          <p className="text-sm text-red-400 py-3 text-center">
                            請在左側品項用 ＋／－ 選擇要退的數量，或按「整筆全選」
                          </p>
                        ) : (
                          <>
                            <div className="bg-white rounded-xl px-4 py-3 space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-stone-500">應退總額</span>
                                <span className="font-black text-red-600 text-xl">NT${refundTotal.toLocaleString()}</span>
                              </div>
                              {refundStamp > 0 && (
                                <div className="flex justify-between text-xs text-stone-400">
                                  <span>其中發票 NT${refundInvoice.toLocaleString()}／郵票 NT${refundStamp.toLocaleString()}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-xs text-stone-500 pt-1 border-t border-stone-100">
                                <span>退款後訂單金額</span>
                                <span className="font-bold">
                                  NT${newTotal.toLocaleString()}{stampTotalAll > 0 && newTotal > 0 ? `（發票 NT$${newInvoice.toLocaleString()}）` : ''}
                                </span>
                              </div>
                            </div>

                            <div className="bg-white rounded-xl px-4 py-3">
                              <p className="text-xs font-bold text-stone-500 mb-1.5">
                                收銀人員請依序處理（原付款：{PAYMENT_LABELS[order.payment_method]}）
                              </p>
                              <ol className="list-decimal list-inside space-y-1 text-sm font-semibold text-stone-800">
                                {refundSteps.map((t, i) => <li key={i}>{t}</li>)}
                              </ol>
                            </div>

                            {tierDrop && (
                              <p className="text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2">
                                🎁 退款後發票金額 NT${newInvoice.toLocaleString()}，
                                {tierAfter ? `滿額活動由「${tierBefore.reward}」降為「${tierAfter.reward}」` : `已低於「${tierBefore.reward}」的門檻`}
                                ，請依活動規則處理已給的贈品。
                              </p>
                            )}

                            <button onClick={() => setShowRefundConfirm(true)}
                              className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-base shadow">
                              {isFullRefund ? '整筆退款' : '退選取品項'} NT${refundTotal.toLocaleString()}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {refundHistory.length > 0 && (
                      <div className="pt-3 border-t border-stone-200 space-y-1.5">
                        <p className="text-xs font-semibold text-stone-400 tracking-widest">退款紀錄</p>
                        {refundHistory.map(h => (
                          <div key={h.id} className="text-xs text-stone-500 bg-stone-100 rounded-lg px-3 py-2">
                            <div className="flex justify-between gap-2">
                              <span className="font-mono text-stone-400">
                                {new Date(h.created_at).toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                　{h.refund_type === 'full' ? '整筆退款' : '部分退款'}
                              </span>
                              <strong className="text-red-500">−NT${Number(h.refund_total).toLocaleString()}</strong>
                            </div>
                            <p className="text-stone-400 mt-0.5">
                              {(h.items ?? []).map(it => `${it.product_name} ×${it.qty}`).join('、')}
                              {h.reason ? `｜${h.reason}` : ''}{h.refund_ref ? `｜單號 ${h.refund_ref}` : ''}
                            </p>
                          </div>
                        ))}
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

      {/* ── 退款確認視窗 ───────────────────────────────────── */}
      {showRefundConfirm && order && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
              <h2 className="font-black text-lg text-stone-900">
                確認{isFullRefund ? '整筆退款' : '退貨'}　<span className="font-mono text-xs text-stone-400">{order.order_no}</span>
              </h2>
              <button onClick={() => setShowRefundConfirm(false)} className="text-stone-400 hover:text-stone-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div className="space-y-1">
                {refundLines.map(l => (
                  <div key={l.item.id} className="flex justify-between text-sm">
                    <span className="text-stone-700 truncate pr-2">{l.item.product_name} ×{l.qty}</span>
                    <span className="font-semibold text-stone-900">NT${(Number(l.item.unit_price) * l.qty).toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 mt-1 border-t border-stone-100">
                  <span className="font-bold text-stone-600">應退總額</span>
                  <span className="font-black text-red-600 text-2xl">NT${refundTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-stone-50 rounded-xl px-4 py-3">
                <ol className="list-decimal list-inside space-y-1 text-sm font-semibold text-stone-800">
                  {refundSteps.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              </div>

              {!isCashPay && (
                <input className="input w-full text-sm" placeholder={`${payName}${refundVerb}單號／備註（選填）`}
                  value={refundRef} onChange={e => setRefundRef(e.target.value)} />
              )}
              <div>
                <input className="input w-full text-sm" placeholder="退款原因（選填）"
                  value={refundReason} onChange={e => setRefundReason(e.target.value)} />
                <div className="flex gap-2 mt-2 flex-wrap">
                  {['客人不要了', '買錯／重複購買', '商品瑕疵'].map(t => (
                    <button key={t} type="button" onClick={() => setRefundReason(t)}
                      className="text-xs px-2.5 py-1 rounded-full border border-stone-200 text-stone-500 hover:bg-stone-50">{t}</button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-stone-400">
                確認後訂單金額與品項會立即更新、庫存回補，並留下退款紀錄，無法復原。
              </p>
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-stone-100 flex gap-3 flex-shrink-0">
              <button onClick={() => setShowRefundConfirm(false)} disabled={refunding}
                className="flex-1 py-3 rounded-xl bg-stone-100 text-stone-600 font-bold hover:bg-stone-200">取消</button>
              <button onClick={submitRefund} disabled={refunding}
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black disabled:opacity-60">
                {refunding ? '處理中…' : '確認退款'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
