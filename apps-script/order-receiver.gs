/**
 * Shi Wa Nan Ma Shop — 網站訂單接收器（Google Apps Script Web App）
 *
 * 功能：接收網站購物車送出的訂單 → 用網站最新的 products.json 重新核對品項與價格
 *      → 寫入試算表「訂單管理」工作表（每個商品規格一列，同一訂單共用訂單編號；依標題名稱對欄位）
 *      → Email 通知店家（與客人）。
 *
 * 每列金額：「商品金額」= 該列小計；「國內超商運費」只記在訂單第一列（NT$60）；
 *          「客人付款總額」= 商品金額 + 該列運費 → 把同一訂單各列加總就是客人應付總額。
 *
 * 部署方式（建立「獨立」Apps Script 專案，不影響試算表原有的程式）：
 *   1. 打開 https://script.new  → 把這整份程式貼上（取代預設內容）→ 存檔
 *   2. 右上「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *      - 執行身分：我
 *      - 誰可以存取：所有人
 *   3. 按「部署」→ 授權 → 複製「網頁應用程式網址」（https://script.google.com/macros/s/…/exec）
 *   4. 到網站「管理 → 網站設定 → 訂單接收網址」貼上 → 儲存設定
 *   之後修改程式：部署 →「管理部署作業」→ 編輯 → 版本選「新版本」→ 部署（網址不變）
 */

// ===== 設定 =====
var SPREADSHEET_ID = '1LIOIyqbMHut99hOM5ebt_HApdO_YhuJS1BMBT1SeC7E';
var SHEET_NAME = '訂單管理';
var PRODUCTS_URL = 'https://mu4540.github.io/shiwananma-shop/products.json';
var SHIPPING = 60;                 // 國內超商運費（NT$）
var NOTIFY_OWNER = true;           // 新訂單 Email 通知店家（寄到部署者帳號）
var NOTIFY_EMAIL = '';             // 留空 = 部署者本人；也可填其他 Email
var SEND_CUSTOMER_EMAIL = true;    // 寄訂單確認信給客人
var TIMEZONE = 'Asia/Taipei';
var MAX_LINES = 30, MAX_QTY = 10;
// ================

function doGet() {
  return json_({ ok: true, service: 'shiwananma-order', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.website) return json_({ ok: true, orderId: 'ORD-IGNORED' });          // 機器人陷阱欄位
    var cache = CacheService.getScriptCache();
    var nonce = String(body.clientId || '').slice(0, 64);
    if (nonce) {
      var prev = cache.get('n:' + nonce);
      if (prev) return json_(JSON.parse(prev));                                       // 重送 → 回同一筆
    }
    var c = clean_(body.customer || {}), pay = clean_(body.payment || {});
    var note = str_(body.note, 300);
    var err = validate_(c, pay);
    if (err) return json_({ ok: false, error: err });

    var priced = priceItems_(body.items);
    if (priced.error) return json_({ ok: false, error: priced.error });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var result;
    try {
      var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
      if (!sheet) throw new Error('找不到工作表「' + SHEET_NAME + '」');
      var now = new Date();
      var orderId = 'ORD-' + Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd-HHmmss');
      var props = PropertiesService.getScriptProperties();
      if (props.getProperty('lastOrderId') && props.getProperty('lastOrderId').indexOf(orderId) === 0) {
        orderId += '-' + Math.floor(Math.random() * 90 + 10);
      }
      props.setProperty('lastOrderId', orderId);

      var total = priced.subtotal + SHIPPING;
      var payment = pay.cashName ? ('無摺存款：' + pay.cashName) : (pay.bank + ' / ' + pay.last5);
      var rows = priced.items.map(function (it, i) {
        var ship = i === 0 ? SHIPPING : '';
        return {
          '訂單編號': orderId,
          '下單時間': now,
          'Instagram': c.ig,
          '購買商品': it.text,
          '收件人姓名': c.name,
          '收件人電話': c.phone,
          'Email': c.email,
          '取貨方式': '7-11店取',
          '7-11門市': c.storeName + ' ' + c.storeNo,
          '匯款資訊': payment,
          '客人付款總額': it.amount + (ship || 0),
          '商品金額': it.amount,
          '國內超商運費': ship,
          '客人備註': i === 0 ? note : ''
        };
      });
      writeRows_(sheet, rows);
      result = { ok: true, orderId: orderId, subtotal: priced.subtotal, shipping: SHIPPING, total: total, lines: priced.lines };
    } finally {
      lock.releaseLock();
    }
    if (nonce) cache.put('n:' + nonce, JSON.stringify(result), 21600);
    notify_(result, c, payment, note);
    return json_(result);
  } catch (ex) {
    return json_({ ok: false, error: '系統忙碌，請稍後再試（' + (ex && ex.message || ex) + '）' });
  }
}

/* ---------- helpers ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function str_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n || 100); }
function clean_(o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = str_(o[k], 120); }); return r; }

function validate_(c, pay) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '')) return '請填寫正確的 Email';
  if (!c.ig) return '請填寫 Instagram 帳號';
  if (!c.name) return '請填寫收件人姓名';
  c.phone = String(c.phone || '').replace(/\D/g, '');
  if (!/^09\d{8}$/.test(c.phone)) return '收件人電話請填 09 開頭的 10 碼手機號碼';
  if (!c.storeName) return '請填寫 7-11 門市名稱';
  if (!/^\d{6}$/.test(c.storeNo || '')) return '7-11 店號是 6 位數字';
  if (pay.cashName) return '';
  if (!/^\d{3}$/.test(pay.bank || '')) return '銀行代號是 3 位數字';
  if (!/^\d{5}$/.test(pay.last5 || '')) return '匯款帳號末 5 碼請填 5 位數字';
  return '';
}

function loadProducts_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('products');
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch(PRODUCTS_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('無法讀取商品資料');
  var data = JSON.parse(res.getContentText());
  var slim = (data.products || []).map(function (p) {
    return { id: p.id, brand: p.brand || '', name: p.name, price: Number(p.price), status: p.status,
      colors: (p.colors || []).map(function (c) { return c.name; }), sizes: p.sizes || [], soldOut: p.soldOut || [] };
  });
  try { cache.put('products', JSON.stringify(slim), 120); } catch (e) {}
  return slim;
}

function priceItems_(items) {
  if (!Array.isArray(items) || !items.length) return { error: '購物車是空的' };
  if (items.length > MAX_LINES) return { error: '一次最多 ' + MAX_LINES + ' 項商品' };
  var products = loadProducts_(), byId = {};
  products.forEach(function (p) { byId[p.id] = p; });
  var lines = [], list = [], subtotal = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {}, p = byId[String(it.id)];
    var color = str_(it.color, 40), size = str_(it.size, 20), qty = Math.floor(Number(it.qty));
    if (!p || p.status === 'hidden') return { error: '有商品已下架，請回購物車移除後再下單' };
    var label = (p.brand ? p.brand + ' ' : '') + p.name;
    if (p.status === 'sold') return { error: '「' + label + '」已售完，請回購物車移除' };
    if (!(qty >= 1 && qty <= MAX_QTY)) return { error: '「' + label + '」數量需為 1–' + MAX_QTY };
    if (p.colors.length && p.colors.indexOf(color) === -1) return { error: '「' + label + '」請重新選擇顏色' };
    if (p.sizes.length && p.sizes.indexOf(size) === -1) return { error: '「' + label + '」請重新選擇尺寸' };
    if (p.soldOut.indexOf((color || '') + '|' + (size || '')) !== -1) return { error: '「' + label + ' ' + [color, size].filter(String).join('/') + '」已缺貨' };
    var line = p.price * qty;
    subtotal += line;
    var text = [label, color, size].filter(String).join(' / ') + ' ×' + qty;
    lines.push(text + '（NT$' + line + '）');
    list.push({ text: text, amount: line });
  }
  return { lines: lines, items: list, subtotal: subtotal };
}

function writeRows_(sheet, rowsValues) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).replace(/\s/g, ''); });
  // 找最後一筆有「訂單編號」或「下單時間」的列，寫在它的下一列（不受下拉選單、公式影響）
  var idCol = headers.indexOf('訂單編號') + 1 || 1, timeCol = headers.indexOf('下單時間') + 1 || 2;
  var n = Math.max(sheet.getLastRow() - 1, 1);
  var a = sheet.getRange(2, idCol, n, 1).getValues(), b = sheet.getRange(2, timeCol, n, 1).getValues();
  var last = 1;
  for (var i = 0; i < n; i++) if (String(a[i][0]).trim() || String(b[i][0]).trim()) last = i + 2;
  // 只寫對應到的欄位，其他欄（成本、狀態、內部備註、公式）不動
  rowsValues.forEach(function (values, r) {
  var row = last + 1 + r;
  Object.keys(values).forEach(function (key) {
    var k = key.replace(/\s/g, '');
    var idx = headers.indexOf(k);
    if (idx === -1) idx = headers.findIndex(function (h) { return h.indexOf(k) === 0; });
    if (idx === -1) return;                                   // 找不到的欄位就略過
    var cell = sheet.getRange(row, idx + 1);
    if (key === '收件人電話' || key === '匯款資訊' || key === '7-11門市') cell.setNumberFormat('@');
    if (key === '客人付款總額' || key === '商品金額' || key === '國內超商運費') cell.setNumberFormat('"NT$"#,##0');
    if (key === '下單時間') cell.setNumberFormat('yyyy/MM/dd HH:mm');
    cell.setValue(values[key]);
  });
  });
}

function notify_(r, c, payment, note) {
  var body = '訂單編號：' + r.orderId + '\n\n'
    + r.lines.join('\n') + '\n\n商品金額：NT$' + r.subtotal + '\n運費：NT$' + r.shipping + '\n總計：NT$' + r.total + '\n\n'
    + '收件人：' + c.name + '　' + c.phone + '\n7-11 門市：' + c.storeName + ' ' + c.storeNo + '\n'
    + 'Instagram：' + c.ig + '\nEmail：' + c.email + '\n匯款資訊：' + payment + (note ? '\n備註：' + note : '');
  try {
    if (NOTIFY_OWNER) MailApp.sendEmail(NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(), '【新訂單】' + r.orderId + '　NT$' + r.total, body);
  } catch (e) {}
  try {
    if (SEND_CUSTOMER_EMAIL) MailApp.sendEmail(c.email, '【Shi Wa Nan Ma Shop】已收到您的訂單 ' + r.orderId,
      '您好，已收到您的訂單，確認匯款後會盡快為您採購，謝謝！\n\n' + body + '\n\n如有問題請透過 Instagram 與我們聯繫。');
  } catch (e) {}
}

/** 在編輯器選這個函式按「執行」可測試寫入（會新增一筆測試訂單，測完請手動刪除）。 */
function testWrite() {
  var p = loadProducts_()[0];
  var fake = { postData: { contents: JSON.stringify({
    items: [{ id: p.id, color: p.colors[0] || '', size: p.sizes[0] || '', qty: 1 }],
    customer: { email: Session.getEffectiveUser().getEmail(), ig: 'test', name: '測試', phone: '0912345678', storeName: '測試門市', storeNo: '123456' },
    payment: { bank: '822', last5: '12345' }, note: '測試訂單，請刪除' }) } };
  Logger.log(doPost(fake).getContent());
}
