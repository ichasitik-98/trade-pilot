import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import express from 'express';
import { timingSafeCompare, verifyQStashSignature, authenticateSchedulerRequest } from '../server/auth/scheduler-auth.ts';
import { db } from '../server/db/storage.ts';
import { DualStageSignalAlertService } from '../server/services/dual-stage-signal-alert.ts';
import { MarketDataSyncService } from '../server/services/market-data-sync.ts';
import { whatsappCloudProvider } from '../server/providers/whatsapp-cloud.ts';
import { apiRouter } from '../server/api/routes.ts';

// Helper to generate real QStash HS256 JWT signatures for testing
function generateTestQStashSignature(params: {
  key: string;
  body: string;
  url: string;
  expired?: boolean;
}): string {
  const bodyHash = crypto.createHash('sha256').update(params.body).digest('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'Upstash',
      sub: params.url,
      body: bodyHash,
      exp: params.expired ? nowSec - 30 : nowSec + 300,
      nbf: nowSec - 10,
    })
  ).toString('base64url');

  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', params.key).update(data).digest('base64url');
  return `${data}.${sig}`;
}

describe('TRADEPILOT — UPGRADE #SCHEDULER-SECURITY SUITE', () => {
  const testCurrentKey = 'sig_test_current_key_8837429104857201';
  const testNextKey = 'sig_test_next_key_9948572018374829';
  const testCronSecret = 'cron_secret_test_abcdef1234567890';
  const targetUrl = 'https://trade-pilot-sage.vercel.app/api/alerts/cron';

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = testCurrentKey;
    process.env.QSTASH_NEXT_SIGNING_KEY = testNextKey;
    process.env.QSTASH_EXPECTED_URL = targetUrl;
    process.env.CRON_SECRET = testCronSecret;
    process.env.QSTASH_SCHEDULER_ENABLED = 'false';
    process.env.ALERT_SCHEDULER_ENABLED = 'false';
    process.env.WHATSAPP_SAFE_TEST_MODE = 'true';
    process.env.MARKET_DATA_MODE = 'REAL';
  });

  afterEach(() => {
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    delete process.env.QSTASH_EXPECTED_URL;
    delete process.env.CRON_SECRET;
    delete process.env.QSTASH_SCHEDULER_ENABLED;
    delete process.env.ALERT_SCHEDULER_ENABLED;
    delete process.env.WHATSAPP_SAFE_TEST_MODE;
    vi.restoreAllMocks();
  });

  describe('1. Constant-Time Comparison (timingSafeCompare)', () => {
    it('returns true for matching secrets', () => {
      expect(timingSafeCompare('secret_abc_123', 'secret_abc_123')).toBe(true);
      expect(timingSafeCompare(testCronSecret, testCronSecret)).toBe(true);
    });

    it('returns false for mismatching secrets with same length', () => {
      expect(timingSafeCompare('secret_abc_123', 'secret_abc_124')).toBe(false);
    });

    it('returns false for secrets with different lengths', () => {
      expect(timingSafeCompare('short', 'much_longer_secret')).toBe(false);
      expect(timingSafeCompare('short', '')).toBe(false);
    });

    it('returns false safely when input is null or undefined', () => {
      expect(timingSafeCompare(null, 'secret')).toBe(false);
      expect(timingSafeCompare('secret', undefined)).toBe(false);
      expect(timingSafeCompare(null, null)).toBe(false);
    });
  });

  describe('2. QStash Signature Verification (verifyQStashSignature)', () => {
    it('verifies a valid QStash signature generated with current signing key', async () => {
      const body = JSON.stringify({ symbol: 'XAUUSD' });
      const signature = generateTestQStashSignature({
        key: testCurrentKey,
        body,
        url: targetUrl,
      });

      const res = await verifyQStashSignature({
        signature,
        rawBody: body,
        url: targetUrl,
      });

      expect(res.valid).toBe(true);
    });

    it('verifies a valid QStash signature generated with next signing key (key rotation support)', async () => {
      const body = JSON.stringify({ symbol: 'XAUUSD' });
      const signature = generateTestQStashSignature({
        key: testNextKey,
        body,
        url: targetUrl,
      });

      const res = await verifyQStashSignature({
        signature,
        rawBody: body,
        url: targetUrl,
      });

      expect(res.valid).toBe(true);
    });

    it('rejects a signature generated with an unknown/untrusted key', async () => {
      const body = JSON.stringify({ symbol: 'XAUUSD' });
      const signature = generateTestQStashSignature({
        key: 'attacker_fake_key_99999999999999',
        body,
        url: targetUrl,
      });

      const res = await verifyQStashSignature({
        signature,
        rawBody: body,
        url: targetUrl,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toBeDefined();
    });

    it('rejects a signature if body was tampered with', async () => {
      const originalBody = JSON.stringify({ symbol: 'XAUUSD' });
      const tamperedBody = JSON.stringify({ symbol: 'BTCUSD' });

      const signature = generateTestQStashSignature({
        key: testCurrentKey,
        body: originalBody,
        url: targetUrl,
      });

      const res = await verifyQStashSignature({
        signature,
        rawBody: tamperedBody,
        url: targetUrl,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('body hash does not match');
    });

    it('rejects an expired QStash signature', async () => {
      const body = JSON.stringify({ symbol: 'XAUUSD' });
      const signature = generateTestQStashSignature({
        key: testCurrentKey,
        body,
        url: targetUrl,
        expired: true,
      });

      const res = await verifyQStashSignature({
        signature,
        rawBody: body,
        url: targetUrl,
      });

      expect(res.valid).toBe(false);
    });

    it('rejects when QStash keys are missing from environment', async () => {
      delete process.env.QSTASH_CURRENT_SIGNING_KEY;
      delete process.env.QSTASH_NEXT_SIGNING_KEY;

      const body = JSON.stringify({ symbol: 'XAUUSD' });
      const signature = generateTestQStashSignature({
        key: testCurrentKey,
        body,
        url: targetUrl,
      });

      const res = await verifyQStashSignature({
        signature,
        rawBody: body,
        url: targetUrl,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('QStash signing keys are not configured');
    });
  });

  describe('3. Scheduler Authentication & Feature Flag Gate (authenticateSchedulerRequest)', () => {
    it('rejects requests without any signature or CRON_SECRET header (401)', async () => {
      const mockReq: any = {
        headers: {},
        body: {},
        get: () => 'trade-pilot-sage.vercel.app',
        protocol: 'https',
        originalUrl: '/api/alerts/cron',
      };

      const result = await authenticateSchedulerRequest(mockReq);
      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toContain('Unauthorized');
    });

    it('rejects requests with forged/invalid QStash signature (401)', async () => {
      const mockReq: any = {
        headers: {
          'upstash-signature': 'invalid.forged.jwt.token',
        },
        body: {},
        rawBody: '{}',
        get: () => 'trade-pilot-sage.vercel.app',
        protocol: 'https',
        originalUrl: '/api/alerts/cron',
      };

      const result = await authenticateSchedulerRequest(mockReq);
      expect(result.authenticated).toBe(false);
      expect(result.isQStash).toBe(true);
      expect(result.statusCode).toBe(401);
      expect(result.error).toContain('Invalid QStash signature');
    });

    it('rejects requests with invalid CRON_SECRET (401)', async () => {
      const mockReq: any = {
        headers: {
          authorization: 'Bearer wrong_token_attempt',
        },
        body: {},
        get: () => 'trade-pilot-sage.vercel.app',
        protocol: 'https',
        originalUrl: '/api/alerts/cron',
      };

      const result = await authenticateSchedulerRequest(mockReq);
      expect(result.authenticated).toBe(false);
      expect(result.isQStash).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('skips evaluation safely with HTTP 200 when QStash signature is valid but feature flag is disabled', async () => {
      process.env.QSTASH_SCHEDULER_ENABLED = 'false';
      const body = JSON.stringify({ symbol: 'XAUUSD' });
      const signature = generateTestQStashSignature({
        key: testCurrentKey,
        body,
        url: targetUrl,
      });

      const mockReq: any = {
        headers: {
          'upstash-signature': signature,
        },
        body: { symbol: 'XAUUSD' },
        rawBody: body,
        get: () => 'trade-pilot-sage.vercel.app',
        protocol: 'https',
        originalUrl: '/api/alerts/cron',
      };

      const result = await authenticateSchedulerRequest(mockReq);
      expect(result.authenticated).toBe(true);
      expect(result.isQStash).toBe(true);
      expect(result.status).toBe('DISABLED');
      expect(result.statusCode).toBe(200);
      expect(result.reason).toContain('QSTASH_SCHEDULER_ENABLED=false');
    });

    it('skips evaluation safely with HTTP 200 when CRON_SECRET is valid but ALERT_SCHEDULER_ENABLED is disabled', async () => {
      process.env.ALERT_SCHEDULER_ENABLED = 'false';

      const mockReq: any = {
        headers: {
          authorization: `Bearer ${testCronSecret}`,
        },
        body: {},
        get: () => 'trade-pilot-sage.vercel.app',
        protocol: 'https',
        originalUrl: '/api/alerts/cron',
      };

      const result = await authenticateSchedulerRequest(mockReq);
      expect(result.authenticated).toBe(true);
      expect(result.isQStash).toBe(false);
      expect(result.status).toBe('DISABLED');
      expect(result.statusCode).toBe(200);
      expect(result.reason).toContain('ALERT_SCHEDULER_ENABLED=false');
    });

    it('authorizes request when QStash signature is valid and QSTASH_SCHEDULER_ENABLED is true', async () => {
      process.env.QSTASH_SCHEDULER_ENABLED = 'true';
      const body = JSON.stringify({ symbol: 'XAUUSD' });
      const signature = generateTestQStashSignature({
        key: testCurrentKey,
        body,
        url: targetUrl,
      });

      const mockReq: any = {
        headers: {
          'upstash-signature': signature,
        },
        body: { symbol: 'XAUUSD' },
        rawBody: body,
        get: () => 'trade-pilot-sage.vercel.app',
        protocol: 'https',
        originalUrl: '/api/alerts/cron',
      };

      const result = await authenticateSchedulerRequest(mockReq);
      expect(result.authenticated).toBe(true);
      expect(result.status).toBe('AUTHORIZED');
      expect(result.statusCode).toBe(200);
    });
  });

  describe('4. Express Endpoint Integration (/api/alerts/cron)', () => {
    async function invokeCronEndpoint(params: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
    }): Promise<{ status: number; body: any }> {
      const app = express();
      app.use(
        express.json({
          verify: (req: any, _res: any, buf: Buffer) => {
            req.rawBody = buf?.toString('utf-8') || '';
          },
        })
      );
      app.use('/api', apiRouter);

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address() as { port: number };
      try {
        const rawBody = params.body;
        const reqHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(params.headers || {}),
        };
        if (rawBody !== undefined) {
          reqHeaders['Content-Length'] = String(Buffer.byteLength(rawBody));
        }

        const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: addr.port,
              path: '/api/alerts/cron',
              method: params.method || 'POST',
              headers: reqHeaders,
            },
            (resp) => {
              let data = '';
              resp.on('data', (c) => (data += c));
              resp.on('end', () => {
                try {
                  resolve({ status: resp.statusCode || 500, body: JSON.parse(data) });
                } catch {
                  resolve({ status: resp.statusCode || 500, body: data });
                }
              });
            }
          );
          req.on('error', reject);
          if (rawBody) req.write(rawBody);
          req.end();
        });
        return res;
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }

    it('returns 401 when called without credentials on ephemeral test server and logs failure without leaking headers', async () => {
      const spyWarn = vi.spyOn(console, 'warn');
      const spyCycle = vi.spyOn(DualStageSignalAlertService, 'runEvaluationCycle');
      const spySync = vi.spyOn(MarketDataSyncService, 'syncMarketData');
      const spyWhatsApp = vi.spyOn(whatsappCloudProvider, 'enqueueSignalNotification');

      const res = await invokeCronEndpoint({ method: 'POST', body: JSON.stringify({ symbol: 'XAUUSD' }) });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');

      // Gate guarantees: NO evaluation, NO sync, NO WhatsApp
      expect(spyCycle).not.toHaveBeenCalled();
      expect(spySync).not.toHaveBeenCalled();
      expect(spyWhatsApp).not.toHaveBeenCalled();

      // Observability check: Structured log recorded without secrets
      const warnCall = spyWarn.mock.calls.find((c) =>
        c.some((arg) => typeof arg === 'string' && arg.includes('[SchedulerAudit] event=scheduler_auth_failed'))
      );
      expect(warnCall).toBeDefined();
      const warnStr = warnCall?.[0] as string;
      expect(warnStr).toContain('status=401');
      expect(warnStr).not.toContain('Bearer');
      expect(warnStr).not.toContain(testCronSecret);
    });

    it('rejects invalid signature with 401 without invoking evaluation, market sync, or WhatsApp', async () => {
      const spyWarn = vi.spyOn(console, 'warn');
      const spyCycle = vi.spyOn(DualStageSignalAlertService, 'runEvaluationCycle');
      const spySync = vi.spyOn(MarketDataSyncService, 'syncMarketData');
      const spyWhatsApp = vi.spyOn(whatsappCloudProvider, 'enqueueSignalNotification');

      const badSig = 'forged_fake_signature_99999999999';
      const body = JSON.stringify({ symbol: 'XAUUSD' });

      const res = await invokeCronEndpoint({
        method: 'POST',
        headers: { 'upstash-signature': badSig },
        body,
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized: Invalid QStash signature');

      // Zero execution guarantees
      expect(spyCycle).not.toHaveBeenCalled();
      expect(spySync).not.toHaveBeenCalled();
      expect(spyWhatsApp).not.toHaveBeenCalled();

      // Observability check: Logs invalid signature category without logging the actual signature
      const warnCall = spyWarn.mock.calls.find((c) =>
        c.some((arg) => typeof arg === 'string' && arg.includes('[SchedulerAudit] event=scheduler_auth_failed category=invalid_qstash_signature'))
      );
      expect(warnCall).toBeDefined();
      const warnStr = warnCall?.[0] as string;
      expect(warnStr).not.toContain(badSig);
    });

    it('when QSTASH_SCHEDULER_ENABLED=false, valid signature returns 200 skipped, logs scheduler_skipped, and guarantees zero side effects', async () => {
      process.env.QSTASH_SCHEDULER_ENABLED = 'false';
      const spyLog = vi.spyOn(console, 'log');
      const spyCycle = vi.spyOn(DualStageSignalAlertService, 'runEvaluationCycle');
      const spySync = vi.spyOn(MarketDataSyncService, 'syncMarketData');
      const spyWhatsApp = vi.spyOn(whatsappCloudProvider, 'enqueueSignalNotification');
      const spyDispatch = vi.spyOn(whatsappCloudProvider, 'dispatchPayloadToMeta');

      const body = JSON.stringify({ symbol: 'XAUUSD' });
      const signature = generateTestQStashSignature({
        key: testCurrentKey,
        body,
        url: targetUrl,
      });

      const res = await invokeCronEndpoint({
        method: 'POST',
        headers: { 'upstash-signature': signature },
        body,
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.skipped).toBe(true);
      expect(res.body.reason).toContain('QSTASH_SCHEDULER_ENABLED=false');

      // Zero side effects verified
      expect(spyCycle).not.toHaveBeenCalled();
      expect(spySync).not.toHaveBeenCalled();
      expect(spyWhatsApp).not.toHaveBeenCalled();
      expect(spyDispatch).not.toHaveBeenCalled();

      // Observability logs verified:
      // 1. Success log
      const successCall = spyLog.mock.calls.find((c) =>
        c.some((arg) => typeof arg === 'string' && arg.includes('[SchedulerAudit] event=scheduler_auth_success caller=QSTASH'))
      );
      expect(successCall).toBeDefined();
      const successStr = successCall?.[0] as string;
      expect(successStr).not.toContain(signature);
      expect(successStr).not.toContain(body);

      // 2. Skipped log with required exact parameters
      const skippedCall = spyLog.mock.calls.find((c) =>
        c.some((arg) => typeof arg === 'string' && arg.includes('[SchedulerAudit] event=scheduler_skipped reason=external_scheduler_disabled caller=QSTASH evaluation_started=false whatsapp_dispatch_started=false'))
      );
      expect(skippedCall).toBeDefined();
    });
  });

  describe('5. Database Idempotency & Atomic Unique Constraint (P2002 Race Handling)', () => {
    it('safely handles concurrent createSignalLifecycleEvent calls with identical idempotencyKey', async () => {
      const uniqueSuffix = Date.now();
      const testKey = `sig:init:test_race_user:XAUUSD:H4:H1:M15:M5:BUY:${uniqueSuffix}`;
      const baseEvent: any = {
        userId: 'usr_demo_01',
        idempotencyKey: testKey,
        symbol: 'XAUUSD',
        direction: 'BUY',
        htfDirectionTimeframe: 'H4',
        htfConfirmationTimeframe: 'H1',
        primaryTimeframe: 'M15',
        confirmationTimeframe: 'M5',
        primaryCandleTimestamp: new Date().toISOString(),
        isClosedCandle: true,
        referencePrice: 2650.5,
        entryPrice: 2650.5,
        stopLoss: 2640.0,
        takeProfit1: 2665.0,
        riskReward: 1.5,
        initialScore: 78,
        initialStatus: 'STRONG_SETUP',
        lifecycleStatus: 'PENDING_CONFIRMATION',
        initialExplanation: 'Concurrent test setup',
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      };

      // Execute two creations simultaneously
      const [ev1, ev2] = await Promise.all([
        db.createSignalLifecycleEvent(baseEvent),
        db.createSignalLifecycleEvent(baseEvent),
      ]);

      expect(ev1).toBeDefined();
      expect(ev2).toBeDefined();
      expect(ev1.idempotencyKey).toBe(testKey);
      expect(ev2.idempotencyKey).toBe(testKey);
      expect(ev1.id).toBe(ev2.id); // Same canonical record preserved
    }, 15000);

    it('safely handles concurrent createNotificationJob calls with identical idempotencyKey', async () => {
      const uniqueSuffix = Date.now();
      const testKey = `wa:INITIAL_SIGNAL:test_event_${uniqueSuffix}`;
      const baseJob: any = {
        userId: 'usr_demo_01',
        notificationType: 'INITIAL_SIGNAL',
        idempotencyKey: testKey,
        recipient: '628159533311',
        messageBody: 'Concurrent notification job test',
        payloadJson: { test: true },
        status: 'PENDING',
      };

      const [j1, j2] = await Promise.all([
        db.createNotificationJob(baseJob),
        db.createNotificationJob(baseJob),
      ]);

      expect(j1).toBeDefined();
      expect(j2).toBeDefined();
      expect(j1.idempotencyKey).toBe(testKey);
      expect(j2.idempotencyKey).toBe(testKey);
      expect(j1.id).toBe(j2.id); // Same job preserved
    }, 15000);
  });

  describe('6. Safe Test Mode & WhatsApp Dispatch Zero-Network Guarantee', () => {
    it('simulates WhatsApp dispatch safely without network calls when WHATSAPP_SAFE_TEST_MODE is true', async () => {
      process.env.WHATSAPP_SAFE_TEST_MODE = 'true';
      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await whatsappCloudProvider.dispatchPayloadToMeta({
        messaging_product: 'whatsapp',
        to: '6281234567890',
        type: 'text',
        text: { body: 'Test simulated payload' },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.providerMessageId).toContain('wamid.SIMULATED_TEST_');
      expect(result.sanitizedResponse).toContain('Safe test mode active');
      // Zero outbound network calls to Meta Graph API
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects automated message when symbol alert config has whatsappEnabled=false', async () => {
      const res = await whatsappCloudProvider.enqueueSignalNotification({
        userId: 'usr_demo_01',
        config: {
          id: 'cfg_1',
          userId: 'usr_demo_01',
          symbol: 'XAUUSD',
          enabled: true,
          primaryTimeframe: 'M15',
          confirmationTimeframe: 'M5',
          initialScoreThreshold: 65,
          confirmationScoreThreshold: 65,
          requireClosedCandle: true,
          requireTrendAlignment: true,
          requireStructureAlignment: true,
          requireMomentumAlignment: false,
          minAdx: 18,
          expirationMinutes: 120,
          invalidationPolicy: 'OPPOSITE_OR_STOP',
          enableInitialAlert: true,
          enableConfirmationAlert: true,
          whatsappEnabled: false, // Disabled
          useTemplateMessage: false,
          templateLanguage: 'en_US',
          configVersion: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
        event: {
          id: 'ev_test_1',
          userId: 'usr_demo_01',
          configId: 'cfg_1',
          signalRunId: 'sr_1',
          idempotencyKey: 'test_k1',
          symbol: 'XAUUSD',
          direction: 'BUY',
          primaryTimeframe: 'M15',
          confirmationTimeframe: 'M5',
          primaryCandleTimestamp: new Date().toISOString(),
          isClosedCandle: true,
          referencePrice: 2650,
          entryPrice: 2650,
          stopLoss: 2640,
          takeProfit1: 2665,
          riskReward: 1.5,
          initialScore: 80,
          initialStatus: 'STRONG_SETUP',
          lifecycleStatus: 'PENDING_CONFIRMATION',
          initialNotificationStatus: 'NOT_QUEUED',
          confirmationNotificationStatus: 'NOT_QUEUED',
          dataFreshnessStatus: 'CURRENT',
          initialExplanation: 'Test setup',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          evaluationCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        notificationType: 'INITIAL_SIGNAL',
      });

      expect(res.queued).toBe(false);
      expect(res.skippedReason).toContain('WhatsApp delivery is disabled');
    });
  });

  describe('7. Strategy Rules Integrity & Sequence (H4 -> H1 -> M15 -> M5)', () => {
    it('rejects unclosed forming candles and lookahead bias', () => {
      const nowMs = 1760000000000;
      const futureCandle: any = {
        symbol: 'XAUUSD',
        timeframe: 'M5',
        timestamp: nowMs + 300000, // Future open time
        open: 2650,
        high: 2652,
        low: 2649,
        close: 2651,
      };

      const isClosed = DualStageSignalAlertService.isCandleClosedAt(futureCandle, 'M5', nowMs);
      expect(isClosed).toBe(false);
    });

    it('rejects evaluation when market data is stale', () => {
      const nowMs = 1760000000000;
      const oldCandles: any[] = [
        {
          symbol: 'XAUUSD',
          timeframe: 'M5',
          timestamp: nowMs - 3600000, // 1 hour old (exceeds 15min threshold)
          open: 2650,
          high: 2652,
          low: 2649,
          close: 2651,
        },
      ];

      const freshness = DualStageSignalAlertService.checkCandleSliceFreshness(
        oldCandles,
        'M5',
        'XAUUSD',
        nowMs
      );
      expect(freshness.isStale).toBe(true);
      expect(freshness.reason).toContain('STALE');
    });

    it('strictly requires H1 to align with H4 direction before allowing Stage 1', () => {
      const h4Candles: any[] = Array.from({ length: 65 }, (_, i) => ({
        timestamp: 1760000000000 - (65 - i) * 14400000,
        open: 2600 + i * 2,
        high: 2603 + i * 2,
        low: 2599 + i * 2,
        close: 2602 + i * 2,
        volume: 100,
        source: 'TWELVEDATA',
      }));

      // H4 is Bullish
      const h4Eval = DualStageSignalAlertService.evaluateH4MarketDirection(h4Candles, 'XAUUSD', 'H4');
      expect(h4Eval.direction).toBe('BULLISH');

      // Opposing Bearish H1 candles
      const opposingH1Candles: any[] = Array.from({ length: 65 }, (_, i) => ({
        timestamp: 1760000000000 - (65 - i) * 3600000,
        open: 2700 - i * 2,
        high: 2701 - i * 2,
        low: 2697 - i * 2,
        close: 2698 - i * 2,
        volume: 100,
        source: 'TWELVEDATA',
      }));

      const h1Eval = DualStageSignalAlertService.evaluateH1TrendConfirmation(
        opposingH1Candles,
        'XAUUSD',
        h4Eval.direction,
        'H1'
      );
      // H1 opposes H4
      expect(h1Eval.h1Trend).toBe('BEARISH');
      expect(h1Eval.aligned).toBe(false);
      expect(h1Eval.reason).toContain('opposes or fails to confirm');
    });
  });

  describe('8. Upgrade #SCHEDULER-RELIABILITY (Symbol Scope, Distributed Lock & Safe Recovery)', () => {
    it('strictly rejects non-XAUUSD symbols (e.g. BTCUSD) with 400 Bad Request on /api/alerts/cron', async () => {
      process.env.ALERT_SCHEDULER_ENABLED = 'true';
      const testSecret = 'reliability-secret-xyz';
      process.env.CRON_SECRET = testSecret;

      // Invoke ephemeral express app
      const app = express();
      app.use(express.json());
      app.use('/api', apiRouter);

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address() as { port: number };

      try {
        const payload = JSON.stringify({ symbol: 'BTCUSD' });
        const res = await new Promise<{ status: number; body: any }>((resolve) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: addr.port,
              path: '/api/alerts/cron',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': String(Buffer.byteLength(payload)),
                Authorization: `Bearer ${testSecret}`,
              },
            },
            (resp) => {
              let data = '';
              resp.on('data', (c) => (data += c));
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

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
        expect(res.body.skipped).toBe(true);
        expect(res.body.error).toContain('strictly restricted to XAUUSD');
        expect(res.body.symbol).toBe('BTCUSD');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        process.env.ALERT_SCHEDULER_ENABLED = 'false';
      }
    });

    it('database-backed atomic distributed lock allows only 1 active instance and rejects concurrent claims', async () => {
      const lockKey = `TEST_RELIABILITY_${Date.now()}`;
      const procA = 'instance_A';
      const procB = 'instance_B';

      // 1. Process A claims lock
      const claimA = await db.acquireDistributedLock({
        lockKey,
        lockId: procA,
        leaseSeconds: 30,
      });
      expect(claimA.acquired).toBe(true);
      expect(claimA.lockKey).toBe(lockKey);

      // 2. Process B attempts concurrent claim -> must be rejected
      const claimB = await db.acquireDistributedLock({
        lockKey,
        lockId: procB,
        leaseSeconds: 30,
      });
      expect(claimB.acquired).toBe(false);
      expect(claimB.reason).toContain('Active distributed lock');

      // 3. Process A safely releases lock
      const releasedA = await db.releaseDistributedLock({
        lockKey,
        lockId: procA,
      });
      expect(releasedA).toBe(true);

      // 4. Process B can now acquire lock
      const claimBSecond = await db.acquireDistributedLock({
        lockKey,
        lockId: procB,
        leaseSeconds: 30,
      });
      expect(claimBSecond.acquired).toBe(true);

      // Cleanup
      await db.releaseDistributedLock({ lockKey, lockId: procB });
    }, 15000);

    it('distributed lock automatically recovers after lease expiry to prevent permanent deadlock', async () => {
      const lockKey = `TEST_EXPIRY_${Date.now()}`;
      const deadProc = 'crashed_instance_1';
      const newProc = 'healthy_instance_2';

      // 1. First instance acquires with short 1-second lease and simulated crash (no release)
      const claimInitial = await db.acquireDistributedLock({
        lockKey,
        lockId: deadProc,
        leaseSeconds: 1, // 1-second lease
      });
      expect(claimInitial.acquired).toBe(true);

      // Immediately checking should be locked
      const immediateClaim = await db.acquireDistributedLock({
        lockKey,
        lockId: newProc,
        leaseSeconds: 10,
      });
      expect(immediateClaim.acquired).toBe(false);

      // 2. Wait 1.2s for lease to expire
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // 3. New instance acquires the expired lock without manual release
      const recoveredClaim = await db.acquireDistributedLock({
        lockKey,
        lockId: newProc,
        leaseSeconds: 10,
      });
      expect(recoveredClaim.acquired).toBe(true);

      // Cleanup
      await db.releaseDistributedLock({ lockKey, lockId: newProc });
    }, 15000);

    it('runEvaluationCycle skips cleanly without fetching or evaluations when distributed lock is active', async () => {
      const lockKey = 'EVAL_XAUUSD';
      const foreignLockId = `external_holder_${Date.now()}`;

      // Acquire lock on behalf of another instance
      const preLock = await db.acquireDistributedLock({
        lockKey,
        lockId: foreignLockId,
        leaseSeconds: 30,
      });
      expect(preLock.acquired).toBe(true);

      try {
        const report = await DualStageSignalAlertService.runEvaluationCycle({
          symbol: 'XAUUSD',
          triggerSource: 'CRON',
        });

        expect(report.skippedReason).toBe('DISTRIBUTED_LOCK_ACTIVE');
        expect(report.stage1Evaluations).toHaveLength(0);
        expect(report.stage2Evaluations).toHaveLength(0);
        expect(report.queueSummary.processedCount).toBe(0);
      } finally {
        await db.releaseDistributedLock({ lockKey, lockId: foreignLockId });
      }
    }, 15000);

    it('ensures production feature flags remain strictly false by default', () => {
      const qstashEnabled = (process.env.QSTASH_SCHEDULER_ENABLED || 'false').toLowerCase() === 'true';
      const alertSchedulerEnabled = (process.env.ALERT_SCHEDULER_ENABLED || 'false').toLowerCase() === 'true';
      const whatsappEnabled = (process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true';
      const safeTestMode = (process.env.WHATSAPP_SAFE_TEST_MODE || 'true').toLowerCase() === 'true';

      expect(qstashEnabled).toBe(false);
      expect(alertSchedulerEnabled).toBe(false);
      expect(whatsappEnabled).toBe(false);
      expect(safeTestMode).toBe(true);
    });
  });
});
