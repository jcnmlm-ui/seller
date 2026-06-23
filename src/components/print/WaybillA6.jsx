// ─── 託運單（100×150mm 定長標籤貼紙）──────────────────────────
import { QRCodeSVG } from 'qrcode.react'
import { STORE } from '../../config/store'

export default function WaybillA6({ order, items, senderInfo }) {
  // senderInfo 優先，fallback 到 store.js
  const senderName    = senderInfo?.sender_name        || STORE.name
  const senderPhone   = senderInfo?.sender_phone       || STORE.phone
  const senderAddress = senderInfo?.sender_address     || STORE.address
  const senderPostal  = senderInfo?.sender_postal_code || ''

  // 郵遞區號格式化：純數字（如 800801）自動補上 "-"（800-801）；已含 "-" 則不重複處理
  function formatPostal(raw) {
    if (!raw) return ''
    if (raw.includes('-')) return raw
    const digits = raw.replace(/\D/g, '')
    if (digits.length === 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return raw
  }
  const postalCode = formatPostal(order.receiver_postal_code)

  const baseUrl  = window.location.origin + window.location.pathname
  const orderUrl = `${baseUrl}#/order/${order.order_no}`

  // 解析收件人電話：支援 "手機:xxx / 市話:xxx"、純手機、純市話（含分機 #409 等）
  function parsePhones(raw) {
    if (!raw) return { mobile: '', landline: '' }
    if (raw.includes('/')) {
      const [a, b] = raw.split('/')
      const mobile   = a.replace(/手機[：:]\s*/g, '').trim()
      const landline = b ? b.replace(/市話[：:]\s*/g, '').trim() : ''
      return { mobile, landline }
    }
    if (raw.includes('市話')) {
      return { mobile: '', landline: raw.replace(/市話[：:]\s*/g, '').trim() }
    }
    return { mobile: raw.trim(), landline: '' }
  }
  const { mobile, landline } = parsePhones(order.receiver_phone)

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
        <div style={{ fontSize: '10px', color: '#888', letterSpacing: '2px', marginBottom: '2px' }}>
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
        <div style={{ fontSize: '10px', color: '#888', letterSpacing: '2px', marginBottom: '3mm' }}>
          收　件　人
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3mm', marginBottom: '2mm' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 收件人姓名：縮小 2px（28px → 26px）*/}
            <div style={{ fontWeight: '900', fontSize: '26px', lineHeight: 1.15, marginBottom: '1.5mm' }}>
              {order.receiver_name}
            </div>

            {/* 手機/市話：縮小 1px（18px → 17px），前面加標籤，行距更密集 */}
            {mobile && (
              <div style={{ fontWeight: '700', fontSize: '17px', letterSpacing: '0.5px', lineHeight: 1.3 }}>
                手機：{mobile}
              </div>
            )}
            {landline && (
              <div style={{ fontWeight: '700', fontSize: '17px', letterSpacing: '0.5px', lineHeight: 1.3, wordBreak: 'break-all' }}>
                市話：{landline}
              </div>
            )}

            {postalCode && (
              <div style={{
                fontWeight: '900', fontSize: '26px',
                fontFamily: 'monospace', letterSpacing: '4px',
                color: '#1a1a2e', lineHeight: 1, marginTop: '1.5mm',
              }}>
                {postalCode}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5mm' }}>
            <QRCodeSVG value={orderUrl} size={68} level="M" />
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#555', textAlign: 'center', lineHeight: 1.3 }}>
              掃碼查詢訂單<br/>{order.order_no}
            </div>
          </div>
        </div>

        {/* 地址（虛線移到地址跟備註之間，這裡不再有上方虛線） */}
        <div style={{
          fontSize: '22px', fontWeight: '700', lineHeight: 1.5, wordBreak: 'break-all',
        }}>
          {order.receiver_address}
        </div>

        {order.note && (
          <div style={{
            marginTop: '2mm', paddingTop: '2mm',
            borderTop: '0.6mm dashed #555',
          }}>
            <div style={{
              padding: '1.5mm 2.5mm',
              background: '#fffde7', borderRadius: '3px', fontSize: '12px',
            }}>
              備註：{order.note}
            </div>
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
