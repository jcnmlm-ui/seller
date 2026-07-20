import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
  Save, X, Gift,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/StatusBadge'

const EMPTY_FORM = { threshold: '', reward: '', is_active: true }

export default function PromotionManage() {
  const [tiers, setTiers]       = useState([])
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('promotion_tiers')
      .select('*')
      .order('threshold', { ascending: true })
    setTiers(data ?? [])
  }

  function openNew() {
    setEditing(null); setForm(EMPTY_FORM); setShowForm(true)
  }
  function openEdit(t) {
    setEditing(t)
    setForm({
      threshold: String(t.threshold),
      reward:    t.reward,
      is_active: t.is_active,
    })
    setShowForm(true)
  }

  async function handleSave() {
    const thresholdNum = parseFloat(form.threshold)
    if (!form.threshold || isNaN(thresholdNum) || thresholdNum <= 0) {
      toast('請填寫有效的門檻金額', 'error'); return
    }
    if (!form.reward.trim()) { toast('請填寫贈品／優惠內容', 'error'); return }

    setSaving(true)
    const payload = {
      threshold: thresholdNum,
      reward:    form.reward.trim(),
      is_active: form.is_active,
    }
    let error
    if (editing) {
      ;({ error } = await supabase.from('promotion_tiers').update(payload).eq('id', editing.id))
    } else {
      ;({ error } = await supabase.from('promotion_tiers').insert(payload))
    }
    if (error) {
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        toast('已經有相同金額的門檻了', 'error')
      } else {
        toast('儲存失敗：' + error.message, 'error')
      }
    } else {
      toast(editing ? '已更新門檻' : '已新增門檻', 'success')
      setShowForm(false)
      load()
    }
    setSaving(false)
  }

  async function toggleActive(t) {
    const { error } = await supabase
      .from('promotion_tiers').update({ is_active: !t.is_active }).eq('id', t.id)
    if (!error) { toast(t.is_active ? '已停用' : '已啟用', 'info'); load() }
  }

  async function handleDelete(t) {
    if (!confirm(`確認刪除「滿 NT$${t.threshold.toLocaleString()} ${t.reward}」這個門檻？此操作無法復原。`)) return
    const { error } = await supabase.from('promotion_tiers').delete().eq('id', t.id)
    if (error) toast('刪除失敗', 'error')
    else { toast('已刪除', 'info'); load() }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="btn-ghost p-2"><ArrowLeft size={20} /></Link>
            <div>
              <h1 className="font-bold text-stone-900">滿額活動設定</h1>
              <p className="text-xs text-stone-400">設定消費滿額門檻與對應贈品，會顯示在顧客前台</p>
            </div>
          </div>
          <button onClick={openNew} className="btn-primary text-sm py-2 flex items-center gap-1.5">
            <Plus size={16} /> 新增門檻
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {tiers.length === 0 ? (
          <div className="text-center py-20 text-stone-400">
            <Gift size={40} className="mx-auto mb-3 opacity-30" />
            <p>尚未設定滿額活動門檻</p>
            <p className="text-sm mt-1">點右上角「新增門檻」開始設定</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tiers.map(t => (
              <div
                key={t.id}
                className={`bg-white rounded-xl border overflow-hidden flex items-center gap-3 px-4 py-3
                  ${t.is_active ? 'border-stone-200' : 'border-stone-200 opacity-60'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-red-500">NT${t.threshold.toLocaleString()}</span>
                    {!t.is_active && (
                      <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">已停用</span>
                    )}
                  </div>
                  <p className="text-sm text-stone-600 mt-0.5">{t.reward}</p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleActive(t)} className="p-2 text-stone-400 hover:text-stone-700 transition-colors">
                    {t.is_active
                      ? <ToggleRight size={22} className="text-green-500" />
                      : <ToggleLeft size={22} />
                    }
                  </button>
                  <button onClick={() => openEdit(t)} className="p-2 text-stone-400 hover:text-blue-500 transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(t)} className="p-2 text-stone-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增/編輯 Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden"
               style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100 flex-shrink-0">
              <h2 className="font-bold text-stone-900">{editing ? '編輯門檻' : '新增門檻'}</h2>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="label">門檻金額（NT$） *</label>
                <input className="input" type="number" min="1" value={form.threshold}
                  onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
                  placeholder="500" />
              </div>

              <div>
                <label className="label">贈品／優惠內容 *</label>
                <input className="input" value={form.reward}
                  onChange={e => setForm(f => ({ ...f, reward: e.target.value }))}
                  placeholder="例：贈環保購物袋" />
                <p className="text-xs text-stone-400 mt-1">會顯示在前台，簡短描述即可</p>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="active" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-5 h-5 rounded accent-red-500" />
                <label htmlFor="active" className="text-sm font-medium text-stone-700">立即啟用（顯示於前台）</label>
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
