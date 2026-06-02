import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../context/CartContext'

export default function Checkout() {
  const { items, dispatch, total } = useCart()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', phone: '', address: '', note: '' })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-stone-400">
        <p className="text-5xl">🛒</p>
        <p className="font-semibold">購物車是空的</p>
        <Link to="/" className="btn-primary text-sm">去選商品</Link>
      </div>
    )
  }

  function validate() {
    const e = {}
    if (!form.name.trim())    e.name    = '請填寫收件人姓名'
    if (!form.phone.trim())   e.phone   = '請填寫手機號碼'
    if (!form.address.trim()) e.address = '請填寫收件地址'
    if (!/^09\d{8}$/.test(form.phone.replace(/-/g, '')))
      e.phone = '請輸入有效的手機號碼（09開頭10碼）'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setLoading(true)

    try {
      // 1. 先呼叫庫存扣減函數
      const productIds = items.map(i => i.id)
      const quantities = items.map(i => i.quantity)

      const { error: stockErr } = await supabase.rpc('decrement_stock', {
        p_product_ids: productIds,
        p_quantities: quantities,
      })
      if (stockErr) throw new Error(stockErr.message)

      // 2. 建立訂單（order_no 由 DB trigger 自動產生）
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_no:         '',   // trigger 會覆寫
          receiver_name:    form.name.trim(),
          receiver_phone:   form.phone.trim(),
          receiver_address: form.address.trim(),
          note:             form.note.trim() || null,
          total_amount:     total,
          status:           'pending',
        })
        .select('order_no')
        .single()

      if (orderErr) throw new Error(orderErr.message)

      // 3. 建立訂單明細
      const itemRows = items.map(i => ({
        order_id:        order.id ?? undefined, // 有時 select('order_no') 要另取 id
        product_id:      i.id,
        product_name:    i.name,
        product_barcode: i.barcode ?? null,
        unit_price:      i.price,
        quantity:        i.quantity,
      }))

      // 重新取得含 id 的訂單
      const { data: fullOrder } = await supabase
        .from('orders')
        .select('id, order_no')
        .eq('order_no', order.order_no)
        .single()

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(itemRows.map(r => ({ ...r, order_id: fullOrder.id })))

      if (itemsErr) throw new Error(itemsErr.message)

      // 4. 清空購物車，跳到確認頁
      dispatch({ type: 'CLEAR' })
      navigate(`/order/${fullOrder.order_no}`)

    } catch (err) {
      alert('下單失敗：' + err.message)
      setLoading(false)
    }
  }

  function field(key, label, placeholder, type = 'text') {
    return (
      <div>
        <label className="label">{label}</label>
        <input
          type={type}
          className={`input ${errors[key] ? 'border-red-400 ring-1 ring-red-400' : ''}`}
          placeholder={placeholder}
          value={form[key]}
          onChange={e => {
            setForm(f => ({ ...f, [key]: e.target.value }))
            setErrors(e2 => ({ ...e2, [key]: '' }))
          }}
        />
        {errors[key] && <p className="text-red-500 text-xs mt-1">{errors[key]}</p>}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="btn-ghost p-2"><ArrowLeft size={20} /></Link>
          <h1 className="font-bold text-stone-900">確認訂單</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5 fade-up">

        {/* 商品清單 */}
        <div className="card p-4">
          <h2 className="section-title">購物車 ({items.length} 種商品)</h2>
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
                  <p className="font-bold text-stone-900 text-sm">
                    NT${(item.price * item.quantity).toLocaleString()}
                  </p>
                  <button
                    onClick={() => dispatch({ type: 'REMOVE', id: item.id })}
                    className="text-stone-300 hover:text-red-400 transition-colors"
                  >
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
          {field('name', '收件人姓名', '王小明')}
          {field('phone', '手機號碼', '0912-345-678', 'tel')}
          {field('address', '收件地址', '台北市信義區信義路五段7號')}
          <div>
            <label className="label">備註（選填）</label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="例：請小心輕放"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>

        {/* 付款說明 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-800">
          <p className="font-bold mb-1">💳 付款方式</p>
          <p>下單完成後，請至攤位出示訂單畫面，可使用<strong>現金、刷卡或台灣PAY</strong>付款後完成結帳。</p>
        </div>
      </div>

      {/* Bottom Submit Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full text-base py-4"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                送出中…
              </span>
            ) : (
              `確認送出 NT${total.toLocaleString()}`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
