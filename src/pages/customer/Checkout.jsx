import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../context/CartContext'
import { CITIES, getDistricts, getPostalCode } from '../../data/postal_codes'

export default function Checkout() {
  const { items, dispatch, total } = useCart()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '', phone: '', city: '', district: '', detail: '', postal_suffix: '', note: ''
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  // 郵遞區號前3碼（由縣市+鄉鎮自動帶出）
  const postalPrefix = getPostalCode(form.city, form.district)
  // 最終完整郵遞區號
  const postalCode = form.postal_suffix
    ? `${postalPrefix}-${form.postal_suffix}`
    : postalPrefix
  // 最終完整地址
  const fullAddress = `${form.city}${form.district}${form.detail}`

  function handleCityChange(city) {
    setForm(f => ({ ...f, city, district: '', detail: '' }))
    setErrors(e => ({ ...e, city: '', district: '' }))
  }

  function handleDistrictChange(district) {
    setForm(f => ({ ...f, district }))
    setErrors(e => ({ ...e, district: '' }))
  }

  function validate() {
    const e = {}
    if (!form.name.trim())     e.name     = '請填寫收件人姓名'
    if (!form.phone.trim())    e.phone    = '請填寫手機號碼'
    if (!/^09\d{8}$/.test(form.phone.replace(/-/g, '')))
      e.phone = '請輸入有效的手機號碼（09開頭10碼）'
    if (!form.city)            e.city     = '請選擇縣市'
    if (!form.district)        e.district = '請選擇鄉鎮市區'
    if (!form.detail.trim())   e.detail   = '請填寫詳細地址'
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
          receiver_phone:       form.phone.trim(),
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

        {/* 商品清單 */}
        <div className="card p-4">
          <h2 className="section-title">購物車（{items.length} 種商品）</h2>
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    : <span className="text-2xl">📦</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-stone-900 truncate">{item.name}</p>
                  <p className="text-xs text-stone-400">NT${item.price.toLocaleString()} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-stone-900 text-sm">NT${(item.price * item.quantity).toLocaleString()}</p>
                  <button onClick={() => dispatch({ type: 'REMOVE', id: item.id })}
                    className="text-stone-300 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-100 mt-4 pt-3 flex justify-between items-center">
            <span className="font-semibold text-stone-600">合計</span>
            <span className="font-black text-xl text-red-500">NT${total.toLocaleString()}</span>
          </div>
        </div>

        {/* 收件人資料 */}
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

          {/* 電話 */}
          <div>
            <label className="label">手機號碼</label>
            <input type="tel" className={`input ${errors.phone ? 'border-red-400' : ''}`}
              placeholder="0912-345-678" value={form.phone}
              onChange={e => { setForm(f=>({...f,phone:e.target.value})); setErrors(e2=>({...e2,phone:''})) }} />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          {/* 縣市 + 鄉鎮市區 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">縣市</label>
              <select className={`input bg-white ${errors.city ? 'border-red-400' : ''}`}
                value={form.city} onChange={e => handleCityChange(e.target.value)}>
                <option value="">請選擇縣市</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
            </div>
            <div>
              <label className="label">鄉鎮市區</label>
              <select className={`input bg-white ${errors.district ? 'border-red-400' : ''}`}
                value={form.district} onChange={e => handleDistrictChange(e.target.value)}
                disabled={!form.city}>
                <option value="">請選擇區域</option>
                {getDistricts(form.city).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {errors.district && <p className="text-red-500 text-xs mt-1">{errors.district}</p>}
            </div>
          </div>

          {/* 郵遞區號（自動帶出 + 可補後3碼） */}
          {form.district && (
            <div className="bg-stone-50 rounded-xl p-3 flex items-center gap-3">
              <div className="text-center">
                <p className="text-xs text-stone-400 mb-0.5">郵遞區號</p>
                <div className="flex items-center gap-1">
                  {/* 前3碼：自動帶出，唯讀 */}
                  <div className="bg-white border border-stone-300 rounded-lg px-3 py-2 font-mono font-bold text-stone-900 text-lg w-16 text-center">
                    {postalPrefix}
                  </div>
                  <span className="text-stone-400 font-bold">-</span>
                  {/* 後3碼：選填，手動輸入 */}
                  <input
                    type="text" inputMode="numeric" maxLength={3}
                    className="input font-mono font-bold text-lg text-center w-16"
                    placeholder="___"
                    value={form.postal_suffix}
                    onChange={e => setForm(f => ({ ...f, postal_suffix: e.target.value.replace(/\D/g,'').slice(0,3) }))}
                  />
                </div>
              </div>
              <div className="flex-1 text-xs text-stone-400 leading-relaxed">
                <p>前3碼已自動帶入</p>
                <p>後3碼可選填（需查郵局）</p>
                <p>不填也可正常寄送</p>
              </div>
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
            {/* 地址預覽 */}
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
              value={form.note} onChange={e => setForm(f=>({...f,note:e.target.value}))} />
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
