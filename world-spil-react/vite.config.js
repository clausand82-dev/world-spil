import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Enhver anmodning, der starter med '/world-spil' i vores React-app...
      '/world-spil': {
        // ...skal videresendes til vores XAMPP-server.
        target: 'http://localhost',
        changeOrigin: true, // Nødvendig for at få det til at virke
      }
    }
  }
})