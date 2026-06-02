import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Save, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/StatusBadge'

const EMPTY_FORM = { name: '', description: '', barcode: '', price: '', stock: '-1', is_available: true }

export default function ProductManage() {
  const [products, setProducts] = useState([])
  const [editing, setEditing] = useState(null) // null = 新增, object = 編輯中
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at')
    setProducts(data ?? [])
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      barcode: p.barcode ?? '',
      price: String(p.price),
      stock: String(p.stock),
      is_available: p.is_available,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('請填寫商品名稱', 'error'); return }
    if (!form.price || isNaN(form.price)) { toast('請填寫有效的價格', 'error'); return }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      barcode: form.barcode.trim() || null,
      price: parseFloat(form.price),
      stock: parseInt(form.stock) || -1,
      is_available: form.is_available,
    }

    let error
    if (editing) {
      ;({ error } = await supabase.from('products').update(payload).eq('id', editing.id))
    } else {
      ;({ error } = await supabase.from('products').insert(payload))
    }

    if (error) {
      toast('儲存失敗：' + error.message, 'error')
    } else {
      toast(editing ? '已更新商品' : '已新增商品', 'success')
      setShowForm(false)
      load()
    }
    setSaving(false)
  }

  async function toggleAvailable(p) {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !p.is_available })
      .eq('id', p.id)
    if (!error) {
      toast(p.is_available ? '已下架' : '已上架', 'info')
      load()
    }
  }

  async function handleDelete(p) {
    if (!confirm(`確認刪除「${p.name}」？此操作無法復原。`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) {
      toast('刪除失敗', 'error')
    } else {
      toast('已刪除', 'info')
      load()
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="btn-ghost p-2"><ArrowLeft size={20} /></Link>
            <h1 className="font-bold text-stone-900">商品管理</h1>
          </div>
          <button onClick={openNew} className="btn-primary text-sm py-2 flex items-center gap-1.5">
            <Plus size={16} /> 新增商品
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">

        {/* 商品列表 */}
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className={`bg-white rounded-xl border overflow-hidden flex items-center gap-4 px-4 py-3
              ${p.is_available ? 'border-stone-200' : 'border-stone-100 opacity-60'}`}>
              {/* 圖片 */}
              <div className="w-14 h-14 bg-stone-100 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  : <span className="text-2xl">📦</span>
                }
              </div>

              {/* 資訊 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-stone-900 text-sm">{p.name}</span>
                  {!p.is_available && (
                    <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">已下架</span>
                  )}
                </div>
                {p.barcode && (
                  <p className="text-xs text-stone-400 font-mono">{p.barcode}</p>
                )}
                <div className="flex items-center gap-3 mt-0.5 text-sm">
                  <span className="font-bold text-red-500">NT${p.price.toLocaleString()}</span>
                  <span className="text-stone-400">
                    庫存：{p.stock === -1 ? '無限' : `${p.stock} 件`}
                  </span>
                </div>
              </div>

              {/* 操作 */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleAvailable(p)}
                  className="p-2 text-stone-400 hover:text-stone-700 transition-colors"
                  title={p.is_available ? '下架' : '上架'}
                >
                  {p.is_available ? <ToggleRight size={22} className="text-green-500" /> : <ToggleLeft size={22} />}
                </button>
                <button
                  onClick={() => openEdit(p)}
                  className="p-2 text-stone-400 hover:text-blue-500 transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 新增/編輯 Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100">
              <h2 className="font-bold text-stone-900">{editing ? '編輯商品' : '新增商品'}</h2>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="label">商品名稱 *</label>
                <input className="input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="例：手作皮革名片夾" />
              </div>
              <div>
                <label className="label">商品描述</label>
                <textarea className="input resize-none" rows={2} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} placeholder="商品說明（選填）" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">商品條碼</label>
                  <input className="input font-mono text-sm" value={form.barcode} onChange={e => setForm(f=>({...f,barcode:e.target.value}))} placeholder="4901234567890" />
                </div>
                <div>
                  <label className="label">售價（NT$） *</label>
                  <input className="input" type="number" min="0" value={form.price} onChange={e => setForm(f=>({...f,price:e.target.value}))} placeholder="299" />
                </div>
              </div>
              <div>
                <label className="label">庫存數量（-1 = 無限）</label>
                <input className="input" type="number" min="-1" value={form.stock} onChange={e => setForm(f=>({...f,stock:e.target.value}))} placeholder="-1" />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="avail"
                  checked={form.is_available}
                  onChange={e => setForm(f=>({...f,is_available:e.target.checked}))}
                  className="w-5 h-5 rounded accent-red-500"
                />
                <label htmlFor="avail" className="text-sm font-medium text-stone-700">立即上架</label>
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">取消</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    儲存中…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Save size={16} /> 儲存
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
