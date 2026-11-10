-- ============================================================
-- 14 · 攤位收款後「退貨 / 退款」功能
-- 請在 Supabase > SQL Editor 整段貼上執行（可重複執行）
-- 內容：
--   1. orders.status 新增 'refunded'（整筆退款）
--   2. orders.refunded_amount（累計退款金額）
--   3. order_refunds 退款紀錄表（稽核用，不會被刪除）
--   4. refund_order() 函數：一次完成「扣品項、改金額、回補庫存、寫紀錄」
-- ============================================================

-- 1) 狀態允許 'refunded'（先找出舊的 status CHECK 並移除，再重建）
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
  CHECK (status IN ('pending','paid','picking','packed','shipped','delivered','refunded'));

-- 2) 累計退款金額
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2) NOT NULL DEFAULT 0;

-- 3) 退款紀錄表
CREATE TABLE IF NOT EXISTS public.order_refunds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_no        text NOT NULL,
  refund_type     text NOT NULL CHECK (refund_type IN ('partial','full')),
  items           jsonb NOT NULL,              -- [{product_name, qty, unit_price, stamp_amount}]
  refund_total    numeric(10,2) NOT NULL,      -- 實退總額
  refund_invoice  numeric(10,2) NOT NULL,      -- 其中發票金額
  refund_stamp    numeric(10,2) NOT NULL,      -- 其中郵票金額
  payment_method  text,                        -- 原付款方式
  refund_ref      text,                        -- 刷退單號 / 備註
  reason          text,
  operator        text,
  stock_restored  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_refunds_order   ON public.order_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_created ON public.order_refunds(created_at DESC);

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_refunds_auth_select" ON public.order_refunds;
DROP POLICY IF EXISTS "order_refunds_auth_insert" ON public.order_refunds;
CREATE POLICY "order_refunds_auth_select" ON public.order_refunds
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "order_refunds_auth_insert" ON public.order_refunds
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 4) 退款函數（整段在同一個交易內，失敗會全部還原）
-- p_items 格式：[{"order_item_id":"<uuid>","qty":1}, ...]
CREATE OR REPLACE FUNCTION public.refund_order(
  p_order_id uuid,
  p_items    jsonb,
  p_ref      text DEFAULT NULL,
  p_reason   text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  o            public.orders%ROWTYPE;
  it           public.order_items%ROWTYPE;
  r            record;
  v_qty        integer;
  v_total      numeric := 0;
  v_stamp      numeric := 0;
  v_snap       jsonb   := '[]'::jsonb;
  v_restore    boolean;
  v_left       integer;
  v_new_status text;
  v_type       text;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '查無此訂單'; END IF;

  IF o.status NOT IN ('paid','picking','packed') THEN
    RAISE EXCEPTION '訂單狀態為「%」，無法在攤位退款', o.status;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION '請選擇要退貨的品項';
  END IF;

  -- 現場收銀台訂單當初沒有扣庫存，所以不回補；預購訂單才回補
  v_restore := COALESCE(o.source, 'online') <> 'booth_cashier';

  FOR r IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := (r.value->>'qty')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION '退貨數量錯誤'; END IF;

    SELECT * INTO it FROM public.order_items
    WHERE id = (r.value->>'order_item_id')::uuid AND order_id = p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '品項不屬於此訂單，或已被退完'; END IF;
    IF v_qty > it.quantity THEN
      RAISE EXCEPTION '「%」退貨數量（%）超過可退數量（%）', it.product_name, v_qty, it.quantity;
    END IF;

    v_total := v_total + it.unit_price * v_qty;
    v_stamp := v_stamp + COALESCE(it.stamp_amount, 0) * v_qty;
    v_snap  := v_snap || jsonb_build_array(jsonb_build_object(
      'product_name', it.product_name,
      'qty',          v_qty,
      'unit_price',   it.unit_price,
      'stamp_amount', COALESCE(it.stamp_amount, 0)
    ));

    IF v_qty = it.quantity THEN
      DELETE FROM public.order_items WHERE id = it.id;
    ELSE
      UPDATE public.order_items SET quantity = quantity - v_qty WHERE id = it.id;
    END IF;

    -- 回補庫存（stock = -1 為無限庫存，不動；原本因庫存 0 被自動下架的商品會重新上架）
    IF v_restore AND it.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock        = stock + v_qty,
          is_available = CASE WHEN stock <= 0 THEN true ELSE is_available END
      WHERE id = it.product_id AND stock <> -1;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_left FROM public.order_items WHERE order_id = p_order_id;
  IF v_left = 0 THEN v_new_status := 'refunded'; v_type := 'full';
  ELSE v_new_status := o.status;                 v_type := 'partial';
  END IF;

  UPDATE public.orders
  SET total_amount    = total_amount - v_total,
      refunded_amount = COALESCE(refunded_amount, 0) + v_total,
      status          = v_new_status
  WHERE id = p_order_id;

  INSERT INTO public.order_refunds
    (order_id, order_no, refund_type, items, refund_total, refund_invoice, refund_stamp,
     payment_method, refund_ref, reason, operator, stock_restored)
  VALUES
    (p_order_id, o.order_no, v_type, v_snap, v_total, v_total - v_stamp, v_stamp,
     o.payment_method, NULLIF(trim(p_ref), ''), NULLIF(trim(p_reason), ''),
     COALESCE(auth.jwt() ->> 'email', ''), v_restore);

  RETURN json_build_object(
    'success',        true,
    'refund_total',   v_total,
    'refund_stamp',   v_stamp,
    'new_total',      o.total_amount - v_total,
    'new_status',     v_new_status
  );
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.refund_order(uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_order(uuid, jsonb, text, text) TO authenticated;
