import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' hace que la web funcione en GitHub Pages sin importar el nombre del repositorio
export default defineConfig({
  base: './',
  plugins: [react()],
})
