// ─── 託運單（100×150mm 定長標籤貼紙）──────────────────────────
import { QRCodeSVG } from 'qrcode.react'
import { STORE } from '../../config/store'

export default function WaybillA6({ order, items, senderInfo }) {
  // senderInfo 優先，fallback 到 store.js
  const senderName    = senderInfo?.sender_name        || STORE.name
  const senderPhone   = senderInfo?.sender_phone       || STORE.phone
  const senderAddress = senderInfo?.sender_address     || STORE.address
  const senderPostal  = senderInfo?.sender_postal_code || ''

  const postalCode = order.receiver_postal_code || ''
  const baseUrl    = window.location.origin + window.location.pathname
  const orderUrl   = `${baseUrl}#/order/${order.order_no}`

  return (
    <div style={{
      fontFamily: 'Noto Sans TC, sans-serif',
      color: '#000',
      width: '88mm',
      minHeight: '140mm',
      display: 'flex',
      flexDirection: 'column',
      gap: '3mm',
    }}>

      {/* ── 寄件人 ── */}
      <div style={{
        border: '1px solid #aaa',
        borderRadius: '3px',
        padding: '3mm 4mm',
        lineHeight: 1.5,
      }}>
        <div style={{ fontSize: '9px', color: '#888', letterSpacing: '2px', marginBottom: '2px' }}>
          寄　件　人
        </div>
        <div style={{ fontSize: '11px', fontWeight: '700' }}>{senderName}</div>
        <div style={{ fontSize: '11px', color: '#444' }}>
          {senderPhone}
          {senderPostal && `　${senderPostal}`}
          {senderAddress && `　${senderAddress}`}
        </div>
      </div>

      {/* ── 收件人 ── */}
      <div style={{
        border: '2.5px solid #000',
        borderRadius: '4px',
        padding: '3mm 4mm',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ fontSize: '9px', color: '#888', letterSpacing: '2px', marginBottom: '3mm' }}>
          收　件　人
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3mm', marginBottom: '2mm' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '900', fontSize: '28px', lineHeight: 1.15, marginBottom: '1mm' }}>
              {order.receiver_name}
            </div>
            <div style={{ fontWeight: '700', fontSize: '18px', letterSpacing: '1px', marginBottom: '2mm' }}>
              {order.receiver_phone}
            </div>
            {postalCode && (
              <div style={{
                fontWeight: '900', fontSize: '26px',
                fontFamily: 'monospace', letterSpacing: '5px',
                color: '#1a1a2e', lineHeight: 1,
              }}>
                {postalCode}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5mm' }}>
            <QRCodeSVG value={orderUrl} size={68} level="M" />
            <div style={{ fontSize: '8px', fontFamily: 'monospace', color: '#555', textAlign: 'center', lineHeight: 1.3 }}>
              掃碼查詢訂單<br/>{order.order_no}
            </div>
          </div>
        </div>

        <div style={{
          borderTop: '0.6mm dashed #555', paddingTop: '2mm',
          fontSize: '22px', fontWeight: '700', lineHeight: 1.5, wordBreak: 'break-all',
        }}>
          {order.receiver_address}
        </div>

        {order.note && (
          <div style={{
            marginTop: '2mm', padding: '1.5mm 2.5mm',
            background: '#fffde7', borderRadius: '3px', fontSize: '12px',
          }}>
            備註：{order.note}
          </div>
        )}

        <div style={{
          marginTop: 'auto', paddingTop: '2.5mm', borderTop: '1px solid #bbb',
          textAlign: 'center', fontSize: '18px', fontWeight: '700',
          letterSpacing: '1.5px', color: '#222',
        }}>
          無法投遞時，請退回寄件人
        </div>
      </div>

    </div>
  )
}
