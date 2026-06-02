// ============================================================
// ⚙️  攤位設定檔 — 修改這裡的資訊即可完成客製化
// ============================================================

export const STORE = {
  name:    '高雄郵局企劃行銷科',          // ← 改成你的攤位/品牌名稱
  phone:   '07-261-4171#409',         // ← 改成你的電話
  address: '高雄市新興區中正三路177號3樓', // ← 改成你的地址（出現在託運單寄件人）
  email:   '',                       // ← 選填
}

// 付款方式標籤
export const PAYMENT_LABELS = {
  cash:       '💵 現金',
  card:       '💳 刷卡',
  taiwan_pay: '📱 台灣PAY',
}

// 訂單狀態設定（標籤 + 顏色 + 下一個狀態）
export const STATUS_CONFIG = {
  pending:   { label: '待結帳', bg: 'bg-stone-100',  text: 'text-stone-600',  next: 'paid',     nextLabel: '確認收款 →' },
  paid:      { label: '已付款', bg: 'bg-yellow-100', text: 'text-yellow-700', next: 'picking',  nextLabel: '開始揀貨 →' },
  picking:   { label: '揀貨中', bg: 'bg-blue-100',   text: 'text-blue-700',   next: 'packed',   nextLabel: '完成包裝 →' },
  packed:    { label: '已包裝', bg: 'bg-purple-100', text: 'text-purple-700', next: 'shipped',  nextLabel: '確認出貨 →' },
  shipped:   { label: '已出貨', bg: 'bg-green-100',  text: 'text-green-700',  next: 'delivered',nextLabel: '標記送達' },
  delivered: { label: '已送達', bg: 'bg-teal-100',   text: 'text-teal-700',   next: null,       nextLabel: null },
}
