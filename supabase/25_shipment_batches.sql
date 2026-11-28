-- ============================================================
-- 25：託運單匯出批次紀錄（EZpost／哈雷）
-- 用途：後台「託運單」功能匯出檔案時，記下這一批有哪些訂單、順序、當時的收件資料，
--       之後匯入 EZpost 執據 PDF／哈雷回傳檔時，靠它把託運單號對回訂單。
-- 在 Supabase SQL Editor 執行即可（可重複執行）。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shipment_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind IN ('ezpost','harley')),
  operator    text,
  rows        jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_shipment_batches_created ON public.shipment_batches(created_at DESC);

ALTER TABLE public.shipment_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipment_batches_auth_all" ON public.shipment_batches;
CREATE POLICY "shipment_batches_auth_all" ON public.shipment_batches
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
