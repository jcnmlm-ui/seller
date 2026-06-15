import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/StatusBadge'

export default function SettingsPage() {
  const [form, setForm] = useState({
    store_name:          '',
    sender_name:         '',
    sender_phone:        '',
    sender_postal_code:  '',
    sender_address:      '',
  })
  const [loading, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 'main').single()
      .then(({ data }) => {
        if (data) setForm({
          store_name:         data.store_name         ?? '',
          sender_name:        data.sender_name        ?? '',
          sender_phone:       data.sender_phone       ?? '',
          sender_postal_code: data.sender_postal_code ?? '',
          sender_address:     data.sender_address     ?? '',
        })
      })
  }, [])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('settings').upsert({
      id: 'main',
      ...form,
      updated_at: new Date().toISOString(),
    })
    if (error) toast('儲存失敗：' + error.message, 'error')
    else       toast('✓ 設定已儲存', 'success')
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="btn-ghost p-2"><ArrowLeft size={20} /></Link>
            <h1 className="font-bold text-stone-900">系統設定</h1>
          </div>
          <button onClick={handleSave} disabled={loading}
            className="btn-primary text-sm py-2 flex items-center gap-1.5">
            <Save size={14} />
            {loading ? '儲存中…' : '儲存設定'}
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* 攤位資訊 */}
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-stone-900 border-b border-stone-100 pb-2">
            🏪 攤位資訊
          </h2>
          <div>
            <label className="label">攤位名稱</label>
            <input className="input" value={form.store_name}
              placeholder="高雄郵局"
              onChange={e => set('store_name', e.target.value)} />
            <p className="text-xs text-stone-400 mt-1">顯示在顧客預購頁的標題</p>
          </div>
        </div>

        {/* 寄件人資訊 */}
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-stone-900 border-b border-stone-100 pb-2">
            📬 寄件人資訊（印在託運單上）
          </h2>
          <div>
            <label className="label">寄件人姓名 / 單位名稱</label>
            <input className="input" value={form.sender_name}
              placeholder="高雄郵局企劃行銷科"
              onChange={e => set('sender_name', e.target.value)} />
          </div>
          <div>
            <label className="label">寄件人電話</label>
            <input className="input" value={form.sender_phone}
              placeholder="07-2614171"
              onChange={e => set('sender_phone', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">郵遞區號</label>
              <input className="input font-mono" value={form.sender_postal_code}
                placeholder="800"
                onChange={e => set('sender_postal_code', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">寄件人地址</label>
              <input className="input" value={form.sender_address}
                placeholder="高雄市新興區中正三路177號"
                onChange={e => set('sender_address', e.target.value)} />
            </div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-xs text-stone-500 leading-relaxed">
            <p className="font-semibold mb-1">預覽（印在託運單寄件人欄）</p>
            <p>{form.sender_name || '（未填）'}</p>
            <p>{form.sender_phone || ''}</p>
            <p>{form.sender_postal_code ? `${form.sender_postal_code} ` : ''}{form.sender_address || ''}</p>
          </div>
        </div>

      </div>
    </div>
  )
}
