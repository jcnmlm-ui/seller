# 攤位 QR Code 預購系統

## 🚀 快速開始

### 第一步：建立 Supabase 專案

1. 前往 [supabase.com](https://supabase.com) 註冊/登入
2. 點擊 **New project**
3. 填入：
   - **Project name**：隨意（如 `booth-shop`）
   - **Database Password**：設定一個強密碼（記下來）
   - **Region**：選 **Southeast Asia (Singapore)** — 台灣連線最快
4. 等待 2 分鐘初始化完成

5. 進入 **Settings → API**，複製：
   - `Project URL`
   - `anon public` key

6. 進入 **SQL Editor**，依序貼上並執行：
   - `supabase/01_schema.sql`（建立資料表）
   - `supabase/02_triggers.sql`（觸發器 & 函數）
   - `supabase/03_rls.sql`（安全政策 + 範例商品）

7. 建立後台管理員帳號：
   - 進入 **Authentication → Users → Add user**
   - 填入 Email 和密碼（這是後台登入用的）

---

### 第二步：設定本機環境

```bash
# 1. 複製環境變數範本
cp .env.example .env

# 2. 填入你的 Supabase 資訊
# 用文字編輯器打開 .env 填入：
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...

# 3. 安裝套件
npm install

# 4. 啟動開發伺服器
npm run dev
```

瀏覽器打開 `http://localhost:5173/booth-shop/` 即可看到顧客預購頁面。

---

### 第三步：客製化設定

編輯 `src/config/store.js`，填入你的攤位資訊：

```js
export const STORE = {
  name:    '你的攤位名稱',     // 顯示在所有頁面標題
  phone:   '0X-XXXX-XXXX',    // 出現在 A5 託運單寄件人
  address: '高雄市○○區…',     // 出現在 A5 託運單寄件人
}
```

編輯 `vite.config.js`，將 base 改為你的 GitHub repo 名稱：

```js
base: '/你的repo名稱/',
```

---

### 第四步：部署到 GitHub Pages

**方法 A：GitHub Actions 自動部署（推薦）**

1. 建立 GitHub repository（名稱要與 `vite.config.js` 的 base 相同）
2. Push 程式碼到 `main` branch
3. 在 GitHub 的 **Settings → Secrets and variables → Actions** 新增：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. 進入 **Settings → Pages → Source** 選擇 `gh-pages` branch
5. 之後每次 push 到 main 都會自動部署 ✅

**方法 B：手動部署**

```bash
npm run deploy
```

---

## 📱 系統網址

部署後，各頁面網址如下（將 `username/repo-name` 替換為你的）：

| 頁面 | 網址 |
|------|------|
| 顧客預購頁（貼 QR Code 的目標） | `https://username.github.io/repo-name/#/` |
| 訂單確認頁 | `https://username.github.io/repo-name/#/order/ORD-XXXX` |
| 訂單查詢 | `https://username.github.io/repo-name/#/query` |
| 後台登入 | `https://username.github.io/repo-name/#/login` |
| 攤位收款介面 | `https://username.github.io/repo-name/#/booth` |
| 出貨管理後台 | `https://username.github.io/repo-name/#/admin` |
| 商品管理 | `https://username.github.io/repo-name/#/admin/products` |

---

## 🖨️ 列印設定

### A4 出貨單
1. 後台訂單頁點擊「A4 出貨單」
2. 瀏覽器列印對話框：紙張選 **A4**，邊界選 **最小**
3. 關閉「頁首/頁尾」選項

### A5 託運單
1. 後台訂單頁點擊「A5 託運單」
2. 列印對話框：紙張選 **A5**，或將 A4 切半後手動放入紙匣

---

## ⚠️ 注意事項

- **Supabase 免費方案**：7 天無活動會自動暫停。活動前記得手動喚醒，或升級付費方案（$25/月）。
- **庫存上限**：stock 設 -1 = 無限庫存；填數字 = 有庫存管制，售完自動下架。
- **後台帳號安全**：務必設定強密碼，不要在公開場所使用後台。
