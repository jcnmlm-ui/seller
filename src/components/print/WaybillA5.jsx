// ─── A5 託運單 ─────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import JsBarcode from 'jsbarcode'
import { STORE } from '../../config/store'

function Barcode({ value, height = 32 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128', height, displayValue: true, fontSize: 10, margin: 3,
        })
      } catch {}
    }
  }, [value, height])
  if (!value) return null
  return <svg ref={ref} style={{ width:'100%', maxWidth:'180px' }} />
}

export default function WaybillA5({ order, items }) {
  const postalCode = order.receiver_postal_code || ''
  const baseUrl = window.location.origin + window.location.pathname
  const orderUrl = `${baseUrl}#/order/${order.order_no}`
  const itemSummary = items.map(i => `${i.product_name}×${i.quantity}`).join('、')

  return (
    <div style={{
      fontFamily: 'Noto Sans TC, sans-serif',
      fontSize: '13px',
      color: '#000',
      width: '148mm',
      minHeight: '205mm',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── 寄件人（緊湊） ── */}
      <div style={{ border:'1.5px solid #000', borderRadius:'5px',
                    padding:'8px 12px', marginBottom:'7px' }}>
        <div style={{ fontSize:'9px', color:'#888', letterSpacing:'3px', marginBottom:'3px' }}>
          寄　件　人
        </div>
        <div style={{ fontWeight:'900', fontSize:'13px' }}>{STORE.name}</div>
        <div style={{ fontSize:'12px' }}>{STORE.phone}</div>
        <div style={{ fontSize:'12px', color:'#333' }}>{STORE.address}</div>
      </div>

      {/* ── 收件人（主角）── */}
      <div style={{ border:'3px solid #000', borderRadius:'6px',
                    padding:'12px 14px', marginBottom:'8px',
                    display:'flex', flexDirection:'column', flex:'1' }}>
        <div style={{ fontSize:'9px', color:'#888', letterSpacing:'3px', marginBottom:'7px' }}>
          收　件　人
        </div>

        {/* 姓名 */}
        <div style={{ fontWeight:'900', fontSize:'28px', lineHeight:'1.15', marginBottom:'5px' }}>
          {order.receiver_name}
        </div>

        {/* 電話 */}
        <div style={{ fontWeight:'700', fontSize:'18px', marginBottom:'8px', letterSpacing:'1px' }}>
          {order.receiver_phone}
        </div>

        {/* 郵遞區號 */}
        {postalCode && (
          <div style={{ fontWeight:'900', fontSize:'26px', fontFamily:'monospace',
                        letterSpacing:'6px', color:'#1a1a2e', lineHeight:'1',
                        marginBottom:'4px', borderBottom:'1px dashed #ccc', paddingBottom:'6px' }}>
            {postalCode}
          </div>
        )}

        {/* 地址 — 與郵遞區號同大小 */}
        <div style={{ fontSize:'26px', lineHeight:'1.5', fontWeight:'700', marginTop:'4px' }}>
          {order.receiver_address}
        </div>

        {/* 無法投遞聲明 — 收件人框底部中央，與電話同大小 */}
        <div style={{ marginTop:'auto', paddingTop:'14px', textAlign:'center',
                      fontSize:'18px', fontWeight:'700', letterSpacing:'2px',
                      color:'#333', borderTop:'1px solid #ccc' }}>
          無法投遞，請退回寄件人
        </div>
      </div>

      {/* ── 訂單號 + QR Code ── */}
      <div style={{ border:'1px solid #ccc', borderRadius:'5px',
                    padding:'8px 10px', marginBottom:'7px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ flexShrink:0 }}>
            <QRCodeSVG value={orderUrl} size={72} level="M" />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'9px', color:'#888', letterSpacing:'1px' }}>訂單號碼</div>
            <div style={{ fontFamily:'monospace', fontWeight:'bold', fontSize:'12px', marginBottom:'3px' }}>
              {order.order_no}
            </div>
            <Barcode value={order.order_no} height={28} />
          </div>
        </div>
      </div>

      {/* ── 商品摘要（無金額） ── */}
      <div style={{ background:'#f5f5f5', borderRadius:'5px', padding:'6px 10px',
                    fontSize:'11px', color:'#444' }}>
        <div style={{ fontWeight:'bold', fontSize:'9px', color:'#888',
                      letterSpacing:'1px', marginBottom:'2px' }}>商品摘要</div>
        <div style={{ lineHeight:'1.6' }}>{itemSummary || '—'}</div>
      </div>

    </div>
  )
}
