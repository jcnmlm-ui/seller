import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart, Search, Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCart } from '../../context/CartContext'
import { STORE } from '../../config/store'

export default function ProductList() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { items, dispatch, count, total } = useCart()

  useEffect(() => {
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

  const filtered = products.filter(p =>
    p.name.includes(search) || (p.barcode ?? '').includes(search)
  )

  const inCart = (id) => items.find(i => i.id === id)

  function addToCart(product) {
    dispatch({ type: 'ADD', product })
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-stone-900 leading-tight">{STORE.name}</h1>
            <p className="text-xs text-stone-400">掃碼下單，現場取貨付款</p>
          </div>
          <Link to="/checkout" className="relative">
            <div className="flex items-center gap-1.5 bg-red-500 text-white px-3 py-2 rounded-xl font-bold text-sm">
              <ShoppingCart size={16} />
              購物車
            </div>
            {count > 0 && (
              <span className="absolute -top-2 -right-2 bg-stone-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {count}
              </span>
            )}
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 fade-up">
        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="input pl-9"
            placeholder="搜尋商品名稱或條碼…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(n => (
              <div key={n} className="card animate-pulse">
                <div className="bg-stone-200 h-40 w-full" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-stone-200 rounded w-3/4" />
                  <div className="h-3 bg-stone-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
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
                onAdd={() => addToCart(p)}
                onUpdate={(qty) => dispatch({ type: 'UPDATE_QTY', id: p.id, qty })}
              />
            ))}
          </div>
        )}

        {/* 查詢訂單入口 */}
        <div className="mt-8 text-center">
          <Link to="/query" className="text-sm text-stone-400 underline underline-offset-2">
            查詢已有訂單
          </Link>
        </div>
      </div>

      {/* Floating Cart Bar */}
      {count > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto z-20">
          <Link
            to="/checkout"
            className="flex items-center justify-between bg-stone-900 text-white px-5 py-4 rounded-2xl shadow-2xl"
          >
            <span className="font-bold text-sm">{count} 件商品</span>
            <span className="font-black text-base">
              前往結帳 NT${total.toLocaleString()} →
            </span>
          </Link>
        </div>
      )}
    </div>
  )
}

function ProductCard({ product, cartItem, onAdd, onUpdate }) {
  const stockLabel = product.stock === -1 ? null
    : product.stock <= 5 ? `剩 ${product.stock} 件`
    : null

  return (
    <div className="card flex flex-col">
      {/* 商品圖片 */}
      <div className="bg-stone-100 h-36 flex items-center justify-center overflow-hidden relative">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">📦</span>
        )}
        {stockLabel && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
            {stockLabel}
          </span>
        )}
      </div>

      {/* 商品資訊 */}
      <div className="p-3 flex flex-col flex-1">
        <p className="font-bold text-stone-900 text-sm leading-snug mb-0.5">{product.name}</p>
        {product.barcode && (
          <p className="text-xs text-stone-400 font-mono mb-1">{product.barcode}</p>
        )}
        <p className="text-red-500 font-black text-base mt-auto mb-2">
          NT${product.price.toLocaleString()}
        </p>

        {/* 加入/調整數量 */}
        {!cartItem ? (
          <button onClick={onAdd} className="btn-primary w-full text-sm py-2 !rounded-lg">
            加入購物車
          </button>
        ) : (
          <div className="flex items-center justify-between bg-stone-50 rounded-lg px-2 py-1">
            <button className="qty-btn" onClick={() => onUpdate(cartItem.quantity - 1)}>−</button>
            <span className="font-bold text-stone-800 w-6 text-center">{cartItem.quantity}</span>
            <button className="qty-btn" onClick={() => onUpdate(cartItem.quantity + 1)}>+</button>
          </div>
        )}
      </div>
    </div>
  )
}
