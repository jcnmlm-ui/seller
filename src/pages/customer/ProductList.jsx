import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart, Search, Package, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../context/CartContext'
import { STORE } from '../../config/store'
import PromotionBanner from '../../components/PromotionBanner'
import { toast } from '../../components/StatusBadge'

// ── 個資蒐集聲明 Modal ────────────────────────────────────
function PrivacyModal({ onAccept }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl"
           style={{ maxHeight: '88vh' }}>
        {/* 標題 */}
        <div className="px-5 py-4 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xl">🔒</span>
            <h2 className="font-black text-lg text-stone-900">個人資料蒐集、處理及利用告知書</h2>
          </div>
          <p className="text-xs text-stone-400">依個人資料保護法第 8 條規定，請閱讀以下告知事項</p>
        </div>

        {/* 內容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-stone-600 space-y-4">
          <div className="bg-stone-50 rounded-xl p-4 space-y-3">
            <div>
              <p className="font-bold text-stone-800 mb-1">一、蒐集目的</p>
              <p>為辦理商品預購與購買訂單處理、付款確認、商品寄送、售後服務及客服聯繫。</p>
            </div>
            <div>
              <p className="font-bold text-stone-800 mb-1">二、蒐集個人資料類別</p>
              <p>收件人姓名、聯絡電話、行動電話、收件地址（以下簡稱「個人資料」）。</p>
            </div>
            <div>
              <p className="font-bold text-stone-800 mb-1">三、利用期間、地區、對象及方式</p>
              <ul className="space-y-1 list-disc list-inside text-stone-500">
                <li>期間：訂單完成出貨及售後服務期滿後 6 個月內（或依法令規定之保存期限）。</li>
                <li>地區：台灣。</li>
                <li>對象：{STORE.name}及中華郵政物流配送。</li>
                <li>方式：以自動化機器或其他非自動化之電子或紙本方式，用於訂單履約與客戶服務。</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-stone-800 mb-1">四、您的權利</p>
              <p>依個人資料保護法第 3 條規定，您得向本攤位行使查詢或請求閱覽、請求製給複製本、請求補充或更正、請求停止蒐集、處理或利用、請求刪除之權利。</p>
            </div>
            <div>
              <p className="font-bold text-stone-800 mb-1">五、不提供個人資料之影響</p>
              <p>您得自由選擇是否提供個人資料，惟若拒絕提供，本攤位將無法提供您預購登記、訂單處理及商品寄送等相關服務。</p>
            </div>
          </div>

          <p className="text-xs text-stone-400 text-center">
            點擊「同意並繼續」即表示您已閱讀並同意本告知書，授權本攤位依上述目的蒐集、處理及利用您的個人資料。
          </p>
        </div>

        {/* 按鈕 */}
        <div className="px-5 pb-5 pt-3 border-t border-stone-100 flex-shrink-0">
          <button
            onClick={onAccept}
            className="btn-primary w-full py-3.5 text-base"
          >
            我已閱讀並同意，繼續選購
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 商品卡片 ──────────────────────────────────────────────
function ProductCard({ product, cartItem, onAdd, onUpdate }) {
  const stockLabel = product.stock !== -1 && product.stock <= 5
    ? `剩 ${product.stock} 件` : null

  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col">
      {/* 方形圖片區 */}
      <div className="relative" style={{ paddingBottom: '100%' }}>
        <div className="absolute inset-0 bg-stone-100 flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <Package size={36} className="text-stone-300" />
          )}
        </div>
        {stockLabel && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold z-10">
            {stockLabel}
          </span>
        )}
      </div>

      {/* 商品資訊 */}
      <div className="p-3 flex flex-col flex-1">
        <p className="font-bold text-stone-900 text-sm leading-snug mb-0.5 line-clamp-2">
          {product.name}
        </p>
        {product.barcode && (
          <p className="text-xs text-stone-400 font-mono mb-1">{product.barcode}</p>
        )}
        {product.stamp_amount > 0 && (
          <p className="text-xs text-blue-500 mb-1">📮 含郵票 NT${product.stamp_amount}</p>
        )}
        <p className="text-red-500 font-black text-base mt-auto mb-2">
          NT${product.price.toLocaleString()}
        </p>

        {!cartItem ? (
          <button onClick={onAdd} className="btn-primary w-full text-sm py-2 !rounded-xl">
            加入購物車
          </button>
        ) : (
          <div className="flex items-center justify-between bg-stone-50 rounded-xl px-2 py-1.5">
            <button className="qty-btn" onClick={() => onUpdate(cartItem.quantity - 1)}>−</button>
            <span className="font-bold text-stone-800 w-6 text-center">{cartItem.quantity}</span>
            <button className="qty-btn" onClick={() => onUpdate(cartItem.quantity + 1)}>+</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 主頁面 ────────────────────────────────────────────────
export default function ProductList() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showPrivacy, setShowPrivacy] = useState(false)
  const { items, dispatch, count, total } = useCart()

  // ── 試手氣！一鍵滿額 ──────────────────────────────────
  const [luckyTarget, setLuckyTarget]   = useState(null)  // 最高的啟用中滿額門檻
  const [luckyDrawing, setLuckyDrawing] = useState(false)

  useEffect(() => {
    // 個資聲明：未接受過則顯示
    if (!localStorage.getItem('booth_privacy_accepted')) {
      setShowPrivacy(true)
    }
    // 載入商品
    supabase
      .from('products')
      .select('*')
      .eq('is_available', true)
      .order('created_at')
      .then(({ data, error }) => {
        if (!error) setProducts(data ?? [])
        setLoading(false)
      })
    // 取得目前最高的滿額門檻（試手氣的目標金額）
    supabase
      .from('promotion_tiers')
      .select('threshold')
      .eq('is_active', true)
      .order('threshold', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLuckyTarget(data?.threshold ?? null))
  }, [])

  function acceptPrivacy() {
    localStorage.setItem('booth_privacy_accepted', 'true')
    setShowPrivacy(false)
  }

  // 隨機挑商品加入購物車，湊到最高滿額門檻（在目前購物車金額基礎上繼續加）
  function handleLuckyDraw() {
    if (!luckyTarget || luckyDrawing) return
    const remaining = luckyTarget - total
    if (remaining <= 0) {
      toast('已經達成最高門檻囉，小精靈不用出動啦！🎉', 'info')
      return
    }

    setLuckyDrawing(true)

    // 建立候選商品池：排除已無庫存可加的商品（庫存需扣掉購物車已有的數量）
    let pool = products
      .filter(p => p.price > 0)
      .map(p => {
        const inCartQty = items.find(i => i.id === p.id)?.quantity || 0
        const remainingStock = p.stock === -1 ? Infinity : Math.max(0, p.stock - inCartQty)
        return { product: p, remainingStock }
      })
      .filter(entry => entry.remainingStock > 0)

    if (pool.length === 0) {
      toast('小精靈找不到可以加的商品（可能都缺貨了）', 'error')
      setLuckyDrawing(false)
      return
    }

    // 稍微延遲一下再出結果，增加「抽獎」的感覺
    setTimeout(() => {
      const additions = new Map() // productId → { product, qty }
      let addedTotal = 0
      let safety = 0

      while (addedTotal < remaining && pool.length > 0 && safety < 1000) {
        safety++
        const idx = Math.floor(Math.random() * pool.length)
        const entry = pool[idx]

        const prev = additions.get(entry.product.id)
        additions.set(entry.product.id, { product: entry.product, qty: (prev?.qty ?? 0) + 1 })
        addedTotal += entry.product.price

        entry.remainingStock -= 1
        if (entry.remainingStock <= 0) pool.splice(idx, 1)
      }

      additions.forEach(({ product, qty }) => {
        dispatch({ type: 'ADD_QTY', product, qty })
      })

      const newTotal = total + addedTotal
      const itemKinds = additions.size
      if (newTotal >= luckyTarget) {
        toast(`✨ 小精靈煩惱後，精選加入了「${itemKinds}種商品」，達成 NT$${luckyTarget.toLocaleString()} 門檻！`, 'success')
      } else {
        toast(`✨ 小精靈盡力了，只湊到 NT$${newTotal.toLocaleString()}，庫存不夠湊滿 NT$${luckyTarget.toLocaleString()}`, 'info')
      }
      setLuckyDrawing(false)
    }, 450)
  }

  const filtered = products.filter(p =>
    p.name.includes(search) || (p.barcode ?? '').includes(search)
  )

  const inCart = id => items.find(i => i.id === id)

  return (
    // h-screen + flex col：讓 header/footer 固定，中間捲動
    <div className="h-screen flex flex-col bg-stone-50 overflow-hidden">

      {/* ── 固定頂部 Header ── */}
      <header className="flex-shrink-0 bg-white border-b border-stone-200 shadow-sm z-10">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-base font-black text-stone-900 leading-tight">{STORE.name}</h1>
            <p className="text-xs text-stone-400">掃碼下單，免費寄到家</p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* 選擇困難嗎？一鍵滿額 */}
            {luckyTarget && total < luckyTarget && (
              <button
                onClick={handleLuckyDraw}
                disabled={luckyDrawing}
                title="選擇困難嗎？一鍵滿額！"
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl font-bold text-xs text-white
                  bg-gradient-to-r from-amber-400 to-orange-500 shadow-sm
                  active:scale-95 transition-transform disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles size={14} className={luckyDrawing ? 'animate-spin' : ''} />
                {luckyDrawing ? '小精靈選購中…' : '選擇困難嗎？一鍵滿額！'}
              </button>
            )}

            <Link to="/checkout" className="relative flex-shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm transition-colors
                ${count > 0 ? 'bg-red-500 text-white' : 'bg-stone-100 text-stone-600'}`}>
                <ShoppingCart size={15} />
                <span>{count > 0 ? `NT$${total.toLocaleString()}` : '購物車'}</span>
              </div>
              {count > 0 && (
                <span className="absolute -top-2 -right-2 bg-stone-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* 搜尋列 */}
        <div className="max-w-lg mx-auto px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              className="input pl-9 text-sm py-2.5"
              placeholder="搜尋商品名稱或條碼…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* 滿額活動提醒（常駐顯示，購物車變動時有脈動提示）*/}
        <div className="max-w-lg mx-auto px-4 pb-3">
          <PromotionBanner />
        </div>
      </header>

      {/* ── 中間可捲動的商品區 ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1,2,3,4].map(n => (
                <div key={n} className="bg-white rounded-2xl border border-stone-200 animate-pulse">
                  <div className="bg-stone-100" style={{ paddingBottom:'100%' }} />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-stone-100 rounded w-3/4" />
                    <div className="h-4 bg-stone-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-stone-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>找不到商品</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  cartItem={inCart(p.id)}
                  onAdd={() => dispatch({ type: 'ADD', product: p })}
                  onUpdate={qty => dispatch({ type: 'UPDATE_QTY', id: p.id, qty })}
                />
              ))}
            </div>
          )}

          {/* 查詢已有訂單 */}
          <div className="mt-6 text-center">
            <Link to="/query" className="text-xs text-stone-400 underline underline-offset-2">
              查詢已有訂單
            </Link>
          </div>
        </div>
      </div>

    {/* ── 固定底部 Footer ── */}
    <footer className="flex-shrink-0 bg-white border-t border-stone-100 py-2.5 z-10">
      <div className="flex items-center justify-center gap-3 text-xs text-stone-400">
        <span>© Design by Chiahsien</span>
        <span className="text-stone-200">|</span>
        <button
          onClick={() => setShowPrivacy(true)}
          className="underline underline-offset-2 hover:text-stone-600 transition-colors"
        >
          個資聲明
        </button>
        <span className="text-stone-200">|</span>
        <Link
          to="/query"
          className="underline underline-offset-2 hover:text-stone-600 transition-colors"
        >
          查詢訂單
        </Link>
      </div>
    </footer>

      {/* 個資聲明 Modal */}
      {showPrivacy && <PrivacyModal onAccept={acceptPrivacy} />}
    </div>
  )
}
