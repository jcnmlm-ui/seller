import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart, Search, Package, X, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../context/CartContext'
import { STORE } from '../../config/store'

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
            <h2 className="font-black text-lg text-stone-900">個人資料蒐集聲明</h2>
          </div>
          <p className="text-xs text-stone-400">依個人資料保護法第 8 條規定，請閱讀以下告知事項</p>
        </div>

        {/* 內容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-stone-600 space-y-4">
          <div className="bg-stone-50 rounded-xl p-4 space-y-3">
            <div>
              <p className="font-bold text-stone-800 mb-1">一、蒐集目的</p>
              <p>為完成商品預購訂單之處理、確認付款及寄送出貨相關事宜。</p>
            </div>
            <div>
              <p className="font-bold text-stone-800 mb-1">二、蒐集個人資料類別</p>
              <p>收件人姓名、手機號碼、收件地址（以下簡稱「個人資料」）。</p>
            </div>
            <div>
              <p className="font-bold text-stone-800 mb-1">三、利用期間、地區、對象及方式</p>
              <ul className="space-y-1 list-disc list-inside text-stone-500">
                <li>期間：訂單完成出貨後 6 個月內</li>
                <li>地區：中華民國台灣地區</li>
                <li>對象：{STORE.name}及委託配送之物流業者</li>
                <li>方式：電子化處理，用於訂單出貨及客服聯繫</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-stone-800 mb-1">四、您的權利</p>
              <p>依個資法第 3 條，您可向本攤位查詢、請求閱覽、補充或更正、停止蒐集使用或刪除您的個人資料。</p>
            </div>
            <div>
              <p className="font-bold text-stone-800 mb-1">五、不提供個人資料之影響</p>
              <p>若您不提供上述個人資料，將無法完成預購訂單及出貨寄送服務。</p>
            </div>
          </div>

          <p className="text-xs text-stone-400 text-center">
            點擊「同意並繼續」即表示您已閱讀並同意本聲明，授權本攤位依上述目的蒐集、處理及利用您的個人資料。
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
  }, [])

  function acceptPrivacy() {
    localStorage.setItem('booth_privacy_accepted', 'true')
    setShowPrivacy(false)
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
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-base font-black text-stone-900 leading-tight">{STORE.name}</h1>
            <p className="text-xs text-stone-400">掃碼下單 · 現場取貨付款</p>
          </div>
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
