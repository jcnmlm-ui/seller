-- ============================================================
-- 15 · 攤位收款：合併其他通路訂單計算滿額 + 記錄應送贈品
-- 請在 Supabase > SQL Editor 整段貼上執行（可重複執行）
-- ============================================================

-- 合併的其他通路訂單：[{"order_no":"A123","amount":500}, ...]
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merged_orders jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 收款當下記錄的滿額贈品（例如「鑰匙圈+日期章」），事後核對用
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_gift text;

-- 查「同一張其他通路單號是否已被別筆訂單使用」用
CREATE INDEX IF NOT EXISTS idx_orders_merged_orders
  ON public.orders USING gin (merged_orders);
