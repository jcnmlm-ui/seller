import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
  Save, X, Upload, Image, GripVertical,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/StatusBadge'

const EMPTY_FORM = {
  name: '', description: '', barcode: '', price: '',
  stock: '-1', is_available: true, image_url: '',
  stamp_amount: '0',
}

// ── 單一商品卡（可拖曳）────────────────────────────────────
function SortableProduct({ product, onEdit, onDelete, onToggle }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: product.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  const PAYMENT_LABELS = { cash:'現金', card:'刷卡', taiwan_pay:'台灣PAY' }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl border overflow-hidden flex items-center gap-3 px-3 py-3 transition-shadow
        ${isDragging ? 'shadow-2xl border-red-300' : 'border-stone-200'}
        ${!product.is_available ? 'opacity-60' : ''}`}
    >
      {/* 拖曳把手 */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-stone-300 hover:text-stone-500 cursor-grab active:cursor-grabbing p-1 touch-none"
        title="拖曳排序"
      >
        <GripVertical size={18} />
      </button>

      {/* 縮圖 */}
      <div className="w-14 h-14 bg-stone-100 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-stone-200">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          : <Image size={20} className="text-stone-300" />
        }
      </div>

      {/* 資訊 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-stone-900 text-sm">{product.name}</span>
          {!product.is_available && (
            <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">已下架</span>
          )}
        </div>
        {product.barcode && (
          <p className="text-xs text-stone-400 font-mono">{product.barcode}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 text-sm flex-wrap">
          <span className="font-bold text-red-500">NT${product.price.toLocaleString()}</span>
          {product.stamp_amount > 0 && (
            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full">
              含郵票 NT${product.stamp_amount}
            </span>
          )}
          <span className="text-stone-400">庫存：{product.stock === -1 ? '無限' : `${product.stock} 件`}</span>
        </div>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onToggle(product)} className="p-2 text-stone-400 hover:text-stone-700 transition-colors">
          {product.is_available
            ? <ToggleRight size={22} className="text-green-500" />
            : <ToggleLeft size={22} />
          }
        </button>
        <button onClick={() => onEdit(product)} className="p-2 text-stone-400 hover:text-blue-500 transition-colors">
          <Edit2 size={16} />
        </button>
        <button onClick={() => onDelete(product)} className="p-2 text-stone-400 hover:text-red-500 transition-colors">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// ── 主頁面 ────────────────────────────────────────────────
export default function ProductManage() {
  const [products, setProducts] = useState([])
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeId, setActiveId] = useState(null)  // 拖曳中的 id
  const fileInputRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },  // 拖動 8px 才啟動，避免誤觸
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    setProducts(data ?? [])
  }

  // ── 拖曳排序 ──────────────────────────────────────────
  function handleDragStart(event) {
    setActiveId(event.active.id)
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const oldIndex = products.findIndex(p => p.id === active.id)
    const newIndex = products.findIndex(p => p.id === over.id)
    const newOrder = arrayMove(products, oldIndex, newIndex)
    setProducts(newOrder)  // 樂觀更新（即時反映）

    // 批次更新 Supabase sort_order
    await Promise.all(
      newOrder.map((p, i) =>
        supabase.from('products').update({ sort_order: i + 1 }).eq('id', p.id)
      )
    )
    toast('✓ 排序已儲存', 'success', 1500)
  }

  // ── 表單操作 ──────────────────────────────────────────
  function openNew() {
    setEditing(null); setForm(EMPTY_FORM); setShowForm(true)
  }
  function openEdit(p) {
    setEditing(p)
    setForm({
      name: p.name, description: p.description ?? '',
      barcode: p.barcode ?? '', price: String(p.price),
      stock: String(p.stock), is_available: p.is_available,
      image_url: p.image_url ?? '',
      stamp_amount: String(p.stamp_amount ?? 0),
    })
    setShowForm(true)
  }

  // ── 圖片上傳 ──────────────────────────────────────────
  async function handleImageUpload(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg','jpeg','png','webp'].includes(ext)) {
      toast('請上傳 JPG、PNG 或 WebP 格式', 'error'); return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('圖片大小請勿超過 5MB', 'error'); return
    }
    setUploading(true)
    try {
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(filename, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filename)

      setForm(f => ({ ...f, image_url: publicUrl }))
      toast('圖片上傳成功 ✓', 'success')
    } catch (err) {
      if (err.message?.includes('bucket') || err.message?.includes('not found')) {
        toast('請先在 Supabase Storage 建立 product-images bucket（公開）', 'error')
      } else {
        toast('上傳失敗：' + err.message, 'error')
      }
    }
    setUploading(false)
  }

  async function handleSave() {
    if (!form.name.trim())               { toast('請填寫商品名稱', 'error'); return }
    if (!form.price || isNaN(form.price)){ toast('請填寫有效的價格', 'error'); return }
    setSaving(true)
    const payload = {
      name:         form.name.trim(),
      description:  form.description.trim() || null,
      barcode:      form.barcode.trim() || null,
      price:        parseFloat(form.price),
      stock:        parseInt(form.stock) || -1,
      is_available: form.is_available,
      image_url:    form.image_url || null,
      stamp_amount: parseFloat(form.stamp_amount) || 0,
      // 新商品排在最後
      ...(editing ? {} : { sort_order: products.length + 1 }),
    }
    let error
    if (editing) {
      ;({ error } = await supabase.from('products').update(payload).eq('id', editing.id))
    } else {
      ;({ error } = await supabase.from('products').insert(payload))
    }
    if (error) { toast('儲存失敗：' + error.message, 'error') }
    else       { toast(editing ? '已更新商品' : '已新增商品', 'success'); setShowForm(false); load() }
    setSaving(false)
  }

  async function toggleAvailable(p) {
    const { error } = await supabase
      .from('products').update({ is_available: !p.is_available }).eq('id', p.id)
    if (!error) { toast(p.is_available ? '已下架' : '已上架', 'info'); load() }
  }

  async function handleDelete(p) {
    if (!confirm(`確認刪除「${p.name}」？此操作無法復原。`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) toast('刪除失敗', 'error')
    else { toast('已刪除', 'info'); load() }
  }

  const activeProduct = products.find(p => p.id === activeId)

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="btn-ghost p-2"><ArrowLeft size={20} /></Link>
            <div>
              <h1 className="font-bold text-stone-900">商品管理</h1>
              <p className="text-xs text-stone-400">拖曳左側 ⠿ 圖示可調整順序</p>
            </div>
          </div>
          <button onClick={openNew} className="btn-primary text-sm py-2 flex items-center gap-1.5">
            <Plus size={16} /> 新增商品
          </button>
        </div>
      </header>

      {/* 商品列表（可拖曳）*/}
      <div className="max-w-3xl mx-auto px-4 py-5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={products.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {products.map(p => (
                <SortableProduct
                  key={p.id}
                  product={p}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggle={toggleAvailable}
                />
              ))}
            </div>
          </SortableContext>

          {/* 拖曳中的浮動預覽 */}
          <DragOverlay>
            {activeProduct && (
              <div className="bg-white rounded-xl border-2 border-red-400 shadow-2xl flex items-center gap-3 px-3 py-3 opacity-95">
                <GripVertical size={18} className="text-red-400 flex-shrink-0" />
                <div className="w-14 h-14 bg-stone-100 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-stone-200">
                  {activeProduct.image_url
                    ? <img src={activeProduct.image_url} alt="" className="w-full h-full object-cover" />
                    : <Image size={20} className="text-stone-300" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-stone-900 text-sm">{activeProduct.name}</p>
                  <p className="text-red-500 font-bold text-sm">NT${activeProduct.price.toLocaleString()}</p>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* 新增/編輯 Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden"
               style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100 flex-shrink-0">
              <h2 className="font-bold text-stone-900">{editing ? '編輯商品' : '新增商品'}</h2>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {/* 圖片上傳 */}
              <div>
                <label className="label">商品圖片</label>
                <div className="flex items-start gap-3">
                  <div className="w-20 h-20 bg-stone-100 rounded-xl border-2 border-dashed border-stone-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {form.image_url
                      ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                      : <Image size={24} className="text-stone-300" />
                    }
                  </div>
                  <div className="flex-1 space-y-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="btn-secondary w-full text-sm py-2.5 flex items-center justify-center gap-1.5">
                      {uploading
                        ? <><span className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" /> 上傳中…</>
                        : <><Upload size={14} /> 選擇圖片</>
                      }
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => handleImageUpload(e.target.files?.[0])} />
                    {form.image_url && (
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                        className="text-xs text-red-400 hover:text-red-600 w-full text-center">
                        移除圖片
                      </button>
                    )}
                    <p className="text-xs text-stone-400">JPG / PNG / WebP，最大 5MB</p>
                  </div>
                </div>
              </div>

              {/* 名稱 */}
              <div>
                <label className="label">商品名稱 *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(f=>({...f,name:e.target.value}))}
                  placeholder="例：真郵味造型磁鐵" />
              </div>

              {/* 描述 */}
              <div>
                <label className="label">商品描述</label>
                <textarea className="input resize-none" rows={2} value={form.description}
                  onChange={e => setForm(f=>({...f,description:e.target.value}))}
                  placeholder="商品說明（選填）" />
              </div>

              {/* 條碼 + 價格 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">商品條碼</label>
                  <input className="input font-mono text-sm" value={form.barcode}
                    onChange={e => setForm(f=>({...f,barcode:e.target.value}))}
                    placeholder="08Y53652" />
                </div>
                <div>
                  <label className="label">售價（NT$） *</label>
                  <input className="input" type="number" min="0" value={form.price}
                    onChange={e => setForm(f=>({...f,price:e.target.value}))}
                    placeholder="85" />
                </div>
              </div>

              {/* 郵票金額 */}
              <div>
                <label className="label">含郵票金額（NT$）</label>
                <input className="input" type="number" min="0" step="0.01" value={form.stamp_amount}
                  onChange={e => setForm(f=>({...f,stamp_amount:e.target.value}))}
                  placeholder="0" />
                <p className="text-xs text-stone-400 mt-1">
                  商品內含郵票時填入郵票面額，發票金額將自動扣除。不含郵票填 0。
                </p>
              </div>

              {/* 庫存 */}
              <div>
                <label className="label">庫存數量（-1 = 無限）</label>
                <input className="input" type="number" min="-1" value={form.stock}
                  onChange={e => setForm(f=>({...f,stock:e.target.value}))}
                  placeholder="-1" />
              </div>

              {/* 上架 */}
              <div className="flex items-center gap-3">
                <input type="checkbox" id="avail" checked={form.is_available}
                  onChange={e => setForm(f=>({...f,is_available:e.target.checked}))}
                  className="w-5 h-5 rounded accent-red-500" />
                <label htmlFor="avail" className="text-sm font-medium text-stone-700">立即上架</label>
              </div>
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-stone-100 flex-shrink-0">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">取消</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />儲存中…
                    </span>
                  : <span className="flex items-center justify-center gap-1.5"><Save size={16} />儲存</span>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
