import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      // Abaikan folder output backend, uploads, temp, model weights, venv, dan media files
      // Ini krusial agar Vite HMR tidak melakukan auto full-reload saat backend membuat file hasil upscaling
      ignored: [
        '**/output/**',
        '**/.work/**',
        '**/weights/**',
        '**/.venv/**',
        '**/__pycache__/**',
        '**/dist/**',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.png',
        '**/*.webp',
        '**/*.mp4',
        '**/*.mkv',
        '**/*.avi',
        '**/*.zip',
        path.resolve(__dirname, '../output/**'),
        path.resolve(__dirname, '../.work/**'),
        path.resolve(__dirname, '../input/**'),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7860',
        changeOrigin: true,
      },
    },
  },
})

