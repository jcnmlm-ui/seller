// 託運單匯出（EZpost／哈雷）與託運單號匯入的共用邏輯
// 範本與讀檔方式與 topmall_export.user.js 相同（郵政商城那邊的外掛），這裡改成直接吃 seller 的訂單
import JSZip from 'jszip'
import { POST_MAPS, POST_TPL, HARLEY_TPL } from './shippingData'

export const POST_MAX = 100 // 每個 EZpost 檔案 100 筆（範本上限 200）
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const ORDER_NO_RE = /ORD-[\d-]+/g

export const POST_COUNTIES = Object.keys(
  Object.keys(POST_MAPS.zip).reduce((o, k) => { o[k.split('-')[0]] = 1; return o }, {})
)
const POST_AREAS = {}
Object.keys(POST_MAPS.zip).forEach(k => {
  const p = k.split('-'); (POST_AREAS[p[0]] = POST_AREAS[p[0]] || []).push(p.slice(1).join('-'))
})
export { POST_MAPS }

// ── 小工具 ───────────────────────────────────────────────
const digits = s => String(s || '').replace(/\D/g, '')
// 比對用：全形轉半形、去空白標點、臺＝台
export const cmp = s => String(s || '').normalize('NFKC').replace(/臺/g, '台')
  .replace(/[\s　\-－/／,，、.。()（）]/g, '').toLowerCase()
const normName = s => String(s || '').replace(/[\s　]/g, '').normalize('NFKC').toLowerCase()

// 地址 → { county, area, rest, station }
// i 郵箱：station＝郵箱名稱（放在「收件地址」欄），縣市與區取自後面的完整地址
export function parsePostAddr(addr) {
  const a = String(addr || '').replace(/^\s*\d{3,6}\s*/, '').replace(/[\s　]+$/, '').replace(/台/g, '臺')
  let best = null, bi = 1e9
  POST_COUNTIES.forEach(c => { const i = a.indexOf(c); if (i >= 0 && i < bi) { bi = i; best = c } })
  const out = { county: '', area: '', rest: a, station: '' }
  if (!best) return out
  out.county = best
  out.station = a.slice(0, bi).replace(/[\s　]+$/, '')
  const rest = a.slice(bi + best.length)
  let area = ''
  ;(POST_AREAS[best] || []).forEach(n => { if (rest.indexOf(n) === 0 && n.length > area.length) area = n })
  out.area = area
  out.rest = rest.slice(area.length).replace(/^[\s　]+/, '')
  return out
}

// ── 把訂單轉成「要寄的包裹」 ───────────────────────────────
// 一般地址：receiver_address；i 郵箱：receiver_address 是郵箱名稱、ibox_full_address 是完整地址
export function orderAddress(o) {
  const box = !!o.ibox_full_address
  return {
    box,
    full: box ? `${o.receiver_address || ''}${o.ibox_full_address}` : String(o.receiver_address || ''),
  }
}
// 收件資料指紋（匯出時記下，匯入時比對是否被改過）
export function recvFingerprint(o) {
  return `${normName(o.receiver_name)}|${digits(o.receiver_phone)}|${cmp(orderAddress(o).full)}`
}

// parcels: [{ order, n }] → 每個訂單展開成 n 筆（件數編號 k/n）
export function expandParcels(parcels) {
  const rows = []
  parcels.forEach(({ order, n }) => {
    const cnt = Math.min(Math.max(parseInt(n, 10) || 1, 1), 99)
    for (let k = 1; k <= cnt; k++) rows.push({ order, k, n: cnt })
  })
  return rows
}

// ── EZpost 上傳檔 ────────────────────────────────────────
// cfg: { sender:{contract,name,phone,county,area,addr,email}, def:{content,desc,weight,length,pack,undeliver} }
export function postRows(rows, cfg) {
  const def = cfg.def || {}, snd = cfg.sender || {}, issues = []
  const out = rows.map(({ order: o }) => {
    const { box, full } = orderAddress(o)
    const p = parsePostAddr(full)
    const r = {
      B: String(o.receiver_name || '').trim(), C: String(o.receiver_phone || '').replace(/[\s　-]/g, ''),
      D: box ? 'i郵箱地址' : '一般地址', E: p.county, F: p.area, G: '', H: box ? (p.station || p.rest) : p.rest,
      I: snd.contract || '', J: snd.name || '', K: snd.phone || '', L: snd.county || '', M: snd.area || '', N: snd.addr || '', O: snd.email || '',
      P: def.content || '禮品', Q: def.desc || '',
      R: def.weight === '' || def.weight == null ? '' : Number(def.weight),
      S: def.pack || '0.自備箱袋(信封)',
      T: def.length === '' || def.length == null ? '' : Number(def.length),
      U: '', V: def.undeliver || '退回寄件人(另付退回費)',
    }
    const bad = []
    if (!p.county) bad.push('縣市'); else if (!p.area) bad.push('鄉鎮市區')
    if (!r.B) bad.push('收件人')
    if (!r.C) bad.push('電話')
    if (bad.length) issues.push(`${o.order_no}：${bad.join('、')}無法判斷`)
    return r
  })
  // 同一筆訂單的多個包裹只提醒一次
  return { rows: out, issues: Array.from(new Set(issues)) }
}

// 公式欄（W~AD）的計算結果（與範本內的 VLOOKUP 公式一致）
function postCalc(r, no) {
  const M = POST_MAPS
  return {
    A: no,
    W: M.content[r.P] != null ? M.content[r.P] : '',
    X: r.P === '其他' ? String(r.Q || '').trim() : r.P,
    Y: M.undeliver[r.V] != null ? M.undeliver[r.V] : '',
    Z: M.addrType[r.D] != null ? M.addrType[r.D] : '',
    AA: M.zip[`${r.E}-${r.F}`] != null ? M.zip[`${r.E}-${r.F}`] : '',
    AB: M.zip[`${r.L}-${r.M}`] != null ? M.zip[`${r.L}-${r.M}`] : '',
    AC: M.pack[r.S] != null ? M.pack[r.S] : '',
    AD: String(r.B || '').trim() !== '' ? '202' : '',
  }
}

function setCell(doc, c, val, kind) {
  // kind: 'str'（文字）、'num'（數字）、'fstr'（公式的文字結果）、'fnum'（公式的數字結果）
  if (kind === 'fstr' || kind === 'fnum') {
    let v = c.getElementsByTagNameNS(NS, 'v')[0]
    if (!v) { v = doc.createElementNS(NS, 'v'); c.appendChild(v) }
    v.textContent = String(val)
    if (kind === 'fstr') c.setAttribute('t', 'str'); else c.removeAttribute('t')
    return
  }
  while (c.firstChild) c.removeChild(c.firstChild)
  c.removeAttribute('t')
  if (val === '' || val == null) return
  if (kind === 'num') {
    const v2 = doc.createElementNS(NS, 'v'); v2.textContent = String(val); c.appendChild(v2); return
  }
  c.setAttribute('t', 'inlineStr')
  const is = doc.createElementNS(NS, 'is'), tt = doc.createElementNS(NS, 't')
  tt.setAttribute('xml:space', 'preserve'); tt.textContent = String(val)
  is.appendChild(tt); c.appendChild(is)
}

// 一個檔案（最多 POST_MAX 筆）→ Uint8Array
export async function postXlsx(rows) {
  const zip = await JSZip.loadAsync(POST_TPL, { base64: true })
  const path = 'xl/worksheets/sheet1.xml'
  const doc = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml')
  const rowEls = {}
  Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS, 'row'), e => { rowEls[e.getAttribute('r')] = e })
  const TEXT = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'S', 'V']
  const NUM = ['R', 'T', 'U']
  rows.forEach((r, i) => {
    const re = rowEls[String(5 + i)]
    if (!re) throw new Error(`範本缺少第 ${5 + i} 列`)
    const cells = {}
    Array.prototype.forEach.call(re.getElementsByTagNameNS(NS, 'c'), c => { cells[c.getAttribute('r').replace(/\d+/, '')] = c })
    TEXT.forEach(k => { if (cells[k]) setCell(doc, cells[k], r[k], 'str') })
    NUM.forEach(k => { if (cells[k]) setCell(doc, cells[k], r[k], 'num') })
    const cv = postCalc(r, i + 1)
    Object.keys(cv).forEach(k => { if (cells[k]) setCell(doc, cells[k], cv[k], k === 'A' ? 'fnum' : 'fstr') })
  })
  zip.file(path, new XMLSerializer().serializeToString(doc))
  const wb = await zip.file('xl/workbook.xml').async('string')
  zip.file('xl/workbook.xml', wb.replace('<calcPr calcId="191029"/>', '<calcPr calcId="191029" fullCalcOnLoad="1"/>'))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// 把多個 EZpost 檔案打包成 zip
export async function zipFiles(files) {
  const z = new JSZip()
  files.forEach(f => z.file(f.name, f.data))
  return z.generateAsync({ type: 'uint8array' })
}

// ── 哈雷列印格式 ─────────────────────────────────────────
// 欄位：收件人／電話／郵遞區號／地址／內容物／件數／備註（備註一定放訂單編號，匯入時靠它配對）
export function harleyRows(parcels, cfg) {
  return parcels.map(({ order: o, n }) => {
    const { full } = orderAddress(o)
    return [
      String(o.receiver_name || '').trim(),
      String(o.receiver_phone || '').replace(/[\s　-]/g, ''),
      String(o.receiver_postal_code || '').replace(/[\s　]/g, ''),
      full.replace(/^\s*\d{3,6}\s*/, '').replace(/[\s　]+$/g, ''),
      cfg.desc || '',
      Math.min(Math.max(parseInt(n, 10) || 1, 1), 99),
      [cfg.note || '', o.order_no].filter(Boolean).join('　'),
    ]
  })
}

export async function harleyXlsx(rows) {
  const zip = await JSZip.loadAsync(HARLEY_TPL, { base64: true })
  const path = 'xl/worksheets/sheet1.xml'
  const doc = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml')
  const sd = doc.getElementsByTagNameNS(NS, 'sheetData')[0]
  const LET = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  rows.forEach((r, i) => {
    const re = doc.createElementNS(NS, 'row'); re.setAttribute('r', String(i + 2))
    r.forEach((v, j) => {
      const c = doc.createElementNS(NS, 'c'); c.setAttribute('r', LET[j] + (i + 2))
      if (j === 5 && v !== '' && v != null) {
        const nv = doc.createElementNS(NS, 'v'); nv.textContent = String(v); c.appendChild(nv) // 件數：數字
      } else if (v !== '' && v != null) {
        c.setAttribute('t', 'inlineStr')
        const is = doc.createElementNS(NS, 'is'), t = doc.createElementNS(NS, 't')
        t.setAttribute('xml:space', 'preserve'); t.textContent = String(v); is.appendChild(t); c.appendChild(is)
      }
      re.appendChild(c)
    })
    sd.appendChild(re)
  })
  const cols = doc.createElementNS(NS, 'cols')
  ;[12, 14, 10, 52, 28, 8, 24].forEach((w, i) => {
    const c = doc.createElementNS(NS, 'col')
    c.setAttribute('min', i + 1); c.setAttribute('max', i + 1); c.setAttribute('width', w); c.setAttribute('customWidth', '1')
    cols.appendChild(c)
  })
  sd.parentNode.insertBefore(cols, sd)
  zip.file(path, new XMLSerializer().serializeToString(doc))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// ── 讀回傳檔 ─────────────────────────────────────────────
// 讀 xlsx 第一個工作表，回傳二維陣列
export async function readXlsxRows(buf) {
  const zip = await JSZip.loadAsync(buf), ss = [], f = zip.file('xl/sharedStrings.xml')
  if (f) {
    const d = new DOMParser().parseFromString(await f.async('string'), 'application/xml')
    Array.prototype.forEach.call(d.getElementsByTagNameNS(NS, 'si'), si => {
      ss.push(Array.prototype.map.call(si.getElementsByTagNameNS(NS, 't'), t => t.textContent).join(''))
    })
  }
  const names = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))
  if (!names.length) throw new Error('這個 xlsx 裡找不到工作表')
  const doc = new DOMParser().parseFromString(await zip.file(names[0]).async('string'), 'application/xml'), out = []
  Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS, 'row'), re => {
    const row = []
    Array.prototype.forEach.call(re.getElementsByTagNameNS(NS, 'c'), c => {
      const letters = (c.getAttribute('r') || '').replace(/\d+/, '')
      let idx = 0
      for (let k = 0; k < letters.length; k++) idx = idx * 26 + (letters.charCodeAt(k) - 64)
      idx -= 1
      const t = c.getAttribute('t'), v = c.getElementsByTagNameNS(NS, 'v')[0]
      let val = ''
      if (t === 'inlineStr') val = Array.prototype.map.call(c.getElementsByTagNameNS(NS, 't'), x => x.textContent).join('')
      else if (v) val = t === 's' ? (ss[parseInt(v.textContent, 10)] || '') : v.textContent
      row[idx] = val
    })
    out.push(row)
  })
  return out
}

// 哈雷回傳檔 → [{ track, k, n, name, phone, mobile, addr, remark, orderNos, line }]；不是哈雷檔回傳 null
export function readHarleyReturn(rows) {
  let hi = -1
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] || []).some(c => String(c == null ? '' : c).replace(/\s/g, '') === '託運單編號')) { hi = i; break }
  }
  if (hi < 0) return null
  const H = rows[hi].map(c => String(c == null ? '' : c).replace(/\s/g, ''))
  const col = re => { for (let j = 0; j < H.length; j++) if (re.test(H[j])) return j; return -1 }
  const cT = col(/^託運單編號$/), cN = col(/^客戶名稱$|^收件人$/), cP = col(/^電話$/), cM = col(/^手機$/)
  const cA = col(/^地址$/), cK = col(/^件數編號$/), cR = col(/^備註/)
  const cell = (r, j) => (j < 0 || r[j] == null) ? '' : String(r[j]).trim()
  const out = []
  for (let i = hi + 1; i < rows.length; i++) {
    const tr = rows[i] || [], track = cell(tr, cT)
    if (!track) continue
    const remark = cell(tr, cR), kk = cell(tr, cK).match(/(\d+)\s*\/\s*(\d+)/)
    out.push({
      track, k: kk ? +kk[1] : 0, n: kk ? +kk[2] : 0, name: cell(tr, cN), phone: cell(tr, cP), mobile: cell(tr, cM),
      addr: cell(tr, cA), remark, orderNos: Array.from(new Set(remark.match(ORDER_NO_RE) || [])), line: i + 1,
    })
  }
  return out
}

// EZpost 交寄大宗包裹郵件執據 PDF → [{ seq, track(20 碼), name, zip, area }]
// 只讀有「掛號號碼」表頭的頁（執據與存根），依號碼去重
export async function readEzpostPdf(buf, lib) {
  const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise
  const seen = {}, rows = []
  for (let pn = 1; pn <= doc.numPages; pn++) {
    const tc = await (await doc.getPage(pn)).getTextContent()
    const items = tc.items.filter(t => String(t.str).trim())
    if (!items.some(t => /掛號號碼/.test(t.str))) continue
    const lines = []
    items.forEach(t => {
      const y = t.transform[5]
      let ln = lines.filter(l => Math.abs(l.y - y) < 3)[0]
      if (!ln) { ln = { y, its: [] }; lines.push(ln) }
      ln.its.push({ x: t.transform[4], s: t.str })
    })
    lines.forEach(ln => {
      const txt = ln.its.sort((a, b) => a.x - b.x).map(i => i.s).join(' ')
      const m = txt.match(/(?:^|\s)(\d{1,3})\s+(\d{6}-\d{6}-\d{2}-\d{6})\s+(.+?)\s+(\d{3,6})\s*([^\s\d,]+)/)
      if (!m) return
      const track = m[2].replace(/-/g, '')
      if (seen[track]) return
      seen[track] = 1
      rows.push({ seq: +m[1], track, name: m[3].replace(/\s+/g, ''), zip: m[4], area: m[5] })
    })
  }
  rows.sort((a, b) => a.seq - b.seq)
  return rows
}

// ── 配對 ─────────────────────────────────────────────────
// 結果每組：{ orderNo, order, tracks:[…], status:'ok'|'warn'|'none'|'dup', note, flags:[] }
// batchRow（匯出時記下的）：{ order_no, name, phone, addr, fp, k, n, file, pos }

// 訂單目前狀態的檢查：資料被改過／已取消／原本已有託運單號
function liveFlags(order, snapFp) {
  const fl = []
  if (!order) return fl
  if (snapFp && recvFingerprint(order) !== snapFp) fl.push('訂單的收件資料在匯出之後有修改，請確認寄的是新資料還是舊資料')
  if (order.status === 'cancelled' || order.status === 'refunded') fl.push('這筆訂單已取消或已退款')
  return fl
}

function finish(groups, ordersByNo) {
  const taken = {}
  groups.forEach(g => {
    g.order = ordersByNo[g.orderNo] || null
    g.flags = g.flags || []
    if (g.status === 'none') return
    if (!g.order) { g.status = 'none'; g.note = '系統裡找不到這筆訂單'; return }
    g.flags = g.flags.concat(liveFlags(g.order, g.snapFp))
    if (taken[g.orderNo]) { g.status = 'dup'; g.note = '這筆訂單已被另一組託運單號配到'; return }
    taken[g.orderNo] = 1
    g.hadTrack = g.order.tracking_no || ''
    if (g.flags.length) g.status = 'warn'
    g.note = (g.note ? g.note + '；' : '') + g.flags.join('；')
  })
  return groups
}

// 哈雷：備註裡的訂單編號直接對；沒有訂單編號時用姓名＋電話找唯一一筆（標「請核對」）
export function matchHarley(ret, orders, batches) {
  const ordersByNo = {}
  orders.forEach(o => { ordersByNo[o.order_no] = o })
  const snaps = {}
  ;(batches || []).forEach(b => (b.rows || []).forEach(r => { if (!snaps[r.order_no]) snaps[r.order_no] = r.fp }))
  const gmap = {}, groups = []
  ret.forEach(r => {
    let key = r.orderNos.length ? r.orderNos.slice().sort().join(',') : ''
    let flags = []
    if (!key) {
      const nm = normName(r.name), ph = digits(r.phone) + ' ' + digits(r.mobile)
      const c = orders.filter(o => normName(o.receiver_name) === nm && ph.indexOf(digits(o.receiver_phone)) >= 0 &&
        o.status !== 'cancelled' && o.source !== 'booth_cashier')
      if (c.length === 1) { key = c[0].order_no; flags = ['備註沒有訂單編號，用姓名＋電話找到，請核對'] }
      else { key = 'X|' + r.line }
    }
    let g = gmap[key]
    if (!g) {
      g = gmap[key] = { orderNo: key, rows: [], status: 'ok', note: '', flags }
      groups.push(g)
    }
    g.rows.push(r)
  })
  const out = []
  groups.forEach(g => {
    g.rows.sort((a, b) => (a.k - b.k) || (a.line - b.line))
    g.tracks = g.rows.map(r => r.track)
    const nos = g.rows[0].orderNos
    if (g.orderNo.startsWith('X|')) {
      g.status = 'none'; g.note = '備註沒有訂單編號，姓名＋電話也找不到唯一的訂單'
      out.push(g); return
    }
    // 備註裡有多個訂單編號（合併寄出）：每筆訂單都填同一組託運單號
    const list = (nos.length ? nos : [g.orderNo])
    list.forEach((no, i) => {
      out.push(i === 0 ? Object.assign(g, { orderNo: no }) : { orderNo: no, rows: g.rows, tracks: g.tracks, status: 'ok', note: '', flags: [] })
    })
  })
  out.forEach(g => { g.snapFp = snaps[g.orderNo] || '' })
  return finish(out, ordersByNo)
}

// EZpost：PDF 的順序＝匯出時的順序。在匯出批次裡找「姓名順序完全相同」的那一個檔案
export function findEzpostBatch(pdfRows, batches) {
  for (const b of batches) {
    if (b.kind !== 'ezpost') continue
    const files = {}
    ;(b.rows || []).forEach(r => { (files[r.file] = files[r.file] || []).push(r) })
    for (const f of Object.keys(files)) {
      const rows = files[f].slice().sort((a, c) => a.pos - c.pos)
      if (rows.length !== pdfRows.length) continue
      if (rows.every((r, i) => normName(r.name) === normName(pdfRows[i].name))) return { batch: b, rows, file: +f }
    }
  }
  return null
}

export function matchEzpost(pdfRows, found, orders) {
  const ordersByNo = {}
  orders.forEach(o => { ordersByNo[o.order_no] = o })
  const gmap = {}, groups = []
  found.rows.forEach((br, i) => {
    let g = gmap[br.order_no]
    if (!g) { g = gmap[br.order_no] = { orderNo: br.order_no, tracks: [], status: 'ok', note: '', flags: [], snapFp: br.fp, parts: [] }; groups.push(g) }
    g.tracks.push({ k: br.k, track: pdfRows[i].track })
  })
  groups.forEach(g => { g.tracks = g.tracks.sort((a, b) => a.k - b.k).map(x => x.track) })
  return finish(groups, ordersByNo)
}
