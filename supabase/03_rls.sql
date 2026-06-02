-- ============================================================
-- 攤位預購系統 — Row Level Security 政策
-- 請在 02_triggers.sql 之後執行
-- ============================================================

-- ── Products ──────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 前台顧客：只能讀取上架商品
CREATE POLICY "products_public_read"
  ON products FOR SELECT
  USING (is_available = true OR auth.role() = 'authenticated');

-- 後台管理員：完整操作權限
CREATE POLICY "products_auth_all"
  ON products FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


-- ── Orders ────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 任何人（含匿名）都可以建立訂單
CREATE POLICY "orders_anyone_insert"
  ON orders FOR INSERT
  WITH CHECK (true);

-- 任何人可以查詢訂單（前台查詢頁用，依 order_no 查詢）
CREATE POLICY "orders_anyone_select"
  ON orders FOR SELECT
  USING (true);

-- 只有已登入的後台人員可以更新/刪除訂單
CREATE POLICY "orders_auth_update"
  ON orders FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "orders_auth_delete"
  ON orders FOR DELETE
  USING (auth.role() = 'authenticated');


-- ── Order Items ───────────────────────────────────────────
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 任何人可以新增訂單明細
CREATE POLICY "order_items_anyone_insert"
  ON order_items FOR INSERT
  WITH CHECK (true);

-- 任何人可以查詢訂單明細（配合訂單查詢頁）
CREATE POLICY "order_items_anyone_select"
  ON order_items FOR SELECT
  USING (true);

-- 只有已登入的後台人員可以更新/刪除
CREATE POLICY "order_items_auth_update"
  ON order_items FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "order_items_auth_delete"
  ON order_items FOR DELETE
  USING (auth.role() = 'authenticated');


-- ============================================================
-- 範例商品（執行後可先在前台看到商品）
-- ============================================================
INSERT INTO products (name, description, barcode, price, stock, is_available) VALUES
  ('示範商品 A', '這是商品 A 的說明，可在後台修改', '4901234567890', 299, 50, true),
  ('示範商品 B', '這是商品 B 的說明', '4901234567891', 150, 100, true),
  ('示範商品 C', '限量商品', '4901234567892', 599, 10, true);
