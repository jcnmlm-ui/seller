// ─── A4 出貨單 ─────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { STORE, PAYMENT_LABELS } from '../../config/store'

function Barcode({ value, height = 45, displayValue = true }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128', height, displayValue, fontSize: 11, margin: 3,
        })
      } catch {}
    }
  }, [value, height, displayValue])
  if (!value) return null
  return <svg ref={ref} />
}

const STATUS_LABELS = {
  pending:'待結帳', paid:'已付款', picking:'揀貨中',
  packed:'已包裝', shipped:'已出貨', delivered:'已送達',
}

export default function ShippingSlipA4({ order, items, senderInfo }) {
  // senderInfo 優先，fallback 到 store.js
  const senderName    = senderInfo?.sender_name        || STORE.name
  const senderPhone   = senderInfo?.sender_phone       || STORE.phone
  const senderAddress = senderInfo?.sender_address     || STORE.address
  const senderPostal  = senderInfo?.sender_postal_code || ''

  const postalCode = order.receiver_postal_code || ''

  return (
    <div style={{ fontFamily:'Noto Sans TC,sans-serif', fontSize:'13px', color:'#000', lineHeight:1.6 }}>

      {/* ── 標題 ── */}
      <div style={{ borderBottom:'2px solid #000', paddingBottom:'8px', marginBottom:'10px',
                    display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontSize:'20px', fontWeight:'900' }}>{senderName}　出貨單</div>
          <div style={{ fontSize:'11px', color:'#555' }}>
            下單：{new Date(order.created_at).toLocaleString('zh-TW')}
            {order.paid_at && `　付款：${new Date(order.paid_at).toLocaleString('zh-TW')}`}
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize:'11px' }}>
          <span style={{ background:'#1a1a2e', color:'white', padding:'2px 10px',
                         borderRadius:'4px', fontWeight:'bold', marginRight:'6px' }}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          {order.payment_method && (
            <span style={{ background:'#f0f0f0', padding:'2px 8px', borderRadius:'4px', fontWeight:'bold' }}>
              {PAYMENT_LABELS[order.payment_method]?.slice(2)}
            </span>
          )}
        </div>
      </div>

      {/* ── 訂單號條碼 ── */}
      <div style={{ textAlign:'center', marginBottom:'10px' }}>
        <Barcode value={order.order_no} height={40} />
        <div style={{ fontFamily:'monospace', fontWeight:'bold', fontSize:'14px' }}>{order.order_no}</div>
      </div>

      {/* ── 寄件人（左）+ 收件人（右）── */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 3fr', gap:'12px', marginBottom:'14px' }}>

        {/* 寄件人 */}
        <div style={{ border:'1px solid #ccc', borderRadius:'6px', padding:'10px 12px' }}>
          <div style={{ fontSize:'10px', color:'#888', letterSpacing:'2px', marginBottom:'5px' }}>
            寄　件　人
          </div>
          <div style={{ fontWeight:'700', fontSize:'14px' }}>{senderName}</div>
          {senderPhone   && <div style={{ fontSize:'12px', marginTop:'2px' }}>{senderPhone}</div>}
          {senderPostal  && <div style={{ fontSize:'12px', marginTop:'2px' }}>{senderPostal}</div>}
          {senderAddress && <div style={{ fontSize:'12px', marginTop:'2px', color:'#444' }}>{senderAddress}</div>}
        </div>

        {/* 收件人 */}
        <div style={{ border:'2px solid #000', borderRadius:'6px', padding:'12px 14px' }}>
          <div style={{ fontSize:'10px', color:'#888', letterSpacing:'2px', marginBottom:'6px' }}>
            收　件　人
          </div>
          <div style={{ fontWeight:'900', fontSize:'22px', lineHeight:'1.2', marginBottom:'4px' }}>
            {order.receiver_name}
          </div>
          <div style={{ fontWeight:'700', fontSize:'16px', marginBottom:'6px' }}>
            {order.receiver_phone}
          </div>
          {postalCode && (
            <div style={{ fontWeight:'900', fontSize:'22px', fontFamily:'monospace',
                          letterSpacing:'4px', color:'#1a1a2e', marginBottom:'2px' }}>
              {postalCode}
            </div>
          )}
          <div style={{ fontSize:'14px', lineHeight:'1.6' }}>{order.receiver_address}</div>
          {order.note && (
            <div style={{ marginTop:'6px', padding:'4px 8px', background:'#fffde7',
                          borderRadius:'4px', fontSize:'12px' }}>
              備註：{order.note}
            </div>
          )}
        </div>
      </div>

      {/* ── 商品清單 ── */}
      <div style={{ border:'1px solid #ccc', borderRadius:'6px', overflow:'hidden', marginBottom:'12px' }}>
        <div style={{ background:'#1a1a2e', color:'white', padding:'7px 12px',
                      fontWeight:'bold', fontSize:'12px', letterSpacing:'1px' }}>
          商品揀貨清單
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f5f5f5' }}>
              <th style={{ padding:'5px 10px', textAlign:'left', fontSize:'11px',
                           borderBottom:'1px solid #ddd', width:'28px' }}>□</th>
              <th style={{ padding:'5px 10px', textAlign:'left', fontSize:'11px',
                           borderBottom:'1px solid #ddd' }}>商品名稱 / 條碼</th>
              <th style={{ padding:'5px 10px', textAlign:'center', fontSize:'11px',
                           borderBottom:'1px solid #ddd', width:'50px' }}>數量</th>
              <th style={{ padding:'5px 10px', textAlign:'right', fontSize:'11px',
                           borderBottom:'1px solid #ddd', width:'80px' }}>小計</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ borderBottom:'1px solid #eee',
                                         background: i%2===0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding:'8px 10px', textAlign:'center', fontSize:'18px' }}>☐</td>
                <td style={{ padding:'8px 10px' }}>
                  <div style={{ fontWeight:'bold' }}>{item.product_name}</div>
                  {item.product_barcode && (
                    <div style={{ marginTop:'2px' }}>
                      <Barcode value={item.product_barcode} height={26} displayValue={true} />
                    </div>
                  )}
                </td>
                <td style={{ padding:'8px 10px', textAlign:'center',
                              fontWeight:'bold', fontSize:'16px' }}>{item.quantity}</td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold' }}>
                  NT${(item.unit_price * item.quantity).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background:'#f5f5f5', borderTop:'2px solid #ccc' }}>
              <td colSpan="3" style={{ padding:'9px 10px', textAlign:'right',
                                       fontWeight:'bold', fontSize:'13px' }}>實收合計</td>
              <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:'900', fontSize:'18px' }}>
                NT${order.total_amount.toLocaleString()}
              </td>
            </tr>
            {(() => {
              const stampTotal = items.reduce((s, i) => s + (Number(i.stamp_amount) || 0) * i.quantity, 0)
              if (stampTotal === 0) return null
              const invoiceAmount = order.total_amount - stampTotal
              return (
                <tr style={{ background:'#eef6ff', borderTop:'1px solid #ddd' }}>
                  <td colSpan="3" style={{ padding:'6px 10px', textAlign:'right',
                                           fontWeight:'bold', fontSize:'12px', color:'#444' }}>
                    發票金額（扣郵票 NT${stampTotal.toLocaleString()}）
                  </td>
                  <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:'700', fontSize:'15px', color:'#333' }}>
                    NT${invoiceAmount.toLocaleString()}
                  </td>
                </tr>
              )
            })()}
          </tfoot>
        </table>
      </div>

      {/* ── 頁尾 ── */}
      <div style={{ fontSize:'10px', color:'#aaa', textAlign:'center',
                    borderTop:'1px dashed #ccc', paddingTop:'7px' }}>
        此出貨單由系統自動產生 · {senderName} · 列印時間：{new Date().toLocaleString('zh-TW')}
      </div>
    </div>
  )
}
