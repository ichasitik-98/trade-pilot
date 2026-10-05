/**
 * Prisma Client Singleton for Server-Side Database Operations
 *
 * Guarantees a single resilient connection pool instance across hot reloads in development
 * and enforces server-side isolation (never imported on the client).
 * Configured specifically for Neon PostgreSQL serverless pooling with TCP keepalives,
 * silent idle-connection recycling, and automatic query retry resilience.
 */

import { PrismaClient } from '@prisma/client';

function getResilientDatabaseUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;

  try {
    const parsed = new URL(rawUrl);

    // Neon & PgBouncer serverless connection tuning
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '5');
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '30');
    }
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '30');
    }
    // TCP keepalives to prevent premature idle socket drops
    if (!parsed.searchParams.has('keepalives')) {
      parsed.searchParams.set('keepalives', '1');
    }
    if (!parsed.searchParams.has('keepalives_idle')) {
      parsed.searchParams.set('keepalives_idle', '30');
    }
    if (!parsed.searchParams.has('keepalives_interval')) {
      parsed.searchParams.set('keepalives_interval', '10');
    }
    if (!parsed.searchParams.has('keepalives_count')) {
      parsed.searchParams.set('keepalives_count', '3');
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

function isTransientConnectionError(err: any): boolean {
  const msg = err?.message || String(err);
  return (
    msg.includes('Closed') ||
    msg.includes('kind: Closed') ||
    msg.includes('connection closed') ||
    msg.includes("Can't reach database server") ||
    msg.includes('Connection lost') ||
    msg.includes('server closed the connection') ||
    msg.includes('Connection reset by peer') ||
    msg.includes('Engine is not yet connected') ||
    err?.code === 'P1001' ||
    err?.code === 'P1002' ||
    err?.code === 'P1008' ||
    err?.code === 'P1017'
  );
}

function createPrismaClient() {
  const datasourceUrl = getResilientDatabaseUrl();
  const rawClient = new PrismaClient({
    datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
    // Emit logs as events so benign Neon serverless idle-connection closures
    // do not print noisy `prisma:error Error { kind: Closed }` to stderr
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

  rawClient.$on('error', (e) => {
    const msg = e.message || '';
    // Neon serverless compute & PgBouncer close idle TCP connections automatically;
    // suppress stderr noise for idle closures since queries transparently reconnect.
    if (
      msg.includes('kind: Closed') ||
      msg.includes('Closed') ||
      msg.includes('connection closed') ||
      msg.includes('Connection reset by peer') ||
      msg.includes('terminating connection')
    ) {
      return;
    }
    console.warn('[Prisma Database Notice]:', msg);
  });

  // Attach retry & auto-reconnect extension for both model queries and raw queries
  return rawClient.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        let attempts = 0;
        const maxRetries = 3;
        while (true) {
          try {
            return await query(args);
          } catch (err: any) {
            attempts++;
            if (attempts <= maxRetries && isTransientConnectionError(err)) {
              const target = model ? `${String(model)}.${operation}` : operation;
              console.info(
                `[Prisma] Reconnecting idle Neon connection on ${target} (attempt ${attempts}/${maxRetries})...`
              );
              await rawClient.$disconnect().catch(() => {});
              await rawClient.$connect().catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 150 * Math.pow(2, attempts)));
              continue;
            }
            throw err;
          }
        }
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
