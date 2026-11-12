import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Gift, PartyPopper, Info, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCart } from '../context/CartContext'
import { computeGifts, nextGiftStep, giftText } from '../lib/gifts'

// 活動說明條款內容，需要調整文字時改這裡即可
const PROMO_TERMS = [
  '滿額活動為世界郵展現場活動，贈品數量有限，原活動贈品送完將改以其他贈品替代。',
  '「免費寄到家活動」僅限收件人為台灣地址或選擇 i 郵箱收件。',
  '滿額金額以發票金額計算，郵票金額不計入。',
]
const PROMO_TERMS_NOTE = '高雄郵局保有最終修改、變更、活動解釋及取消本活動之權利。'

function PromoTermsModal({ onClose }) {
  // 用 portal 掛到 <body>：避免被外層容器（有 transform／動畫）影響，讓 fixed 永遠以「目前視窗」為準，
  // 不論購物車捲到哪裡，說明視窗都會出現在畫面正中間。
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3"
         style={{ height: '100dvh' }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl" style={{ maxHeight: '85dvh' }}
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-stone-100 flex-shrink-0 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Info size={18} className="text-red-500 flex-shrink-0" />
            <h2 className="font-black text-base text-stone-900">活動說明</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 flex-shrink-0 -mt-1 -mr-1 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-stone-600">
          <ul className="space-y-2 list-decimal list-inside">
            {PROMO_TERMS.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
          <p className="text-xs text-stone-400 mt-4 pt-3 border-t border-stone-100">{PROMO_TERMS_NOTE}</p>
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-stone-100 flex-shrink-0">
          <button onClick={onClose} className="btn-primary w-full py-3 text-sm">我知道了</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// 顧客前台共用的「滿額活動」提醒橫幅
// - 沒有設定任何啟用中的門檻時不顯示任何東西
// - 購物車金額改變時（例如加入購物車）會觸發一次脈動提示
// - 滿額以「發票金額」計算（實收金額扣除郵票金額），郵票金額不計入
// - 循環制：以最高一階門檻為一個循環，每滿一個循環再送一整組；餘額再依門檻加送（算法見 lib/gifts.js）
export default function PromotionBanner() {
  const { invoiceTotal: total, stampTotal } = useCart()
  const [tiers, setTiers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [pulse, setPulse]     = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const firstRun = useRef(true)

  useEffect(() => {
    supabase
      .from('promotion_tiers')
      .select('*')
      .eq('is_active', true)
      .order('threshold', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setTiers(data ?? [])
        setLoading(false)
      })
  }, [])

  // 購物車金額變動時觸發脈動提示（略過第一次載入）
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 650)
    return () => clearTimeout(t)
  }, [total])

  if (loading || tiers.length === 0) return null

  const calc     = computeGifts(tiers, total)
  const gifts    = calc.gifts
  const step     = nextGiftStep(tiers, total)
  const topTier  = calc.topTier
  if (!topTier) return null   // 保險：任何情況下都不要因為橫幅讓整個頁面白屏
  const cycle    = Number(topTier.threshold)
  const soldOutHit = calc.soldOut.length > 0

  const progressPct = step
    ? Math.min(100, Math.max(0, ((total - step.prev) / (step.at - step.prev)) * 100))
    : 100
  const nextSoldOut = !!step?.tier?.is_sold_out

  return (
    <>
    <div className={`bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl px-4 py-3
      ${pulse ? 'promo-pulse' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-1.5 min-w-0">
          {gifts.length > 0
            ? <PartyPopper size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            : <Gift size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          }
          <span className="font-bold text-sm text-stone-800">
            {gifts.length === 0
              ? '滿額贈好禮'
              : soldOutHit
                ? `已達門檻，但贈品「${calc.soldOut.map(t => t.reward).join('、')}」目前已送完，請洽工作人員`
                : <>目前可獲得：<span className="text-red-600">{giftText(gifts)}</span></>}
          </span>
        </div>
        <button
          onClick={() => setShowTerms(true)}
          className="flex items-center gap-0.5 text-xs text-stone-400 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
        >
          <Info size={12} />
          活動說明
        </button>
      </div>

      {/* 門檻梯子：本輪（餘額）達到的那一階亮起；已滿整輪的最高階顯示「×組數」；已送完的一律以橘色標示 */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tiers.map(t => {
          const isTop     = t.id === topTier.id
          const isCurrent = isTop ? calc.cycles > 0 : t.id === calc.remTier?.id
          const isNext    = t.id === step?.tier?.id
          return (
            <span
              key={t.id}
              className={`text-xs px-2 py-1 rounded-full font-semibold border leading-tight
                ${t.is_sold_out
                  ? 'bg-orange-50 text-orange-500 border-orange-200'
                  : isCurrent
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : isNext
                      ? 'bg-white text-red-600 border-red-300'
                      : 'bg-stone-100 text-stone-400 border-stone-200'}`}
            >
              {t.is_sold_out ? '⚠ ' : isCurrent ? '✓ ' : ''}
              NT${Number(t.threshold).toLocaleString()} <span className={t.is_sold_out ? 'line-through' : ''}>{t.reward}</span>
              {isTop && calc.cycles > 1 ? ` ×${calc.cycles}` : ''}
              {t.is_sold_out ? '（已送完）' : ''}
            </span>
          )
        })}
      </div>

      <p className="text-xs text-stone-400 mb-2">
        🔁 每滿 NT${cycle.toLocaleString()} 即可再獲得一組「{topTier.reward}」，餘額依門檻加送
      </p>

      {step && (
        <>
          <div className="h-1.5 bg-white rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-red-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-stone-600">
            {nextSoldOut
              ? <>還差 <span className="font-bold text-red-500">NT${step.need.toLocaleString()}</span> 可達下一門檻，但贈品「{step.tier.reward}」<span className="font-semibold text-orange-500">已送完</span></>
              : <>還差 <span className="font-bold text-red-500">NT${step.need.toLocaleString()}</span> 即可多獲得「{giftText(step.adds)}」</>
            }
          </p>
        </>
      )}

      {/* 購物車含郵票時提醒：郵票金額不計入滿額 */}
      {stampTotal > 0 && (
        <p className="text-xs text-blue-500 mt-1.5">
          📮 郵票 NT${stampTotal.toLocaleString()} 不計入滿額，目前發票金額 NT${total.toLocaleString()}
        </p>
      )}
    </div>
    {showTerms && <PromoTermsModal onClose={() => setShowTerms(false)} />}
    </>
  )
}
