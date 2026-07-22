import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
  Save, X, Upload, Image, GripVertical,
  MoreVertical, FileDown, FileUp, ShieldAlert, AlertTriangle,
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
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/StatusBadge'

const EMPTY_FORM = {
  name: '', description: '', barcode: '', price: '',
  stock: '-1', is_available: true, image_url: '',
  stamp_amount: '0',
}

// ── 匯出／匯入 Excel 對應的資料庫欄位（順序即欄位順序）──────
const EXCEL_COLUMNS = [
  'id', 'name', 'description', 'barcode', 'price',
  'stamp_amount', 'stock', 'is_available', 'image_url',
  'sort_order', 'created_at',
]
const EXCEL_COL_WIDTHS = [36, 24, 30, 14, 10, 12, 8, 10, 40, 10, 20]

function fileTimestamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

function excelToBool(val, fallback = true) {
  if (typeof val === 'boolean') return val
  if (val === '' || val === null || val === undefined) return fallback
  const s = String(val).trim().toLowerCase()
  if (['true', '1', '是', 'yes', 'v', '✓'].includes(s)) return true
  if (['false', '0', '否', 'no', 'x'].includes(s)) return false
  return fallback
}

function excelToNum(val, fallback) {
  if (val === '' || val === null || val === undefined) return fallback
  const n = Number(val)
  return Number.isNaN(n) ? fallback : n
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

  // ── 匯出／匯入／清空 ──────────────────────────────────
  const [showMenu, setShowMenu]         = useState(false)
  const [exporting, setExporting]       = useState(false)
  const [importing, setImporting]       = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [importResult, setImportResult] = useState(null) // { inserted, updated, failed:[] }
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearing, setClearing]         = useState(false)
  const importInputRef = useRef(null)

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
        .from('seller-product-images')
        .upload(filename, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage
        .from('seller-product-images')
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

  // ── 匯出 Excel（備份）──────────────────────────────────
  async function handleExport() {
    setExporting(true)
    try {
      const rows = products.map(p => ({
        id:           p.id,
        name:         p.name,
        description:  p.description ?? '',
        barcode:      p.barcode ?? '',
        price:        p.price,
        stamp_amount: p.stamp_amount ?? 0,
        stock:        p.stock,
        is_available: p.is_available,
        image_url:    p.image_url ?? '',
        sort_order:   p.sort_order ?? '',
        created_at:   p.created_at ?? '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows, { header: EXCEL_COLUMNS })
      ws['!cols'] = EXCEL_COL_WIDTHS.map(wch => ({ wch }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '商品')
      XLSX.writeFile(wb, `商品備份_${fileTimestamp()}.xlsx`)
      toast(
        rows.length > 0 ? `✓ 已匯出 ${rows.length} 筆商品` : '✓ 已匯出空白範本（目前無商品）',
        'success'
      )
    } catch (err) {
      toast('匯出失敗：' + err.message, 'error')
    }
    setExporting(false)
    setShowMenu(false)
  }

  // ── 匯入 Excel（還原／批次新增）───────────────────────
  async function handleImportFile(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls'].includes(ext)) {
      toast('請上傳 .xlsx 或 .xls 檔案', 'error'); return
    }

    setImporting(true)
    setImportProgress('')
    const result = { inserted: 0, updated: 0, failed: [] }

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      if (rows.length === 0) {
        toast('檔案內沒有資料列', 'error')
        setImporting(false); setShowMenu(false); return
      }

      const existingIds = new Set(products.map(p => p.id))

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const rowNum = i + 2 // 對應 Excel 實際列號（含表頭列）
        setImportProgress(`${i + 1}/${rows.length}`)

        const name  = String(r.name ?? '').trim()
        const price = excelToNum(r.price, NaN)

        if (!name) {
          result.failed.push({ row: rowNum, name: '(未命名)', reason: '缺少商品名稱' }); continue
        }
        if (Number.isNaN(price) || price < 0) {
          result.failed.push({ row: rowNum, name, reason: '價格無效' }); continue
        }

        const payload = {
          name,
          description:  String(r.description ?? '').trim() || null,
          barcode:      String(r.barcode ?? '').trim() || null,
          price,
          stamp_amount: excelToNum(r.stamp_amount, 0),
          stock:        excelToNum(r.stock, -1),
          is_available: excelToBool(r.is_available, true),
          image_url:    String(r.image_url ?? '').trim() || null,
        }
        const sortOrderVal = excelToNum(r.sort_order, null)
        if (sortOrderVal !== null) payload.sort_order = sortOrderVal

        const id = String(r.id ?? '').trim()
        try {
          if (id && existingIds.has(id)) {
            const { error } = await supabase.from('products').update(payload).eq('id', id)
            if (error) throw error
            result.updated++
          } else {
            const { error } = await supabase.from('products').insert(payload)
            if (error) throw error
            result.inserted++
          }
        } catch (err) {
          const msg = err.message?.includes('duplicate') || err.message?.includes('unique')
            ? '條碼重複（已存在相同條碼的商品）'
            : err.message
          result.failed.push({ row: rowNum, name, reason: msg })
        }
      }

      await load()
      setImportResult(result)
      if (result.failed.length === 0) {
        toast(`✓ 匯入完成：新增 ${result.inserted} 筆、更新 ${result.updated} 筆`, 'success')
      } else {
        toast(`匯入完成，但有 ${result.failed.length} 筆失敗，詳見結果視窗`, 'error')
      }
    } catch (err) {
      toast('匯入失敗：' + err.message, 'error')
    }
    setImporting(false)
    setImportProgress('')
    setShowMenu(false)
  }

  // ── 清空所有商品 ──────────────────────────────────────
  async function handleClearAll() {
    if (clearConfirmText.trim() !== '清空') {
      toast('請輸入「清空」以確認', 'error'); return
    }
    setClearing(true)
    try {
      const ids = products.map(p => p.id)
      if (ids.length === 0) {
        toast('目前沒有商品', 'info')
      } else {
        const { error } = await supabase.from('products').delete().in('id', ids)
        if (error) throw error
        toast(`✓ 已清空 ${ids.length} 筆商品`, 'success')
        load()
      }
      setShowClearModal(false)
      setClearConfirmText('')
    } catch (err) {
      toast('清除失敗：' + err.message, 'error')
    }
    setClearing(false)
  }

  const activeProduct = products.find(p => p.id === activeId)

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin" className="btn-ghost p-2 flex-shrink-0"><ArrowLeft size={20} /></Link>
            <div className="min-w-0">
              <h1 className="font-bold text-stone-900">商品管理</h1>
              <p className="text-xs text-stone-400">拖曳左側 ⠿ 圖示可調整順序</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 更多操作：匯出／匯入／清空 */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(v => !v)}
                className="btn-secondary p-2.5"
                title="更多操作"
              >
                <MoreVertical size={18} />
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-stone-200 shadow-xl z-50 overflow-hidden py-1">
                    <button
                      onClick={handleExport}
                      disabled={exporting}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50 text-left"
                    >
                      <FileDown size={16} className="text-stone-400 flex-shrink-0" />
                      {exporting ? '匯出中…' : '匯出 Excel（備份）'}
                    </button>
                    <button
                      onClick={() => importInputRef.current?.click()}
                      disabled={importing}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50 text-left"
                    >
                      <FileUp size={16} className="text-stone-400 flex-shrink-0" />
                      {importing ? `匯入中… ${importProgress}` : '匯入 Excel（還原）'}
                    </button>
                    <div className="h-px bg-stone-100 my-1" />
                    <button
                      onClick={() => { setShowMenu(false); setShowClearModal(true) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 text-left"
                    >
                      <ShieldAlert size={16} className="flex-shrink-0" />
                      清空所有商品
                    </button>
                  </div>
                </>
              )}

              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => { handleImportFile(e.target.files?.[0]); e.target.value = '' }}
              />
            </div>

            <button onClick={openNew} className="btn-primary text-sm py-2 flex items-center gap-1.5">
              <Plus size={16} /> 新增商品
            </button>
          </div>
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

      {/* 匯入結果視窗 */}
      {importResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden"
               style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100 flex-shrink-0">
              <h2 className="font-bold text-stone-900">匯入結果</h2>
              <button onClick={() => setImportResult(null)} className="text-stone-400 hover:text-stone-700">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-green-50 rounded-xl py-3">
                  <p className="text-lg font-bold text-green-600">{importResult.inserted}</p>
                  <p className="text-xs text-stone-500">新增</p>
                </div>
                <div className="bg-blue-50 rounded-xl py-3">
                  <p className="text-lg font-bold text-blue-600">{importResult.updated}</p>
                  <p className="text-xs text-stone-500">更新</p>
                </div>
                <div className="bg-red-50 rounded-xl py-3">
                  <p className="text-lg font-bold text-red-600">{importResult.failed.length}</p>
                  <p className="text-xs text-stone-500">失敗</p>
                </div>
              </div>

              {importResult.failed.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-stone-700 mb-2">失敗明細</p>
                  <div className="space-y-1.5">
                    {importResult.failed.map((f, i) => (
                      <div key={i} className="text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <span className="font-semibold text-red-600">第 {f.row} 列</span>
                        <span className="text-stone-600">　{f.name}</span>
                        <p className="text-red-500 mt-0.5">{f.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-stone-100 flex-shrink-0">
              <button onClick={() => setImportResult(null)} className="btn-primary w-full">關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* 清空所有商品確認視窗 */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-3">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h2 className="font-bold text-stone-900 mb-1.5">清空所有商品？</h2>
              <p className="text-sm text-stone-500 leading-relaxed">
                即將刪除全部 <span className="font-bold text-red-500">{products.length}</span> 項商品，此操作無法復原。
                （不會影響已存在的訂單紀錄，建議清空前先匯出備份）
              </p>
              <p className="text-sm text-stone-500 mt-3">
                請輸入「<span className="font-bold text-stone-800">清空</span>」以確認：
              </p>
              <input
                className="input mt-2"
                value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                placeholder="清空"
                autoFocus
              />
            </div>
            <div className="px-5 pb-5 pt-1 flex gap-3">
              <button
                onClick={() => { setShowClearModal(false); setClearConfirmText('') }}
                className="btn-secondary flex-1"
              >取消</button>
              <button
                onClick={handleClearAll}
                disabled={clearing || clearConfirmText.trim() !== '清空'}
                className="btn-primary flex-1"
              >
                {clearing ? '清除中…' : '確認清空'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
