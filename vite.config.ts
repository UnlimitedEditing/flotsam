import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// Same proxies for `vite` (dev) and `vite preview` (testing the built PWA locally).
// app.graydient.ai and catbox.moe send no CORS headers (verified 2026-10-20).
const proxy = {
  '/catbox': {
    target: 'https://catbox.moe',
    changeOrigin: true,
    rewrite: () => '/user/api.php',
  },
  '/gd': {
    target: 'https://app.graydient.ai',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/gd/, '/api/v3'),
  },
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new version never reloads the page by itself, so it cannot interrupt a running render.
      registerType: 'prompt',
      injectRegister: false, // registered by src/pwa/register.ts
      includeAssets: ['icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Flotsam',
        short_name: 'Flotsam',
        description: 'An independent client for your Graydient account.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0e1113',
        theme_color: '#0e1113',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache ONLY our own build output (app shell + static assets).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // NO runtime caching, deliberately. API responses, uploads, ModelTrends and generated media
        // (including adult content and M3DS images) must always go to the network and never be written to
        // Cache Storage. src/pwa/sw-guard.test.ts fails the build if this ever changes.
        runtimeCaching: [],
        importScripts: ['sw-notify.js'],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { environment: 'node' },
  server: { proxy },
  preview: { proxy },
})
