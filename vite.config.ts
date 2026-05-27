import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 앱(/ilgampack)과 별도 포트로 동시 구동 가능하도록 5174 사용
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      // /api/* 요청을 백엔드(localhost:3000) 로 그대로 전달
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4174,
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-xlsx': ['xlsx'],
          'vendor-exceljs': ['exceljs'],
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
