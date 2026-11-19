-- ============================================================
-- 23 · 現場庫存（booth_stock）＋低庫存提醒
-- 請在 Supabase > SQL Editor 整段貼上執行（可重複執行）
-- 規則：
--   · products.booth_stock：現場庫存，和預購用的 stock 完全分開；NULL = 不追蹤（舊商品預設）
--   · products.booth_low_alert：現場刷讀時，剩餘數量低於此數字就跳出提醒；NULL = 不設門檻
--   · 現場收銀收款成功後，由 booth_deduct_stock(order_id) 依該訂單品項扣現場庫存（一次鎖定、一次扣完）
--     只警告不阻擋：庫存可以扣成 0 或負數（負數代表實際賣得比系統記錄多，後台會看到）
--   · 預購訂單（含在攤位收款的預購單）不扣現場庫存
--   · orders.booth_stock_deducted：記錄這筆現場單有沒有扣過現場庫存，避免同一筆重複扣
--   · 目前系統沒有「現場收銀單」的退款功能（refund_order 只接受 paid/picking/packed，現場單是 delivered），
--     所以不改 refund_order；現場實際退貨時，請到後台商品管理直接把「現場庫存」改回正確數字
-- 注意：先執行本檔，再部署前端。
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS booth_stock     integer,
  ADD COLUMN IF NOT EXISTS booth_low_alert integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS booth_stock_deducted boolean NOT NULL DEFAULT false;

-- 現場收款後扣現場庫存
CREATE OR REPLACE FUNCTION public.booth_deduct_stock(p_order_id uuid)
RETURNS json AS $$
DECLARE
  o  public.orders%ROWTYPE;
  it record;
  n  integer := 0;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '查無此訂單'; END IF;

  IF COALESCE(o.source, 'online') <> 'booth_cashier' THEN
    RETURN json_build_object('success', true, 'skipped', 'not_booth_order');
  END IF;
  IF o.booth_stock_deducted THEN
    RETURN json_build_object('success', true, 'skipped', 'already_deducted');
  END IF;

  -- 依 product_id 排序處理，避免兩台收銀同時結帳互相鎖死
  FOR it IN
    SELECT product_id, SUM(quantity)::integer AS qty
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    UPDATE public.products
    SET booth_stock = booth_stock - it.qty
    WHERE id = it.product_id AND booth_stock IS NOT NULL;
    n := n + 1;
  END LOOP;

  UPDATE public.orders SET booth_stock_deducted = true WHERE id = p_order_id;
  RETURN json_build_object('success', true, 'items', n);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.booth_deduct_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booth_deduct_stock(uuid) TO authenticated;
