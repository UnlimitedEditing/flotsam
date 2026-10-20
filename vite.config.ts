import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node' },
  server: {
    // app.graydient.ai sends no CORS headers (verified 2026-10-20), so dev goes through this proxy.
    proxy: {
      '/gd': {
        target: 'https://app.graydient.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gd/, '/api/v3'),
      },
    },
  },
})
