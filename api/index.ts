import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { apiRouter } from '../server/api/routes.ts';
import { db } from '../server/db/storage.ts';

dotenv.config();

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

let isDbInitialized = false;
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!isDbInitialized) {
      await db.init();
      isDbInitialized = true;
    }
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api', apiRouter);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', app: 'TradePilot', timestamp: new Date().toISOString() });
});

app.get('/api/health/database', async (_req: Request, res: Response) => {
  try {
    const { prisma } = await import('../server/db/prisma.ts');
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', database: 'postgresql' });
  } catch {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failure' });
  }
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err.message);
  const status = err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? 'An unexpected internal server error occurred' : err.message,
  });
});

export default app;
