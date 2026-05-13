import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/yoga-playlist-planner/' : '/',
  plugins: [react()],
  server: {
    port: 5174,
    host: '127.0.0.1',
  },
}))
