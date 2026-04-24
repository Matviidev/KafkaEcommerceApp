import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/orders': 'http://localhost:3001',
      '/events': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/analytics': 'http://localhost:3004',
      '/search': 'http://localhost:3005',
    },
  },
});
