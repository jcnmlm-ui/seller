-- 20：贈品發放結構化記錄
-- orders.promo_gift_items：收款（或「預購領取滿額贈」）當下應送的贈品，格式 [{"name":"鑰匙圈","qty":2}, ...]
-- 供報表加總各贈品發放數量；舊資料沒有此欄位值時，報表會改解析 promo_gift 文字。
-- （「預購領取滿額贈」另用 orders.source = 'gift_redeem' 標記，不需要額外 SQL。）

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_gift_items jsonb NOT NULL DEFAULT '[]'::jsonb;
