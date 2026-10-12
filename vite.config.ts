import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const hmrClientPort = process.env.HMR_CLIENT_PORT
    ? parseInt(process.env.HMR_CLIENT_PORT, 10)
    : undefined;
  const extraAllowedHosts = (process.env.NG_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

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
      allowedHosts: ['.run.app', 'localhost', '127.0.0.1', ...extraAllowedHosts],
      hmr: {
        protocol: (process.env.HMR_PROTOCOL as 'ws' | 'wss' | undefined) || undefined,
        host: process.env.HMR_HOST || undefined,
        clientPort: hmrClientPort,
        path: process.env.HMR_PATH || undefined,
      },
      watch: {},
    },
  };
});
