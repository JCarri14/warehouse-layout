import { seoPlugin } from './seo/plugin.mjs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seoPlugin()],
  build: { manifest: true },
})

