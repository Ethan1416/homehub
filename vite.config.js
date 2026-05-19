import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/homehub/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        scope: '/homehub/',
        start_url: '/homehub/',
        name: 'HomeHub',
        short_name: 'HomeHub',
        description: 'Shared calendar + Claude status for the household',
        theme_color: '#5b6ef5',
        background_color: '#f3f4fb',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Always-online realtime app: prefer network so deploys take effect
        // immediately; cache is only an offline fallback (no stale precache).
        globPatterns: [],
        navigateFallback: null,
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.host.includes('supabase'),
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase', networkTimeoutSeconds: 5 }
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80 }
            }
          }
        ]
      }
    })
  ],
  server: { host: true }
})
