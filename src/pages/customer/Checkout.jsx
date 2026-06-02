import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../context/CartContext'
import { CITIES, getDistricts, getPostalCode } from '../../data/postal_codes'

export default function Checkout() {
  const { items, dispatch, total } = useCart()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '', mobile: '', landline: '',
    city: '', district: '', detail: '', postal_suffix: '', note: '',
  })
  const [loading, setLoading]   = useState(false)
  const [errors, setErrors]     = useState({})

  const postalPrefix = getPostalCode(form.city, form.district)
  const postalCode   = form.postal_suffix
    ? `${postalPrefix}-${form.postal_suffix}` : postalPrefix
  const fullAddress  = `${form.city}${form.district}${form.detail}`

  // 合併聯絡電話欄位（mobile / landline 至少一個）
  function buildPhone() {
    const m = form.mobile.trim()
    const l = form.landline.trim()
    if (m && l) return `手機:${m} / 市話:${l}`
    if (m) return m
    return `市話:${l}`
  }

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = '請填寫收件人姓名'

    // 手機格式
    const cleanMobile = form.mobile.replace(/[-\s]/g, '')
    if (form.mobile && !/^09\d{8}$/.test(cleanMobile))
      e.mobile = '手機號碼格式不正確（09開頭10碼）'

    // 市話格式（區碼+號碼，去除符號後8-10碼，開頭0不是09）
    const cleanLand = form.landline.replace(/[-\s]/g, '')
    if (form.landline && !/^0[2-8]\d{6,8}$/.test(cleanLand))
      e.landline = '市話格式不正確（含區碼，如 07-2614171）'

    // 至少填一個
    if (!form.mobile.trim() && !form.landline.trim())
      e.phone_required = '手機或市話至少需填寫一個'

    if (!form.city)           e.city    = '請選擇縣市'
    if (!form.district)       e.district= '請選擇鄉鎮市區'
    if (!form.detail.trim())  e.detail  = '請填寫詳細地址'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setLoading(true)
    try {
      const { error: stockErr } = await supabase.rpc('decrement_stock', {
        p_product_ids: items.map(i => i.id),
        p_quantities:  items.map(i => i.quantity),
      })
      if (stockErr) throw new Error(stockErr.message)

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_no:             '',
          receiver_name:        form.name.trim(),
          receiver_phone:       buildPhone(),
          receiver_postal_code: postalCode,
          receiver_address:     fullAddress,
          note:                 form.note.trim() || null,
          total_amount:         total,
          status:               'pending',
        })
        .select('id, order_no')
        .single()
      if (orderErr) throw new Error(orderErr.message)

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(items.map(i => ({
          order_id:        order.id,
          product_id:      i.id,
          product_name:    i.name,
          product_barcode: i.barcode ?? null,
          unit_price:      i.price,
          quantity:        i.quantity,
        })))
      if (itemsErr) throw new Error(itemsErr.message)

      dispatch({ type: 'CLEAR' })
      navigate(`/order/${order.order_no}`)
    } catch (err) {
      alert('下單失敗：' + err.message)
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-stone-400">
        <p className="text-5xl">🛒</p>
        <p className="font-semibold">購物車是空的</p>
        <Link to="/" className="btn-primary text-sm">去選商品</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="btn-ghost p-2"><ArrowLeft size={20} /></Link>
          <h1 className="font-bold text-stone-900">確認訂單</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5 fade-up">

        {/* ── 購物車（含數量調整）── */}
        <div className="card p-4">
          <h2 className="section-title">購物車（{items.length} 種商品）</h2>
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                {/* 圖片 */}
                <div className="w-14 h-14 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    : <span className="text-2xl">📦</span>
                  }
                </div>

                {/* 商品名稱 + 單價 */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-stone-900 truncate">{item.name}</p>
                  <p className="text-xs text-stone-400">NT${item.price.toLocaleString()} / 件</p>
                </div>

                {/* 數量調整 + 小計 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* 數量 +/- */}
                  <div className="flex items-center gap-1 bg-stone-100 rounded-xl px-1 py-1">
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-600 hover:bg-white active:scale-90 transition-all font-bold"
                      onClick={() => dispatch({ type: 'UPDATE_QTY', id: item.id, qty: item.quantity - 1 })}
                    >−</button>
                    <span className="font-bold text-stone-800 w-5 text-center text-sm">
                      {item.quantity}
                    </span>
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-600 hover:bg-white active:scale-90 transition-all font-bold"
                      onClick={() => dispatch({ type: 'UPDATE_QTY', id: item.id, qty: item.quantity + 1 })}
                    >+</button>
                  </div>
                  {/* 小計 */}
                  <p className="font-bold text-stone-900 text-sm w-16 text-right">
                    NT${(item.price * item.quantity).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-100 mt-4 pt-3 flex justify-between items-center">
            <span className="text-stone-500 text-sm">
              共 {items.reduce((s, i) => s + i.quantity, 0)} 件
            </span>
            <span className="font-black text-xl text-red-500">NT${total.toLocaleString()}</span>
          </div>
        </div>

        {/* ── 收件人資料 ── */}
        <div className="card p-4 space-y-4">
          <h2 className="section-title">收件人資料</h2>

          {/* 姓名 */}
          <div>
            <label className="label">收件人姓名</label>
            <input type="text" className={`input ${errors.name ? 'border-red-400' : ''}`}
              placeholder="王小明" value={form.name}
              onChange={e => { setForm(f=>({...f,name:e.target.value})); setErrors(e2=>({...e2,name:''})) }} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* 聯絡電話（手機 + 市話）*/}
          <div>
            <label className="label">
              聯絡電話
              <span className="text-xs font-normal text-stone-400 ml-1">（手機或市話至少填一個）</span>
            </label>
            {/* 至少一個未填的提示 */}
            {errors.phone_required && (
              <p className="text-red-500 text-xs mb-2">{errors.phone_required}</p>
            )}
            <div className="space-y-2">
              {/* 手機 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 w-16 flex-shrink-0 font-medium">📱 手機</span>
                <div className="flex-1">
                  <input type="tel"
                    className={`input text-sm py-2.5 ${errors.mobile ? 'border-red-400' : ''}`}
                    placeholder="0912-345-678（選填）"
                    value={form.mobile}
                    onChange={e => { setForm(f=>({...f,mobile:e.target.value})); setErrors(e2=>({...e2,mobile:'',phone_required:''})) }} />
                  {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile}</p>}
                </div>
              </div>
              {/* 市話 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 w-16 flex-shrink-0 font-medium">☎️ 市話</span>
                <div className="flex-1">
                  <input type="tel"
                    className={`input text-sm py-2.5 ${errors.landline ? 'border-red-400' : ''}`}
                    placeholder="07-2614171（選填，含區碼）"
                    value={form.landline}
                    onChange={e => { setForm(f=>({...f,landline:e.target.value})); setErrors(e2=>({...e2,landline:'',phone_required:''})) }} />
                  {errors.landline && <p className="text-red-500 text-xs mt-1">{errors.landline}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* 縣市 + 鄉鎮市區 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">縣市</label>
              <select className={`input bg-white ${errors.city ? 'border-red-400' : ''}`}
                value={form.city}
                onChange={e => {
                  setForm(f => ({ ...f, city: e.target.value, district: '' }))
                  setErrors(e2 => ({ ...e2, city: '', district: '' }))
                }}>
                <option value="">請選擇縣市</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
            </div>
            <div>
              <label className="label">鄉鎮市區</label>
              <select className={`input bg-white ${errors.district ? 'border-red-400' : ''}`}
                value={form.district}
                disabled={!form.city}
                onChange={e => {
                  setForm(f => ({ ...f, district: e.target.value }))
                  setErrors(e2 => ({ ...e2, district: '' }))
                }}>
                <option value="">請選擇區域</option>
                {getDistricts(form.city).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {errors.district && <p className="text-red-500 text-xs mt-1">{errors.district}</p>}
            </div>
          </div>

          {/* 郵遞區號（自動帶出） */}
          {form.district && (
            <div className="bg-stone-50 rounded-xl p-3 flex items-center gap-3">
              <div>
                <p className="text-xs text-stone-400 mb-1">郵遞區號</p>
                <div className="flex items-center gap-1.5">
                  <div className="bg-white border border-stone-300 rounded-lg px-3 py-1.5 font-mono font-bold text-stone-900 text-lg w-16 text-center">
                    {postalPrefix}
                  </div>
                  <span className="text-stone-400 font-bold">-</span>
                  <input type="text" inputMode="numeric" maxLength={3}
                    className="input font-mono font-bold text-lg text-center w-16 py-1.5"
                    placeholder="___"
                    value={form.postal_suffix}
                    onChange={e => setForm(f => ({ ...f, postal_suffix: e.target.value.replace(/\D/g,'').slice(0,3) }))} />
                </div>
              </div>
              <p className="text-xs text-stone-400 flex-1 leading-relaxed">
                前3碼已自動帶入<br/>後3碼選填（不填也可寄送）
              </p>
            </div>
          )}

          {/* 詳細地址 */}
          <div>
            <label className="label">詳細地址</label>
            <input type="text" className={`input ${errors.detail ? 'border-red-400' : ''}`}
              placeholder="中正三路177號3樓"
              value={form.detail}
              onChange={e => { setForm(f=>({...f,detail:e.target.value})); setErrors(e2=>({...e2,detail:''})) }} />
            {errors.detail && <p className="text-red-500 text-xs mt-1">{errors.detail}</p>}
            {form.city && form.district && form.detail && (
              <p className="text-xs text-stone-400 mt-1.5 bg-stone-50 px-3 py-1.5 rounded-lg">
                📍 {fullAddress}
              </p>
            )}
          </div>

          {/* 備註 */}
          <div>
            <label className="label">備註（選填）</label>
            <textarea className="input resize-none" rows={2} placeholder="例：請小心輕放"
              value={form.note}
              onChange={e => setForm(f=>({...f,note:e.target.value}))} />
          </div>
        </div>

        {/* 付款說明 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-800">
          <p className="font-bold mb-1">💳 付款方式</p>
          <p>下單完成後，請至攤位出示訂單畫面，可使用<strong>現金、刷卡或台灣PAY</strong>付款後完成結帳。</p>
        </div>
      </div>

      {/* 底部送出 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-4">
        <div className="max-w-lg mx-auto">
          <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full text-base py-4">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                送出中…
              </span>
            ) : `確認送出 NT$${total.toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
