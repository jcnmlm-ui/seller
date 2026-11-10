-- ============================================================
-- 16 · 攤位收款前：直接調整（減少）待收款訂單的品項數量
-- 請在 Supabase > SQL Editor 整段貼上執行（可重複執行）
-- 用途：客人在櫃檯口頭說要減少某品項，收銀人員不用請客人重新下單
-- 規則：只限「待收款(pending)」訂單、只能減少不能增加；減少的數量會回補庫存；
--       調整前後的品項與金額會記在 orders.edit_log
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS edit_log jsonb NOT NULL DEFAULT '[]'::jsonb;

-- p_items 格式：[{"order_item_id":"<uuid>","qty":調整後的數量}]，qty = 0 代表移除該品項
CREATE OR REPLACE FUNCTION public.reduce_pending_order(
  p_order_id uuid,
  p_items    jsonb
)
RETURNS json AS $$
DECLARE
  o          public.orders%ROWTYPE;
  it         public.order_items%ROWTYPE;
  r          record;
  v_new      integer;
  v_diff     integer;
  v_delta    numeric := 0;
  v_changes  jsonb   := '[]'::jsonb;
  v_left     integer;
  v_restore  boolean;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '查無此訂單'; END IF;
  IF o.status <> 'pending' THEN
    RAISE EXCEPTION '訂單狀態為「%」，只有待收款訂單可以直接調整數量（已收款請用退貨／退款）', o.status;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION '沒有任何數量變更';
  END IF;

  v_restore := COALESCE(o.source, 'online') <> 'booth_cashier';

  FOR r IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_new := (r.value->>'qty')::integer;
    IF v_new IS NULL OR v_new < 0 THEN RAISE EXCEPTION '數量錯誤'; END IF;

    SELECT * INTO it FROM public.order_items
    WHERE id = (r.value->>'order_item_id')::uuid AND order_id = p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '品項不屬於此訂單'; END IF;
    IF v_new > it.quantity THEN
      RAISE EXCEPTION '「%」只能減少數量，不能增加（原 % 件）', it.product_name, it.quantity;
    END IF;

    v_diff := it.quantity - v_new;
    IF v_diff = 0 THEN CONTINUE; END IF;

    v_delta   := v_delta + it.unit_price * v_diff;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'product_name', it.product_name, 'from', it.quantity, 'to', v_new, 'unit_price', it.unit_price));

    IF v_new = 0 THEN
      DELETE FROM public.order_items WHERE id = it.id;
    ELSE
      UPDATE public.order_items SET quantity = v_new WHERE id = it.id;
    END IF;

    -- 回補庫存（預購下單時已扣庫存；stock = -1 為無限庫存不動；原本因庫存 0 自動下架的商品重新上架）
    IF v_restore AND it.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock        = stock + v_diff,
          is_available = CASE WHEN stock <= 0 THEN true ELSE is_available END
      WHERE id = it.product_id AND stock <> -1;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_changes) = 0 THEN
    RAISE EXCEPTION '沒有任何數量變更';
  END IF;

  SELECT COUNT(*) INTO v_left FROM public.order_items WHERE order_id = p_order_id;
  IF v_left = 0 THEN
    RAISE EXCEPTION '至少需保留一項商品（若整筆不要了，請客人不要付款，或改走後台處理）';
  END IF;

  UPDATE public.orders
  SET total_amount = total_amount - v_delta,
      edit_log     = COALESCE(edit_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'at',         now(),
        'operator',   COALESCE(auth.jwt() ->> 'email', ''),
        'changes',    v_changes,
        'from_total', o.total_amount,
        'to_total',   o.total_amount - v_delta))
  WHERE id = p_order_id;

  RETURN json_build_object('success', true, 'new_total', o.total_amount - v_delta);
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.reduce_pending_order(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reduce_pending_order(uuid, jsonb) TO authenticated;
