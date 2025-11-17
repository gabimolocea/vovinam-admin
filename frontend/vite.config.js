import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/static/',  // Set base path for production to match Django STATIC_URL
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
