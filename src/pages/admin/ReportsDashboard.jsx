import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../../lib/supabase'
import { STORE, PAYMENT_LABELS } from '../../config/store'
import {
  ArrowLeft, Printer, RefreshCw,
  TrendingUp, ShoppingBag, CreditCard, BarChart2,
} from 'lucide-react'

// ── 期間快捷鍵 ───────────────────────────────────────────────
const PRESETS = ['今日', '昨日', '近7天', '本月', '今年', '全部']

function getPresetRange(label) {
  const now   = new Date()
  const tod   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const ms    = 86400000
  switch (label) {
    case '今日':  return { s: tod, e: new Date(tod.getTime() + ms) }
    case '昨日':  return { s: new Date(tod.getTime() - ms), e: tod }
    case '近7天': return { s: new Date(tod.getTime() - 6 * ms), e: new Date(tod.getTime() + ms) }
    case '本月':  return { s: new Date(now.getFullYear(), now.getMonth(), 1), e: new Date(tod.getTime() + ms) }
    case '今年':  return { s: new Date(now.getFullYear(), 0, 1), e: new Date(tod.getTime() + ms) }
    default:     return { s: null, e: null }
  }
}

// ── 工具函數 ─────────────────────────────────────────────────
const fmt  = n  => `NT$${Number(n).toLocaleString()}`
const pct  = (a, b) => b ? Math.round(a / b * 100) : 0
const dstr = d => d?.toLocaleDateString('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit' }) ?? ''

export default function ReportsDashboard() {
  const [orders,  setOrders]  = useState([])
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(false)
  const [preset,  setPreset]  = useState('本月')
  const [custom,  setCustom]  = useState({ start: '', end: '' })
  const [useCustom, setUseCustom] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')  // all | online | booth_cashier
  const printRef = useRef(null)

  // 計算查詢範圍
  function getRange() {
    if (useCustom && custom.start) {
      return {
        s: new Date(custom.start),
        e: custom.end ? new Date(custom.end + 'T23:59:59') : new Date(),
      }
    }
    return getPresetRange(preset)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const { s, e } = getRange()
    let q = supabase
      .from('orders')
      .select('id,order_no,receiver_name,receiver_phone,total_amount,status,payment_method,created_at,shipped_at,source')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
    if (sourceFilter !== 'all') q = q.eq('source', sourceFilter)
    if (s) q = q.gte('created_at', s.toISOString())
    if (e) q = q.lte('created_at', e.toISOString())

    const { data: oData } = await q
    setOrders(oData ?? [])

    if (oData?.length) {
      const { data: iData } = await supabase
        .from('order_items').select('*')
        .in('order_id', oData.map(o => o.id))
      setItems(iData ?? [])
    } else {
      setItems([])
    }
    setLoading(false)
  }, [preset, useCustom, custom, sourceFilter])

  useEffect(() => { loadData() }, [loadData])

  // ── 統計計算 ────────────────────────────────────────────
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0)
  const avgOrder     = orders.length ? totalRevenue / orders.length : 0
  const totalQty     = items.reduce((s, i) => s + i.quantity, 0)

  // 付款方式分布
  const payStats = ['cash','card','taiwan_pay'].map(pm => {
    const sub = orders.filter(o => o.payment_method === pm)
    return {
      pm, label: PAYMENT_LABELS[pm] ?? pm,
      count: sub.length,
      amount: sub.reduce((s, o) => s + Number(o.total_amount), 0),
    }
  }).filter(p => p.count > 0)

  // 商品銷售排行
  const prodMap = {}
  for (const item of items) {
    if (!prodMap[item.product_name]) {
      prodMap[item.product_name] = {
        name: item.product_name,
        barcode: item.product_barcode ?? '',
        qty: 0, revenue: 0,
      }
    }
    prodMap[item.product_name].qty     += item.quantity
    prodMap[item.product_name].revenue += Number(item.unit_price) * item.quantity
  }
  const prodList = Object.values(prodMap).sort((a, b) => b.qty - a.qty)
  const maxQty   = prodList[0]?.qty ?? 1

  // 每日銷售
  const dayMap = {}
  for (const o of orders) {
    const day = o.created_at.slice(0, 10)
    if (!dayMap[day]) dayMap[day] = { day, count: 0, amount: 0 }
    dayMap[day].count++
    dayMap[day].amount += Number(o.total_amount)
  }
  const dayList = Object.values(dayMap).sort((a, b) => b.day.localeCompare(a.day))

  // 訂單狀態分布
  const statusMap = {
    paid: 0, picking: 0, packed: 0, shipped: 0, delivered: 0,
  }
  for (const o of orders) { if (statusMap[o.status] !== undefined) statusMap[o.status]++ }

  // 回頭客（相同電話超過1筆）
  const phoneCount = {}
  for (const o of orders) {
    const p = (o.receiver_phone ?? '').split('/')[0].trim()
    phoneCount[p] = (phoneCount[p] ?? 0) + 1
  }
  const repeatCustomers = Object.values(phoneCount).filter(c => c > 1).length

  // ── 列印 ────────────────────────────────────────────────
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    pageStyle: '@page { size: A4 portrait; margin: 15mm; }',
  })

  const { s: rs, e: re } = getRange()
  const periodLabel = useCustom && custom.start
    ? `${custom.start} ～ ${custom.end || '今日'}`
    : `${preset}（${rs ? dstr(rs) : '全部'} ～ ${re ? dstr(re) : ''}）`

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10 no-print">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="btn-ghost p-2"><ArrowLeft size={20} /></Link>
            <div>
              <h1 className="font-bold text-stone-900">銷售報表</h1>
              <p className="text-xs text-stone-400">{STORE.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} className="btn-secondary py-2 flex items-center gap-1.5 text-sm">
              <RefreshCw size={14} /> 重新整理
            </button>
            <button onClick={handlePrint} className="btn-primary py-2 flex items-center gap-1.5 text-sm">
              <Printer size={14} /> 列印報表
            </button>
          </div>
        </div>
      </header>

      {/* 篩選列 */}
      <div className="bg-white border-b border-stone-100 no-print">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          {/* 快捷鈕 */}
          <div className="flex gap-1 flex-wrap">
            {PRESETS.map(p => (
              <button key={p}
                onClick={() => { setPreset(p); setUseCustom(false) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all
                  ${!useCustom && preset === p
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                {p}
              </button>
            ))}
          </div>

          {/* 來源篩選 */}
          <div className="flex gap-1 flex-shrink-0">
            {[
              { value: 'all',           label: '全部來源' },
              { value: 'online',        label: '📱 預購' },
              { value: 'booth_cashier', label: '🏪 現場' },
            ].map(s => (
              <button key={s.value}
                onClick={() => setSourceFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all
                  ${sourceFilter === s.value
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                {s.label}
              </button>
            ))}
          </div>
          {/* 自訂期間 */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-stone-400 text-xs">自訂：</span>
            <input type="date" className="input py-1.5 text-sm w-36"
              value={custom.start}
              onChange={e => { setCustom(c => ({...c, start: e.target.value})); setUseCustom(true) }} />
            <span className="text-stone-400">～</span>
            <input type="date" className="input py-1.5 text-sm w-36"
              value={custom.end}
              onChange={e => { setCustom(c => ({...c, end: e.target.value})); setUseCustom(true) }} />
            {useCustom && (
              <button onClick={loadData} className="btn-primary text-xs py-1.5 px-3">查詢</button>
            )}
          </div>
        </div>
      </div>

      {/* ── 可列印區域 ─────────────────────────────────────── */}
      <div ref={printRef}>
        {/* 列印用標題（螢幕隱藏）*/}
        <div className="print-only" style={{ padding:'0 0 16px', borderBottom:'2px solid #000', marginBottom:'20px' }}>
          <div style={{ fontSize:'20px', fontWeight:'900' }}>{STORE.name}　銷售報表</div>
          <div style={{ fontSize:'12px', color:'#555', marginTop:'4px' }}>
            期間：{periodLabel}　|　產生時間：{new Date().toLocaleString('zh-TW')}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-5 space-y-6">

          {loading ? (
            <div className="flex items-center justify-center py-20 text-stone-400 gap-3">
              <span className="w-6 h-6 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
              載入中…
            </div>
          ) : (
            <>
              {/* 期間標示 */}
              <div className="flex items-center justify-between no-print">
                <p className="text-sm text-stone-500">
                  📅 {periodLabel}
                  <span className="ml-2 text-stone-400">共 <strong className="text-stone-900">{orders.length}</strong> 筆訂單</span>
                </p>
              </div>

              {/* ── 四大指標 ── */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: <TrendingUp size={20} className="text-green-500"/>, label:'總銷售額',   value: fmt(totalRevenue), sub: `${orders.length} 筆訂單` },
                  { icon: <ShoppingBag size={20} className="text-blue-500"/>, label:'總售出件數',  value: `${totalQty} 件`, sub: `${prodList.length} 種商品` },
                  { icon: <CreditCard size={20} className="text-purple-500"/>, label:'平均客單價', value: fmt(Math.round(avgOrder)), sub: '每筆訂單' },
                  { icon: <BarChart2 size={20} className="text-amber-500"/>, label:'回頭客',       value: `${repeatCustomers} 位`, sub: '同電話 >1 筆' },
                ].map(card => (
                  <div key={card.label} className="bg-white rounded-xl border border-stone-200 p-4">
                    <div className="flex items-center gap-2 mb-2">{card.icon}<span className="text-xs text-stone-500">{card.label}</span></div>
                    <div className="font-black text-xl text-stone-900">{card.value}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{card.sub}</div>
                  </div>
                ))}
              </div>

              {/* ── 商品銷售排行 ── */}
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                  <h2 className="font-bold text-stone-900">📦 商品銷售排行</h2>
                  <span className="text-xs text-stone-400">{prodList.length} 種商品</span>
                </div>
                {prodList.length === 0 ? (
                  <p className="text-center py-10 text-stone-400 text-sm">此期間無銷售資料</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 text-xs text-stone-500">
                        <th className="text-left px-4 py-2.5 font-semibold">排名</th>
                        <th className="text-left px-4 py-2.5 font-semibold">商品名稱</th>
                        <th className="text-left px-4 py-2.5 font-semibold">條碼</th>
                        <th className="text-right px-4 py-2.5 font-semibold">售出數量</th>
                        <th className="text-right px-4 py-2.5 font-semibold">銷售金額</th>
                        <th className="text-right px-4 py-2.5 font-semibold">佔比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prodList.map((p, i) => (
                        <tr key={p.name} className="border-t border-stone-100 hover:bg-stone-50">
                          <td className="px-4 py-2.5">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                              ${i===0?'bg-yellow-100 text-yellow-700':i===1?'bg-stone-100 text-stone-600':i===2?'bg-amber-50 text-amber-600':'text-stone-400'}`}>
                              {i+1}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-stone-800">{p.name}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-stone-400">{p.barcode || '—'}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* 視覺化長條 */}
                              <div className="w-16 bg-stone-100 rounded-full h-2 hidden sm:block">
                                <div className="bg-red-400 h-2 rounded-full"
                                     style={{ width: `${pct(p.qty, maxQty)}%` }} />
                              </div>
                              <span className="font-bold text-stone-900">{p.qty} 件</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(p.revenue)}</td>
                          <td className="px-4 py-2.5 text-right text-stone-500">
                            {pct(p.revenue, totalRevenue)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-stone-50 border-t border-stone-200 font-bold">
                        <td colSpan="3" className="px-4 py-3 text-stone-700">合計</td>
                        <td className="px-4 py-3 text-right text-stone-900">{totalQty} 件</td>
                        <td className="px-4 py-3 text-right text-stone-900">{fmt(totalRevenue)}</td>
                        <td className="px-4 py-3 text-right text-stone-500">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* ── 付款方式分布 ── */}
              {payStats.length > 0 && (
                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-stone-100">
                    <h2 className="font-bold text-stone-900">💳 付款方式分布</h2>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-stone-100">
                    {payStats.map(p => (
                      <div key={p.pm} className="px-5 py-4 text-center">
                        <div className="text-xl mb-1">{p.label.slice(0,2)}</div>
                        <div className="font-black text-stone-900">{p.count} 筆</div>
                        <div className="text-sm text-stone-500">{fmt(p.amount)}</div>
                        <div className="text-xs text-stone-400 mt-0.5">{pct(p.count, orders.length)}%</div>
                      </div>
                    ))}
                    {payStats.length < 3 && (
                      orders.filter(o => !o.payment_method).length > 0 && (
                        <div className="px-5 py-4 text-center">
                          <div className="text-xl mb-1">❓</div>
                          <div className="font-black text-stone-900">
                            {orders.filter(o => !o.payment_method).length} 筆
                          </div>
                          <div className="text-xs text-stone-400 mt-1">未登記</div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* ── 每日銷售 ── */}
              {dayList.length > 1 && (
                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-stone-100">
                    <h2 className="font-bold text-stone-900">📅 每日銷售明細</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 text-xs text-stone-500">
                        <th className="text-left px-4 py-2.5 font-semibold">日期</th>
                        <th className="text-right px-4 py-2.5 font-semibold">訂單數</th>
                        <th className="text-right px-4 py-2.5 font-semibold">銷售金額</th>
                        <th className="text-right px-4 py-2.5 font-semibold">佔總額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayList.map(d => (
                        <tr key={d.day} className="border-t border-stone-100 hover:bg-stone-50">
                          <td className="px-4 py-2.5 font-medium">{d.day}</td>
                          <td className="px-4 py-2.5 text-right">{d.count} 筆</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(d.amount)}</td>
                          <td className="px-4 py-2.5 text-right text-stone-400">
                            {pct(d.amount, totalRevenue)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── 訂單狀態分布 ── */}
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <h2 className="font-bold text-stone-900 mb-3">📊 訂單狀態分布</h2>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(statusMap).filter(([,v]) => v > 0).map(([k, v]) => {
                    const labels = { paid:'已付款', picking:'揀貨中', packed:'已包裝', shipped:'已出貨', delivered:'已送達' }
                    const colors = { paid:'bg-yellow-100 text-yellow-700', picking:'bg-blue-100 text-blue-700', packed:'bg-purple-100 text-purple-700', shipped:'bg-green-100 text-green-700', delivered:'bg-teal-100 text-teal-700' }
                    return (
                      <div key={k} className={`px-4 py-2 rounded-xl text-sm font-bold ${colors[k]}`}>
                        {labels[k]}：{v} 筆
                      </div>
                    )
                  })}
                </div>
              </div>


              {/* ── 來源分布 ── */}
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <h2 className="font-bold text-stone-900 mb-3">🔀 銷售來源分布</h2>
                <div className="flex gap-4">
                  {[
                    { key: 'online',        label: '📱 顧客預購', color: 'bg-blue-50 text-blue-700' },
                    { key: 'booth_cashier', label: '🏪 現場銷售', color: 'bg-amber-50 text-amber-700' },
                  ].map(s => {
                    const sub = orders.filter(o => (o.source ?? 'online') === s.key)
                    const amt = sub.reduce((a, o) => a + Number(o.total_amount), 0)
                    return (
                      <div key={s.key} className={`flex-1 ${s.color} rounded-xl p-4`}>
                        <p className="text-sm font-bold mb-1">{s.label}</p>
                        <p className="font-black text-2xl">{sub.length} 筆</p>
                        <p className="text-sm mt-0.5">NT${amt.toLocaleString()}</p>
                        <p className="text-xs opacity-70 mt-0.5">{pct(sub.length, orders.length)}%</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── 訂單明細列表 ── */}
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                  <h2 className="font-bold text-stone-900">🧾 訂單明細</h2>
                  <span className="text-xs text-stone-400">{orders.length} 筆</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 text-xs text-stone-500">
                        <th className="text-left px-3 py-2.5 font-semibold">訂單號</th>
                        <th className="text-left px-3 py-2.5 font-semibold">日期</th>
                        <th className="text-left px-3 py-2.5 font-semibold">收件人</th>
                        <th className="text-left px-3 py-2.5 font-semibold">付款</th>
                        <th className="text-right px-3 py-2.5 font-semibold">金額</th>
                        <th className="text-left px-3 py-2.5 font-semibold">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.id} className="border-t border-stone-100">
                          <td className="px-3 py-2 font-mono text-xs text-stone-600">{o.order_no}</td>
                          <td className="px-3 py-2 text-stone-500 whitespace-nowrap text-xs">
                            {new Date(o.created_at).toLocaleString('zh-TW', {
                              month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
                            })}
                          </td>
                          <td className="px-3 py-2 font-medium text-stone-800">{o.receiver_name}</td>
                          <td className="px-3 py-2 text-xs text-stone-400">
                            {PAYMENT_LABELS[o.payment_method] ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{fmt(o.total_amount)}</td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-stone-500">
                              {{ paid:'已付款', picking:'揀貨中', packed:'已包裝', shipped:'已出貨', delivered:'已送達' }[o.status] ?? o.status}
                            </span>
                            {o.source === 'booth_cashier' && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">現場</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-stone-50 border-t-2 border-stone-200 font-bold">
                        <td colSpan="4" className="px-3 py-3 text-stone-700">合計</td>
                        <td className="px-3 py-3 text-right text-stone-900">{fmt(totalRevenue)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 列印頁尾 */}
              <div className="print-only" style={{ marginTop:'24px', paddingTop:'12px', borderTop:'1px solid #ccc', fontSize:'11px', color:'#888', textAlign:'center' }}>
                {STORE.name} · {STORE.phone} · {STORE.address}<br/>
                本報表由系統自動產生 · {new Date().toLocaleString('zh-TW')}
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  )
}
