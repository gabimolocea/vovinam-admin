import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/static/' : '/',  // Use /static/ only in production
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
