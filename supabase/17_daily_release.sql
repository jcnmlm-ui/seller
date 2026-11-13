-- ============================================================
-- 17 · 逐日釋放庫存（預購）
-- 請在 Supabase > SQL Editor 整段貼上執行（可重複執行）
-- 規則：
--   · 全商品共用同一組「活動開始日 + 每日權重(%)」，權重合計必須 = 100
--   · 累計開放量(第 d 天) = floor(活動總量 × 累計% / 100)，最後一天(含之後)開放 100%
--   · 前一天沒賣完的自動留到後面；今日可買 = min(剩餘庫存, 累計開放量 − 已售)
--   · 活動開始日之前，套用第 1 天的量；以台灣時間 00:00 換日
--   · 只管預購(decrement_stock)；現場收銀台維持原狀、不扣庫存
-- ============================================================

-- 1) 共用的天數／權重設定（單列 id='main'）
CREATE TABLE IF NOT EXISTS public.release_schedule (
  id         text PRIMARY KEY DEFAULT 'main',
  start_date date  NOT NULL,
  weights    jsonb NOT NULL,          -- 例 [10,15,15,20,20,20]
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.release_schedule_check()
RETURNS trigger AS $$
DECLARE
  v_sum numeric := 0;
  v     jsonb;
BEGIN
  IF jsonb_typeof(NEW.weights) <> 'array' OR jsonb_array_length(NEW.weights) < 1 THEN
    RAISE EXCEPTION '至少要設定 1 天';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(NEW.weights) LOOP
    IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric < 0 THEN
      RAISE EXCEPTION '每日權重必須是不小於 0 的數字';
    END IF;
    v_sum := v_sum + (v #>> '{}')::numeric;
  END LOOP;
  IF abs(v_sum - 100) > 0.01 THEN
    RAISE EXCEPTION '每日權重合計必須等於 100%%（目前 %）', v_sum;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_release_schedule_check ON public.release_schedule;
CREATE TRIGGER trg_release_schedule_check
  BEFORE INSERT OR UPDATE ON public.release_schedule
  FOR EACH ROW EXECUTE FUNCTION public.release_schedule_check();

ALTER TABLE public.release_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "release_schedule_read" ON public.release_schedule;
CREATE POLICY "release_schedule_read" ON public.release_schedule FOR SELECT USING (true);
DROP POLICY IF EXISTS "release_schedule_auth_all" ON public.release_schedule;
CREATE POLICY "release_schedule_auth_all" ON public.release_schedule FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 2) 商品欄位：是否逐日釋放、活動總量
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS release_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS release_total   integer;

-- 3) 今天的累計開放百分比；沒有設定回傳 NULL（＝不限制）
CREATE OR REPLACE FUNCTION public.release_cum_pct()
RETURNS numeric AS $$
DECLARE
  s public.release_schedule%ROWTYPE;
  n integer;
  d integer;
  c numeric := 0;
  k integer;
BEGIN
  SELECT * INTO s FROM public.release_schedule WHERE id = 'main';
  IF NOT FOUND THEN RETURN NULL; END IF;
  n := jsonb_array_length(s.weights);
  IF n < 1 THEN RETURN NULL; END IF;
  d := ((now() AT TIME ZONE 'Asia/Taipei')::date - s.start_date) + 1;
  IF d < 1 THEN d := 1; END IF;
  IF d >= n THEN RETURN 100; END IF;
  FOR k IN 0 .. d - 1 LOOP
    c := c + (s.weights->>k)::numeric;
  END LOOP;
  RETURN c;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 4) 某商品今天還能賣幾件；NULL = 不受逐日釋放限制
CREATE OR REPLACE FUNCTION public.release_available(
  p_stock integer, p_total integer, p_enabled boolean
)
RETURNS integer AS $$
DECLARE
  pct  numeric;
  cum  integer;
  sold integer;
BEGIN
  IF NOT COALESCE(p_enabled, false) OR p_total IS NULL OR p_stock IS NULL OR p_stock = -1 THEN
    RETURN NULL;
  END IF;
  pct := public.release_cum_pct();
  IF pct IS NULL THEN RETURN NULL; END IF;
  cum  := floor(p_total * pct / 100)::integer;
  sold := GREATEST(0, p_total - p_stock);
  RETURN GREATEST(0, LEAST(p_stock, cum - sold));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 5) 給前台顧客頁讀取「今日可買數量」
CREATE OR REPLACE FUNCTION public.product_release_availability()
RETURNS TABLE (product_id uuid, available integer) AS $$
  SELECT p.id, public.release_available(p.stock, p.release_total, p.release_enabled)
  FROM public.products p
  WHERE p.release_enabled
    AND public.release_available(p.stock, p.release_total, p.release_enabled) IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.product_release_availability() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cum_pct()              TO anon, authenticated;

-- 6) 下單扣庫存：多檢查「今日開放數量」（FOR UPDATE 已確保同時下單不會超賣）
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
