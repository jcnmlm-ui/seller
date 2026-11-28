import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from './StatusBadge'
import { X, Download, Upload, Loader2, Info } from 'lucide-react'
import {
  POST_MAPS, POST_MAX, parsePostAddr, orderAddress, recvFingerprint, expandParcels,
  postRows, postXlsx, zipFiles, harleyRows, harleyXlsx,
  readXlsxRows, readHarleyReturn, readEzpostPdf, matchHarley, findEzpostBatch, matchEzpost,
} from '../lib/shipping'

const CFG_KEY = 'seller_ship_cfg_v1'
const CFG_DEFAULT = {
  content: '禮品', desc: '', weight: '1', length: '40', pack: '0.自備箱袋(信封)',
  undeliver: '退回寄件人(另付退回費)', contract: '', email: '', hlDesc: '', hlNote: '',
}
const EXPORT_STATUS = [
  ['packed', '已包裝'], ['picking', '揀貨中'], ['paid', '待揀貨'], ['shipped', '已出貨'],
]
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function loadCfg() {
  try { return { ...CFG_DEFAULT, ...(JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}) } }
  catch { return { ...CFG_DEFAULT } }
}
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
function saveFile(name, data, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

async function loadPdfLib() {
  const lib = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
  lib.GlobalWorkerOptions.workerSrc = worker
  return lib
}

const STATUS_PILL = {
  ok:   ['可匯入', 'bg-emerald-100 text-emerald-700'],
  warn: ['請核對', 'bg-amber-100 text-amber-700'],
  none: ['沒對到', 'bg-red-100 text-red-600'],
  dup:  ['重複', 'bg-red-100 text-red-600'],
}

export default function ShipmentTools({ orders, senderSettings, onClose, onDone }) {
  const { session } = useAuth() ?? {}
  const [tab, setTab] = useState('export')
  const [cfg, setCfg] = useState(loadCfg)
  useEffect(() => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)) } catch { /* ignore */ } }, [cfg])
  const setC = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  // ── 匯出 ───────────────────────────────────────────────
  const [status, setStatus] = useState('packed')
  const [addrType, setAddrType] = useState('all') // all｜normal｜box
  const [checked, setChecked] = useState(new Set())
  const [pkgs, setPkgs] = useState({})
  const [busy, setBusy] = useState(false)

  const inStatus = useMemo(
    () => orders.filter(o => o.status === status).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [orders, status]
  )
  const nBox = inStatus.filter(o => o.ibox_full_address).length
  const list = useMemo(
    () => inStatus.filter(o => addrType === 'all' || (addrType === 'box') === !!o.ibox_full_address),
    [inStatus, addrType]
  )
  useEffect(() => { setChecked(new Set(list.filter(o => !o.tracking_no).map(o => o.id))) }, [list])

  const toggle = id => setChecked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOn = list.length > 0 && list.every(o => checked.has(o.id))
  const pk = o => Math.min(Math.max(parseInt(pkgs[o.id], 10) || 1, 1), 99)

  async function saveBatch(kind, rows) {
    const { error } = await supabase.from('shipment_batches')
      .insert({ kind, operator: session?.user?.email ?? null, rows })
    if (error) {
      console.error(error)
      toast('批次紀錄寫入失敗，之後匯入時對不到。請確認已在 Supabase 執行 25 號 SQL', 'error', 6000)
      return false
    }
    return true
  }

  async function exportEzpost() {
    const parcels = list.filter(o => checked.has(o.id)).map(o => ({ order: o, n: pk(o) }))
    if (!parcels.length) return
    const sp = parsePostAddr(senderSettings?.sender_address || '')
    const sender = {
      contract: cfg.contract, email: cfg.email, name: senderSettings?.sender_name || '', phone: senderSettings?.sender_phone || '',
      county: sp.county, area: sp.area, addr: sp.rest,
    }
    if (!sp.county || !sp.area) { toast('寄件人地址看不出縣市＋鄉鎮市區，請先到「系統設定」填寫寄件人地址', 'error', 5000); return }
    setBusy(true)
    try {
      const rows = expandParcels(parcels)
      const res = postRows(rows, { sender, def: { content: cfg.content, desc: cfg.desc, weight: cfg.weight, length: cfg.length, pack: cfg.pack, undeliver: cfg.undeliver } })
      const batchRows = rows.map((r, i) => ({
        order_id: r.order.id, order_no: r.order.order_no, name: String(r.order.receiver_name || '').trim(),
        phone: r.order.receiver_phone, addr: orderAddress(r.order).full, fp: recvFingerprint(r.order),
        k: r.k, n: r.n, file: Math.floor(i / POST_MAX) + 1, pos: (i % POST_MAX) + 1,
      }))
      const saved = await saveBatch('ezpost', batchRows)
      const files = []
      for (let i = 0; i < res.rows.length; i += POST_MAX) files.push(res.rows.slice(i, i + POST_MAX))
      const base = `EZpost格式_${stamp()}`
      const blobs = []
      for (const f of files) blobs.push(await postXlsx(f))
      if (blobs.length === 1) saveFile(`${base}.xlsx`, blobs[0], XLSX_MIME)
      else saveFile(`${base}.zip`, await zipFiles(blobs.map((b, i) => ({ name: `${base}_${i + 1}.xlsx`, data: b }))), 'application/zip')
      let m = `已下載 EZpost 檔：${res.rows.length} 筆包裹` + (blobs.length > 1 ? `，分成 ${blobs.length} 個檔案（zip）` : '')
      if (res.issues.length) m += `。有資料不完整：${res.issues.slice(0, 3).join('；')}`
      toast(m, res.issues.length || !saved ? 'info' : 'success', 6000)
    } catch (e) {
      console.error(e); toast(`匯出失敗：${e.message || e}`, 'error', 5000)
    } finally { setBusy(false) }
  }

  async function exportHarley() {
    const parcels = list.filter(o => checked.has(o.id)).map(o => ({ order: o, n: pk(o) }))
    if (!parcels.length) return
    setBusy(true)
    try {
      const rows = harleyRows(parcels, { desc: cfg.hlDesc || cfg.desc || cfg.content, note: cfg.hlNote })
      const saved = await saveBatch('harley', parcels.map(({ order: o, n }) => ({
        order_id: o.id, order_no: o.order_no, name: String(o.receiver_name || '').trim(),
        phone: o.receiver_phone, addr: orderAddress(o).full, fp: recvFingerprint(o), k: 1, n,
      })))
      saveFile(`哈雷列印格式_${stamp()}.xlsx`, await harleyXlsx(rows), XLSX_MIME)
      const miss = rows.filter(r => !r[0] || !r[1] || !r[2] || !r[3]).length
      toast(`已下載哈雷檔：${rows.length} 筆（件數合計 ${rows.reduce((a, r) => a + r[5], 0)}）` + (miss ? `，有 ${miss} 筆缺資料` : ''), miss || !saved ? 'info' : 'success', 5000)
    } catch (e) {
      console.error(e); toast(`匯出失敗：${e.message || e}`, 'error', 5000)
    } finally { setBusy(false) }
  }

  // ── 匯入 ───────────────────────────────────────────────
  const [files, setFiles] = useState([]) // 已讀入的檔案描述
  const [groups, setGroups] = useState([])
  const [on, setOn] = useState({})
  const [markShipped, setMarkShipped] = useState(false)
  const [importing, setImporting] = useState(false)
  const [reading, setReading] = useState(false)
  const [errs, setErrs] = useState([])

  async function onPick(fileList) {
    setReading(true); setErrs([])
    const fdesc = [], gs = [], er = []
    try {
      const { data: batches, error } = await supabase.from('shipment_batches')
        .select('*').order('created_at', { ascending: false }).limit(40)
      if (error) er.push('讀不到匯出批次紀錄（請確認已執行 25 號 SQL）')
      const bl = batches ?? []
      for (const f of Array.from(fileList)) {
        try {
          const buf = await f.arrayBuffer()
          if (/\.pdf$/i.test(f.name)) {
            const pdfRows = await readEzpostPdf(buf, await loadPdfLib())
            if (!pdfRows.length) { er.push(`「${f.name}」裡找不到「掛號號碼」那張表（要放有執據／存根頁的 PDF）`); continue }
            const found = findEzpostBatch(pdfRows, bl)
            if (!found) {
              er.push(`「${f.name}」有 ${pdfRows.length} 筆，但找不到收件人順序相同的 EZpost 匯出批次。請確認這份 PDF 是從本頁匯出的 EZpost 檔上傳後產生的，且沒有改過列的順序`)
              continue
            }
            fdesc.push(`EZpost 託運單 PDF：${pdfRows.length} 筆（${f.name}）`)
            gs.push(...matchEzpost(pdfRows, found, orders))
          } else {
            const x = await readXlsxRows(buf)
            const ret = readHarleyReturn(x)
            if (!ret) { er.push(`「${f.name}」不像哈雷的回傳檔（找不到「託運單編號」欄）。EZpost 上傳檔不用放，只要放託運單 PDF`); continue }
            fdesc.push(`哈雷回傳檔：${ret.length} 列（${f.name}）`)
            gs.push(...matchHarley(ret, orders, bl.filter(b => b.kind === 'harley')))
          }
        } catch (e) { console.error(e); er.push(`讀不了「${f.name}」：${e.message || e}`) }
      }
    } finally { setReading(false) }
    setFiles(fdesc); setGroups(gs); setErrs(er)
    const o = {}; gs.forEach((g, i) => { o[i] = g.status === 'ok' }); setOn(o)
  }

  const isOn = i => !!on[i] && (groups[i].status === 'ok' || groups[i].status === 'warn')
  const picked = groups.map((g, i) => [g, i]).filter(([, i]) => isOn(i))
  function reset() { setFiles([]); setGroups([]); setOn({}); setErrs([]) }

  async function applyImport() {
    if (!picked.length || importing) return
    setImporting(true)
    try {
      let okN = 0, fail = 0
      for (const [g] of picked) {
        const upd = { tracking_no: g.tracks.join(',') }
        if (markShipped && g.order.status === 'packed') { upd.status = 'shipped'; upd.shipped_at = new Date().toISOString() }
        const { error } = await supabase.from('orders').update(upd).eq('id', g.order.id)
        if (error) fail++; else okN++
      }
      toast(`已寫入 ${okN} 筆訂單的託運單號` + (fail ? `，${fail} 筆失敗` : ''), fail ? 'info' : 'success', 5000)
      reset(); onDone?.()
    } finally { setImporting(false) }
  }

  const sel = 'w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white'
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100">
          <div>
            <h2 className="font-bold text-stone-900 text-lg">託運單（EZpost／哈雷）</h2>
            <p className="text-xs text-stone-400 mt-0.5">匯出寄件資料，再把拿到的託運單號匯入訂單</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1"><X size={20} /></button>
        </div>
        <div className="flex gap-1 px-5 pt-3">
          {[['export', '1. 匯出寄件資料'], ['import', '2. 匯入託運單號']].map(([k, t]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-t-lg text-sm font-bold ${tab === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'}`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 border-t border-stone-200">
          {tab === 'export' && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm text-stone-500">顯示：</span>
                {EXPORT_STATUS.map(([k, t]) => (
                  <button key={k} onClick={() => setStatus(k)}
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${status === k ? 'bg-red-500 text-white' : 'bg-stone-100 text-stone-600'}`}>
                    {t} {orders.filter(o => o.status === k).length}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm text-stone-500">地址：</span>
                {[['all', '全部', inStatus.length], ['normal', '一般地址', inStatus.length - nBox], ['box', 'i郵箱', nBox]].map(([k, t, n]) => (
                  <button key={k} onClick={() => setAddrType(k)}
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${addrType === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>
                    {t} {n}
                  </button>
                ))}
              </div>
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 px-3 py-2 flex items-center gap-3 text-xs font-bold text-stone-500">
                  <label className="flex items-center gap-2 w-14">
                    <input type="checkbox" checked={allOn}
                      onChange={e => setChecked(e.target.checked ? new Set(list.map(o => o.id)) : new Set())} /> 全選
                  </label>
                  <span className="flex-1">訂單／收件人／地址</span>
                  <span className="w-20 text-center">包裹數</span>
                </div>
                <div className="max-h-[38vh] overflow-y-auto divide-y divide-stone-100">
                  {list.length === 0 && <p className="text-center text-stone-400 text-sm py-8">這個狀態沒有訂單</p>}
                  {list.map(o => (
                    <div key={o.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                      <span className="w-14 flex-none"><input type="checkbox" checked={checked.has(o.id)} onChange={() => toggle(o.id)} /></span>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-stone-400">{o.order_no}{o.ibox_full_address && <span className="ml-2 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-sans font-bold">i郵箱</span>}{o.tracking_no && <span className="ml-2 text-emerald-600">已有託運單號 {o.tracking_no}</span>}</p>
                        <p className="font-semibold text-stone-800 truncate">{o.receiver_name}　<span className="font-normal text-stone-500">{o.receiver_phone}</span></p>
                        <p className="text-xs text-stone-500 truncate">{orderAddress(o).full}</p>
                      </div>
                      <input type="number" min="1" max="99" value={pkgs[o.id] ?? 1}
                        onChange={e => setPkgs(p => ({ ...p, [o.id]: e.target.value }))}
                        className="w-20 border border-stone-300 rounded-lg px-2 py-1 text-center" />
                    </div>
                  ))}
                </div>
              </div>

              <details className="mt-3 border border-stone-200 rounded-xl">
                <summary className="px-4 py-2 text-sm font-bold text-stone-600 cursor-pointer">包裹與寄件設定（改一次會記住）</summary>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <label>內裝物品種類<select className={sel} value={cfg.content} onChange={e => setC('content', e.target.value)}>
                    {Object.keys(POST_MAPS.content).map(k => <option key={k}>{k}</option>)}</select></label>
                  <label>內裝物品描述（選「其他」必填）<input className={sel} value={cfg.desc} onChange={e => setC('desc', e.target.value)} /></label>
                  <label>總重量 kg<input className={sel} type="number" step="0.1" value={cfg.weight} onChange={e => setC('weight', e.target.value)} /></label>
                  <label>包裹總長 cm<input className={sel} type="number" value={cfg.length} onChange={e => setC('length', e.target.value)} /></label>
                  <label>包材<select className={sel} value={cfg.pack} onChange={e => setC('pack', e.target.value)}>
                    {Object.keys(POST_MAPS.pack).map(k => <option key={k}>{k}</option>)}</select></label>
                  <label>未送達處理<select className={sel} value={cfg.undeliver} onChange={e => setC('undeliver', e.target.value)}>
                    {Object.keys(POST_MAPS.undeliver).map(k => <option key={k}>{k}</option>)}</select></label>
                  <label>合約編號（選填）<input className={sel} value={cfg.contract} onChange={e => setC('contract', e.target.value)} /></label>
                  <label>哈雷：內容物（空白＝用左邊的描述）<input className={sel} value={cfg.hlDesc} onChange={e => setC('hlDesc', e.target.value)} /></label>
                  <label>哈雷：備註前綴（訂單編號會自動接在後面）<input className={sel} value={cfg.hlNote} onChange={e => setC('hlNote', e.target.value)} /></label>
                  <p className="col-span-full text-xs text-stone-400">寄件人姓名、電話、地址讀取「系統設定」裡的寄件人資料。</p>
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                <button onClick={exportEzpost} disabled={busy || checked.size === 0} className="btn-primary text-sm py-2 flex items-center gap-1.5">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 下載 EZpost 格式
                </button>
                <button onClick={exportHarley} disabled={busy || checked.size === 0} className="btn-secondary text-sm py-2 flex items-center gap-1.5">
                  <Download size={14} /> 下載哈雷列印格式
                </button>
                <span className="text-xs text-stone-400">已勾 {checked.size} 筆訂單，共 {list.filter(o => checked.has(o.id)).reduce((a, o) => a + pk(o), 0)} 個包裹</span>
              </div>
              <p className="text-xs text-stone-400 mt-2 flex gap-1"><Info size={12} className="mt-0.5 flex-none" />
                匯出時會記下這一批的訂單與順序（存在資料庫），匯入託運單號時用它對回訂單；EZpost 的 PDF 不用保留原上傳檔。</p>
            </div>
          )}

          {tab === 'import' && (
            <div>
              <label className="flex items-center gap-3 border-2 border-dashed border-stone-300 rounded-xl p-4 cursor-pointer hover:bg-stone-50">
                {reading ? <Loader2 className="animate-spin text-stone-400" /> : <Upload className="text-stone-400" />}
                <div>
                  <p className="font-bold text-stone-800">放入 EZpost 託運單 PDF，或哈雷回傳的 xlsx</p>
                  <p className="text-xs text-stone-500">可一次放好幾個。EZpost 只需要 PDF（含執據／存根頁）；哈雷要放有「託運單編號」欄的回傳檔</p>
                </div>
                <input type="file" accept=".pdf,.xlsx" multiple hidden
                  onChange={e => { const fs = Array.from(e.target.files); e.target.value = ''; if (fs.length) onPick(fs) }} />
              </label>
              {files.length > 0 && (
                <div className="mt-2 text-sm text-stone-600 space-y-0.5">
                  {files.map(f => <p key={f}>✓ {f}</p>)}
                  <button onClick={reset} className="text-xs text-stone-400 hover:text-red-500 underline">清除重放</button>
                </div>
              )}
              {errs.map(e => <p key={e} className="mt-2 text-sm text-red-600">{e}</p>)}

              {groups.length > 0 && (
                <>
                  <div className="mt-4 border border-stone-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-50 text-xs text-stone-500">
                        <tr><th className="w-10 px-2 py-2" /><th className="text-left px-2">訂單</th><th className="text-left px-2">託運單號</th><th className="text-left px-2">狀態</th></tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {groups.map((g, i) => {
                          const p = STATUS_PILL[g.status] ?? STATUS_PILL.none
                          const can = g.status === 'ok' || g.status === 'warn'
                          return (
                            <tr key={i} className={can ? '' : 'bg-red-50/50'}>
                              <td className="px-2 py-2 text-center">
                                {can && <input type="checkbox" checked={isOn(i)} onChange={e => setOn(o => ({ ...o, [i]: e.target.checked }))} />}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <p className="font-mono text-xs text-stone-400">{g.orderNo.startsWith('X|') ? '（未知）' : g.orderNo}</p>
                                <p className="font-semibold text-stone-800">{g.order?.receiver_name ?? g.rows?.[0]?.name ?? ''}</p>
                              </td>
                              <td className="px-2 py-2 align-top font-mono text-xs break-all">
                                {g.tracks.map(t => <div key={t}>{t}</div>)}
                                {g.tracks.length > 1 && <span className="text-stone-400 font-sans">共 {g.tracks.length} 個包裹，用逗號串在一起</span>}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${p[1]}`}>{p[0]}</span>
                                {g.note && <p className="text-xs text-amber-700 mt-1">{g.note}</p>}
                                {g.hadTrack && can && <p className="text-xs text-stone-400 mt-1">原本的託運單號 {g.hadTrack} 會被覆蓋</p>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-4">
                    <button onClick={applyImport} disabled={importing || picked.length === 0} className="btn-primary text-sm py-2 flex items-center gap-1.5">
                      {importing && <Loader2 size={14} className="animate-spin" />} 寫入 {picked.length} 筆訂單的託運單號
                    </button>
                    <label className="flex items-center gap-2 text-sm text-stone-600">
                      <input type="checkbox" checked={markShipped} onChange={e => setMarkShipped(e.target.checked)} />
                      同時把「已包裝」的訂單改成已出貨
                    </label>
                  </div>
                  <p className="text-xs text-stone-400 mt-2">「請核對」的預設不勾（收件資料在匯出後有改、訂單已取消等），確認後自己勾選。</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
