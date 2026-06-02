import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ⚠️ 將 '/booth-shop/' 改成你的 GitHub repo 名稱
// 例如 repo 名稱是 my-shop，就改成 '/my-shop/'
export default defineConfig({
  plugins: [react()],
  base: '/bigvender/',
})
