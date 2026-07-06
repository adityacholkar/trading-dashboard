import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, proxy API and WebSocket calls to the backend so the app uses the
// same relative URLs it will use in production (where Express serves both).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
})
