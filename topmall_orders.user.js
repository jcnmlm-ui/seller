// ==UserScript==
// @name         郵政商城 訂單查詢／改訂單處理中（C1910）
// @namespace    topmall-c1910
// @version      1.6.2
// @description  在商店後台用你自己的登入狀態查訂單，並可把「已付款＋未出貨」的出貨單改成訂單處理中
// @match        https://topmall.post.gov.tw/*
// @match        https://jcnmlm-ui.github.io/seller/*
// @updateURL    https://jcnmlm-ui.github.io/seller/topmall_orders.user.js
// @downloadURL  https://jcnmlm-ui.github.io/seller/topmall_orders.user.js
// @connect      topmall.post.gov.tw
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==
/* Port of /workspace/topmall/server.py (lookup / process). Requests go only to
   topmall.post.gov.tw using the browser's own login; no cookies are read, stored, or sent
   anywhere else. 查詢 is read-only. On the 收款 pages (booth / cashier) the panel talks to the
   後台 through GM_xmlhttpRequest. A read-only keepalive runs every 5 minutes (shared across tabs). */
(function () {
  'use strict';
  var ON_TOPMALL = location.hostname === 'topmall.post.gov.tw';
  if (ON_TOPMALL && /login\.aspx/i.test(location.pathname)) return;
  // The 後台 home is a frameset (_header / _menu / _content): show the panel only in the content frame.
  if (document.body && document.body.tagName === 'FRAMESET') return;
  if (window.top !== window && window.name !== '_content') return;
  if (window.__topmallOrders) { try { window.__topmallOrders.show(); } catch (e) {} return; }

  // ---------- constants (same as lookup_order.py / process_order.py / server.py) ----------
  var ORIGIN = 'https://topmall.post.gov.tw';
  var ORDER_URL = ORIGIN + '/order/orderList.aspx?init=1';
  var SHIP_URL = ORIGIN + '/order/orderShippingList.aspx?init=1';
  var ORDER_SEARCH_URL = ORIGIN + '/order/orderSearch.aspx?init=1';
  var SHIP_SEARCH_URL = ORIGIN + '/order/orderShippingSearch.aspx?init=1';
  var ORDER_FIELD = 'ctl00$ContentPlaceHolder1$txtorder_uid';
  var SHIP_FIELD = 'ctl00$ContentPlaceHolder1$txtorder_query_code';
  var SEARCH_BTN = 'ctl00$ContentPlaceHolder1$btn_search';
  var GRID_ID = 'ctl00_ContentPlaceHolder1_GridView1';
  var STATUS_RADIO = 'ctl00$ContentPlaceHolder1$RBLorder_ship_status';
  var SAVE_BTN = 'ctl00$ContentPlaceHolder1$btn_go';
  var STATUS_LABEL = '訂單處理中';
  var ASPNET_ERROR_HINTS = ['Validation of viewstate', 'Invalid viewstate', 'Invalid postback',
    '事件驗證', 'ValidateEvent', '無法驗證'];
  var EXPIRED_MSG = '登入已過期，請重新登入後台';
  var TIMEOUT_MS = 15000;

  function SessionExpired() { this.name = 'SessionExpired'; }
  function LookupErr(msg) { this.name = 'LookupErr'; this.message = msg; }

  // ---------- helpers ----------
  function parseHtml(html) { return new DOMParser().parseFromString(html, 'text/html'); }

  function looksLikeLogin(url, html) {
    if ((url || '').toLowerCase().indexOf('login.aspx') >= 0) return true;
    if (html.indexOf('請先進行身分驗證') >= 0) return true;
    if (html.indexOf(ORDER_FIELD) >= 0 || html.indexOf(SHIP_FIELD) >= 0) return false;
    if (html.toLowerCase().indexOf('login.aspx') >= 0 || html.indexOf('驗證碼') >= 0) return true;
    return false;
  }

  function pageOk(url, html, field) {
    if (looksLikeLogin(url, html)) return false;
    var low = html.toLowerCase();
    for (var i = 0; i < ASPNET_ERROR_HINTS.length; i++) {
      var h = ASPNET_ERROR_HINTS[i];
      if (/^[\x00-\x7f]*$/.test(h) ? low.indexOf(h.toLowerCase()) >= 0 : html.indexOf(h) >= 0) return false;
    }
    return html.indexOf(field) >= 0 || html.indexOf('GridView1') >= 0 || html.indexOf('無資料顯示') >= 0;
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new LookupErr('連線逾時')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function gmReq(method, url, body, referer) {
    return new Promise(function (resolve, reject) {
      var headers = { 'Referer': referer || url };
      if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      GM_xmlhttpRequest({
        method: method, url: url, data: body, headers: headers, anonymous: false, timeout: TIMEOUT_MS,
        onload: function (r) { resolve({ url: r.finalUrl || url, text: r.responseText || '' }); },
        onerror: function () { reject(new LookupErr('連不到後台')); },
        ontimeout: function () { reject(new LookupErr('連線逾時')); }
      });
    });
  }

  function httpGet(url) {
    if (!ON_TOPMALL) return gmReq('GET', url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now());
    return withTimeout(fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'follow' })
      .then(function (r) { return r.text().then(function (t) { return { url: r.url, text: t }; }); }), TIMEOUT_MS);
  }

  function httpPost(url, data, referer) {
    var body = new URLSearchParams();
    Object.keys(data).forEach(function (k) { body.append(k, data[k]); });
    if (!ON_TOPMALL) return gmReq('POST', url, body.toString(), referer);
    return withTimeout(fetch(url, {
      method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'follow',
      referrer: referer || url,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString()
    }).then(function (r) { return r.text().then(function (t) { return { url: r.url, text: t }; }); }), TIMEOUT_MS);
  }

  // lookup_order.extract_form
  function extractForm(html, baseUrl) {
    var doc = typeof html === 'string' ? parseHtml(html) : html;
    var form = doc.getElementById('aspnetForm') || doc.querySelector('form');
    if (!form) throw new LookupErr('找不到表單');
    var action = new URL(form.getAttribute('action') || baseUrl, baseUrl).href;
    var data = {};
    form.querySelectorAll('input').forEach(function (inp) {
      var name = inp.getAttribute('name');
      if (!name) return;
      var typ = (inp.getAttribute('type') || 'text').toLowerCase();
      if (['submit', 'image', 'button', 'reset', 'file'].indexOf(typ) >= 0) return;
      if ((typ === 'checkbox' || typ === 'radio') && !inp.hasAttribute('checked')) return;
      data[name] = inp.getAttribute('value') || '';
    });
    form.querySelectorAll('select').forEach(function (sel) {
      var name = sel.getAttribute('name');
      if (!name) return;
      var opts = sel.querySelectorAll('option');
      var selected = null;
      for (var i = 0; i < opts.length; i++) if (opts[i].hasAttribute('selected')) { selected = opts[i]; break; }
      if (selected) data[name] = selected.getAttribute('value') !== null ? selected.getAttribute('value') : '';
      else data[name] = opts.length ? (opts[0].getAttribute('value') || '') : '';
    });
    form.querySelectorAll('textarea').forEach(function (ta) {
      var name = ta.getAttribute('name');
      if (name) data[name] = ta.textContent || '';
    });
    var btn = form.querySelector('input[name="' + SEARCH_BTN + '"]') ||
      form.querySelector('input#ctl00_ContentPlaceHolder1_btn_search');
    var btnName = btn && btn.getAttribute('name') ? btn.getAttribute('name') : SEARCH_BTN;
    var btnVal = btn && btn.getAttribute('value') !== null ? btn.getAttribute('value') : '查詢';
    return { action: action, data: data, btnName: btnName, btnVal: btnVal };
  }

  // BeautifulSoup get_text(" ", strip=True)
  function cellText(el) {
    var parts = [];
    var w = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      var s = n.nodeValue.replace(/^\s+|\s+$/g, '');
      if (s) parts.push(s);
    }
    return parts.join(' ');
  }

  // lookup_order.parse_grid
  function parseGrid(html) {
    var doc = typeof html === 'string' ? parseHtml(html) : html;
    var table = doc.getElementById(GRID_ID);
    if (!table) {
      var tbls = doc.querySelectorAll('table');
      for (var i = 0; i < tbls.length; i++) {
        if ((tbls[i].getAttribute('id') || '').slice(-9) === 'GridView1') { table = tbls[i]; break; }
      }
    }
    if (!table) return [];
    var rows = table.querySelectorAll('tr');
    if (!rows.length) return [];
    var headers = Array.prototype.map.call(rows[0].querySelectorAll('th,td'), cellText);
    if (rows.length === 1) return [];
    var records = [];
    for (var r = 1; r < rows.length; r++) {
      var cells = Array.prototype.map.call(rows[r].querySelectorAll('th,td'), cellText);
      if (!cells.length) continue;
      if (cells.join('').indexOf('無資料') >= 0 && cells.length <= 2) continue;
      var rec = {}, any = false;
      headers.forEach(function (h, j) { rec[h] = j < cells.length ? cells[j] : ''; if (rec[h]) any = true; });
      if (any) records.push(rec);
    }
    return records;
  }

  function footerInt(html, label) {
    var text = html.replace(/<[^>]+>/g, ' ');
    var esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = new RegExp(esc + '\\s*[：:]\\s*(-?[\\d,]+)').exec(text);
    if (!m) return null;
    var v = parseInt(m[1].replace(/,/g, ''), 10);
    return isNaN(v) ? null : v;
  }

  function hasDoneAlert(html) {
    if (/alert\s*\(\s*(['"])完成\1/i.test(html)) return true;
    if (/alert\s*\(\s*(['"])\\u5b8c\\u6210\1/i.test(html)) return true;
    return false;
  }

  function strip(s) { return (s || '').replace(/^\s+|\s+$/g, ''); }

  // ---------- form cache (server.FormCache) ----------
  function FormCache(name, url, field) { this.name = name; this.url = url; this.field = field; this.clear(); }
  FormCache.prototype.clear = function () { this.form = null; this.lastUrl = null; };
  FormCache.prototype.ready = function () { return !!(this.form && this.form.action && this.form.btnName); };
  FormCache.prototype.ingest = function (html, url) { this.form = extractForm(html, url); this.lastUrl = url; };

  var caches = {
    order: new FormCache('order', ORDER_URL, ORDER_FIELD),
    ship: new FormCache('ship', SHIP_URL, SHIP_FIELD),
    osearch: new FormCache('osearch', ORDER_SEARCH_URL, ORDER_FIELD),
    ssearch: new FormCache('ssearch', SHIP_SEARCH_URL, SHIP_FIELD)
  };

  async function getAndCache(cache) {
    var r = await httpGet(cache.url);
    if (looksLikeLogin(r.url, r.text)) throw new SessionExpired();
    if (!pageOk(r.url, r.text, cache.field)) throw new LookupErr(cache.name + ' 頁面異常');
    cache.ingest(r.text, r.url);
    return r;
  }

  // server.ShopClient.search
  async function search(cache, orderNo) {
    var lastExc = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        if (!cache.ready() || attempt === 1) await getAndCache(cache);
        var data = Object.assign({}, cache.form.data);
        data[cache.field] = orderNo;
        data[cache.form.btnName] = cache.form.btnVal || '查詢';
        var r = await httpPost(cache.form.action, data, cache.lastUrl || cache.url);
        if (looksLikeLogin(r.url, r.text)) {
          if (attempt === 0) { cache.clear(); continue; }
          throw new SessionExpired();
        }
        if (!pageOk(r.url, r.text, cache.field)) {
          cache.clear();
          if (attempt === 0) { lastExc = new LookupErr(cache.name + ' 快取失效'); continue; }
          throw new LookupErr(cache.name + ' 查詢失敗');
        }
        cache.ingest(r.text, r.url);
        return r;
      } catch (e) {
        if (e instanceof SessionExpired) throw e;
        lastExc = e;
        cache.clear();
        if (attempt === 0) continue;
        throw e;
      }
    }
    throw lastExc || new LookupErr('查詢失敗');
  }

  // server.ShopClient.gather
  async function gather(orderNo) {
    var source = 'orderSearch';
    var resp = await search(caches.osearch, orderNo);
    var orders = parseGrid(resp.text).filter(function (r) { return r['訂單編號'] === orderNo; });
    var bonus = 0;
    if (orders.length) {
      if (orders.length === 1 && footerInt(resp.text, '資料筆數') === 1) bonus = footerInt(resp.text, '使用紅利金額') || 0;
    } else {
      source = 'orderList';
      resp = await search(caches.order, orderNo);
      orders = parseGrid(resp.text).filter(function (r) { return r['訂單編號'] === orderNo; });
      if (!orders.length) return null;
    }
    var row = orders[0];
    var info = {
      source: source,
      order_rows: orders.length,
      amount: strip((row['訂單金額'] || '').replace(/,/g, '')),
      bonus: bonus && bonus > 0 ? bonus : 0,
      setup: strip(row['訂單成立狀態']),
      order_state: strip(row['訂單狀態']),
      pay: strip(row['付款狀態'])
    };
    var sresp = await search(caches.ssearch, orderNo);
    info.ships = parseGrid(sresp.text).filter(function (r) { return r['訂單編號'] === orderNo; })
      .map(function (r) { return { no: strip(r['出貨單編號']), status: strip(r['出貨狀態']) }; });
    return info;
  }

  function amt(info) {
    var bonus = info.bonus || 0;
    if (bonus > 0) {
      var a = String(info.amount).replace(/,/g, '');
      var total = /^-?\d+$/.test(a) ? parseInt(a, 10) + bonus : info.amount;
      return '$' + total + '（含紅利$' + bonus + '）';
    }
    return '金額$' + info.amount;
  }

  // 查完單號後通知收款頁（#/booth）：合併面板開著時，會自動把單號與金額填進欄位
  // 只有「已付款、訂單成立」才帶入金額；取消／逾期／未付款只帶單號並提示原因
  var quiet = false;   // 確認收款後的自動改狀態不要再回報查詢結果
  function notifyBooth(orderNo, info) {
    try {
      var ok = false, amount = null, reason = '', processing = false;
      if (!info) reason = '查無此單號';
      else {
        var a = String(info.amount).replace(/,/g, '');
        amount = /^-?\d+$/.test(a) ? parseInt(a, 10) + (info.bonus || 0) : null;
        var c = classify(info), code = c[0];
        if (info.setup.indexOf('取消') >= 0) reason = '訂單已取消';
        else if (info.setup.indexOf('逾期') >= 0) reason = '訂單逾期';
        else if (info.pay.indexOf('未付款') >= 0) reason = '訂單未付款';
        else if (code === '3') reason = '訂單已出貨';
        else if (code === '4') reason = '訂單已送達';
        else if (amount === null || amount <= 0) reason = '讀不到金額';
        else if (code === '1' || code === '2') { ok = true; processing = (code === '2'); }
        else reason = c[1].replace(amt(info) + ' ', '');
      }
      if (!ON_TOPMALL && !quiet) window.dispatchEvent(new CustomEvent('topmall-order-result',
        { detail: JSON.stringify({ orderNo: orderNo, ok: ok, amount: amount, reason: reason, processing: processing }) }));
    } catch (e) {}
  }

  // server.ShopClient.classify -> [case, reply]; case "1" means a save is needed
  function classify(info) {
    if (info === null) return ['8', '沒有單號'];
    var A = amt(info), setup = info.setup, pay = info.pay, ships = info.ships;
    if (setup.indexOf('取消') >= 0) return ['6', A + ' 訂單已取消'];
    if (setup.indexOf('逾期') >= 0) return ['7', A + ' 訂單逾期'];
    if (pay.indexOf('未付款') >= 0) {
      if (ships.length) return ['x', A + ' 未付款但已有出貨單（' + (ships[0].status || '狀態不明') + '），未修改'];
      return ['5', A + ' 未付款，無法修改'];
    }
    if (ships.length === 0) return ['x', A + ' 付款狀態:' + (pay || '不明') + '，查無出貨單，未修改'];
    if (ships.length > 1) {
      var sts = {}, nWait = 0, nProc = 0, nShip = 0, nDone = 0, nOther = 0;
      ships.forEach(function (s) {
        var t = s.status || '?'; sts[t] = 1;
        if (t.indexOf('已送達') >= 0) nDone++;
        else if (t.indexOf('已出貨') >= 0) nShip++;
        else if (t === '訂單處理中') nProc++;
        else if (t === '未出貨') nWait++;
        else nOther++;
      });
      var stText = Object.keys(sts).sort().join('/'), N = ships.length;
      if (nDone) return ['4', A + ' 有' + N + '張出貨單，含已送達，不修改'];
      if (nShip) return ['3', A + ' 有' + N + '張出貨單，含已出貨，不修改'];
      if (nOther) return ['x', A + ' 有' + N + '張出貨單（' + stText + '），未修改'];
      if (!nWait) return ['2', A + ' 有' + N + '張出貨單，已全是訂單處理中'];
      if (pay === '已付款' && setup === '成立') return ['1', A + ' 共' + N + '張出貨單，已修改為訂單處理中'];
      return ['x', A + ' 出貨單未出貨，但成立/付款狀態為' + (setup || '?') + '/' + (pay || '?') + '，未修改'];
    }
    var st = ships[0].status;
    if (st.indexOf('已送達') >= 0) return ['4', A + ' 已送達，不用修改'];
    if (st.indexOf('已出貨') >= 0) return ['3', A + ' 已出貨，不用修改'];
    if (st === '訂單處理中') return ['2', A + ' 已是訂單處理中'];
    if (st === '未出貨') {
      if (pay === '已付款' && setup === '成立') return ['1', A + ' 已修改為訂單處理中'];
      return ['x', A + ' 出貨單未出貨，但成立/付款狀態為' + (setup || '?') + '/' + (pay || '?') + '，未修改'];
    }
    return ['x', A + ' 出貨單狀態:' + (st || '不明') + '，未修改'];
  }

  function tidy(reply) { return reply.replace('） ', '）'); } // first occurrence only, like Python replace(..., 1)

  // server.ShopClient._save_processing (出貨單管理 → 編輯 → 訂單處理中 → 確定)
  async function saveProcessing(orderNo, A, okReply) {
    var done = 0, guard = 0;
    for (;;) {
      if (++guard > 20) return A + ' 出貨單過多，已改' + done + '張，未全部修改';
      var shipResp = await search(caches.ship, orderNo);
      var shipHtml = shipResp.text;
      var doc = parseHtml(shipHtml);
      var rows = Array.prototype.slice.call(doc.querySelectorAll('#' + GRID_ID + ' tr')).slice(1);
      var hdrs = parseGrid(shipHtml);
      var all = hdrs.filter(function (r) { return r['訂單編號'] === orderNo; });
      if (!all.length) return A + ' 出貨單管理筆數為0，' + (done ? '已改' + done + '張，未全部修改' : '未修改');
      var bad = all.filter(function (r) { var t = strip(r['出貨狀態']); return t !== '未出貨' && t !== STATUS_LABEL; });
      if (bad.length) return A + ' 出貨單管理狀態為' + (strip(bad[0]['出貨狀態']) || '不明') + '，' + (done ? '已改' + done + '張，未全部修改' : '未修改');
      var wait = all.filter(function (r) { return strip(r['出貨狀態']) === '未出貨'; });
      if (!wait.length) return done ? okReply : A + ' 已是訂單處理中';
      // find the edit button on a 未出貨 row
      var editBtn = null;
      for (var ri = 0; ri < rows.length && !editBtn; ri++) {
        var txt = rows[ri].textContent || '';
        if (txt.indexOf(orderNo) < 0 || txt.indexOf('未出貨') < 0) continue;
        editBtn = rows[ri].querySelector('input[type="submit"][id$="_btn_Edit"], input[type="submit"][name$="$btn_Edit"]');
      }
      if (!editBtn) return A + ' 找不到編輯按鈕，' + (done ? '已改' + done + '張，未全部修改' : '未修改');
      var editName = editBtn.getAttribute('name');
      if (!editName) return A + ' 找不到編輯按鈕，' + (done ? '已改' + done + '張，未全部修改' : '未修改');
      var partial = done ? '已改' + done + '張，未全部修改' : '未修改';

      var ef = extractForm(doc, shipResp.url);
      ef.data[editName] = editBtn.getAttribute('value') || '編輯';
      var editResp = await httpPost(ef.action, ef.data, shipResp.url);
      var editHtml = editResp.text;
      if (looksLikeLogin(editResp.url, editHtml)) throw new SessionExpired();
      if ((editResp.url || '').indexOf('orderShippingEdit.aspx') < 0 || editHtml.indexOf(STATUS_RADIO) < 0)
        return A + ' 無法開啟編輯頁，' + partial;
      if (editHtml.indexOf(orderNo) < 0) return A + ' 編輯頁訂單編號不符，' + partial;

      var edoc = parseHtml(editHtml);
      var statusVal = null, radios = edoc.querySelectorAll('input[name="' + STATUS_RADIO + '"]');
      for (var i = 0; i < radios.length; i++) {
        var id = radios[i].getAttribute('id');
        var label = id ? edoc.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
        if (label && strip(label.textContent) === STATUS_LABEL) {
          statusVal = radios[i].getAttribute('value');
          if (statusVal === null || statusVal === '') return A + ' 出貨狀態「訂單處理中」沒有值，' + partial;
          break;
        }
      }
      if (statusVal === null) return A + ' 編輯頁找不到出貨狀態「訂單處理中」，' + partial;

      var sf = extractForm(edoc, editResp.url);
      sf.data[STATUS_RADIO] = statusVal;
      var saveBtn = edoc.querySelector('input[name="' + SAVE_BTN + '"]') || edoc.querySelector('input#ctl00_ContentPlaceHolder1_btn_go');
      if (!saveBtn || !saveBtn.getAttribute('name')) return A + ' 找不到確定按鈕，' + partial;
      sf.data[saveBtn.getAttribute('name')] = saveBtn.getAttribute('value') || '確定';

      var saved = await httpPost(sf.action, sf.data, editResp.url);
      if (looksLikeLogin(saved.url, saved.text)) throw new SessionExpired();
      if (!hasDoneAlert(saved.text)) return A + ' 未看到完成確認，' + partial;
      done++;
      caches.ship.clear();
    }
  }

  // 查詢 is read-only. server.py's /lookup would print the case-1 "已修改" line without saving;
  // here we say plainly that it was NOT changed and can be changed with 查詢並修改.
  async function lookup(orderNo) {
    var info = await gather(orderNo);
    notifyBooth(orderNo, info);
    var c = classify(info);
    if (c[0] === '1') return tidy(amt(info) + (info.ships.length > 1 ? ' 已付款＋共' + info.ships.length + '張出貨單、含未出貨，尚未修改（按「查詢並修改」才會全部改）' : ' 已付款＋未出貨，尚未修改（按「查詢並修改」才會改）'));
    return tidy(c[1]);
  }

  async function processOrder(orderNo) {
    var info = await gather(orderNo);
    notifyBooth(orderNo, info);
    var c = classify(info);
    if (c[0] !== '1') return tidy(c[1]);
    return tidy(await saveProcessing(orderNo, amt(info), c[1]));
  }

  // Returns the panel line text (without the order number). Never throws.
  async function run(orderNo, doSave) {
    try {
      return doSave ? await processOrder(orderNo) : await lookup(orderNo);
    } catch (e) {
      try {
        if (!ON_TOPMALL && !quiet) window.dispatchEvent(new CustomEvent('topmall-order-result', { detail: JSON.stringify(
          { orderNo: orderNo, ok: false, amount: null, reason: (e instanceof SessionExpired) ? '商城登入已過期' : '查詢失敗' }) }));
      } catch (e2) {}
      if (e instanceof SessionExpired) return EXPIRED_MSG;
      return '查詢失敗（' + ((e && e.message) || e) + '），未修改';
    }
  }

  // ---------- panel ----------
  var busy = false, panel, ta, out, btnQ, btnP, kaEl, host, bodyEl, tog;
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }

  function buildPanel() {
    panel = el('div', 'display:block;width:420px;background:#fff;' +
      'border:2px solid #0a7d3b;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.25);font:16px/1.5 "Microsoft JhengHei",sans-serif;color:#222');
    var head = el('div', 'background:#0a7d3b;color:#fff;padding:4px 8px;cursor:pointer;display:flex;justify-content:space-between', '');
    head.appendChild(el('span', '', '訂單處理工具'));
    kaEl = el('span', 'font-size:13px;opacity:.9;margin-left:auto;margin-right:10px', '');
    head.appendChild(kaEl);
    tog = el('span', '', '－');
    head.appendChild(tog);
    bodyEl = el('div', 'padding:8px');
    head.onclick = function () { setCollapsed(bodyEl.style.display !== 'none'); };
    ta = el('textarea', 'display:block;width:100%;box-sizing:border-box;height:64px;font:22px monospace;resize:vertical');
    ta.placeholder = '貼上單號，可多筆（空白、逗號或換行分隔）';
    var st = document.createElement('style');   // 提示文字 18px（輸入文字維持 22px）
    st.textContent = 'textarea::placeholder{font-size:18px;color:#888}';
    panel.appendChild(st);
    var row = el('div', 'display:flex;gap:6px;margin:6px 0');
    btnQ = el('button', 'flex:1;padding:10px;font-size:18px;cursor:pointer', '查詢');
    btnP = el('button', 'flex:1;padding:10px;font-size:18px;cursor:pointer;background:#0a7d3b;color:#fff;border:1px solid #075c2b', '查詢並修改');
    var btnC = el('button', 'padding:10px 12px;font-size:16px;cursor:pointer', '清除結果');
    btnQ.onclick = function () { go(false); };
    btnP.onclick = function () { go(true); };
    btnC.onclick = function () { out.innerHTML = ''; saveOut(); };
    row.appendChild(btnQ); row.appendChild(btnP); row.appendChild(btnC);
    // on-screen keypad
    var pad = el('div', 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0');
    var kcss = 'padding:12px 0;font:bold 22px sans-serif;cursor:pointer;background:#f3f3f3;border:1px solid #bbb;border-radius:6px';
    ['7','8','9','⌫','4','5','6','清空','1','2','3','下一筆','0'].forEach(function (k) {
      var b = el('button', kcss + (k === '0' ? ';grid-column:span 3' : '') + (k.length > 1 ? ';font-size:16px' : ''), k);
      b.onclick = function () {
        if (k === '⌫') ta.value = ta.value.slice(0, -1);
        else if (k === '清空') ta.value = '';
        else if (k === '下一筆') { if (ta.value && !/\s$/.test(ta.value)) ta.value += '\n'; }
        else ta.value += k;
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollTop = ta.scrollHeight;
      };
      pad.appendChild(b);
    });
    out = el('div', 'max-height:260px;overflow:auto;font:16px monospace;white-space:pre-wrap;user-select:text');
    bodyEl.appendChild(ta); bodyEl.appendChild(pad); bodyEl.appendChild(row); bodyEl.appendChild(out);
    panel.appendChild(head); panel.appendChild(bodyEl);
    // Shadow DOM keeps the site's CSS from breaking the panel layout.
    host = el('div', 'all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647');
    host.id = 'topmall-orders-host';
    var root = host.attachShadow({ mode: 'open' });
    root.appendChild(panel);
    document.body.appendChild(host);
    try { out.innerHTML = sessionStorage.getItem('tmo_out') || ''; out.scrollTop = out.scrollHeight; } catch (e) {}
  }
  // 展開／收折（只剩標題列）
  function setCollapsed(c) {
    if (!bodyEl) return;
    bodyEl.style.display = c ? 'none' : '';
    tog.textContent = c ? '＋' : '－';
  }
  function saveOut() { try { sessionStorage.setItem('tmo_out', out.innerHTML); } catch (e) {} }

  function parseNumbers(text) {
    var seen = {}, list = [];
    (text.match(/\d+/g) || []).forEach(function (n) {
      if (n.length >= 6 && n.length <= 12 && !seen[n]) { seen[n] = 1; list.push(n); }
    });
    return list;
  }

  async function go(doSave) {
    if (busy) return;
    var nums = parseNumbers(ta.value);
    if (!nums.length) { addLine('', '請輸入 6–12 位數的單號', '#b00'); return; }
    ta.value = '';
    busy = true; btnQ.disabled = btnP.disabled = true;
    sendBatch('start', nums.length);
    try {
      for (var i = 0; i < nums.length; i++) {
        var line = addLine(nums[i], doSave ? '處理中…' : '查詢中…', '#888');
        var res = await run(nums[i], doSave);
        line.textContent = nums[i] + ' ' + res;
        line.style.color = colorFor(res);
        saveOut();
        if (!/查詢失敗/.test(res)) { GM_setValue('tmo_ka_state', res === EXPIRED_MSG ? 'expired' : 'ok'); GM_setValue('tmo_ka_time', Date.now()); showKa(); }
        if (res === EXPIRED_MSG) {
          for (var j = i + 1; j < nums.length; j++) addLine(nums[j], '未查詢（登入已過期）', '#b00');
          break;
        }
      }
    } finally { busy = false; btnQ.disabled = btnP.disabled = false; sendBatch('end', nums.length); }
  }

  // 通知收款頁「這一批查詢開始／結束」：整批查完才一次關閉合併面板，不會漏單
  function sendBatch(phase, total) {
    if (ON_TOPMALL) return;
    try { window.dispatchEvent(new CustomEvent('topmall-batch', { detail: JSON.stringify({ phase: phase, total: total }) })); } catch (e) {}
  }

  // 收款頁按「確認收款」成功後，才把合併的商城單改成「訂單處理中」（已是處理中／已出貨的會自動略過）
  async function onConfirmPaid(e) {
    var d; try { d = JSON.parse(e.detail); } catch (err) { return; }
    var nos = (d && d.orders) || [];
    if (!nos.length) return;
    window.dispatchEvent(new CustomEvent('topmall-process-ack', { detail: '{}' }));
    for (var w = 0; w < 60 && busy; w++) await new Promise(function (r) { setTimeout(r, 500); });
    var results = [];
    quiet = true;
    try {
      for (var i = 0; i < nos.length; i++) {
        var line = addLine(nos[i], '確認收款後處理中…', '#888');
        var res = await run(nos[i], true);
        line.textContent = nos[i] + ' ' + res;
        line.style.color = colorFor(res);
        saveOut();
        var st = /已修改為訂單處理中$/.test(res) ? 'changed' : /已是訂單處理中|已全是訂單處理中/.test(res) ? 'already'
               : /已出貨|已送達/.test(res) ? 'skipped' : 'failed';
        results.push({ orderNo: nos[i], status: st, text: res });
        if (res === EXPIRED_MSG) {
          for (var j = i + 1; j < nos.length; j++) results.push({ orderNo: nos[j], status: 'failed', text: '未處理（登入已過期）' });
          break;
        }
      }
    } finally { quiet = false; }
    window.dispatchEvent(new CustomEvent('topmall-process-done', { detail: JSON.stringify({ results: results }) }));
  }

  function colorFor(res) {
    if (res === EXPIRED_MSG || /未修改$|未全部修改$|查詢失敗/.test(res)) return '#b00';
    if (/已修改為訂單處理中$/.test(res)) return '#0a7d3b';
    return '#222';
  }

  function addLine(no, text, color) {
    var d = el('div', 'border-bottom:1px dotted #ccc;padding:2px 0;color:' + (color || '#222'), (no ? no + ' ' : '') + text);
    out.appendChild(d); out.scrollTop = out.scrollHeight;
    return d;
  }

  // ---------- keepalive: read-only GET every 5 min, at most once per 4.5 min across all tabs ----------
  var KA_EVERY = 5 * 60 * 1000;
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function showKa() {
    if (!kaEl) return;
    var st = GM_getValue('tmo_ka_state', ''), t = GM_getValue('tmo_ka_time', 0);
    if (!t) { kaEl.textContent = ''; return; }
    kaEl.textContent = st === 'ok' ? '後台已連線 ' + hhmm(t) : st === 'expired' ? '⚠ 後台已登出 ' + hhmm(t) : '連線失敗 ' + hhmm(t);
    kaEl.style.color = st === 'ok' ? '#fff' : '#ffd24d';
  }
  async function keepalive() {
    var last = GM_getValue('tmo_ka_time', 0);
    if (Date.now() - last < KA_EVERY - 30000 || busy) { showKa(); return; }
    GM_setValue('tmo_ka_time', Date.now()); // claim the slot so other tabs skip
    var st;
    try {
      var r = await httpGet(ORDER_SEARCH_URL);
      st = looksLikeLogin(r.url, r.text) ? 'expired' : 'ok';
    } catch (e) { st = 'error'; }
    GM_setValue('tmo_ka_state', st); GM_setValue('tmo_ka_time', Date.now());
    showKa();
  }

  // On the 收款 site show the panel only on #/booth and #/cashier.
  function routeOk() { return ON_TOPMALL || /^#\/(booth|cashier)\b/.test(location.hash); }
  function applyRoute() { if (host) host.style.display = routeOk() ? '' : 'none'; }

  window.__topmallOrders = {
    lookup: function (n) { return run(String(n), false); },
    process: function (n) { return run(String(n), true); },
    show: function () { if (panel) panel.style.display = ''; },
    _root: function () { return panel; },
    _gather: gather, _classify: classify, _parseGrid: parseGrid, _extractForm: extractForm, _footerInt: footerInt, _hasDoneAlert: hasDoneAlert
  };
  buildPanel();
  applyRoute();
  // 收款網站（#/booth、#/cashier）：預設收折；「合併其他通路」面板開啟時自動展開，按完成／自動加入後收折
  if (!ON_TOPMALL) {
    setCollapsed(true);
    window.addEventListener('seller-confirm-paid', onConfirmPaid);
    window.addEventListener('seller-merge-panel', function (e) {
      try {
        var open = !!JSON.parse(e.detail).open;
        setCollapsed(!open);
        // 打開合併面板時，游標直接停在單號輸入框（延遲兩次，避免被網站自己的焦點搶走）
        if (open) {
          var f = function () { try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (x) {} };
          setTimeout(f, 60); setTimeout(f, 350);
        }
      } catch (err) {}
    });
  }
  window.addEventListener('hashchange', applyRoute);
  showKa();
  setTimeout(keepalive, 3000);
  setInterval(keepalive, 60 * 1000);
})();
