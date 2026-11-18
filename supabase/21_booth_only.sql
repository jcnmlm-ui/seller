-- 21：僅現場販售商品
-- booth_only = true：預購網站（ProductList）不顯示，現場收銀（CashierPage）刷條碼仍可查到
-- 注意：先在 Supabase 執行此檔，再部署前端（前端查詢會用到此欄位）

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS booth_only boolean NOT NULL DEFAULT false;
