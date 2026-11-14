-- ============================================================
-- 18 · 待收款訂單：手動取消、隔日 00:00 自動清除（庫存補回）
-- 請在 Supabase > SQL Editor 整段貼上執行（可重複執行）
-- 規則：
--   · 新增訂單狀態 'cancelled'（已取消）：回補庫存、不計入報表、不出現在出貨後台
--   · 只有「待收款(pending)」的預購訂單可以取消（已收款請走退貨／退款）
--   · 每天台灣時間 19:00（攤位 18:00 下班，預留 1 小時緩衝）清掉「19:00 以前下單、仍待收款」的預購訂單並補回庫存
--     例：今天 10:00 下的單，今天 19:00 後取消；今天 20:00 下的單，明天 19:00 後取消
--     （不需要排程：有顧客下單、顧客開商品頁、或後台開待收款頁時，會順便清理）
--   · 要改清除時間，只要改 pending_cutoff() 裡的 19
-- ============================================================

-- 1) 狀態允許 'cancelled'
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','paid','picking','packed','shipped','delivered','refunded','cancelled'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at     timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by     text;

-- 2) 取消單筆（內部用）：待收款才處理；回補庫存（stock=-1 不動；原本因 0 庫存下架的重新上架）
CREATE OR REPLACE FUNCTION public.cancel_order_core(
  p_order_id uuid, p_reason text, p_by text
)
RETURNS boolean AS $$
DECLARE
  o public.orders%ROWTYPE;
  it record;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending' THEN
    RETURN false;
  END IF;

  IF COALESCE(o.source, 'online') <> 'booth_cashier' THEN
    FOR it IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
      IF it.product_id IS NOT NULL THEN
        UPDATE public.products
        SET stock        = stock + it.quantity,
            is_available = CASE WHEN stock <= 0 THEN true ELSE is_available END
        WHERE id = it.product_id AND stock <> -1;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET status = 'cancelled', cancelled_at = now(),
      cancelled_reason = p_reason, cancelled_by = p_by
  WHERE id = p_order_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.cancel_order_core(uuid, text, text) FROM PUBLIC;

-- 3) 後台手動取消（可多筆）；回傳實際取消的筆數
CREATE OR REPLACE FUNCTION public.cancel_pending_orders(
  p_order_ids uuid[], p_reason text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  oid uuid;
  n   integer := 0;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION '請先登入';
  END IF;
  FOREACH oid IN ARRAY COALESCE(p_order_ids, ARRAY[]::uuid[]) LOOP
    IF public.cancel_order_core(
         oid, COALESCE(NULLIF(trim(p_reason), ''), '人工取消'),
         COALESCE(auth.jwt() ->> 'email', '')) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.cancel_pending_orders(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_pending_orders(uuid[], text) TO authenticated;

-- 4) 自動清除：「最近一次 19:00（台灣時間）」以前下單、仍待收款的預購訂單
CREATE OR REPLACE FUNCTION public.pending_cutoff(p_now timestamptz DEFAULT now())
RETURNS timestamptz AS $$
DECLARE
  v_local  timestamp := p_now AT TIME ZONE 'Asia/Taipei';
  v_cut    timestamp := date_trunc('day', p_now AT TIME ZONE 'Asia/Taipei') + interval '19 hours';
BEGIN
  IF v_local < v_cut THEN v_cut := v_cut - interval '1 day'; END IF;
  RETURN v_cut AT TIME ZONE 'Asia/Taipei';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.expire_pending_orders()
RETURNS integer AS $$
DECLARE
  r record;
  n integer := 0;
  v_cutoff timestamptz := public.pending_cutoff();
BEGIN
  FOR r IN
    SELECT id FROM public.orders
    WHERE status = 'pending'
      AND COALESCE(source, 'online') <> 'booth_cashier'
      AND created_at < v_cutoff
    ORDER BY created_at
  LOOP
    IF public.cancel_order_core(r.id, '逾期未結帳（每日 19:00 自動取消）', 'system') THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.expire_pending_orders() TO anon, authenticated;

-- 5) 下單前先清理過期訂單（庫存補回後才檢查），其餘同 17 版
CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_ids uuid[], p_quantities integer[]
)
RETURNS json AS $$
DECLARE
  i         integer;
  current   integer;
  prod_name text;
  r_enabled boolean;
  r_total   integer;
  avail     integer;
BEGIN
  PERFORM public.expire_pending_orders();

  FOR i IN 1 .. array_length(p_product_ids, 1) LOOP
    SELECT stock, name, release_enabled, release_total
      INTO current, prod_name, r_enabled, r_total
    FROM products
    WHERE id = p_product_ids[i]
    FOR UPDATE;

    IF current != -1 THEN
      IF current < p_quantities[i] THEN
        RAISE EXCEPTION '商品「%」庫存不足（剩餘 % 件）', prod_name, current;
      END IF;

      avail := public.release_available(current, r_total, r_enabled);
      IF avail IS NOT NULL AND avail < p_quantities[i] THEN
        RAISE EXCEPTION '商品「%」今日開放數量不足（今日還可購買 % 件），明天 00:00 會釋放更多', prod_name, avail;
      END IF;

      UPDATE products
        SET stock = stock - p_quantities[i],
            is_available = CASE WHEN (stock - p_quantities[i]) <= 0 THEN false ELSE true END
        WHERE id = p_product_ids[i];
    END IF;
  END LOOP;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
