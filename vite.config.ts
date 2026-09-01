import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'client',
  plugins: [preact()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/preact/')) return 'preact'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/dashboard': 'http://127.0.0.1:8787',
      '/recommendations': 'http://127.0.0.1:8787',
      '/brain': 'http://127.0.0.1:8787',
      '/learning': 'http://127.0.0.1:8787',
      '/taste': 'http://127.0.0.1:8787',
      '/knowledge': 'http://127.0.0.1:8787',
      '/analytics': 'http://127.0.0.1:8787',
      '/notes': 'http://127.0.0.1:8787',
      '/sessions': 'http://127.0.0.1:8787',
      '/collections': 'http://127.0.0.1:8787',
      '/capture': 'http://127.0.0.1:8787',
      '/settings': 'http://127.0.0.1:8787',
      '/srs': 'http://127.0.0.1:8787',
    },
  },
})
