/**
 * Prisma Client Singleton for Server-Side Database Operations
 *
 * Guarantees a single resilient connection pool instance across hot reloads in development
 * and enforces server-side isolation (never imported on the client).
 * Configured specifically for Neon PostgreSQL serverless pooling with auto-reconnection and retry resilience.
 */

import { PrismaClient } from '@prisma/client';

function getResilientDatabaseUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;

  try {
    const parsed = new URL(rawUrl);

    // Neon & PgBouncer connection tuning
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '5');
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '20');
    }
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '20');
    }
    // Neon AWS PgBouncer pooler requires pgbouncer=true to disable session-level prepared statements
    if (parsed.host.includes('-pooler') && !parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function createPrismaClient() {
  const datasourceUrl = getResilientDatabaseUrl();
  const rawClient = new PrismaClient({
    datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  // Attach retry & auto-reconnect extension for transient Neon serverless connection drops
  return rawClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          let attempts = 0;
          const maxRetries = 3;
          while (true) {
            try {
              return await query(args);
            } catch (err: any) {
              attempts++;
              const msg = err?.message || String(err);
              const isTransientConnectionError =
                msg.includes('Closed') ||
                msg.includes('kind: Closed') ||
                msg.includes('connection closed') ||
                msg.includes("Can't reach database server") ||
                msg.includes('Connection lost') ||
                msg.includes('server closed the connection') ||
                msg.includes('Connection reset by peer');

              if (attempts <= maxRetries && isTransientConnectionError) {
                console.warn(
                  `[Prisma] Transient connection drop on ${String(model)}.${operation}. Reconnecting and retrying (${attempts}/${maxRetries})...`
                );
                await rawClient.$connect().catch(() => {});
                await new Promise((resolve) => setTimeout(resolve, 150 * Math.pow(2, attempts)));
                continue;
              }
              throw err;
            }
          }
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var __tradepilot_prisma__: ExtendedPrismaClient | undefined;
}

export const prisma = globalThis.__tradepilot_prisma__ || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__tradepilot_prisma__ = prisma;
}

export default prisma;
