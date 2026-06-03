// ─── 託運單（100×150mm 定長標籤貼紙）──────────────────────────
// 原 A6（105×148mm）調整為 XP-420B 捲紙尺寸 100×150mm

import { useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { STORE } from '../../config/store'

export default function WaybillA5({ order, items }) {
  const postalCode = order.receiver_postal_code || ''
  const baseUrl = window.location.origin + window.location.pathname
  const orderUrl = `${baseUrl}#/order/${order.order_no}`

  return (
    <div style={{
      fontFamily: 'Noto Sans TC, sans-serif',
      color: '#000',
      width: '88mm',        // 100mm 紙寬 - 6mm×2 邊距
      minHeight: '140mm',   // 150mm 紙高 - 5mm×2 邊距
      display: 'flex',
      flexDirection: 'column',
      gap: '3mm',
    }}>

      {/* ── 寄件人：單行橫排，緊湊 ── */}
      <div style={{
        border: '1px solid #aaa',
        borderRadius: '3px',
        padding: '3mm 4mm',
        lineHeight: 1.5,
      }}>
        <div style={{
          fontSize: '8px', color: '#888', letterSpacing: '2px',
          marginBottom: '2px',
        }}>寄　件　人</div>
        <div style={{ fontSize: '11px', fontWeight: '700' }}>
          {STORE.name}
        </div>
        <div style={{ fontSize: '11px', color: '#444' }}>
          {STORE.phone}　{STORE.address}
        </div>
      </div>

      {/* ── 收件人：主體區塊 ── */}
      <div style={{
        border: '2.5px solid #000',
        borderRadius: '4px',
        padding: '3mm 4mm',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          fontSize: '8px', color: '#888', letterSpacing: '2px',
          marginBottom: '3mm',
        }}>收　件　人</div>

        {/* 姓名 + QR Code 並排 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3mm', marginBottom: '2mm' }}>

          {/* 左：姓名、電話、郵遞區號 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: '900', fontSize: '28px',
              lineHeight: 1.15, marginBottom: '1mm',
            }}>
              {order.receiver_name}
            </div>
            <div style={{
              fontWeight: '700', fontSize: '18px',
              letterSpacing: '1px', marginBottom: '2mm',
            }}>
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

          {/* 右：QR Code */}
          <div style={{
            flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '1.5mm',
          }}>
            <QRCodeSVG value={orderUrl} size={68} level="M" />
            <div style={{
              fontSize: '8px', fontFamily: 'monospace',
              color: '#555', textAlign: 'center',
              lineHeight: 1.3,
            }}>
              掃碼查詢訂單<br/>{order.order_no}
            </div>
          </div>
        </div>

        {/* 地址：橫跨全寬 */}
        <div style={{
          borderTop: '1px dashed #ccc',
          paddingTop: '2mm',
          fontSize: '22px',
          fontWeight: '700',
          lineHeight: 1.5,
          wordBreak: 'break-all',
        }}>
          {order.receiver_address}
        </div>

        {/* 備註（有才顯示） */}
        {order.note && (
          <div style={{
            marginTop: '2mm',
            padding: '1.5mm 2.5mm',
            background: '#fffde7',
            borderRadius: '3px',
            fontSize: '12px',
          }}>
            備註：{order.note}
          </div>
        )}

        {/* 無法投遞聲明：推到底部中央 */}
        <div style={{
          marginTop: 'auto',
          paddingTop: '2.5mm',
          borderTop: '1px solid #bbb',
          textAlign: 'center',
          fontSize: '18px',
          fontWeight: '700',
          letterSpacing: '1.5px',
          color: '#222',
        }}>
          無法投遞，請退回寄件人
        </div>
      </div>

    </div>
  )
}
