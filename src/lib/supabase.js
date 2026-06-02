import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('⚠️  缺少 Supabase 環境變數，請確認 .env 檔案設定正確')
}

export const supabase = createClient(url, key, {
  realtime: { params: { eventsPerSecond: 10 } },
})
