-- 24：現場收銀台「快速鍵」（7 格）
-- 存在 settings（單列 id='main'）的 jsonb 欄位，格式：
--   [{ "label": "按鈕名稱", "product_id": "<products.id>", "product_name": "商品名稱" }, ...]
-- 在後台「系統設定」頁設定；沒選商品的格子不會出現在收銀台。

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS cashier_quick_buttons jsonb NOT NULL DEFAULT '[]'::jsonb;
