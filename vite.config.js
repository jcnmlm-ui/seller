import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/seller/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // service worker 範圍對應 GitHub Pages 的 /seller/ 路徑
      scope: '/seller/',
      base: '/seller/',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],

      manifest: {
        name: '高雄郵局 攤位預購系統',
        short_name: '攤位預購',
        description: '高雄郵局攤位預購與出貨管理',
        theme_color: '#ef4444',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/seller/#/admin',
        scope: '/seller/',
        icons: [
          {
            src: '/seller/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/seller/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      workbox: {
        // 預先快取所有 build 產出的靜態資源
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Supabase API 用 NetworkFirst（優先用網路，離線才用快取）
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 小時
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
})
