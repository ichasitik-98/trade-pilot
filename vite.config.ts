import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const isHttps = process.env.APP_URL?.startsWith('https');
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      port,
      host: true,
      strictPort: false,
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {
              ...(isHttps ? { clientPort: 443 } : {}),
            },
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
