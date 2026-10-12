import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/api/routes.ts';
import { db } from './server/db/storage.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Warm up persistent database asynchronously so port 3000 binds immediately
  db.init()
    .then(() => {
      if ((process.env.ALERT_SCHEDULER_ENABLED || 'false').toLowerCase() === 'true') {
        const intervalSec = Math.max(60, Number(process.env.ALERT_SCHEDULER_INTERVAL_SEC || 300));
        console.log(`[AlertScheduler] Background Dual-Stage Signal evaluation enabled every ${intervalSec}s`);
        setInterval(async () => {
          try {
            const { DualStageSignalAlertService } = await import('./server/services/dual-stage-signal-alert.ts');
            await DualStageSignalAlertService.runEvaluationCycle({ triggerSource: 'SCHEDULER' });
          } catch (schedErr: any) {
            console.warn('[AlertScheduler] Background cycle error:', schedErr.message);
          }
        }, intervalSec * 1000);
      }
    })
    .catch((err) => {
      console.warn('[Server Startup] Initial database warm-up deferred:', err.message);
    });

  // API router
  app.use('/api', apiRouter);

  // Health endpoints
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', app: 'TradePilot', timestamp: new Date().toISOString() });
  });

  app.get('/api/health/database', async (req: Request, res: Response) => {
    try {
      const { prisma } = await import('./server/db/prisma.ts');
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'healthy', database: 'postgresql' });
    } catch (err: any) {
      res.status(503).json({ status: 'unhealthy', error: 'Database connection failure' });
    }
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Server error:', err.message);
    const status = err.statusCode || 500;
    res.status(status).json({
      error: status === 500 ? 'An unexpected internal server error occurred' : err.message,
    });
  });

  let httpServer: any;
  if (!isProduction) {
    const http = await import('http');
    httpServer = http.createServer(app);

    // Attach Vite Dev Server middleware and HMR WebSocket upgrade handler to the shared HTTP server
    const hmrClientPort = process.env.HMR_CLIENT_PORT
      ? parseInt(process.env.HMR_CLIENT_PORT, 10)
      : undefined;
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
          protocol: (process.env.HMR_PROTOCOL as 'ws' | 'wss' | undefined) || undefined,
          host: process.env.HMR_HOST || undefined,
          clientPort: hmrClientPort,
          path: process.env.HMR_PATH || undefined,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`TradePilot Server is active on http://0.0.0.0:${PORT}`);
    });
  } else {
    // Serve production static build
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`TradePilot Server is active on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
