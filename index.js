/**
 * 攤位預購系統 — 本地列印伺服器
 * 搭配 XP-420B 熱感條碼印表機 (USB 連接)
 *
 * 啟動：node index.js
 * 監聽：http://127.0.0.1:3001  (只對本機開放，不對外網)
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { print, getPrinters } = require('pdf-to-printer');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001;
const HOST = '127.0.0.1'; // 只綁 localhost，絕不對外
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// ─── 預設設定 ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  defaultPrinter: '',          // 空字串 = 使用 Windows 預設印表機
  paperWidth: '100mm',
  paperHeight: '150mm',
  allowedOrigins: [            // 允許哪些來源呼叫此 API
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  senderName: '我的攤位',
  senderPhone: '',
  senderAddress: '',
};

// ─── 找系統已安裝的 Chrome ────────────────────────────────────
function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const fs2 = require('fs');
  for (const p of candidates) {
    try { if (fs2.existsSync(p)) return p; } catch {}
  }
  return null; // 找不到就讓 puppeteer 用自己的
}

// ─── 工具函式 ────────────────────────────────────────────────
function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...fs.readJsonSync(SETTINGS_FILE) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  fs.writeJsonSync(SETTINGS_FILE, settings, { spaces: 2 });
}

function buildItemsHTML(items, template) {
  if (!items) items = [];
  if (!template) template = 'label';

  if (!items.length) {
    if (template === 'shipping_slip_a4') {
      return '<tr><td class="td-check">&#9744;</td><td colspan="2">（無商品明細）</td><td class="td-sub">-</td></tr>';
    }
    return '<tr><td colspan="2">（無商品明細）</td></tr>';
  }

  if (template === 'shipping_slip_a4') {
    return items.map(function(item, i) {
      var qty = item.quantity || item.qty || 0;
      var price = item.unit_price || 0;
      var subtotal = price * qty;
      var bg = i % 2 === 0 ? '#fff' : '#fafafa';
      var name = item.product_name || item.name || '';
      var barcode = item.product_barcode
        ? '<div class="item-barcode-wrap"><svg class="item-barcode" data-barcode="' + item.product_barcode + '"></svg></div>'
        : '';
      var sub = subtotal > 0 ? 'NT' + String.fromCharCode(36) + subtotal.toLocaleString() : '-';
      return '<tr style="border-bottom:1px solid #eee;background:' + bg + '">'
        + '<td class="td-check">&#9744;</td>'
        + '<td style="padding:8px 10px"><div class="item-name">' + name + '</div>' + barcode + '</td>'
        + '<td class="td-qty">' + qty + '</td>'
        + '<td class="td-sub">' + sub + '</td>'
        + '</tr>';
    }).join('');
  }

  return items.map(function(item) {
    var name = item.product_name || item.name || '';
    var qty = item.quantity || item.qty || 0;
    return '<tr><td>' + name + '</td><td class="qty">x' + qty + '</td></tr>';
  }).join('');
}

// ─── 模板設定：各模板對應的檔名、尺寸、預設印表機 ─────────────
const TEMPLATE_CONFIG = {
  label: {
    file:    'label.html',
    width:   null,   // 使用 settings.paperWidth
    height:  null,   // 使用 settings.paperHeight
    printer: 'defaultPrinter',   // settings 的鍵名
  },
  shipping_slip_a4: {
    file:    'shipping_slip_a4.html',
    width:   '210mm',
    height:  '297mm',
    printer: 'a4Printer',        // settings 的鍵名
  },
};

// ─── 核心：HTML → PDF → 送印 ─────────────────────────────────
async function printLabel(data, options = {}) {
  const settings = loadSettings();

  // 判斷模板
  const templateName = options.template || 'label';
  const tplConfig = TEMPLATE_CONFIG[templateName] || TEMPLATE_CONFIG.label;
  const templatePath = path.join(__dirname, 'templates', tplConfig.file);

  // 狀態標籤
  const STATUS_LABELS = {
    pending:'待結帳', paid:'已付款', picking:'揀貨中',
    packed:'已包裝', shipped:'已出貨', delivered:'已送達',
  };
  const PAYMENT_LABELS = {
    cash:'現金', card:'刷卡', taiwan_pay:'台灣PAY',
  };

  // 讀取 HTML 模板，替換所有 {{欄位}}
  let html = await fs.readFile(templatePath, 'utf-8');
  html = html
    .replace(/\{\{order_no\}\}/g,              data.order_no                                      || '')
    .replace(/\{\{order_status\}\}/g,           STATUS_LABELS[data.status] || data.status          || '')
    .replace(/\{\{payment_method\}\}/g,         PAYMENT_LABELS[data.payment_method]                || '')
    .replace(/\{\{created_at\}\}/g,             data.created_at ? new Date(data.created_at).toLocaleString('zh-TW') : '')
    .replace(/\{\{paid_at\}\}/g,                data.paid_at    ? new Date(data.paid_at).toLocaleString('zh-TW')    : '')
    .replace(/\{\{receiver_name\}\}/g,          data.receiver_name                                 || '')
    .replace(/\{\{receiver_phone\}\}/g,         data.receiver_phone                                || '')
    .replace(/\{\{receiver_postal_code\}\}/g,   data.receiver_postal_code                          || '')
    .replace(/\{\{receiver_address\}\}/g,       data.receiver_address                              || '')
    .replace(/\{\{note\}\}/g,                   data.note                                          || '')
    .replace(/\{\{sender_name\}\}/g,            data.sender_name    || settings.senderName)
    .replace(/\{\{sender_phone\}\}/g,           data.sender_phone   || settings.senderPhone)
    .replace(/\{\{sender_address\}\}/g,         data.sender_address || settings.senderAddress)
    .replace(/\{\{order_url\}\}/g,              data.order_url                                     || '')
    .replace(/\{\{items_html\}\}/g,             buildItemsHTML(data.items, templateName))
    .replace(/\{\{total_amount\}\}/g,           data.total_amount ? Number(data.total_amount).toLocaleString() : '0')
    .replace(/\{\{date\}\}/g,                   new Date().toLocaleString('zh-TW'));

  // 啟動 Puppeteer
  const chromePath = findChrome();
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

  const pdfPath = path.join(os.tmpdir(), `print_${Date.now()}.pdf`);

  // 尺寸：A4 用固定值，標籤用 settings
  const pdfWidth  = tplConfig.width  || settings.paperWidth;
  const pdfHeight = tplConfig.height || settings.paperHeight;

  await page.pdf({
    path: pdfPath,
    width:  pdfWidth,
    height: pdfHeight,
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();

  // 送至印表機（按模板選擇預設印表機，可被 options.printer 覆蓋）
  const defaultForTemplate = settings[tplConfig.printer] || settings.defaultPrinter || undefined;
  const printerName = options.printer || defaultForTemplate;
  const printOptions = { silent: true, copies: options.copies || 1 };
  if (printerName) printOptions.printer = printerName;

  await print(pdfPath, printOptions);

  setTimeout(() => fs.remove(pdfPath).catch(() => {}), 5000);
  return true;
}

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use((req, res, next) => {
  const settings = loadSettings();
  const origins = settings.allowedOrigins || [];
  cors({
    origin: (origin, cb) => {
      // 允許：無 origin（同源）、localhost 開頭、或在白名單內的 github.io
      if (!origin || origin.startsWith('http://localhost') || origins.includes(origin)) {
        return cb(null, true);
      }
      // 允許任何 github.io 子網域（讓後台 Web App 可以呼叫）
      if (/^https:\/\/[^.]+\.github\.io$/.test(origin)) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'));
    },
    credentials: false,
  })(req, res, next);
});

// ─── API 端點 ────────────────────────────────────────────────

// 健康檢查：Web App 開啟時自動呼叫，確認服務是否啟動
app.get('/health', async (req, res) => {
  let printers = [];
  try { printers = await getPrinters(); } catch {}
  res.json({
    ok: true,
    version: '1.0.0',
    printerCount: printers.length,
  });
});

// 預覽模板：支援 ?template=label 或 ?template=shipping_slip_a4
// 標籤：  http://127.0.0.1:3001/preview
// A4單：  http://127.0.0.1:3001/preview?template=shipping_slip_a4
app.get('/preview', async (req, res) => {
  const settings = loadSettings();
  const templateName = req.query.template || 'label';
  const tplConfig    = TEMPLATE_CONFIG[templateName] || TEMPLATE_CONFIG.label;
  const templatePath = path.join(__dirname, 'templates', tplConfig.file);

  // 測試假資料
  const data = {
    order_no:             req.query.order_no || 'ORD-20260603-0001',
    status:               'packed',
    payment_method:       'cash',
    created_at:           new Date().toISOString(),
    paid_at:              new Date().toISOString(),
    receiver_name:        req.query.name    || '王小明',
    receiver_phone:       req.query.phone   || '0912-345-678',
    receiver_postal_code: req.query.postal  || '800',
    receiver_address:     req.query.address || '高雄市新興區中正三路177號3樓',
    note:                 req.query.note    || '',
    sender_name:          settings.senderName,
    sender_phone:         settings.senderPhone,
    sender_address:       settings.senderAddress,
    order_url:            'http://127.0.0.1:3001/preview',
    total_amount:         1350,
    items: [
      { product_name: '手作皮革錢包', quantity: 1, unit_price: 980 },
      { product_name: '鑰匙扣',       quantity: 2, unit_price: 185 },
    ],
  };

  const STATUS_LABELS  = { pending:'待結帳', paid:'已付款', picking:'揀貨中', packed:'已包裝', shipped:'已出貨', delivered:'已送達' };
  const PAYMENT_LABELS = { cash:'現金', card:'刷卡', taiwan_pay:'台灣PAY' };

  let html = await fs.readFile(templatePath, 'utf-8');
  html = html
    .replace(/\{\{order_no\}\}/g,              data.order_no)
    .replace(/\{\{order_status\}\}/g,           STATUS_LABELS[data.status] || data.status || '')
    .replace(/\{\{payment_method\}\}/g,         PAYMENT_LABELS[data.payment_method] || '')
    .replace(/\{\{created_at\}\}/g,             new Date(data.created_at).toLocaleString('zh-TW'))
    .replace(/\{\{paid_at\}\}/g,                new Date(data.paid_at).toLocaleString('zh-TW'))
    .replace(/\{\{receiver_name\}\}/g,          data.receiver_name)
    .replace(/\{\{receiver_phone\}\}/g,         data.receiver_phone)
    .replace(/\{\{receiver_postal_code\}\}/g,   data.receiver_postal_code)
    .replace(/\{\{receiver_address\}\}/g,       data.receiver_address)
    .replace(/\{\{note\}\}/g,                   data.note)
    .replace(/\{\{sender_name\}\}/g,            data.sender_name)
    .replace(/\{\{sender_phone\}\}/g,           data.sender_phone)
    .replace(/\{\{sender_address\}\}/g,         data.sender_address)
    .replace(/\{\{order_url\}\}/g,              data.order_url)
    .replace(/\{\{items_html\}\}/g,             buildItemsHTML(data.items, templateName))
    .replace(/\{\{total_amount\}\}/g,           data.total_amount.toLocaleString())
    .replace(/\{\{date\}\}/g,                   new Date().toLocaleString('zh-TW'));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 取得印表機清單
app.get('/printers', async (req, res) => {
  try {
    const printers = await getPrinters();
    res.json({ printers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 列印單筆訂單
app.post('/print', async (req, res) => {
  try {
    const { printer, data, copies } = req.body;
    if (!data || !data.order_no) {
      return res.status(400).json({ error: '缺少必要欄位：data.order_no' });
    }
    await printLabel(data, { printer, copies });
    res.json({ success: true });
  } catch (err) {
    console.error('[列印失敗]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 批量列印（多筆訂單）
app.post('/print/batch', async (req, res) => {
  try {
    const { orders, printer } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: '請傳入 orders 陣列' });
    }
    let success = 0;
    const errors = [];

    for (const data of orders) {
      try {
        await printLabel(data, { printer });
        success++;
      } catch (err) {
        errors.push({ order_no: data.order_no, error: err.message });
      }
    }

    res.json({ success: true, printed: success, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 讀取設定
app.get('/settings', (req, res) => {
  res.json(loadSettings());
});

// 儲存設定
app.post('/settings', (req, res) => {
  try {
    const current = loadSettings();
    const updated = { ...current, ...req.body };
    saveSettings(updated);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 核心：HTML → PDF → 送印 ─────────────────────────────────
async function printLabel(data, options = {}) {
  const settings = loadSettings();

  // 判斷模板
  const templateName = options.template || 'label';
  const tplConfig = TEMPLATE_CONFIG[templateName] || TEMPLATE_CONFIG.label;
  const templatePath = path.join(__dirname, 'templates', tplConfig.file);

  // 狀態標籤
  const STATUS_LABELS = {
    pending:'待結帳', paid:'已付款', picking:'揀貨中',
    packed:'已包裝', shipped:'已出貨', delivered:'已送達',
  };
  const PAYMENT_LABELS = {
    cash:'現金', card:'刷卡', taiwan_pay:'台灣PAY',
  };

  // 讀取 HTML 模板，替換所有 {{欄位}}
  let html = await fs.readFile(templatePath, 'utf-8');
  html = html
    .replace(/\{\{order_no\}\}/g,              data.order_no                                      || '')
    .replace(/\{\{order_status\}\}/g,           STATUS_LABELS[data.status] || data.status          || '')
    .replace(/\{\{payment_method\}\}/g,         PAYMENT_LABELS[data.payment_method]                || '')
    .replace(/\{\{created_at\}\}/g,             data.created_at ? new Date(data.created_at).toLocaleString('zh-TW') : '')
    .replace(/\{\{paid_at\}\}/g,                data.paid_at    ? new Date(data.paid_at).toLocaleString('zh-TW')    : '')
    .replace(/\{\{receiver_name\}\}/g,          data.receiver_name                                 || '')
    .replace(/\{\{receiver_phone\}\}/g,         data.receiver_phone                                || '')
    .replace(/\{\{receiver_postal_code\}\}/g,   data.receiver_postal_code                          || '')
    .replace(/\{\{receiver_address\}\}/g,       data.receiver_address                              || '')
    .replace(/\{\{note\}\}/g,                   data.note                                          || '')
    .replace(/\{\{sender_name\}\}/g,            data.sender_name    || settings.senderName)
    .replace(/\{\{sender_phone\}\}/g,           data.sender_phone   || settings.senderPhone)
    .replace(/\{\{sender_address\}\}/g,         data.sender_address || settings.senderAddress)
    .replace(/\{\{order_url\}\}/g,              data.order_url                                     || '')
    .replace(/\{\{items_html\}\}/g,             buildItemsHTML(data.items, templateName))
    .replace(/\{\{total_amount\}\}/g,           data.total_amount ? Number(data.total_amount).toLocaleString() : '0')
    .replace(/\{\{date\}\}/g,                   new Date().toLocaleString('zh-TW'));

  // 啟動 Puppeteer
  const chromePath = findChrome();
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

  const pdfPath = path.join(os.tmpdir(), `print_${Date.now()}.pdf`);

  // 尺寸：A4 用固定值，標籤用 settings
  const pdfWidth  = tplConfig.width  || settings.paperWidth;
  const pdfHeight = tplConfig.height || settings.paperHeight;

  await page.pdf({
    path: pdfPath,
    width:  pdfWidth,
    height: pdfHeight,
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();

  // 送至印表機（按模板選擇預設印表機，可被 options.printer 覆蓋）
  const defaultForTemplate = settings[tplConfig.printer] || settings.defaultPrinter || undefined;
  const printerName = options.printer || defaultForTemplate;
  const printOptions = { silent: true, copies: options.copies || 1 };
  if (printerName) printOptions.printer = printerName;

  await print(pdfPath, printOptions);

  setTimeout(() => fs.remove(pdfPath).catch(() => {}), 5000);
  return true;
}

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use((req, res, next) => {
  const settings = loadSettings();
  const origins = settings.allowedOrigins || [];
  cors({
    origin: (origin, cb) => {
      // 允許：無 origin（同源）、localhost 開頭、或在白名單內的 github.io
      if (!origin || origin.startsWith('http://localhost') || origins.includes(origin)) {
        return cb(null, true);
      }
      // 允許任何 github.io 子網域（讓後台 Web App 可以呼叫）
      if (/^https:\/\/[^.]+\.github\.io$/.test(origin)) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'));
    },
    credentials: false,
  })(req, res, next);
});

// ─── API 端點 ────────────────────────────────────────────────

// 健康檢查：Web App 開啟時自動呼叫，確認服務是否啟動
app.get('/health', async (req, res) => {
  let printers = [];
  try { printers = await getPrinters(); } catch {}
  res.json({
    ok: true,
    version: '1.0.0',
    printerCount: printers.length,
  });
});

// 預覽模板：支援 ?template=label 或 ?template=shipping_slip_a4
// 標籤：  http://127.0.0.1:3001/preview
// A4單：  http://127.0.0.1:3001/preview?template=shipping_slip_a4
app.get('/preview', async (req, res) => {
  const settings = loadSettings();
  const templateName = req.query.template || 'label';
  const tplConfig    = TEMPLATE_CONFIG[templateName] || TEMPLATE_CONFIG.label;
  const templatePath = path.join(__dirname, 'templates', tplConfig.file);

  // 測試假資料
  const data = {
    order_no:             req.query.order_no || 'ORD-20260603-0001',
    status:               'packed',
    payment_method:       'cash',
    created_at:           new Date().toISOString(),
    paid_at:              new Date().toISOString(),
    receiver_name:        req.query.name    || '王小明',
    receiver_phone:       req.query.phone   || '0912-345-678',
    receiver_postal_code: req.query.postal  || '800',
    receiver_address:     req.query.address || '高雄市新興區中正三路177號3樓',
    note:                 req.query.note    || '',
    sender_name:          settings.senderName,
    sender_phone:         settings.senderPhone,
    sender_address:       settings.senderAddress,
    order_url:            'http://127.0.0.1:3001/preview',
    total_amount:         1350,
    items: [
      { product_name: '手作皮革錢包', quantity: 1, unit_price: 980 },
      { product_name: '鑰匙扣',       quantity: 2, unit_price: 185 },
    ],
  };

  const STATUS_LABELS  = { pending:'待結帳', paid:'已付款', picking:'揀貨中', packed:'已包裝', shipped:'已出貨', delivered:'已送達' };
  const PAYMENT_LABELS = { cash:'現金', card:'刷卡', taiwan_pay:'台灣PAY' };

  let html = await fs.readFile(templatePath, 'utf-8');
  html = html
    .replace(/\{\{order_no\}\}/g,              data.order_no)
    .replace(/\{\{order_status\}\}/g,           STATUS_LABELS[data.status] || data.status || '')
    .replace(/\{\{payment_method\}\}/g,         PAYMENT_LABELS[data.payment_method] || '')
    .replace(/\{\{created_at\}\}/g,             new Date(data.created_at).toLocaleString('zh-TW'))
    .replace(/\{\{paid_at\}\}/g,                new Date(data.paid_at).toLocaleString('zh-TW'))
    .replace(/\{\{receiver_name\}\}/g,          data.receiver_name)
    .replace(/\{\{receiver_phone\}\}/g,         data.receiver_phone)
    .replace(/\{\{receiver_postal_code\}\}/g,   data.receiver_postal_code)
    .replace(/\{\{receiver_address\}\}/g,       data.receiver_address)
    .replace(/\{\{note\}\}/g,                   data.note)
    .replace(/\{\{sender_name\}\}/g,            data.sender_name)
    .replace(/\{\{sender_phone\}\}/g,           data.sender_phone)
    .replace(/\{\{sender_address\}\}/g,         data.sender_address)
    .replace(/\{\{order_url\}\}/g,              data.order_url)
    .replace(/\{\{items_html\}\}/g,             buildItemsHTML(data.items, templateName))
    .replace(/\{\{total_amount\}\}/g,           data.total_amount.toLocaleString())
    .replace(/\{\{date\}\}/g,                   new Date().toLocaleString('zh-TW'));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 取得印表機清單
app.get('/printers', async (req, res) => {
  try {
    const printers = await getPrinters();
    res.json({ printers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 列印單筆訂單
app.post('/print', async (req, res) => {
  try {
    const { printer, data, copies } = req.body;
    if (!data || !data.order_no) {
      return res.status(400).json({ error: '缺少必要欄位：data.order_no' });
    }
    await printLabel(data, { printer, copies });
    res.json({ success: true });
  } catch (err) {
    console.error('[列印失敗]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 批量列印（多筆訂單）
app.post('/print/batch', async (req, res) => {
  try {
    const { orders, printer } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: '請傳入 orders 陣列' });
    }
    let success = 0;
    const errors = [];

    for (const data of orders) {
      try {
        await printLabel(data, { printer });
        success++;
      } catch (err) {
        errors.push({ order_no: data.order_no, error: err.message });
      }
    }

    res.json({ success: true, printed: success, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 讀取設定
app.get('/settings', (req, res) => {
  res.json(loadSettings());
});

// 儲存設定
app.post('/settings', (req, res) => {
  try {
    const current = loadSettings();
    const updated = { ...current, ...req.body };
    saveSettings(updated);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 啟動 ─────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('🖨️  列印伺服器已啟動');
  console.log(`   地址：http://${HOST}:${PORT}`);
  console.log(`   按 Ctrl+C 停止`);
  console.log('');
});
