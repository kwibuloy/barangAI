import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:8000', rewrite: path => path.replace(/^\/api/, '') } } },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], testTimeout: 20_000 },
})
