-- ============================================================
-- 22 · 暫停預購下單（臨時封鎖）：2026-11-20 00:00（台灣時間）之前不能下單
-- 請在 Supabase > SQL Editor 整段貼上執行（可重複執行）
-- 做法：在 decrement_stock 最前面（扣庫存之前）檢查時間，封鎖期間直接丟錯誤，
--       所以不會扣到庫存、也不會留下訂單。其餘邏輯與 19 版（資料庫目前版本）完全相同。
-- 解除：時間一過就自動失效，不需要再改。之後若重寫 decrement_stock（例如修 bug），
--       直接用新版覆蓋即可，這段封鎖會一併消失。
-- 不影響：現場收銀台（不呼叫 decrement_stock）、後台收款／取消／退款。
-- ============================================================

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
  -- ★ 暫停下單：此時間之前一律拒絕（放最前面，避免先扣庫存）
  IF now() < timestamptz '2026-11-20 00:00:00+08' THEN
    RAISE EXCEPTION '系統調整中，暫停預購下單，將於 11/20 00:00 重新開放，造成不便敬請見諒。';
  END IF;

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
