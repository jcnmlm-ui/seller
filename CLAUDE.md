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
| Supabase project | `ftjwnidvajuhtincpdtx` |

---

## 重要約束

1. **jcn 完全透過 GitHub 網頁介面操作**，沒有本機開發環境
2. 所有程式碼修改透過 GitHub 網頁直接上傳覆蓋
3. 不可要求 jcn 在本機執行 CLI 指令（print-server 除外）
4. SQL migrations 手動在 Supabase SQL Editor 執行
5. **提供修改時必須給完整檔案**，讓 jcn 整個複製貼上
6. 多個檔案同時修改時，用 Python 腳本處理後再輸出完整檔案

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
created_at
```

### order_items
```sql
id, order_id (FK), product_id (FK),
product_name, product_barcode,
unit_price, quantity, created_at
```

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

---

## 注意事項

1. **Supabase 免費方案**：7天無活動自動暫停，展場前需手動喚醒
2. **條碼槍行為**：模擬鍵盤，末尾附帶 Enter，所有輸入邏輯需考慮此特性
3. **PWA start_url**：`/seller/#/booth`（攤位收款頁）
4. **print-server CORS**：平板透過 LAN IP 呼叫時需加入 allowedOrigins
5. **圖示檔名**：`icon-192.png` / `icon-512.png`（不可多餘副檔名）
6. **Broadcast vs postgres_changes**：UPDATE 事件用 Broadcast 而非 postgres_changes（RLS 限制）
