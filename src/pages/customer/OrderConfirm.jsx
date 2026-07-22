import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../../lib/supabase'
import { STATUS_CONFIG, PAYMENT_LABELS } from '../../config/store'
import { useEnabledPaymentMethods } from '../../hooks/useEnabledPaymentMethods'

// 郵局包裹追蹤網址
const POST_TRACK_URL = 'https://postserv.post.gov.tw/pstatus/TrackMail.jsp?id='

export default function OrderConfirm() {
  const enabledPayMethods = useEnabledPaymentMethods()
  const { orderNo } = useParams()
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: ord } = await supabase
        .from('orders').select('*').eq('order_no', orderNo).single()
      if (ord) {
        setOrder(ord)
        const { data: its } = await supabase
          .from('order_items').select('*').eq('order_id', ord.id)
        setItems(its ?? [])
      }
      setLoading(false)
    }
    load()
  }, [orderNo])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-stone-400 px-8 text-center">
        <p className="text-5xl">🔍</p>
        <p className="font-semibold">找不到訂單</p>
        <p className="text-sm">訂單編號：{orderNo}</p>
        <Link to="/query" className="btn-secondary text-sm">查詢其他訂單</Link>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending
  const isPending  = order.status === 'pending'
  const isShipped  = order.status === 'shipped' || order.status === 'delivered'
  const qrValue    = window.location.href

  return (
    <div className="min-h-screen bg-stone-50 pb-8">
      {/* 狀態 Header */}
      <div className={`py-8 px-6 text-center text-white
        ${isPending ? 'bg-red-500' : isShipped ? 'bg-green-600' : 'bg-stone-700'}`}>
        <div className="text-5xl mb-3">
          {isPending ? '✅' : isShipped ? '🚚' : '📦'}
        </div>
        <h1 className="text-2xl font-black mb-1">
          {isPending ? '預購成功！' : `訂單${statusCfg.label}`}
        </h1>
        {isPending && (
          <p className="text-sm opacity-80">請保留此畫面，前往攤位出示結帳</p>
        )}
        {isShipped && order.tracking_no && (
          <p className="text-sm opacity-90 mt-1">包裹已出貨，可點擊下方連結追蹤</p>
        )}
      </div>

      <div className="max-w-sm mx-auto px-4 py-5 space-y-4 fade-up">

        {/* 訂單號 + QR */}
        <div className="card p-5 text-center">
          <p className="text-xs text-stone-400 mb-1 font-mono tracking-widest">訂單號碼</p>
          <p className="font-mono font-black text-xl text-stone-900 mb-4">{order.order_no}</p>
          <div className="flex justify-center mb-3">
            <div className="bg-white p-3 rounded-2xl border-2 border-stone-200 inline-block">
              <QRCodeSVG value={qrValue} size={160} level="M" />
            </div>
          </div>
          <p className="text-xs text-stone-400">攤位人員掃描此 QR Code 即可帶出您的訂單</p>
        </div>

        {/* 包裹追蹤號碼（已出貨才顯示）*/}
        {order.tracking_no && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🚚</span>
              <p className="font-bold text-stone-800">包裹追蹤</p>
            </div>
            <div className="bg-stone-50 rounded-xl px-4 py-2 flex items-center justify-between gap-3 mb-2">
              <span className="font-mono font-bold text-stone-900 text-sm tracking-widest">
                {order.tracking_no}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(order.tracking_no).then(() => alert('已複製'))}
                className="text-xs text-stone-400 hover:text-stone-600 flex-shrink-0"
              >
                複製
              </button>
            </div>
            <a
              href={`${POST_TRACK_URL}${order.tracking_no}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 bg-red-500 text-white font-bold text-sm py-2.5 rounded-xl hover:bg-red-600 transition-colors"
            >
              前往中華郵政查詢包裹狀態 →
            </a>
          </div>
        )}

        {/* 付款方式 */}
        {isPending ? (
          <div className="card p-4">
            <p className="text-sm font-bold text-stone-700 mb-2">💳 可使用付款方式</p>
            <div className="flex gap-2">
              {Object.entries(PAYMENT_LABELS)
                .filter(([k]) => enabledPayMethods.includes(k))
                .map(([k, v]) => (
                <span key={k} className="bg-stone-100 text-stone-600 text-xs px-3 py-1.5 rounded-lg font-medium">
                  {v}
                </span>
              ))}
            </div>
          </div>
        ) : (
          order.payment_method && (
            <div className="card p-4 flex items-center gap-3">
              <span className="text-xl">{PAYMENT_LABELS[order.payment_method]?.slice(0,2)}</span>
              <div>
                <p className="text-xs text-stone-400">付款方式</p>
                <p className="font-bold text-stone-800">{PAYMENT_LABELS[order.payment_method]}</p>
              </div>
            </div>
          )
        )}

        {/* 訂單狀態 */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-stone-600">訂單狀態</span>
            <span className={`badge ${statusCfg.bg} ${statusCfg.text}`}>{statusCfg.label}</span>
          </div>
          <p className="text-xs text-stone-400">
            下單時間：{new Date(order.created_at).toLocaleString('zh-TW')}
          </p>
          {order.paid_at && (
            <p className="text-xs text-stone-400">
              付款時間：{new Date(order.paid_at).toLocaleString('zh-TW')}
            </p>
          )}
          {order.shipped_at && (
            <p className="text-xs text-stone-400">
              出貨時間：{new Date(order.shipped_at).toLocaleString('zh-TW')}
            </p>
          )}
        </div>

        {/* 收件資訊 */}
        <div className="card p-4 space-y-2">
          <p className="text-sm font-semibold text-stone-700 mb-2">📬 寄送資訊</p>
          {[
            ['收件人', order.receiver_name],
            ['電話',   order.receiver_phone],
            order.receiver_postal_code ? ['郵遞區號', order.receiver_postal_code] : null,
            ['地址',   order.receiver_address],
            order.note ? ['備註', order.note] : null,
          ].filter(Boolean).map(([l, v]) => (
            <div key={l} className="flex gap-3 text-sm">
              <span className="text-stone-400 w-16 flex-shrink-0">{l}</span>
              <span className="text-stone-700 font-medium">{v}</span>
            </div>
          ))}
        </div>

        {/* 商品明細 */}
        <div className="card p-4">
          <p className="text-sm font-semibold text-stone-700 mb-3">🛒 商品明細</p>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-stone-700">
                  {item.product_name}
                  <span className="text-stone-400 ml-1">×{item.quantity}</span>
                </span>
                <span className="font-semibold text-stone-900">
                  NT${(item.unit_price * item.quantity).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-100 mt-3 pt-3">
            {(() => {
              const stampTotal = items.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.quantity, 0)
              const invoiceAmount = order.total_amount - stampTotal
              return (
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-stone-600">合計</span>
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {stampTotal > 0 && <span className="text-xs text-stone-400">實收</span>}
                      <span className="font-black text-lg text-red-500">
                        NT${order.total_amount.toLocaleString()}
                      </span>
                    </div>
                    {stampTotal > 0 && (
                      <div className="flex items-center gap-2 justify-end mt-0.5">
                        <span className="text-xs text-stone-400">發票</span>
                        <span className="font-semibold text-stone-500 text-sm">NT${invoiceAmount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* 提醒（待結帳） */}
        {isPending && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            <p className="font-bold mb-1">⚠️ 請注意</p>
            <p>請截圖或加入書籤，至攤位出示後完成結帳。若不慎關閉，可使用下方連結重新查詢。</p>
          </div>
        )}

        {/* 底部操作 */}
        <div className="flex gap-3">
          <Link to="/" className="btn-secondary flex-1 text-center text-sm">繼續選購</Link>
          <Link to="/query" className="btn-ghost flex-1 text-center text-sm">查詢訂單</Link>
        </div>
      </div>
    </div>
  )
}
