import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': 'http://localhost:3002',
    },
  },
  optimizeDeps: {
    include: ['jspreadsheet', 'jsuites', 'lemonadejs', 'gridstack', 'highcharts', 'lucide', 'tabularjs'],
  },
})
