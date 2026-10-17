import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Keep local API calls same-origin in development. Set VITE_API_BASE_URL only
// when the frontend needs to call a separately hosted API.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
