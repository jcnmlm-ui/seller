// ─── A5 託運單（貼包裹用）──────────────────────────────────
// 內容：寄件人 + 收件人（大字） + 訂單號 QR + 條碼 + 商品摘要
import { useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import JsBarcode from 'jsbarcode'
import { STORE } from '../../config/store'

function Barcode({ value, height = 35 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          height,
          displayValue: true,
          fontSize: 10,
          margin: 3,
        })
      } catch {}
    }
  }, [value, height])
  if (!value) return null
  return <svg ref={ref} style={{ width:'100%', maxWidth:'200px' }} />
}

export default function WaybillA5({ order, items }) {
  const itemSummary = items
    .map(i => `${i.product_name}×${i.quantity}`)
    .join('、')

  // 線上訂單頁網址（用於 QR Code）
  const baseUrl = window.location.origin + window.location.pathname
  const orderUrl = `${baseUrl}#/order/${order.order_no}`

  return (
    <div style={{
      fontFamily: 'Noto Sans TC, sans-serif',
      fontSize: '13px',
      color: '#000',
      width: '148mm',
      minHeight: '210mm',
      padding: '0',
      boxSizing: 'border-box',
    }}>

      {/* 寄件人 */}
      <div style={{ border:'2px solid #000', borderRadius:'6px', padding:'10px 12px', marginBottom:'8px' }}>
        <div style={{ fontSize:'10px', color:'#666', letterSpacing:'2px', marginBottom:'4px' }}>寄 件 人</div>
        <div style={{ fontWeight:'900', fontSize:'15px' }}>{STORE.name}</div>
        <div style={{ fontSize:'12px', color:'#333' }}>{STORE.phone}</div>
        <div style={{ fontSize:'12px', color:'#333' }}>{STORE.address}</div>
      </div>

      {/* 收件人（大字） */}
      <div style={{ border:'3px solid #000', borderRadius:'6px', padding:'12px', marginBottom:'10px', background:'#fafafa' }}>
        <div style={{ fontSize:'10px', color:'#666', letterSpacing:'2px', marginBottom:'6px' }}>收 件 人</div>
        <div style={{ fontWeight:'900', fontSize:'26px', lineHeight:'1.2', marginBottom:'6px' }}>
          {order.receiver_name}
        </div>
        <div style={{ fontWeight:'bold', fontSize:'16px', marginBottom:'4px' }}>
          {order.receiver_phone}
        </div>
        <div style={{ fontSize:'14px', lineHeight:'1.5' }}>
          {order.receiver_address}
        </div>
        {order.note && (
          <div style={{ marginTop:'6px', background:'#fffde7', border:'1px solid #ffe082', borderRadius:'4px', padding:'4px 8px', fontSize:'12px' }}>
            備註：{order.note}
          </div>
        )}
      </div>

      {/* 訂單號 + QR + 條碼 */}
      <div style={{ border:'1px solid #ccc', borderRadius:'6px', padding:'10px', marginBottom:'8px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
          {/* QR Code */}
          <div style={{ flexShrink:0 }}>
            <QRCodeSVG value={orderUrl} size={80} level="M" />
          </div>
          {/* 訂單資訊 */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'10px', color:'#888', letterSpacing:'1px' }}>訂單號碼</div>
            <div style={{ fontFamily:'monospace', fontWeight:'bold', fontSize:'13px', marginBottom:'4px' }}>
              {order.order_no}
            </div>
            <Barcode value={order.order_no} height={32} />
          </div>
        </div>
      </div>

      {/* 商品摘要 */}
      <div style={{ background:'#f5f5f5', borderRadius:'6px', padding:'8px 12px', fontSize:'12px', color:'#333' }}>
        <div style={{ fontWeight:'bold', marginBottom:'3px', fontSize:'11px', color:'#666', letterSpacing:'1px' }}>商品摘要</div>
        <div>{itemSummary || '—'}</div>
        <div style={{ marginTop:'4px', fontWeight:'bold', textAlign:'right', fontSize:'14px' }}>
          NT${order.total_amount.toLocaleString()}
        </div>
      </div>

    </div>
  )
}
