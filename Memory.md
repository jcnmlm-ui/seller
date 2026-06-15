# Memory.md — 開發狀態記錄

> 記錄開發進度與現況。每次上傳新 zip 後請對照更新。
> 最後更新：2026/06/15（對照 seller-main.zip 驗證）

---

## 使用者資訊

- **稱呼**：jcn
- **操作方式**：GitHub 網頁介面，無本機開發環境
- **硬體**：XP-420B 熱感應標籤機、EPSON AL-M8000 雷射機、USB/藍牙條碼槍

---

## 目前版本狀態（已驗證）

所有檔案均已確認為最新版本，全部功能通過檢查。

### src/App.jsx ✅
- 路由：/、/checkout、/order/:orderNo、/query
- 路由：/login、/booth、/cashier、/admin
- 路由：/admin/products、/admin/reports、/admin/settings

### src/pages/customer/

| 檔案 | 功能摘要 |
|------|---------|
| ProductList.jsx | 固定 Header/Footer，個資聲明 Modal，footer 含個資/查詢訂單/版權連結 |
| Checkout.jsx | 雙電話欄（手機+市話），縣市鄉鎮下拉，郵遞區號自動帶入 |
| OrderConfirm.jsx | QR Code，追蹤號連結至中華郵政 |
| OrderQuery.jsx | 訂單查詢 |

### src/pages/booth/

| 檔案 | 功能摘要 |
|------|---------|
| BoothDashboard.jsx | 橫式雙欄，QR 解析，Enter 雙用，付款修改記錄，Broadcast 廣播 |
| CashierPage.jsx | 刷條碼收銀，source=booth_cashier，status=delivered |

### src/pages/admin/

| 檔案 | 功能摘要 |
|------|---------|
| OrderDashboard.jsx | 批次勾選，揀貨清單，連續出貨，Broadcast接收，senderSettings |
| ProductManage.jsx | CRUD + 圖片上傳（Supabase Storage）|
| ReportsDashboard.jsx | 期間+來源篩選，來源分布卡片，A4列印 |
| SettingsPage.jsx | 攤位名稱+寄件人資訊，upsert 至 settings 表 |

### src/components/print/

| 檔案 | 功能摘要 |
|------|---------|
| WaybillA5.jsx | 100×150mm，senderInfo prop，fallback STORE |
| ShippingSlipA4.jsx | A4，senderInfo prop，fallback STORE |

### 根目錄

| 檔案 | 狀態 |
|------|------|
| vite.config.js | VitePWA，start_url=/seller/#/booth |
| index.html | PWA meta tags，apple-touch-icon |
| icon-192.png | ✅ 已上傳 |
| icon-512.png | ✅ 已上傳 |

---

## SQL Migrations 執行狀態

| 編號 | 內容 | 狀態 |
|------|------|------|
| 01 | schema（基礎資料表）| ✅ repo 內 |
| 02 | triggers（訂單號、庫存）| ✅ repo 內 |
| 03 | RLS | ✅ repo 內 |
| 04 | receiver_postal_code | ✅ Supabase 執行 |
| 05 | tracking_no | ✅ Supabase 執行 |
| 06 | Storage RLS | ✅ Supabase 執行 |
| 07 | payment_log JSONB | ✅ Supabase 執行 |
| 08 | settings 資料表 | ✅ Supabase 執行 |
| 09 | orders.source | ✅ Supabase 執行 |

---

## 已完成功能

### 顧客前台
- [x] 商品列表（固定版面、個資聲明、Footer 連結）
- [x] 購物車（數量調整）
- [x] 結帳（雙電話、三段地址）
- [x] 訂單確認（QR Code、追蹤號連結）
- [x] 訂單查詢

### 攤位收款
- [x] 橫式雙欄版面
- [x] QR Code 掃描（網址解析）
- [x] Enter 雙重功能
- [x] 預設現金付款
- [x] 已收款修改付款方式
- [x] 修改紀錄（payment_log）
- [x] Broadcast 廣播通知後台

### 現場收銀台（新）
- [x] 刷條碼加入購物車
- [x] 重複刷讀 +1
- [x] 數量手動調整
- [x] 確認收款建立訂單（booth_cashier）

### 出貨後台
- [x] 四分頁管理
- [x] 批次勾選（待揀貨/揀貨中/已出貨）
- [x] 揀貨清單列印
- [x] 自動列印（開始揀貨）
- [x] 連續出貨模式
- [x] 追蹤號輸入/編輯
- [x] 收款通知（Broadcast + 音效 + 系統通知）
- [x] 系統設定連結

### 報表
- [x] 期間篩選
- [x] 來源篩選（預購/現場）
- [x] 來源分布卡片
- [x] 商品排行、付款分布、每日明細
- [x] A4 列印

### 系統設定
- [x] 攤位名稱、寄件人資訊
- [x] 列印文件自動帶入

### 列印
- [x] A4 出貨單（senderInfo）
- [x] 託運單 100×150mm（senderInfo）
- [x] 揀貨清單（批次彙整）

### PWA
- [x] 安裝支援
- [x] start_url = /seller/#/booth

---

## 待辦事項

- [x] ~~執行 09_add_source.sql~~（已完成）
- [ ] 現場收銀台收據列印
- [ ] 現場收銀台也廣播通知後台
- [ ] 報表 Excel 匯出

---

## 重要設計決策

| 決策 | 原因 |
|------|------|
| HashRouter | GitHub Pages 不支援 SPA 路由 fallback |
| Broadcast 取代 postgres_changes UPDATE | RLS 導致 UPDATE 事件不可靠 |
| 橫式雙欄攤位收款 | 展場平板多為橫式 |
| Enter 雙重功能 | 條碼槍刷讀後自帶 Enter，需區分查詢與確認 |
| settings 表存寄件人 | 同系統多地點各自設定 |
| 現場收銀直接 delivered | 現場交付，跳過出貨流程 |
| payment_log JSONB | 彈性記錄修改，不需額外資料表 |
| source 欄位 | 區分預購與現場，報表可分別統計 |

---

## store.js 實際值

```js
name:    '高雄郵局'
phone:   '07-261-4171#409'
address: '高雄市新興區中正三路177號3樓'
```
