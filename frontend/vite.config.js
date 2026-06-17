import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('react-dom') || id.includes('/react/')) {
            return 'react-vendor'
          }

          if (id.includes('/three/')) {
            return 'three-vendor'
          }

          if (id.includes('/echarts/')) {
            return 'echarts-vendor'
          }

          if (id.includes('/mqtt/')) {
            return 'mqtt-vendor'
          }

          return 'vendor'
        }
      }
    }
  }
})
