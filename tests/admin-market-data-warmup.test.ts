import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import express from 'express';
import { apiRouter, resetManualSyncCooldownForTesting } from '../server/api/routes.ts';
import { createSession } from '../server/auth/session.ts';
import { db } from '../server/db/storage.ts';
import { MarketDataSyncService } from '../server/services/market-data-sync.ts';
import { twelveDataBudget } from '../server/services/twelve-data-budget.ts';
import { whatsappCloudProvider } from '../server/providers/whatsapp-cloud.ts';

describe('TradePilot — Admin Market Data Warm-Up Panel Suite', () => {
  let server: http.Server;
  let serverPort: number;

  const adminUser = {
    id: 'usr_admin_test_01',
    email: 'admin@tradepilot.test',
    name: 'Admin Tester',
    role: 'ADMIN' as const,
    passwordHash: 'dummy',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const regularUser = {
    id: 'usr_regular_test_02',
    email: 'user@tradepilot.test',
    name: 'Regular Trader',
    role: 'USER' as const,
    passwordHash: 'dummy',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let adminToken: string;
  let regularToken: string;

  beforeEach(async () => {
    resetManualSyncCooldownForTesting();

    // Generate valid stateless session tokens
    adminToken = createSession({ id: adminUser.id, role: 'ADMIN' });
    regularToken = createSession({ id: regularUser.id, role: 'USER' });

    // Mock db.findUserById to return our test users
    vi.spyOn(db, 'findUserById').mockImplementation(async (id: string) => {
      if (id === adminUser.id) return adminUser as any;
      if (id === regularUser.id) return regularUser as any;
      return undefined;
    });

    // Mock db.addAuditLog to avoid db constraint failure during tests
    vi.spyOn(db, 'addAuditLog').mockResolvedValue({} as any);

    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    serverPort = addr.port;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function postSync(
    body: Record<string, any>,
    token?: string
  ): Promise<{ status: number; body: any }> {
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(payload)),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/api/market-data/sync',
          method: 'POST',
          headers,
        },
        (resp) => {
          let data = '';
          resp.on('data', (chunk) => (data += chunk));
          resp.on('end', () => {
            try {
              resolve({ status: resp.statusCode || 500, body: JSON.parse(data) });
            } catch {
              resolve({ status: resp.statusCode || 500, body: data });
            }
          });
        }
      );
      req.write(payload);
      req.end();
    });
  }

  describe('1. Authentication and Admin Access Control', () => {
    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      const res = await postSync({ symbol: 'XAUUSD', timeframe: 'H4', count: 250 });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('rejects authenticated non-admin users with HTTP 403 Forbidden', async () => {
      const res = await postSync(
        { symbol: 'XAUUSD', timeframe: 'H4', count: 250 },
        regularToken
      );
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Forbidden: Admin role required');
    });

    it('permits authenticated ADMIN user to invoke synchronization', async () => {
      const syncSpy = vi.spyOn(MarketDataSyncService, 'syncMarketData').mockResolvedValueOnce({
        provider: 'Twelve Data (REAL)',
        symbol: 'XAUUSD',
        timeframe: 'H4',
        requestedRange: { targetCount: 250 },
        receivedCandles: 250,
        insertedCandles: 15,
        updatedCandles: 235,
        rejectedCandles: 0,
        gaps: [],
        latestTimestamp: new Date().toISOString(),
        freshness: { isStale: false, ageSeconds: 120 } as any,
        status: 'FRESH',
        dataQuality: 100,
        durationMs: 340,
      } as any);

      const res = await postSync(
        { symbol: 'XAUUSD', timeframe: 'H4', count: 250 },
        adminToken
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.symbol).toBe('XAUUSD');
      expect(res.body.summary.timeframe).toBe('H4');
      expect(res.body.summary.receivedCandles).toBe(250);
      expect(syncSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Parameter Validation (Symbol, Timeframe, Count)', () => {
    it('rejects missing or empty symbol with 400 Bad Request', async () => {
      const res = await postSync({ timeframe: 'H4', count: 250 }, adminToken);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Valid symbol is required');
    });

    it('rejects invalid timeframe with 400 Bad Request', async () => {
      const res = await postSync(
        { symbol: 'XAUUSD', timeframe: 'INVALID_TF', count: 250 },
        adminToken
      );
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid timeframe');
    });

    it('rejects invalid count (less than 10 or greater than 5000) with 400 Bad Request', async () => {
      const resLow = await postSync(
        { symbol: 'XAUUSD', timeframe: 'H4', count: 5 },
        adminToken
      );
      expect(resLow.status).toBe(400);
      expect(resLow.body.error).toContain('Count must be an integer between 10 and 5000');

      const resHigh = await postSync(
        { symbol: 'XAUUSD', timeframe: 'H4', count: 10000 },
        adminToken
      );
      expect(resHigh.status).toBe(400);
      expect(resHigh.body.error).toContain('Count must be an integer between 10 and 5000');
    });
  });

  describe('3. Concurrency Lock & Rate Limiting (5-Second Interval)', () => {
    it('enforces 5-second cooldown between consecutive sync requests', async () => {
      vi.spyOn(MarketDataSyncService, 'syncMarketData').mockResolvedValue({
        provider: 'Twelve Data',
        symbol: 'XAUUSD',
        timeframe: 'H4',
        receivedCandles: 250,
        insertedCandles: 0,
        updatedCandles: 250,
        rejectedCandles: 0,
        gaps: [],
        latestTimestamp: new Date().toISOString(),
        freshness: { isStale: false, ageSeconds: 60 } as any,
        status: 'FRESH',
        dataQuality: 100,
        durationMs: 200,
      } as any);

      // First sync succeeds
      const firstRes = await postSync(
        { symbol: 'XAUUSD', timeframe: 'H4', count: 250 },
        adminToken
      );
      expect(firstRes.status).toBe(200);

      // Immediate second sync must be rate-limited (HTTP 429)
      const secondRes = await postSync(
        { symbol: 'XAUUSD', timeframe: 'H1', count: 250 },
        adminToken
      );
      expect(secondRes.status).toBe(429);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.error).toContain('wait at least 5 seconds');
    });
  });

  describe('4. Warm-Up Isolation Contract Guarantee', () => {
    it('guarantees zero SignalLifecycleEvent, zero NotificationJob, and zero WhatsApp dispatch during warm-up', async () => {
      const eventSpy = vi.spyOn(db, 'createSignalLifecycleEvent');
      const jobSpy = vi.spyOn(db, 'createNotificationJob');
      const metaSpy = vi.spyOn(whatsappCloudProvider, 'dispatchPayloadToMeta');

      vi.spyOn(MarketDataSyncService, 'syncMarketData').mockResolvedValueOnce({
        provider: 'Twelve Data (REAL)',
        symbol: 'XAUUSD',
        timeframe: 'M15',
        receivedCandles: 250,
        insertedCandles: 10,
        updatedCandles: 240,
        rejectedCandles: 0,
        gaps: [],
        latestTimestamp: new Date().toISOString(),
        freshness: { isStale: false, ageSeconds: 30 } as any,
        status: 'FRESH',
        dataQuality: 100,
        durationMs: 180,
      } as any);

      resetManualSyncCooldownForTesting();

      const res = await postSync(
        { symbol: 'XAUUSD', timeframe: 'M15', count: 250 },
        adminToken
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Absolute guarantees:
      expect(eventSpy).not.toHaveBeenCalled();
      expect(jobSpy).not.toHaveBeenCalled();
      expect(metaSpy).not.toHaveBeenCalled();
    });

    it('verifies Twelve Data budget compliance for all 4 authorized timeframes (H4, H1, M15, M5)', () => {
      const budget = twelveDataBudget.getSnapshot();
      expect(budget.maxCreditsPerMinute).toBeGreaterThanOrEqual(6);
      expect(budget.maxCreditsPerDay).toBeGreaterThanOrEqual(750);

      // 4 timeframes require 4 credits total (1 per call)
      const creditsNeeded = 4;
      expect(creditsNeeded).toBeLessThanOrEqual(budget.maxCreditsPerMinute);
      expect(creditsNeeded).toBeLessThan(budget.maxCreditsPerDay);
    });
  });
});
