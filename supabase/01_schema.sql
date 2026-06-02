-- ============================================================
-- 攤位預購系統 — 資料表建立
-- 請在 Supabase > SQL Editor 依序執行此檔案
-- ============================================================

-- 商品表
CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  barcode      text UNIQUE,
  price        numeric(10,2) NOT NULL CHECK (price >= 0),
  image_url    text,
  stock        integer NOT NULL DEFAULT -1, -- -1 表示無限庫存
  is_available boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 訂單表
CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no         text UNIQUE NOT NULL,         -- 自動產生，見 02_triggers.sql
  receiver_name    text NOT NULL,
  receiver_phone   text NOT NULL,
  receiver_address text NOT NULL,
  note             text,
  total_amount     numeric(10,2) NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','picking','packed','shipped','delivered')),
  payment_method   text
    CHECK (payment_method IN ('cash','card','taiwan_pay')),
  paid_at          timestamptz,
  shipped_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 訂單明細表
CREATE TABLE order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name     text NOT NULL,   -- 快照，避免商品修改影響歷史訂單
  product_barcode  text,            -- 快照
  unit_price       numeric(10,2) NOT NULL,
  quantity         integer NOT NULL CHECK (quantity > 0)
);

-- 索引（加速查詢）
CREATE INDEX idx_orders_status     ON orders(status);
CREATE INDEX idx_orders_phone      ON orders(receiver_phone);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);
