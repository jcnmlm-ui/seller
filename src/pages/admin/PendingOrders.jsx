import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Search, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/StatusBadge'
import { taipeiToday } from '../../lib/release'
import { isPendingExpired, expiresLabel, PENDING_EXPIRE_HOUR } from '../../lib/pending'

const tpDate = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
const tpTime = iso => new Date(iso).toLocaleString('zh-TW', {
  timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
})
function yesterdayStr() {
  const d = new Date(Date.parse(taipeiToday() + 'T00:00:00Z') - 86400000)
  return d.toISOString().slice(0, 10)
}

export default function PendingOrders() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('pending')   // pending | cancelled
  const [search, setSearch]   = useState('')
  const [dateF, setDateF]     = useState('all')       // all | today | yesterday
  const [productF, setProductF] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    // 先把過期（下單日已過）的待收款訂單清掉、庫存補回
    await supabase.rpc('expire_pending_orders')
    const { data, error } = await supabase
      .from('orders')
      .select('id,order_no,receiver_name,receiver_phone,total_amount,status,source,created_at,cancelled_at,cancelled_reason,cancelled_by, order_items(product_name,quantity,unit_price)')
      .in('status', ['pending', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) toast('載入失敗：' + error.message, 'error')
    setOrders(data ?? [])
    setSelected(new Set())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const productNames = useMemo(() => {
    const s = new Set()
    orders.forEach(o => (o.order_items ?? []).forEach(i => s.add(i.product_name)))
    return [...s].sort()
  }, [orders])

  const today = taipeiToday()
  const yest  = yesterdayStr()

  const rows = useMemo(() => orders.filter(o => {
    if (o.status !== tab) return false
    if (dateF === 'today'     && tpDate(o.created_at) !== today) return false
    if (dateF === 'yesterday' && tpDate(o.created_at) !== yest)  return false
    if (productF && !(o.order_items ?? []).some(i => i.product_name === productF)) return false
    const q = search.trim().toLowerCase()
    if (q) {
      const hay = `${o.order_no} ${o.receiver_name ?? ''} ${o.receiver_phone ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [orders, tab, dateF, productF, search, today, yest])

  const pendingAll = orders.filter(o => o.status === 'pending')
  // 待收款佔用的庫存（依商品彙整）
  const held = useMemo(() => {
    const m = new Map()
    pendingAll.forEach(o => (o.order_items ?? []).forEach(i =>
      m.set(i.product_name, (m.get(i.product_name) ?? 0) + i.quantity)))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [pendingAll])

  const allChecked = tab === 'pending' && rows.length > 0 && rows.every(o => selected.has(o.id))
  function toggle(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map(o => o.id)))
  }

  async function cancelOrders(ids) {
    if (ids.length === 0) return
    const list = orders.filter(o => ids.includes(o.id))
    const qty = list.reduce((s, o) => s + (o.order_items ?? []).reduce((t, i) => t + i.quantity, 0), 0)
    if (!confirm(`確認取消 ${ids.length} 筆待收款訂單？\n共 ${qty} 件商品會補回庫存，取消後無法復原。`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('cancel_pending_orders', { p_order_ids: ids, p_reason: '人工取消' })
    setBusy(false)
    if (error) { toast('取消失敗：' + error.message + '（請確認已執行 18_cancel_pending.sql）', 'error'); return }
    toast(`已取消 ${data} 筆，庫存已補回`, 'success')
    load()
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin" className="btn-ghost p-2 flex-shrink-0"><ArrowLeft size={20} /></Link>
            <div className="min-w-0">
              <h1 className="font-bold text-stone-900">待收款訂單</h1>
              <p className="text-xs text-stone-400">未結帳的預購訂單會佔住庫存；每天 {PENDING_EXPIRE_HOUR}:00 會自動取消當時仍未結帳的訂單</p>
            </div>
          </div>
          <button onClick={load} className="btn-secondary p-2.5" title="重新整理"><RefreshCw size={16} /></button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {/* 佔用庫存摘要 */}
        {held.length > 0 && tab === 'pending' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-amber-800">目前待收款共 {pendingAll.length} 筆，佔住的庫存：</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              {held.map(([n, q]) => `${n}×${q}`).join('、')}
            </p>
          </div>
        )}

        {/* 頁籤 */}
        <div className="flex gap-2">
          {[['pending', `待收款（${pendingAll.length}）`], ['cancelled', `已取消（${orders.length - pendingAll.length}）`]].map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setSelected(new Set()) }}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors
                ${tab === k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* 篩選 */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="input pl-9 text-sm py-2.5 w-full" placeholder="搜尋訂單號、姓名、手機…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input text-sm py-2.5 w-auto" value={dateF} onChange={e => setDateF(e.target.value)}>
            <option value="all">全部日期</option>
            <option value="today">今天下單</option>
            <option value="yesterday">昨天下單</option>
          </select>
          <select className="input text-sm py-2.5 w-auto max-w-[200px]" value={productF} onChange={e => setProductF(e.target.value)}>
            <option value="">全部商品</option>
            {productNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* 批次操作 */}
        {tab === 'pending' && rows.length > 0 && (
          <div className="flex items-center justify-between bg-white border border-stone-200 rounded-xl px-4 py-2.5">
            <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 accent-red-500" />
              全選目前列出的 {rows.length} 筆
            </label>
            <button disabled={selected.size === 0 || busy} onClick={() => cancelOrders([...selected])}
              className="text-sm font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-40 px-3 py-1.5 rounded-lg">
              取消選取的 {selected.size} 筆
            </button>
          </div>
        )}

        {/* 清單 */}
        {loading ? (
          <p className="text-center text-stone-400 py-16">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-stone-400 py-16">
            {tab === 'pending' ? '沒有符合條件的待收款訂單' : '沒有已取消的訂單'}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map(o => {
              const items = o.order_items ?? []
              const expired = isPendingExpired(o.created_at)
              return (
                <div key={o.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex gap-3">
                  {tab === 'pending' && (
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)}
                      className="w-4 h-4 mt-1 accent-red-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-stone-900 text-sm">{o.order_no}</span>
                      <span className="text-xs text-stone-400">{tpTime(o.created_at)}</span>
                      {tab === 'pending' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${expired ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                          {expired ? '已過期，待清除' : `${expiresLabel(o.created_at)} 自動取消`}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-stone-700 mt-0.5">
                      {o.receiver_name || '（未填姓名）'}　{o.receiver_phone}
                    </p>
                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                      {items.map(i => `${i.product_name}×${i.quantity}`).join('、')}
                    </p>
                    {tab === 'cancelled' && (
                      <p className="text-xs text-stone-400 mt-1">
                        取消於 {o.cancelled_at ? tpTime(o.cancelled_at) : '—'}　原因：{o.cancelled_reason || '—'}
                        {o.cancelled_by && o.cancelled_by !== 'system' ? `　操作：${o.cancelled_by}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-red-500">NT${Number(o.total_amount).toLocaleString()}</p>
                    {tab === 'pending' && (
                      <button disabled={busy} onClick={() => cancelOrders([o.id])}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-red-600">
                        <XCircle size={13} /> 取消訂單
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
