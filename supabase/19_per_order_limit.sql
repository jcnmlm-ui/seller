-- 19：逐日釋放商品「每單限購」
-- 在 release_schedule（單列 id='main'）加兩個欄位：是否啟用、每單最多幾件。
-- 只限制「有開逐日釋放」的商品；一般商品不受影響。可隨時在後台開關、改數字。

ALTER TABLE public.release_schedule
  ADD COLUMN IF NOT EXISTS per_order_limit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS per_order_limit integer NOT NULL DEFAULT 1;

ALTER TABLE public.release_schedule
  DROP CONSTRAINT IF EXISTS release_schedule_per_order_limit_chk;
ALTER TABLE public.release_schedule
  ADD CONSTRAINT release_schedule_per_order_limit_chk CHECK (per_order_limit >= 1);

-- 目前生效的每單限購數；未啟用或沒有設定回傳 NULL（＝不限）
CREATE OR REPLACE FUNCTION public.release_per_order_limit()
RETURNS integer AS $$
  SELECT CASE WHEN per_order_limit_enabled THEN per_order_limit ELSE NULL END
  FROM public.release_schedule WHERE id = 'main';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.release_per_order_limit() TO anon, authenticated;

-- decrement_stock：在 18 版基礎上加入「每單限購」檢查
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
  lim       integer;
BEGIN
  PERFORM public.expire_pending_orders();
  lim := public.release_per_order_limit();

  FOR i IN 1 .. array_length(p_product_ids, 1) LOOP
    SELECT stock, name, release_enabled, release_total
      INTO current, prod_name, r_enabled, r_total
    FROM products
    WHERE id = p_product_ids[i]
    FOR UPDATE;

    IF lim IS NOT NULL AND COALESCE(r_enabled, false) AND p_quantities[i] > lim THEN
      RAISE EXCEPTION '商品「%」每單限購 % 件', prod_name, lim;
    END IF;

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
