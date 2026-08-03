import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
const PROD = 'https://recommendations-worker.mhmudnasr30.workers.dev'
export default defineConfig({
  root: 'client',
  plugins: [preact()],
  server: {
    port: 5174,
    proxy: {
      '/api': PROD, '/dashboard': PROD, '/recommendations': PROD, '/brain': PROD, '/learning': PROD, '/taste': PROD, '/knowledge': PROD, '/analytics': PROD, '/notes': PROD, '/sessions': PROD, '/collections': PROD, '/capture': PROD, '/settings': PROD, '/srs': PROD,
    },
  },
})
