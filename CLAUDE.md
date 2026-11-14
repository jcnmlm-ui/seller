# 攤位預購系統 — CLAUDE.md

> 給 Claude 閱讀的專案說明文件。每次新對話開始時請先讀這份文件。

---

## 專案概覽

**名稱**：高雄郵局 攤位預購系統
**用途**：郵局攤位現場銷售與線上預購管理，含出貨、收款、列印、報表
**Frontend**：React + Vite → GitHub Pages
**Backend**：Supabase（PostgreSQL + Realtime Broadcast + Storage）
**本機列印**：Node.js + Express + Puppeteer + pdf-to-printer（Windows）

---

## Repository

| 項目 | 值 |
|------|-----|
| GitHub org | `jcnmlm-ui` |
| Repo | `jcnmlm-ui/seller` |
| 部署網址 | `https://jcnmlm-ui.github.io/seller/` |
| 部署方式 | GitHub Actions（push to main 自動觸發）|
| Supabase project | `tukzmdtkhdxdpbnvkjzz`（khpostgoods，目前使用）；舊專案 `ftjwnidvajuhtincpdtx` 已遷移，刪除前請先確認無殘留相依 |

---

## 重要約束

1. **jcn 完全透過 GitHub 網頁介面操作**，沒有本機開發環境
2. 所有程式碼修改透過 GitHub 網頁直接上傳覆蓋
3. 不可要求 jcn 在本機執行 CLI 指令（print-server 除外）
4. SQL migrations 手動在 Supabase SQL Editor 執行
5. **提供修改時必須給完整檔案**，讓 jcn 整個複製貼上
6. 多個檔案同時修改時，用 Python 腳本處理後再輸出完整檔案
7. **交付檔案請依 GitHub 資料夾階層打包成 zip**（根目錄 `seller-main/`），jcn 解壓縮後把 `src` 等資料夾直接拖進 GitHub 上傳頁面即可覆蓋；SQL 另外提供、在 Supabase SQL Editor 執行（可選擇一併放進 `supabase/` 留存）
8. 交付前一律先 `npm run build` 驗證

---

## 技術棧

### Frontend
```
React 18.3.1 + Vite 5.2.12
React Router v6（HashRouter，base: /seller/）
Tailwind CSS 3.4.4
lucide-react 0.383.0（icons）
react-to-print 2.15.1（瀏覽器列印 fallback）
qrcode.react 3.1.0（QR Code 生成）
jsbarcode 3.11.6（條碼生成）
@supabase/supabase-js 2.43.4
vite-plugin-pwa 0.19.0（PWA）
```

### Backend (Supabase)
```
PostgreSQL
Storage（product-images bucket，public）
Realtime Broadcast（channel: payment-events）
```

### 本機列印伺服器 (print-server)
```
Node.js + Express
Puppeteer（產生 PDF）
pdf-to-printer（送印 Windows 印表機）
監聽：http://127.0.0.1:3001
templates/label.html（100×150mm，XP-420B）
templates/shipping_slip_a4.html（A4，EPSON AL-M8000）
settings.json（印表機名稱等設定）
```

---

## 頁面路由

| 路徑 | 頁面 | 說明 |
|------|------|------|
| `/#/` | ProductList | 顧客商品列表 |
| `/#/checkout` | Checkout | 結帳 |
| `/#/order/:orderNo` | OrderConfirm | 訂單確認（含 QR Code）|
| `/#/query` | OrderQuery | 訂單查詢 |
| `/#/login` | LoginPage | 後台登入 |
| `/#/booth` | BoothDashboard | 攤位掃碼收款（橫式雙欄）|
| `/#/cashier` | CashierPage | 現場收銀台（刷條碼）|
| `/#/admin` | OrderDashboard | 出貨管理後台 |
| `/#/admin/products` | ProductManage | 商品管理 |
| `/#/admin/reports` | ReportsDashboard | 銷售報表 |
| `/#/admin/settings` | SettingsPage | 系統設定 |
| `/#/admin/pending` | PendingOrders | 待收款訂單清單（查詢／篩選／取消）|

---

## 資料庫結構

### orders
```sql
id, order_no (UNIQUE, 格式: ORD-YYYYMMDD-XXXX),
receiver_name, receiver_phone,
receiver_postal_code, receiver_address, note,
total_amount, status, payment_method,
paid_at, shipped_at, tracking_no,
payment_log (jsonb),   -- 付款方式修改紀錄
source (text),         -- 'online' | 'booth_cashier'
ibox_full_address,     -- i 郵箱完整地址（migration 12）
refunded_amount,       -- 累計退款金額（migration 14）
merged_orders (jsonb), -- 合併的其他通路訂單 [{order_no, amount}]（migration 15）
promo_gift (text),     -- 收款當下記錄的應送贈品，例「鑰匙圈×3、日期章×4」（migration 15）
edit_log (jsonb),      -- 收款前數量調整紀錄（migration 16）
created_at
```
status 允許值：`pending / paid / picking / packed / shipped / delivered / refunded / cancelled`
cancelled_at, cancelled_reason, cancelled_by（migration 18）

### order_items
```sql
id, order_id (FK), product_id (FK),
product_name, product_barcode,
unit_price, quantity,
stamp_amount,          -- 該品項含的郵票金額（下單時快照；unit_price 已包含郵票金額）
created_at
```

### order_refunds（migration 14）
```sql
id, order_id (FK), order_no, refund_type ('partial'|'full'),
items (jsonb), refund_total, refund_invoice, refund_stamp,
payment_method, refund_ref (刷退單號/備註), reason,
operator (登入 email), stock_restored, created_at
```

### promotion_tiers
```sql
id, threshold, reward (贈品文字，多項用 + 分隔，數量可寫「貼紙x2」),
is_active, is_sold_out
```

### 資料庫函數（RPC）
- `decrement_stock(product_ids, quantities)`：下單扣庫存
- `refund_order(order_id, items, ref, reason)`：已收款訂單退貨／退款，單一交易內完成「扣品項、改金額、回補庫存、寫紀錄」
- `reduce_pending_order(order_id, items)`：待收款訂單減少品項數量，回補庫存並寫入 edit_log
- `cancel_pending_orders(order_ids, reason)`：後台取消待收款訂單（可多筆），回補庫存、狀態改 cancelled
- `expire_pending_orders()`：把「下單日（台灣時間）已過」仍待收款的預購訂單自動取消並補回庫存；由 decrement_stock、顧客商品頁載入、後台待收款頁載入時順便觸發（不需排程）

### products
```sql
id, name, description, barcode,
price, stock (-1=無限), is_available,
image_url, created_at
```

### settings（單列，id='main'）
```sql
id, store_name,
sender_name, sender_phone,
sender_postal_code, sender_address,
updated_at
```

---

## 訂單狀態流程

```
pending → paid → picking → packed → shipped → delivered
（預購流程）

booth_cashier 現場銷售：直接建立 status='delivered'

退款：paid / picking / packed 可在攤位退款
  部分退 → 狀態不變，品項數量與金額直接更新
  整筆退 → status='refunded'（不出現在出貨後台、不計入營業額）
shipped / delivered 不可在攤位退款

取消：只有 pending 預購訂單可取消 → status='cancelled'（回補庫存、不計入報表與營業額、不出現在出貨後台）
  手動：後台「待收款」頁；自動：下單當天沒結帳，隔天 00:00 後清除
```

---

## store.js 預設值（列印 fallback）

```js
name:    '高雄郵局'
phone:   '07-261-4171#409'
address: '高雄市新興區中正三路177號3樓'
```
列印時優先使用 Supabase settings 表的資料，找不到才 fallback 到 store.js。

---

## 列印系統

### 偵測邏輯（OrderDashboard 啟動時）
```
fetch http://127.0.0.1:3001/health
  成功 → printMode = 'local'  （靜默送印，不跳對話框）
  失敗 → printMode = 'browser' （react-to-print，跳瀏覽器對話框）
```

### 本機列印 API
```
POST http://127.0.0.1:3001/print
Body: { template: 'label' | 'shipping_slip_a4', data: { ...} }
```

### data 物件欄位（含寄件人）
```js
{
  order_no, receiver_name, receiver_phone,
  receiver_postal_code, receiver_address, note,
  total_amount, payment_method, status,
  created_at, paid_at, shipped_at,
  sender_name, sender_phone,        // 從 settings 表讀取
  sender_postal_code, sender_address,
  items: [{ product_name, product_barcode, quantity, unit_price }]
}
```

### 紙張規格
- 託運單（WaybillA5）：100×150mm，XP-420B 熱感應捲紙
- 出貨單（ShippingSlipA4）：A4，EPSON AL-M8000

---

## 關鍵功能說明

### 攤位收款（BoothDashboard）
- 橫式雙欄：左 45%（搜尋+清單）/ 右 55%（顧客+付款）
- 條碼槍掃 QR Code → regex 抽取訂單號（`/ORD-[\d-]+/`）
- Enter 雙重功能：有輸入=查詢；空白=確認收款
- 確認付款方式預設現金，確認後可修改，修改寫入 payment_log
- 確認收款時透過 Supabase Broadcast 通知所有後台

- **收款前調整數量**：待收款訂單可按「調整數量」只減不增（0 = 移除），儲存後回補庫存並寫入 `edit_log`；至少保留一項
- **滿額贈品提示**：依「發票金額（扣郵票）＋合併的其他通路金額」即時算出應送贈品與數量；計算邏輯在 `src/lib/gifts.js`
- **合併其他通路訂單**：勾選後彈出面板輸入單號與金額（可多筆），同一單號已被別筆訂單合併會警示；收款時存入 `merged_orders`、`promo_gift`
- **退貨／退款**（已收款）：左側用 ＋／－ 選退幾件或「整筆全選」，右側顯示應退金額與收銀步驟（現金退現金；刷卡/電子支付＝整筆刷退後重刷剩餘金額，郵票金額退現金）；退款後滿額贈品減少會提示追回；任何登入人員皆可操作，操作人員 email 記入 `order_refunds`
- 右上角「今日」統計以**台灣時間 00:00** 為起點，排除待結帳與整筆退款訂單，另顯示「已扣退款」

### 現場收銀台（CashierPage）
- 刷讀商品條碼 → 查 products 表 → 加入購物車
- 重複刷讀 = 數量 +1，可手動調整
- 確認收款 → 建立 source='booth_cashier', status='delivered' 訂單
- 右側收款完成後顯示本筆紀錄摘要

### 出貨後台（OrderDashboard）
- 批次勾選：待揀貨/揀貨中/已出貨（BATCH_TABS）
- 揀貨清單：批次勾選揀貨中訂單 → 彙整商品數量 → A4 列印
- 連續出貨模式：勾選後 Enter 自動跳下一筆已包裝訂單
- Broadcast 接收：攤位收款後 toast + 音效 + 系統通知
- senderSettings 從 Supabase settings 讀取，傳入 WaybillA5 / ShippingSlipA4

### 滿額贈品（循環制，`src/lib/gifts.js`，攤位收款頁與顧客購物車橫幅共用）
- 全部讀取後台 `promotion_tiers`（啟用中），程式內沒有寫死金額或贈品名稱
- 以**最高一階門檻**為一個循環：每滿一個循環送一整組最高階贈品；餘額再依達到的最高一階加送該階贈品
  例（500 鑰匙圈／1,000 日期章／1,500 鑰匙圈+日期章）：1,500→各1；3,000→各2；3,500→各2再加鑰匙圈1
- 各階贈品名稱互相包含視為同一項（「波波鴿日期章」≈「日期章」），畫面統一顯示較短名稱，**後台改名時請維持互相包含**
- 滿額金額以發票金額計算（郵票金額不計入）
- 活動說明視窗（PromoTermsModal）以 portal 掛到 `<body>`，避免外層 transform 讓 fixed 定位跑掉

### 逐日釋放庫存（預購，migration 17）
- 後台「商品管理」上方設定**全商品共用**的活動開始日、天數、每日權重(%)，合計必須 = 100；各商品編輯時勾「逐日釋放」，庫存欄變成「活動總量」
- 累計開放量(第 d 天) = floor(總量 × 累計% / 100)，最後一天 = 總量；前一天沒賣完的留到後面；今日可買 = min(剩餘庫存, 累計開放量 − 已售)；開始日之前套用第 1 天；以台灣時間 00:00 換日
  例：550 件、權重 10/15/15/20/20/20 → 每日新增 55/82/83/110/110/110
- 由伺服器 `decrement_stock` 強制限制（超買會回錯誤訊息）；顧客頁透過 RPC `product_release_availability()` 顯示「今日剩 N 件／今日已售完」，每 60 秒與回到頁面時更新
- 退款／減量回補庫存後，今日可買數量會自動增加（已售 = 總量 − 剩餘庫存）
- 現場收銀台（CashierPage）維持不扣庫存，與預購分開；Excel 匯入匯出未包含 release 欄位
- 計算邏輯：`src/lib/release.js`（後台預覽）與 SQL 規則一致

### 待收款訂單管理（migration 18，`/admin/pending`）
- 預購下單即扣庫存，未結帳的訂單會佔庫存；此頁列出待收款／已取消訂單，可用訂單號、姓名、手機搜尋，依下單日（今天／昨天）與商品篩選，單筆或勾選多筆取消
- 頁面上方顯示「待收款佔住的庫存」依商品彙整
- 訂單確認頁（OrderConfirm）提示「請於當天 24:00 前到攤位結帳，逾時自動取消」
- 攤位收款頁掃到已取消訂單會顯示「此訂單已取消」，不能收款

### 銷售報表
- 篩選：期間（快捷+自訂）× 來源（全部/預購/現場）
- 來源分布卡片、商品排行、付款方式分布、每日明細、訂單列表

---

## SQL Migrations 說明

repo 的 `supabase/` 資料夾只有前 3 個（初始架構）。
04~09 是後來在 Supabase SQL Editor 直接執行，未存入 repo。

| 編號 | 內容 |
|------|------|
| 01 | products, orders, order_items 基礎結構 |
| 02 | 訂單號自動產生、庫存扣減觸發器 |
| 03 | Row Level Security |
| 04 | receiver_postal_code 欄位 |
| 05 | tracking_no 欄位 |
| 06 | product-images Storage RLS |
| 07 | payment_log JSONB 欄位 |
| 08 | settings 資料表 |
| 09 | orders.source 欄位 |
| 10–11 | 郵票金額（stamp_amount）、滿額活動（promotion_tiers）相關（確切檔名/內容請對照 Supabase SQL Editor 紀錄補上） |
| 12 | `12_add_ibox_address.sql`：orders.ibox_full_address |
| 13 | `13_promotion_sold_out.sql`：promotion_tiers.is_sold_out |
| 14 | `14_order_refund.sql`：refunded 狀態、orders.refunded_amount、order_refunds 表、refund_order() |
| 15 | `15_merge_other_channel.sql`：orders.merged_orders、orders.promo_gift |
| 16 | `16_reduce_pending_order.sql`：orders.edit_log、reduce_pending_order() |
| 17 | `17_daily_release.sql`：逐日釋放庫存（release_schedule 表、products.release_enabled/release_total、release_available()、product_release_availability()、改寫 decrement_stock） |
| 18 | `18_cancel_pending.sql`：cancelled 狀態與欄位、cancel_order_core()、cancel_pending_orders()、expire_pending_orders()、decrement_stock 加入過期清理 |

---

## 注意事項

1. **Supabase 免費方案**：7天無活動自動暫停，展場前需手動喚醒
2. **條碼槍行為**：模擬鍵盤，末尾附帶 Enter，所有輸入邏輯需考慮此特性
3. **PWA start_url**：`/seller/#/booth`（攤位收款頁）
4. **print-server CORS**：平板透過 LAN IP 呼叫時需加入 allowedOrigins
5. **圖示檔名**：`icon-192.png` / `icon-512.png`（不可多餘副檔名）
6. **Broadcast vs postgres_changes**：UPDATE 事件用 Broadcast 而非 postgres_changes（RLS 限制）
