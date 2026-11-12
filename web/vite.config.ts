import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Site do GitHub Pages: https://jd200172.github.io/calouro/
export default defineConfig({
  base: '/calouro/',
  plugins: [react()],
})
