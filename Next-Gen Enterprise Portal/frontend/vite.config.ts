import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './test/setup.ts',
      clearMocks: true,
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/');
            if (!normalizedId.includes('node_modules')) return undefined;

            if (normalizedId.includes('/node_modules/react/') || normalizedId.includes('/node_modules/react-dom/') || normalizedId.includes('/node_modules/scheduler/')) {
              return 'vendor-react';
            }
            if (
              normalizedId.includes('/node_modules/lucide-react')
            ) {
              return 'vendor-icons';
            }
            if (
              normalizedId.includes('/node_modules/i18next/') ||
              normalizedId.includes('/node_modules/react-i18next/') ||
              normalizedId.includes('/node_modules/dayjs/')
            ) {
              return 'vendor-i18n';
            }
            if (normalizedId.includes('/node_modules/recharts')) return 'vendor-charts';
            if (normalizedId.includes('/node_modules/react-markdown') || normalizedId.includes('/node_modules/remark-gfm')) {
              return 'vendor-markdown';
            }
            if (normalizedId.includes('/node_modules/axios/')) return 'vendor-network';
            if (normalizedId.includes('/node_modules/jsencrypt/')) return 'vendor-crypto';
            if (normalizedId.includes('/node_modules/agentation/')) return 'vendor-agentation';
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
