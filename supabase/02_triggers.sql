-- ============================================================
-- 攤位預購系統 — 函數與觸發器
-- 請在 01_schema.sql 之後執行
-- ============================================================

-- 訂單號序列（全域遞增，不依日期重置）
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- 自動產生訂單號的函數
CREATE OR REPLACE FUNCTION generate_order_no()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_no := 'ORD-'
    || to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYYYMMDD')
    || '-'
    || LPAD(nextval('order_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 觸發器：INSERT 時若 order_no 為空則自動生成
CREATE TRIGGER trg_set_order_no
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.order_no IS NULL OR NEW.order_no = '')
  EXECUTE FUNCTION generate_order_no();

-- ============================================================
-- 庫存扣減函數（原子操作，防止超賣）
-- 呼叫方式：SELECT decrement_stock(product_id_array, quantity_array)
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_ids uuid[],
  p_quantities  integer[]
)
RETURNS json AS $$
DECLARE
  i         integer;
  current   integer;
  prod_name text;
BEGIN
  -- 鎖定涉及的商品列（FOR UPDATE 防止並發超賣）
  FOR i IN 1 .. array_length(p_product_ids, 1) LOOP
    SELECT stock, name INTO current, prod_name
    FROM products
    WHERE id = p_product_ids[i]
    FOR UPDATE;

    -- stock = -1 表示無限庫存，跳過
    IF current != -1 THEN
      IF current < p_quantities[i] THEN
        RAISE EXCEPTION '商品「%」庫存不足（剩餘 % 件）', prod_name, current;
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
