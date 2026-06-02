// ─── A4 出貨單（揀貨用）───────────────────────────────────
// 內容：訂單條碼 + 訂單資訊 + 收件人 + 付款方式 + 揀貨清單 + 商品條碼
import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { STORE, PAYMENT_LABELS } from '../../config/store'

function Barcode({ value, height = 50, displayValue = true }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          height,
          displayValue,
          fontSize: 11,
          margin: 4,
        })
      } catch (e) {
        // 條碼格式不合時靜默失敗
      }
    }
  }, [value, height, displayValue])
  if (!value) return null
  return <svg ref={ref} />
}

export default function ShippingSlipA4({ order, items }) {
  const PAYMENT_LABELS_LOCAL = { cash: '現金', card: '刷卡', taiwan_pay: '台灣PAY' }
  const STATUS_LABELS = {
    pending:'待結帳', paid:'已付款', picking:'揀貨中', packed:'已包裝', shipped:'已出貨'
  }

  return (
    <div style={{ fontFamily: 'Noto Sans TC, sans-serif', fontSize: '13px', color: '#000', padding: '0', lineHeight: 1.6 }}>

      {/* 標題列 */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'2px solid #000', paddingBottom:'8px', marginBottom:'10px' }}>
        <div>
          <div style={{ fontSize:'20px', fontWeight:'900' }}>{STORE.name} ─ 出貨單</div>
          <div style={{ fontSize:'11px', color:'#555' }}>
            下單：{new Date(order.created_at).toLocaleString('zh-TW')}
            {order.paid_at && ` ｜ 付款：${new Date(order.paid_at).toLocaleString('zh-TW')}`}
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize:'11px' }}>
          <div style={{ fontWeight:'bold', marginBottom:'2px' }}>狀態：{STATUS_LABELS[order.status] ?? order.status}</div>
          {order.payment_method && (
            <div style={{ background:'#f0f0f0', padding:'2px 8px', borderRadius:'4px', display:'inline-block', fontWeight:'bold' }}>
              付款方式：{PAYMENT_LABELS_LOCAL[order.payment_method] ?? order.payment_method}
            </div>
          )}
        </div>
      </div>

      {/* 訂單號條碼 */}
      <div style={{ textAlign:'center', marginBottom:'10px' }}>
        <Barcode value={order.order_no} height={45} />
        <div style={{ fontFamily:'monospace', fontWeight:'bold', fontSize:'14px' }}>{order.order_no}</div>
      </div>

      {/* 兩欄：收件人 + 寄件人 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
        <div style={{ border:'1px solid #ccc', borderRadius:'6px', padding:'10px' }}>
          <div style={{ fontSize:'11px', color:'#666', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'1px' }}>收件人</div>
          <div style={{ fontWeight:'900', fontSize:'16px' }}>{order.receiver_name}</div>
          <div style={{ fontWeight:'bold' }}>{order.receiver_phone}</div>
          <div>{order.receiver_address}</div>
          {order.note && <div style={{ marginTop:'4px', padding:'4px 6px', background:'#fffde7', borderRadius:'4px', fontSize:'12px' }}>備註：{order.note}</div>}
        </div>
        <div style={{ border:'1px solid #ccc', borderRadius:'6px', padding:'10px' }}>
          <div style={{ fontSize:'11px', color:'#666', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'1px' }}>寄件人</div>
          <div style={{ fontWeight:'900', fontSize:'16px' }}>{STORE.name}</div>
          <div style={{ fontWeight:'bold' }}>{STORE.phone}</div>
          <div>{STORE.address}</div>
        </div>
      </div>

      {/* 商品揀貨清單 */}
      <div style={{ border:'1px solid #ccc', borderRadius:'6px', overflow:'hidden', marginBottom:'12px' }}>
        <div style={{ background:'#1a1a2e', color:'white', padding:'8px 12px', fontWeight:'bold', fontSize:'12px', letterSpacing:'1px' }}>
          商品揀貨清單
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f5f5f5' }}>
              <th style={{ padding:'6px 10px', textAlign:'left', fontSize:'11px', border:'none', borderBottom:'1px solid #ddd' }}>□</th>
              <th style={{ padding:'6px 10px', textAlign:'left', fontSize:'11px', border:'none', borderBottom:'1px solid #ddd' }}>商品名稱 / 條碼</th>
              <th style={{ padding:'6px 10px', textAlign:'center', fontSize:'11px', border:'none', borderBottom:'1px solid #ddd' }}>數量</th>
              <th style={{ padding:'6px 10px', textAlign:'right', fontSize:'11px', border:'none', borderBottom:'1px solid #ddd' }}>小計</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ borderBottom:'1px solid #eee', background: i%2===0?'#fff':'#fafafa' }}>
                <td style={{ padding:'8px 10px', textAlign:'center', fontSize:'18px' }}>☐</td>
                <td style={{ padding:'8px 10px' }}>
                  <div style={{ fontWeight:'bold' }}>{item.product_name}</div>
                  {item.product_barcode && (
                    <div style={{ marginTop:'2px' }}>
                      <Barcode value={item.product_barcode} height={28} displayValue={true} />
                    </div>
                  )}
                </td>
                <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:'bold', fontSize:'16px' }}>
                  {item.quantity}
                </td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold' }}>
                  NT${(item.unit_price * item.quantity).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background:'#f5f5f5', borderTop:'2px solid #ccc' }}>
              <td colSpan="3" style={{ padding:'10px', textAlign:'right', fontWeight:'bold', fontSize:'13px' }}>合計</td>
              <td style={{ padding:'10px', textAlign:'right', fontWeight:'900', fontSize:'18px' }}>
                NT${order.total_amount.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 底部備注 */}
      <div style={{ fontSize:'11px', color:'#888', textAlign:'center', borderTop:'1px dashed #ccc', paddingTop:'8px' }}>
        此出貨單由系統自動產生 · {STORE.name} · 列印時間：{new Date().toLocaleString('zh-TW')}
      </div>
    </div>
  )
}
