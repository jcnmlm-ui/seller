import { useEffect, useRef, useState } from 'react'
import { Gift, PartyPopper } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCart } from '../context/CartContext'

// 顧客前台共用的「滿額活動」提醒橫幅
// - 沒有設定任何啟用中的門檻時不顯示任何東西
// - 購物車金額改變時（例如加入購物車）會觸發一次脈動提示
export default function PromotionBanner() {
  const { total } = useCart()
  const [tiers, setTiers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [pulse, setPulse]     = useState(false)
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

  // 目前達成的最高一階（唯一會亮起打勾的）；超過它的較低門檻不再保持點亮
  const achievedTiers = tiers.filter(t => total >= t.threshold)
  const currentTier   = achievedTiers.length > 0 ? achievedTiers[achievedTiers.length - 1] : null
  const nextTier       = tiers.find(t => total < t.threshold)
  const allDone         = !nextTier

  const prevThreshold  = currentTier?.threshold ?? 0
  const progressPct    = nextTier
    ? Math.min(100, Math.max(0, ((total - prevThreshold) / (nextTier.threshold - prevThreshold)) * 100))
    : 100

  return (
    <div className={`bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl px-4 py-3
      ${pulse ? 'promo-pulse' : ''}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {allDone
          ? <PartyPopper size={15} className="text-red-500 flex-shrink-0" />
          : <Gift size={15} className="text-red-500 flex-shrink-0" />
        }
        <span className="font-bold text-sm text-stone-800">
          {allDone ? `已達最高門檻，可獲得「${currentTier.reward}」` : '滿額贈好禮'}
        </span>
      </div>

      {/* 門檻梯子：任何時刻只有「目前這一階」亮起打勾，其餘（含已被超越的較低門檻）都是暗的 */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tiers.map(t => {
          const isCurrent = t.id === currentTier?.id
          const isNext    = t.id === nextTier?.id
          return (
            <span
              key={t.id}
              className={`text-xs px-2 py-1 rounded-full font-semibold border leading-tight
                ${isCurrent
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : isNext
                    ? 'bg-white text-red-600 border-red-300'
                    : 'bg-stone-100 text-stone-400 border-stone-200'}`}
            >
              {isCurrent ? '✓ ' : ''}NT${t.threshold.toLocaleString()} {t.reward}
            </span>
          )
        })}
      </div>

      {!allDone && (
        <>
          <div className="h-1.5 bg-white rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-red-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-stone-600">
            還差 <span className="font-bold text-red-500">NT${(nextTier.threshold - total).toLocaleString()}</span> 即可獲得「{nextTier.reward}」
          </p>
        </>
      )}
    </div>
  )
}
