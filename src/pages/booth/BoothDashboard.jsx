import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, LogOut, Edit2, X, Monitor, Minus, Plus, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PAYMENT_LABELS, STORE } from '../../config/store'
import { useEnabledPaymentMethods } from '../../hooks/useEnabledPaymentMethods'
import { toast } from '../../components/StatusBadge'
import { computeGifts, nextGiftStep, giftText } from '../../lib/gifts'

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
  // ── 收款前調整（減少）數量 ──
  const [editMode, setEditMode]           = useState(false)
  const [editQty, setEditQty]             = useState({})   // { [order_item_id]: 調整後數量 }
  const [savingEdit, setSavingEdit]       = useState(false)
  // ── 合併其他通路訂單（計入滿額）──
  const [mergeEnabled, setMergeEnabled]   = useState(false)
  const [mergedOrders, setMergedOrders]   = useState([])   // [{ order_no, amount, dupOf? }]
  const [showMergePanel, setShowMergePanel] = useState(false)
  const [mergeNo, setMergeNo]             = useState('')
  const [mergeAmt, setMergeAmt]           = useState('')
  const [mergeWarn, setMergeWarn]         = useState('')
  const inputRef = useRef(null)
  const { signOut } = useAuth()

  useEffect(() => {
    inputRef.current?.focus()
    loadTodayStats()
    loadTiers()
  }, [])

  // 滿額贈設定：開頁時讀一次，之後每掃一筆訂單再重讀，後台改設定不用重新整理攤位頁
  async function loadTiers() {
    const { data, error } = await supabase.from('promotion_tiers').select('*').eq('is_active', true)
      .order('threshold', { ascending: true })
    if (!error) setTiers(data ?? [])
  }

  // ── 快速鍵：F3 切換到現場收銀台，方便全螢幕時免用滑鼠切換 ──
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'F3') { e.preventDefault(); navigate('/cashier') }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  async function loadTodayStats() {
    // 以台灣時間 00:00 當每天起點（toISOString 是 UTC，早上 8 點前會算到前一天）
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }) + 'T00:00:00+08:00').toISOString()
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
    loadTiers()
    const savedMerged = Array.isArray(ord.merged_orders) ? ord.merged_orders : []
    setMergedOrders(savedMerged); setMergeEnabled(savedMerged.length > 0)
    setShowMergePanel(false); setMergeNo(''); setMergeAmt(''); setMergeWarn('')
    const { data: its } = await supabase.from('order_items').select('*').eq('order_id', ord.id)
    setItems(its ?? [])
    const { data: rf } = await supabase.from('order_refunds').select('*')
      .eq('order_id', ord.id).order('created_at', { ascending: true })
    setRefundHistory(rf ?? [])
  }

  function resetRefundState() {
    setRefundMode(false); setRefundQty({}); setRefundRef(''); setRefundReason('')
    setShowRefundConfirm(false); setRefundHistory([])
    setEditMode(false); setEditQty({})
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
    setMergeEnabled(false); setMergedOrders([]); setShowMergePanel(false)
    inputRef.current?.focus()
  }

  // ── 確認收款 ─────────────────────────────────────────────
  async function confirmPayment() {
    if (!order || order.status !== 'pending') return
    if (editMode) { toast('請先「儲存調整」或「取消」數量調整，再確認收款', 'error'); return }
    setConfirming(true)
    const basePatch = { status: 'paid', payment_method: payMethod, paid_at: new Date().toISOString() }
    let { error } = await supabase.from('orders').update({
      ...basePatch,
      merged_orders: mergedOrders.map(m => ({ order_no: m.order_no, amount: m.amount })),
      promo_gift: giftList.length ? giftText(giftList) : null,
    }).eq('id', order.id)
    // 保險：還沒執行 15 號 SQL（資料庫沒有新欄位）時，收款仍照常完成，只是不記錄合併資訊
    if (error && /merged_orders|promo_gift/.test(error.message)) {
      if (mergedOrders.length > 0) toast('資料庫尚未執行 15 號 SQL，合併訂單資訊未被記錄', 'error', 5000)
      ;({ error } = await supabase.from('orders').update(basePatch).eq('id', order.id))
    }

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
        setQuery(''); setOrder(null); setItems([]); setMergeEnabled(false); setMergedOrders([]); inputRef.current?.focus()
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

  // ── 合併其他通路訂單 ─────────────────────────────────────
  function toggleMerge(checked) {
    setMergeEnabled(checked)
    if (checked) { setShowMergePanel(true) }
    else { setMergedOrders([]); setMergeWarn('') }
  }
  async function addMergedOrder() {
    const no = mergeNo.trim().toUpperCase()
    const amount = Number(mergeAmt)
    if (!no) { setMergeWarn('請輸入其他通路的訂單編號'); return }
    if (!amount || amount <= 0) { setMergeWarn('請輸入該筆訂單的金額（發票金額）'); return }
    if (mergedOrders.some(m => m.order_no === no)) { setMergeWarn('這個單號已經加入了'); return }
    // 檢查這張單是否已被別筆訂單合併過（避免同一張單重複領贈品）
    let dupOf = null
    try {
      const { data } = await supabase.from('orders').select('order_no')
        .contains('merged_orders', [{ order_no: no }]).neq('id', order.id).limit(1)
      if (data?.length) dupOf = data[0].order_no
    } catch {}
    setMergedOrders(prev => [...prev, { order_no: no, amount, dupOf }])
    setMergeNo(''); setMergeAmt('')
    setMergeWarn(dupOf ? `⚠️ 此單號已在 ${dupOf} 合併計算過，請確認是否重複領取` : '')
  }
  function removeMergedOrder(no) {
    setMergedOrders(prev => prev.filter(m => m.order_no !== no))
  }
  function closeMergePanel() {
    setShowMergePanel(false); setMergeWarn('')
    if (mergedOrders.length === 0) setMergeEnabled(false)   // 沒輸入任何單就關掉 → 取消勾選
  }

  // ── 收款前調整數量（只能減少，0 = 移除該品項）──────────────
  function startEdit() {
    const q = {}; items.forEach(i => { q[i.id] = i.quantity })
    setEditQty(q); setEditMode(true)
  }
  function cancelEdit() { setEditMode(false); setEditQty({}) }
  function setItemEditQty(item, qty) {
    const q = Math.max(0, Math.min(item.quantity, qty))
    setEditQty(prev => ({ ...prev, [item.id]: q }))
  }
  async function saveEdit() {
    if (!editChanged) { cancelEdit(); return }
    if (editRemaining <= 0) { toast('至少要保留一項商品', 'error'); return }
    setSavingEdit(true)
    const { error } = await supabase.rpc('reduce_pending_order', {
      p_order_id: order.id,
      p_items: items.filter(i => effQty(i) !== i.quantity).map(i => ({ order_item_id: i.id, qty: effQty(i) })),
    })
    setSavingEdit(false)
    if (error) { toast('調整失敗：' + error.message, 'error'); return }
    toast('✓ 已調整數量，庫存已回補', 'success')
    const { data: ord } = await supabase.from('orders').select('*').eq('id', order.id).single()
    if (ord) await loadOrderRecord(ord)
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
  const effQty = i => (editMode ? (editQty[i.id] ?? i.quantity) : i.quantity)   // 調整模式下用「調整後」數量試算
  const stampTotalAll = items.reduce((s, i) => s + itemStamp(i) * effQty(i), 0)
  const effTotal = editMode ? items.reduce((s, i) => s + Number(i.unit_price) * effQty(i), 0) : (Number(order?.total_amount) || 0)
  const curInvoice = effTotal - stampTotalAll
  const editChanged   = editMode && items.some(i => effQty(i) !== i.quantity)
  const editRemaining = items.reduce((s, i) => s + effQty(i), 0)
  // ── 滿額贈品試算（本單發票金額 + 其他通路合併金額）──
  const mergedSum   = mergedOrders.reduce((s, m) => s + Number(m.amount || 0), 0)
  const giftBase    = curInvoice + mergedSum
  const giftCalc    = computeGifts(tiers, giftBase)
  const giftList    = giftCalc.gifts
  const giftPieces  = giftList.reduce((s, g) => s + g.qty, 0)
  const giftStep    = nextGiftStep(tiers, giftBase)
  const minThreshold = tiers.length ? Math.min(...tiers.map(t => Number(t.threshold))) : 0
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
  const giftsBefore = giftList
  const giftsAfter  = computeGifts(tiers, newInvoice + mergedSum).gifts
  const tierDrop    = refundTotal > 0 && giftsBefore.length > 0 && giftText(giftsBefore) !== giftText(giftsAfter)

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

  const isPending = order?.status === 'pending'

  // 滿額贈品提示卡（待收款時即時試算；已收款則顯示當時的合併紀錄）
  const giftCard = order && order.status !== 'refunded' && tiers.length > 0 ? (
    <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="text-sm font-black text-red-700">🎁 滿額贈品</p>
        <p className="text-xs text-stone-500">
          發票 NT${curInvoice.toLocaleString()}
          {mergedSum > 0 && <> ＋ 其他通路 NT${mergedSum.toLocaleString()}</>}
          {' '}＝ <b className="text-stone-800">NT${giftBase.toLocaleString()}</b>
        </p>
      </div>

      {giftList.length > 0 ? (
        <>
          <p className="text-lg font-black text-stone-900">
            應送 {giftList.length} 項／共 {giftPieces} 個
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {giftList.map((g, i) => (
              <span key={i} className="px-4 py-2 rounded-full bg-white border border-red-200 text-red-700 text-base font-black">
                {g.name} <span className="text-red-500">×{g.qty}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-stone-400 mt-2">
            {giftCalc.cycles > 0 && <>滿 NT${Number(giftCalc.topTier.threshold).toLocaleString()} ×{giftCalc.cycles} 組</>}
            {giftCalc.cycles > 0 && giftCalc.remTier && '，'}
            {giftCalc.remTier && <>餘 NT${giftCalc.rem.toLocaleString()}（滿 NT${Number(giftCalc.remTier.threshold).toLocaleString()} 加送「{giftCalc.remTier.reward}」）</>}
          </p>
          {giftCalc.soldOut.length > 0 && (
            <p className="mt-2 text-sm font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
              ⚠ 「{giftCalc.soldOut.map(t => t.reward).join('、')}」已送完，請改送替代贈品
            </p>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-stone-500">
          未達最低門檻（NT${minThreshold.toLocaleString()}），本單無滿額贈品
        </p>
      )}

      {giftStep && giftStep.adds.length > 0 && (
        <p className="text-xs text-stone-500 mt-2">
          再 <b className="text-red-500">NT${giftStep.need.toLocaleString()}</b> 可多送：{giftText(giftStep.adds)}
        </p>
      )}

      {/* 已收款：顯示當時合併的其他通路訂單與記錄的贈品 */}
      {!isPending && mergedOrders.length > 0 && (
        <div className="mt-2 pt-2 border-t border-red-100 text-xs text-stone-500 space-y-0.5">
          <p className="font-semibold text-stone-400">已合併其他通路訂單</p>
          {mergedOrders.map(m => (
            <p key={m.order_no}><span className="font-mono">{m.order_no}</span>　NT${Number(m.amount).toLocaleString()}</p>
          ))}
        </div>
      )}
      {!isPending && order.promo_gift && (
        <p className="text-xs text-stone-400 mt-1">收款時記錄贈品：{order.promo_gift}</p>
      )}
    </div>
  ) : null

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
                  {order.status === 'pending' && !editMode && items.length > 0 && (
                    <button type="button" onClick={startEdit}
                      className="flex items-center gap-1 text-xs font-bold text-stone-600 border border-stone-300 bg-white hover:bg-stone-100 px-3 py-1.5 rounded-full transition-colors">
                      <Edit2 size={12} /> 調整數量
                    </button>
                  )}
                  {editMode && (
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full">調整中（只能減少）</span>
                  )}
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
                        ${refundMode && (refundQty[item.id] || 0) > 0 ? 'bg-red-50 ring-1 ring-red-200'
                          : editMode && effQty(item) !== item.quantity ? 'bg-amber-50 ring-1 ring-amber-200'
                          : 'bg-stone-50'}
                        ${editMode && effQty(item) === 0 ? 'opacity-50' : ''}`}>
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
                        {editMode && (
                          <div className="flex items-center gap-1 bg-white border border-amber-300 rounded-lg px-1 py-0.5">
                            <button type="button" onClick={() => setItemEditQty(item, effQty(item) - 1)}
                              className="p-1 text-amber-600 hover:bg-amber-50 rounded"><Minus size={14} /></button>
                            <span className="w-14 text-center font-bold text-amber-700 text-xs">
                              {effQty(item) === 0 ? '移除' : `改 ${effQty(item)}`}
                            </span>
                            <button type="button" onClick={() => setItemEditQty(item, effQty(item) + 1)}
                              disabled={effQty(item) >= item.quantity}
                              className="p-1 text-amber-600 hover:bg-amber-50 rounded disabled:opacity-30"><Plus size={14} /></button>
                          </div>
                        )}
                        <span className={`text-stone-400 ${editMode && effQty(item) !== item.quantity ? 'line-through' : ''}`}>×{item.quantity}</span>
                        <span className={`font-bold text-stone-900 w-20 text-right ${editMode && effQty(item) === 0 ? 'line-through' : ''}`}>
                          NT${(item.unit_price * (editMode ? effQty(item) : item.quantity)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {Array.isArray(order.edit_log) && order.edit_log.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-stone-100 space-y-1">
                    <p className="text-xs font-semibold text-stone-400 tracking-widest">收款前數量調整紀錄</p>
                    {order.edit_log.map((e, i) => (
                      <p key={i} className="text-xs text-stone-400">
                        <span className="font-mono">{new Date(e.at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>
                        {'　'}{(e.changes ?? []).map(c => `${c.product_name} ${c.from}→${c.to}`).join('、')}
                        {'　'}合計 NT${Number(e.from_total).toLocaleString()}→NT${Number(e.to_total).toLocaleString()}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 合計 */}
          {order && (
            <div className="flex-shrink-0 border-t border-stone-200 bg-white px-5 py-4">
              {editMode && (
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={cancelEdit} disabled={savingEdit}
                    className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-600 font-bold hover:bg-stone-200 text-sm">取消</button>
                  <button type="button" onClick={saveEdit} disabled={savingEdit || !editChanged || editRemaining <= 0}
                    className="flex-[2] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm disabled:opacity-40">
                    {savingEdit ? '儲存中…' : editRemaining <= 0 ? '至少保留一項' : editChanged ? `儲存調整（原 NT$${Number(order.total_amount).toLocaleString()}）` : '尚未調整'}
                  </button>
                </div>
              )}
              {(() => {
                const stampTotal = stampTotalAll
                const invoiceAmount = effTotal - stampTotal
                return (
                  <div className="flex justify-between items-start">
                    <span className="text-stone-500 font-medium pt-1">合計應收</span>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {stampTotal > 0 && <span className="text-xs text-stone-400">實收</span>}
                        <span className="font-black text-3xl text-red-500">
                          NT${effTotal.toLocaleString()}
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

                    {giftCard}

                    {/* 合併其他通路訂單：打勾後彈出輸入面板 */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" className="w-4 h-4 accent-red-500"
                          checked={mergeEnabled} onChange={e => toggleMerge(e.target.checked)} />
                        <span className="text-sm font-semibold text-stone-700">合併其他通路購買訂單（一併計算滿額）</span>
                      </label>
                      {mergedOrders.length > 0 && (
                        <div className="mt-2 bg-white border border-stone-200 rounded-xl px-4 py-3 space-y-1">
                          {mergedOrders.map(m => (
                            <div key={m.order_no} className="flex items-center justify-between text-sm gap-2">
                              <span className="font-mono text-stone-600 truncate">
                                {m.order_no}{m.dupOf && <span className="text-amber-600 font-sans text-xs ml-2">⚠ 已用於 {m.dupOf}</span>}
                              </span>
                              <span className="font-bold text-stone-800 flex-shrink-0">NT${Number(m.amount).toLocaleString()}</span>
                            </div>
                          ))}
                          <button type="button" onClick={() => setShowMergePanel(true)}
                            className="text-xs text-red-500 hover:text-red-700 font-semibold pt-1">＋ 新增／編輯</button>
                        </div>
                      )}
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

                    <button onClick={confirmPayment} disabled={confirming || editMode}
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
                    {!refundMode && giftCard}

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
                                🎁 退款後{mergedSum > 0 ? '（含其他通路）' : ''}滿額金額 NT${(newInvoice + mergedSum).toLocaleString()}，
                                {giftsAfter.length
                                  ? `應送贈品由「${giftText(giftsBefore)}」減為「${giftText(giftsAfter)}」`
                                  : `已低於最低門檻，原應送「${giftText(giftsBefore)}」不再符合`}
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

      {/* ── 合併其他通路訂單面板 ─────────────────────────────── */}
      {showMergePanel && order && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
              <h2 className="font-black text-lg text-stone-900">合併其他通路訂單</h2>
              <button onClick={closeMergePanel} className="text-stone-400 hover:text-stone-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <p className="text-xs text-stone-400">輸入客人在其他通路（例如網路商店）購買的訂單編號與發票金額，會與本單合併計算滿額（郵票金額不計入）。</p>

              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-sm" placeholder="其他通路訂單編號" autoFocus
                  value={mergeNo} onChange={e => setMergeNo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('merge-amt')?.focus() } }} />
                <input id="merge-amt" className="input w-28 text-sm" type="number" min="1" placeholder="金額"
                  value={mergeAmt} onChange={e => setMergeAmt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMergedOrder() } }} />
                <button type="button" onClick={addMergedOrder} className="btn-primary px-4 text-sm">加入</button>
              </div>
              {mergeWarn && (
                <p className="text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2">{mergeWarn}</p>
              )}

              {mergedOrders.length > 0 && (
                <div className="space-y-1.5">
                  {mergedOrders.map(m => (
                    <div key={m.order_no} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2 text-sm gap-2">
                      <span className="font-mono text-stone-700 truncate">{m.order_no}</span>
                      <span className="flex items-center gap-3 flex-shrink-0">
                        <b>NT${Number(m.amount).toLocaleString()}</b>
                        <button type="button" onClick={() => removeMergedOrder(m.order_no)} className="text-stone-400 hover:text-red-500"><X size={14} /></button>
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-1 border-t border-stone-100">
                    <span className="text-stone-500">其他通路合計</span>
                    <b>NT${mergedSum.toLocaleString()}</b>
                  </div>
                </div>
              )}

              {/* 即時顯示合併後的贈品結果 */}
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm">
                <p className="text-xs text-stone-500">合併後滿額金額 <b className="text-stone-800">NT${giftBase.toLocaleString()}</b></p>
                <p className="font-black text-red-700 mt-0.5">
                  {giftList.length
                    ? `應送 ${giftList.length} 項：${giftText(giftList)}`
                    : '尚未達到任何滿額門檻'}
                </p>
              </div>
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-stone-100 flex-shrink-0">
              <button onClick={closeMergePanel} className="btn-primary w-full py-3 text-sm font-bold">完成</button>
            </div>
          </div>
        </div>
      )}

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
