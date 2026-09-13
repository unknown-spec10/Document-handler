import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  // 'spa' mode: serves index.html for any unmatched route so React handles
  // /admin/search, /admin/user/:id etc. without 404 on direct navigation.
  appType: 'spa',
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // Single rule: everything under /api goes to FastAPI.
      // React routes (/admin, /admin/search, etc.) are untouched.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})



