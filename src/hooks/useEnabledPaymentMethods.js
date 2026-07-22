import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_ENABLED_PAYMENT_METHODS } from '../config/store'

// 讀取目前攤位開放收款的付款方式（存在 settings.enabled_payment_methods，
// 可在後台「系統設定」頁面直接開關，不用改程式碼）
export function useEnabledPaymentMethods() {
  const [methods, setMethods] = useState(DEFAULT_ENABLED_PAYMENT_METHODS)

  useEffect(() => {
    supabase
      .from('settings')
      .select('enabled_payment_methods')
      .eq('id', 'main')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.enabled_payment_methods?.length) {
          setMethods(data.enabled_payment_methods)
        }
      })
  }, [])

  return methods
}
