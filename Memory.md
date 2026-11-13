# Memory.md — 開發狀態記錄

> 記錄開發進度與現況。每次上傳新 zip 後請對照更新。
> 最後更新：2026/11/10（世界郵展現場收款調整；依本次對話交付內容更新）

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
| BoothDashboard.jsx | 橫式雙欄，QR 解析，Enter 雙用，付款修改記錄，Broadcast 廣播；**收款前調整數量、滿額贈品提示（循環制）、合併其他通路訂單、退貨／退款**（2026/11/10）|
| CashierPage.jsx | 刷條碼收銀，source=booth_cashier，status=delivered；今日統計改台灣時間 00:00 起算 |

### src/lib/、src/components/（2026/11/10 異動）

| 檔案 | 功能摘要 |
|------|---------|
| lib/gifts.js | 新增。滿額贈品循環制計算（computeGifts / nextGiftStep / giftText），攤位與顧客橫幅共用 |
| components/PromotionBanner.jsx | 顧客購物車滿額贈橫幅改循環制；活動說明視窗改 portal |
| config/store.js | STATUS_CONFIG 新增 refunded（已退款）|
| pages/admin/ReportsDashboard.jsx | 報表排除 pending 與 refunded 訂單 |
| pages/customer/OrderQuery.jsx | 狀態對照新增「已退款」|

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
| 10–11 | 郵票金額 / 滿額活動（內容待對照 Supabase 紀錄補上）| ✅ Supabase 執行 |
| 12 | orders.ibox_full_address | ✅ Supabase 執行 |
| 13 | promotion_tiers.is_sold_out | ✅ Supabase 執行 |
| 14 | 退貨／退款：refunded 狀態、order_refunds、refund_order() | ⚠️ 2026/11/10 提供，**請確認已在 Supabase 執行** |
| 15 | 合併其他通路訂單：merged_orders、promo_gift | ⚠️ 同上 |
| 16 | 收款前調整數量：edit_log、reduce_pending_order() | ⚠️ 同上 |

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

### 攤位收款 — 世界郵展現場調整（2026/11/10）
- [x] 收款前調整（減少）待收款訂單數量，回補庫存，留 edit_log
- [x] 收款時顯示應送滿額贈品（項數／個數／名稱），贈品與金額全部跟後台滿額贈設定走
- [x] 滿額贈品改循環制：每滿最高門檻再送一組，餘額加送（攤位頁與顧客橫幅一致）
- [x] 合併其他通路購買訂單（單號＋金額，可多筆，重複單號警示）
- [x] 已收款訂單退貨／退款（部分退、整筆退、庫存回補、刷卡整筆刷退重刷、郵票金額退現金、退款紀錄、滿額贈品減少提示）
- [x] 今日統計改台灣時間 00:00 起算，並顯示「已扣退款」
- [x] 活動說明視窗置中修正（portal）

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
- [ ] 顧客「一鍵滿額」小精靈目前只湊到最高一階，是否改為可繼續湊下一組（循環）
- [ ] 活動說明視窗條款補上循環制說明（需 jcn 確認文字）
- [ ] 「取消整筆待收款訂單」功能（目前調整數量至少保留一項；整筆不要只能不付款，庫存仍被保留）
- [ ] 退款後通知出貨端（OrderDashboard 目前靠 postgres_changes 自動重整，無專屬提醒）
- [ ] 已出貨／送達訂單的退款流程（目前攤位不可退，需後台處理）
- [ ] 報表顯示退款明細（目前報表只是排除整筆退款訂單，不單獨列退款）

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
| 退款走 RPC（單一交易） | 品項、金額、庫存、退款紀錄必須同時成功或同時失敗 |
| 部分退款直接更新 order_items 與 total_amount，原始內容存 order_refunds | 出貨單、揀貨清單、報表自動呈現退款後內容，不用逐頁改 |
| 刷卡退款＝整筆刷退重刷 | 刷卡機無法部分退；系統只提示步驟，不串接刷卡機 |
| 現場收銀台訂單退款不回補庫存 | 現場收銀當初就沒有扣庫存 |
| 滿額贈循環以「最高門檻」為週期 | 跟後台設定連動，不寫死金額；贈品名稱用互相包含合併 |
| 日界線用台灣時間 00:00 | toISOString 是 UTC，早上 8 點前會算錯 |
| 滿額贈計算金額為 0 時仍要回傳最高一階（topTier） | 2026/11/12 事故：空購物車時 topTier 為 null，橫幅讀 topTier.threshold 當掉，顧客頁整頁白屏；橫幅另加 null 保險 |
| 逐日釋放庫存採「累計制」，由 decrement_stock 在伺服器端強制 | 前一天沒賣完留到後面；全商品共用一組天數與權重；現場收銀台不扣庫存、與預購分開；權重合計須 = 100（DB trigger 也會擋）；2026/11 實作，migration 17 |
| 活動說明視窗用 portal | 外層容器有 transform 時，fixed 會以容器而非視窗為準 |

---

## store.js 實際值

```js
name:    '高雄郵局'
phone:   '07-261-4171#409'
address: '高雄市新興區中正三路177號3樓'
```
