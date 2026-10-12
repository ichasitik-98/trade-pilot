import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import http from 'http';
import app from '../api/index.ts';
import { DualStageSignalAlertService } from '../server/services/dual-stage-signal-alert.ts';
import {
  WhatsAppCloudProvider,
  normalizeWhatsAppRecipient,
  maskSensitiveIdentifier,
} from '../server/providers/whatsapp-cloud.ts';
import { twelveDataBudget } from '../server/services/twelve-data-budget.ts';
import { db } from '../server/db/storage.ts';
import { Candle, SignalAlertConfig } from '../server/types/index.ts';
import { createSession } from '../server/auth/session.ts';

async function invokeApi(params: {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, any>;
}): Promise<{ status: number; body: any }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  try {
    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const payload = params.body ? JSON.stringify(params.body) : undefined;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: params.path,
          method: params.method,
          headers: {
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
            ...(params.headers || {}),
          },
        },
        (resp) => {
          let raw = '';
          resp.on('data', (chunk) => (raw += chunk));
          resp.on('end', () => {
            let parsed: any = raw;
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch {
              parsed = raw;
            }
            resolve({ status: resp.statusCode || 500, body: parsed });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
    return res;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/**
 * Deterministic candle builder for H4 / H1 directional trends with strict HH + HL (for BULLISH) or LH + LL (for BEARISH).
 */
function buildTrendCandles(
  symbol: string,
  timeframe: string,
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  count: number,
  durationMs: number,
  endCloseTimeMs: number,
  basePrice = 2600
): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const idxFromEnd = count - 1 - i;
    const openTime = endCloseTimeMs - (idxFromEnd + 1) * durationMs;

    if (direction === 'NEUTRAL') {
      const wave = (i % 2 === 0 ? 1 : -1) * 0.2;
      const close = Number((basePrice + wave).toFixed(4));
      candles.push({
        symbol,
        pair: symbol,
        timeframe,
        timestamp: openTime,
        open: basePrice,
        high: Number((basePrice + 0.3).toFixed(4)),
        low: Number((basePrice - 0.3).toFixed(4)),
        close,
        volume: 1000,
        source: 'TWELVEDATA',
        isClosed: true,
      });
      continue;
    }

    const sign = direction === 'BULLISH' ? 1 : -1;
    // 10-bar cycle: 6 bars advancing (+1.5 * sign each = +9.0) and 4 bars pulling back (-1.25 * sign each = -5.0)
    // Net advance per cycle = +4.0 * sign -> strict HH + HL structure, EMA20 > EMA50, and healthy RSI(14) ~ 52-64
    const cycle = Math.floor(i / 10);
    const pos = i % 10;
    const prevPos = (i - 1 + 10) % 10;
    const cycleOffset = pos <= 5 ? (pos + 1) * 1.5 : 9.0 - (pos - 5) * 1.25;
    const prevOffset =
      i === 0
        ? 0
        : pos === 0
        ? 0
        : prevPos <= 5
        ? (prevPos + 1) * 1.5
        : 9.0 - (prevPos - 5) * 1.25;
    const rawOpen = basePrice + (cycle * 4.0 + prevOffset) * sign;
    const rawClose = basePrice + (cycle * 4.0 + cycleOffset) * sign;
    const open = Number(rawOpen.toFixed(4));
    const close = Number(rawClose.toFixed(4));
    const high = Number((Math.max(open, close) + 0.6).toFixed(4));
    const low = Number((Math.min(open, close) - 0.6).toFixed(4));

    candles.push({
      symbol,
      pair: symbol,
      timeframe,
      timestamp: openTime,
      open,
      high,
      low,
      close,
      volume: 1200 + i * 10,
      source: 'TWELVEDATA',
      isClosed: true,
    });
  }
  return candles;
}

/**
 * Builds M15 candles with a valid pullback into the EMA20/HL (for BUY) or EMA20/LH (for SELL) value zone.
 */
function buildM15PullbackCandles(
  symbol: string,
  direction: 'BULLISH' | 'BEARISH',
  count: number,
  endCloseTimeMs: number,
  validPullback: boolean = true
): Candle[] {
  const durationMs = 15 * 60 * 1000;
  // Use a count that ends at pos = 8 in the 10-bar cycle (e.g., 119 bars -> last index 118 -> pos = 8, which is 3 bars into the pullback toward EMA20!)
  const alignedCount = Math.floor(count / 10) * 10 + 9;
  const base = buildTrendCandles(symbol, 'M15', direction, alignedCount, durationMs, endCloseTimeMs, 2600);

  if (!validPullback) {
    // Make the last 12 bars a vertical runaway spike so RSI > 75 and price is far above EMA20 without any pullback
    const sign = direction === 'BULLISH' ? 1 : -1;
    let running = base[base.length - 13].close;
    for (let i = base.length - 12; i < base.length; i++) {
      const open = running;
      const close = Number((open + 14.0 * sign).toFixed(4));
      base[i] = {
        ...base[i],
        open,
        close,
        high: direction === 'BULLISH' ? Number((close + 0.5).toFixed(4)) : Number((open + 0.2).toFixed(4)),
        low: direction === 'BULLISH' ? Number((open - 0.2).toFixed(4)) : Number((close - 0.5).toFixed(4)),
      };
      running = close;
    }
    return base;
  }

  return base;
}

/**
 * Builds M5 candles with a Break of Structure (BOS) on the final bar, with either a valid closed confirmation candle
 * or an unconfirmed (wick-rejected / opposite-body) candle.
 */
function buildM5BosCandles(
  symbol: string,
  direction: 'BUY' | 'SELL',
  count: number,
  endCloseTimeMs: number,
  options: {
    hasBos: boolean;
    validConfirmationCandle: boolean;
  }
): Candle[] {
  const durationMs = 5 * 60 * 1000;
  const trendDir = direction === 'BUY' ? 'BULLISH' : 'BEARISH';
  const candles = buildTrendCandles(symbol, 'M5', trendDir, count, durationMs, endCloseTimeMs, 2600);
  const n = candles.length;
  const sign = direction === 'BUY' ? 1 : -1;

  // Create a clear swing high (for BUY) or swing low (for SELL) at index n - 6 (lookback = 3 requires 3 bars after it)
  const refPrice = candles[n - 8].close;
  const swingExtreme = Number((refPrice + 6.0 * sign).toFixed(2));

  candles[n - 6].open = refPrice;
  candles[n - 6].close = Number((refPrice + 4.0 * sign).toFixed(2));
  candles[n - 6].high = direction === 'BUY' ? swingExtreme : Number((refPrice + 1.0).toFixed(2));
  candles[n - 6].low = direction === 'SELL' ? swingExtreme : Number((refPrice - 1.0).toFixed(2));

  // Bars n-5, n-4, n-3 stay inside swingExtreme so n-6 is detected as the latest swing high/low
  for (let idx = n - 5; idx <= n - 2; idx++) {
    const cClose = Number((refPrice + 2.5 * sign).toFixed(2));
    candles[idx].open = Number((cClose - 0.5 * sign).toFixed(2));
    candles[idx].close = cClose;
    candles[idx].high =
      direction === 'BUY'
        ? Number((swingExtreme - 1.2).toFixed(2))
        : Number((cClose + 1.0).toFixed(2));
    candles[idx].low =
      direction === 'SELL'
        ? Number((swingExtreme + 1.2).toFixed(2))
        : Number((cClose - 1.0).toFixed(2));
  }

  // Final closed M5 candle (n - 1)
  if (!options.hasBos) {
    // Stay below swing high (for BUY) or above swing low (for SELL) -> no BOS
    const cClose = Number((refPrice + 2.0 * sign).toFixed(2));
    candles[n - 1].open = Number((cClose - 0.4 * sign).toFixed(2));
    candles[n - 1].close = cClose;
    candles[n - 1].high =
      direction === 'BUY' ? Number((swingExtreme - 1.5).toFixed(2)) : Number((cClose + 0.8).toFixed(2));
    candles[n - 1].low =
      direction === 'SELL' ? Number((swingExtreme + 1.5).toFixed(2)) : Number((cClose - 0.8).toFixed(2));
  } else if (options.validConfirmationCandle) {
    // Break beyond swingExtreme with a strong, decisive closed confirmation candle (body >= 45%, closes near extreme)
    const bosClose = Number((swingExtreme + 4.5 * sign).toFixed(2));
    const bosOpen = Number((swingExtreme - 0.5 * sign).toFixed(2));
    candles[n - 1].open = bosOpen;
    candles[n - 1].close = bosClose;
    candles[n - 1].high =
      direction === 'BUY' ? Number((bosClose + 0.4).toFixed(2)) : Number((bosOpen + 0.4).toFixed(2));
    candles[n - 1].low =
      direction === 'SELL' ? Number((bosClose - 0.4).toFixed(2)) : Number((bosOpen - 0.4).toFixed(2));
  } else {
    // Break beyond swingExtreme on close (so BOS = true), BUT candle has massive rejection wick / tiny body (< 45%)
    const bosClose = Number((swingExtreme + 0.5 * sign).toFixed(2));
    const bosOpen = Number((swingExtreme + 0.3 * sign).toFixed(2));
    candles[n - 1].open = bosOpen;
    candles[n - 1].close = bosClose;
    candles[n - 1].high =
      direction === 'BUY'
        ? Number((swingExtreme + 12.0).toFixed(2)) // Huge upper wick rejection
        : Number((bosOpen + 0.5).toFixed(2));
    candles[n - 1].low =
      direction === 'SELL'
        ? Number((swingExtreme - 12.0).toFixed(2)) // Huge lower wick rejection
        : Number((bosOpen - 0.5).toFixed(2));
  }

  return candles;
}

describe('TradePilot Post-Upgrade Validation Audit — 12 Mandatory Verification Tests', () => {
  const testUserAId = 'user_audit_alpha';
  const testUserBId = 'user_audit_bravo';
  let userAToken: string;
  let userBToken: string;
  let testConfig: SignalAlertConfig;

  beforeAll(async () => {
    const existingA = await db.findUserByEmail('audit-alpha@tradepilot.local');
    const userA =
      existingA ||
      (await db.createUser({
        id: testUserAId,
        email: 'audit-alpha@tradepilot.local',
        name: 'Audit Alpha',
        passwordHash: 'hashed_pw_a',
        role: 'USER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

    const existingB = await db.findUserByEmail('audit-bravo@tradepilot.local');
    const userB =
      existingB ||
      (await db.createUser({
        id: testUserBId,
        email: 'audit-bravo@tradepilot.local',
        name: 'Audit Bravo',
        passwordHash: 'hashed_pw_b',
        role: 'USER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

    userAToken = createSession({ id: userA.id, role: userA.role });
    userBToken = createSession({ id: userB.id, role: userB.role });

    const configs = await db.ensureDefaultXauusdAlertConfig(userA.id);
    expect(configs.length).toBeGreaterThanOrEqual(1);
    testConfig = configs.find((c) => c.symbol === 'XAUUSD') || configs[0];
  }, 30000);

  beforeEach(() => {
    twelveDataBudget.resetForTests();
    vi.restoreAllMocks();
    process.env.ALERT_SCHEDULER_ENABLED = 'false';
  });

  it('0. Verifies 4-timeframe default configuration (H4 -> H1 -> M15 -> M5) on XAUUSD', () => {
    expect(testConfig.symbol).toBe('XAUUSD');
    expect(testConfig.htfDirectionTimeframe).toBe('H4');
    expect(testConfig.htfConfirmationTimeframe).toBe('H1');
    expect(testConfig.primaryTimeframe).toBe('M15');
    expect(testConfig.confirmationTimeframe).toBe('M5');
    expect(testConfig.enabled).toBe(true);
    expect(testConfig.whatsappEnabled).toBe(false);
  });

  it('1. Pengujian Wajib #1: Valid BUY and Valid SELL across H4 -> H1 -> M15 (Stage 1) -> M5 (Stage 2)', async () => {
    const nowMs = Date.now();
    const h4Dur = 4 * 3600 * 1000;
    const h1Dur = 3600 * 1000;

    const cfg: SignalAlertConfig = {
      ...testConfig,
      initialScoreThreshold: 45,
      confirmationScoreThreshold: 45,
      minAdx: 0,
    };

    // --- A. VALID BUY ---
    const buyH4 = buildTrendCandles('XAUUSD', 'H4', 'BULLISH', 120, h4Dur, nowMs - 120_000);
    const buyH1 = buildTrendCandles('XAUUSD', 'H1', 'BULLISH', 120, h1Dur, nowMs - 120_000);
    const buyM15 = buildM15PullbackCandles('XAUUSD', 'BULLISH', 120, nowMs - 120_000, true);
    const buyM5 = buildM5BosCandles('XAUUSD', 'BUY', 120, nowMs - 10_000, {
      hasBos: true,
      validConfirmationCandle: true,
    });

    const buyStage1 = await DualStageSignalAlertService.evaluateStage1ForConfig(cfg, {
      timeframeCandles: { H4: buyH4, H1: buyH1, M15: buyM15 },
      nowMs,
    });
    expect(buyStage1.state).toBe('BUY');
    expect(buyStage1.h4Direction).toBe('BULLISH');
    expect(buyStage1.h1Trend).toBe('BULLISH');
    expect(buyStage1.m15PullbackValid).toBe(true);
    expect(buyStage1.signalEvent?.lifecycleStatus).toBe('PENDING_CONFIRMATION');

    const buyStage2 = await DualStageSignalAlertService.evaluateStage2Confirmation(
      buyStage1.signalEvent!,
      cfg,
      { timeframeCandles: { M5: buyM5 }, nowMs }
    );
    expect(buyStage2.newStatus).toBe('CONFIRMED');
    expect(buyStage2.m5BosDetected).toBe(true);
    expect(buyStage2.m5CandleConfirmed).toBe(true);

    // --- B. VALID SELL ---
    const sellH4 = buildTrendCandles('EURUSD', 'H4', 'BEARISH', 120, h4Dur, nowMs - 120_000);
    const sellH1 = buildTrendCandles('EURUSD', 'H1', 'BEARISH', 120, h1Dur, nowMs - 120_000);
    const sellM15 = buildM15PullbackCandles('EURUSD', 'BEARISH', 120, nowMs - 120_000, true);
    const sellM5 = buildM5BosCandles('EURUSD', 'SELL', 120, nowMs - 10_000, {
      hasBos: true,
      validConfirmationCandle: true,
    });

    const sellCfg: SignalAlertConfig = { ...cfg, symbol: 'EURUSD' };
    const sellStage1 = await DualStageSignalAlertService.evaluateStage1ForConfig(sellCfg, {
      timeframeCandles: { H4: sellH4, H1: sellH1, M15: sellM15 },
      nowMs,
    });
    expect(sellStage1.state).toBe('SELL');
    expect(sellStage1.h4Direction).toBe('BEARISH');
    expect(sellStage1.h1Trend).toBe('BEARISH');
    expect(sellStage1.m15PullbackValid).toBe(true);

    const sellStage2 = await DualStageSignalAlertService.evaluateStage2Confirmation(
      sellStage1.signalEvent!,
      sellCfg,
      { timeframeCandles: { M5: sellM5 }, nowMs }
    );
    expect(sellStage2.newStatus).toBe('CONFIRMED');
    expect(sellStage2.m5BosDetected).toBe(true);
    expect(sellStage2.m5CandleConfirmed).toBe(true);
  }, 30000);

  it('2. Pengujian Wajib #2: NO_SIGNAL never turns into BUY or SELL', async () => {
    const nowMs = Date.now();
    const h4Dur = 4 * 3600 * 1000;
    const h1Dur = 3600 * 1000;

    // Case A: Neutral H4 market direction -> NO_SIGNAL
    const neutralH4 = buildTrendCandles('XAUUSD', 'H4', 'NEUTRAL', 120, h4Dur, nowMs - 60_000);
    const bullH1 = buildTrendCandles('XAUUSD', 'H1', 'BULLISH', 120, h1Dur, nowMs - 60_000);
    const bullM15 = buildM15PullbackCandles('XAUUSD', 'BULLISH', 120, nowMs - 60_000, true);

    const neutralOutcome = await DualStageSignalAlertService.evaluateStage1ForConfig(testConfig, {
      timeframeCandles: { H4: neutralH4, H1: bullH1, M15: bullM15 },
      nowMs,
    });
    expect(neutralOutcome.state).toBe('NO_SIGNAL');
    expect(neutralOutcome.createdNewEvent).toBe(false);
    expect(neutralOutcome.signalEvent).toBeUndefined();

    // Case B: High threshold (99/100) -> NO_SIGNAL
    const bullH4 = buildTrendCandles('XAUUSD', 'H4', 'BULLISH', 120, h4Dur, nowMs - 60_000);
    const strictOutcome = await DualStageSignalAlertService.evaluateStage1ForConfig(
      { ...testConfig, initialScoreThreshold: 99 },
      { timeframeCandles: { H4: bullH4, H1: bullH1, M15: bullM15 }, nowMs }
    );
    expect(strictOutcome.state).toBe('NO_SIGNAL');
    expect(strictOutcome.createdNewEvent).toBe(false);
  });

  it('3. Pengujian Wajib #3: H4 and H1 in opposing directions are strictly rejected as NO_SIGNAL', async () => {
    const nowMs = Date.now();
    const h4Dur = 4 * 3600 * 1000;
    const h1Dur = 3600 * 1000;

    const bullH4 = buildTrendCandles('XAUUSD', 'H4', 'BULLISH', 120, h4Dur, nowMs - 60_000);
    const bearH1 = buildTrendCandles('XAUUSD', 'H1', 'BEARISH', 120, h1Dur, nowMs - 60_000);
    const bullM15 = buildM15PullbackCandles('XAUUSD', 'BULLISH', 120, nowMs - 60_000, true);

    const outcome = await DualStageSignalAlertService.evaluateStage1ForConfig(
      { ...testConfig, initialScoreThreshold: 40, minAdx: 0 },
      { timeframeCandles: { H4: bullH4, H1: bearH1, M15: bullM15 }, nowMs }
    );

    expect(outcome.state).toBe('NO_SIGNAL');
    expect(outcome.h4Direction).toBe('BULLISH');
    expect(outcome.h1Trend).toBe('BEARISH');
    expect(outcome.createdNewEvent).toBe(false);
    expect(outcome.reason).toContain('opposes or fails to confirm H4 direction');
  });

  it('4. Pengujian Wajib #4: Invalid M15 pullback is rejected as NO_SIGNAL even when H4 & H1 align', async () => {
    const nowMs = Date.now();
    const h4Dur = 4 * 3600 * 1000;
    const h1Dur = 3600 * 1000;

    const bullH4 = buildTrendCandles('XAUUSD', 'H4', 'BULLISH', 120, h4Dur, nowMs - 60_000);
    const bullH1 = buildTrendCandles('XAUUSD', 'H1', 'BULLISH', 120, h1Dur, nowMs - 60_000);
    const invalidM15 = buildM15PullbackCandles('XAUUSD', 'BULLISH', 120, nowMs - 60_000, false);

    const outcome = await DualStageSignalAlertService.evaluateStage1ForConfig(
      { ...testConfig, initialScoreThreshold: 40, minAdx: 0 },
      { timeframeCandles: { H4: bullH4, H1: bullH1, M15: invalidM15 }, nowMs }
    );

    expect(outcome.state).toBe('NO_SIGNAL');
    expect(outcome.m15PullbackValid).toBe(false);
    expect(outcome.createdNewEvent).toBe(false);
    expect(outcome.reason).toContain('M15 pullback invalid');
  });

  it('5 & 6. Pengujian Wajib #5 & #6: M5 BOS without confirmation candle stays PENDING_CONFIRMATION; M5 BOS with valid closed candle transitions to CONFIRMED', async () => {
    const nowMs = Date.now();
    const h4Dur = 4 * 3600 * 1000;
    const h1Dur = 3600 * 1000;

    const cfg: SignalAlertConfig = {
      ...testConfig,
      symbol: 'GBPUSD',
      initialScoreThreshold: 45,
      confirmationScoreThreshold: 45,
      minAdx: 0,
    };

    const bullH4 = buildTrendCandles('GBPUSD', 'H4', 'BULLISH', 120, h4Dur, nowMs - 120_000);
    const bullH1 = buildTrendCandles('GBPUSD', 'H1', 'BULLISH', 120, h1Dur, nowMs - 120_000);
    const bullM15 = buildM15PullbackCandles('GBPUSD', 'BULLISH', 120, nowMs - 120_000, true);

    const stage1 = await DualStageSignalAlertService.evaluateStage1ForConfig(cfg, {
      timeframeCandles: { H4: bullH4, H1: bullH1, M15: bullM15 },
      nowMs,
    });
    expect(stage1.state).toBe('BUY');
    const event = stage1.signalEvent!;

    // Verify Stage 1 WhatsApp message explicitly warns that entry is NOT YET CONFIRMED
    const provider = new WhatsAppCloudProvider();
    const stage1Msg = provider.formatInitialSignalMessage(event);
    expect(stage1Msg).toContain('BELUM DIKONFIRMASI');
    expect(stage1Msg).toContain('ENTRY NOT YET CONFIRMED');

    // Test #5: M5 BOS present WITHOUT valid confirmation candle (huge upper wick / tiny body)
    const m5BosWithoutCandleConfirm = buildM5BosCandles('GBPUSD', 'BUY', 120, nowMs - 15_000, {
      hasBos: true,
      validConfirmationCandle: false,
    });

    const unconfirmedStage2 = await DualStageSignalAlertService.evaluateStage2Confirmation(
      event,
      cfg,
      { timeframeCandles: { M5: m5BosWithoutCandleConfirm }, nowMs }
    );
    expect(unconfirmedStage2.m5BosDetected).toBe(true);
    expect(unconfirmedStage2.m5CandleConfirmed).toBe(false);
    expect(unconfirmedStage2.newStatus).toBe('PENDING_CONFIRMATION');
    expect(unconfirmedStage2.notificationQueued).toBeUndefined();

    // Test #6: M5 BOS WITH valid closed confirmation candle -> transitions to CONFIRMED
    const m5BosWithValidCandle = buildM5BosCandles('GBPUSD', 'BUY', 120, nowMs - 5_000, {
      hasBos: true,
      validConfirmationCandle: true,
    });

    const confirmedStage2 = await DualStageSignalAlertService.evaluateStage2Confirmation(
      event,
      cfg,
      { timeframeCandles: { M5: m5BosWithValidCandle }, nowMs }
    );
    expect(confirmedStage2.m5BosDetected).toBe(true);
    expect(confirmedStage2.m5CandleConfirmed).toBe(true);
    expect(confirmedStage2.newStatus).toBe('CONFIRMED');
  }, 30000);

  it('7. Pengujian Wajib #7: Unclosed forming candles, lookahead timestamps, and stale data never trigger alerts', async () => {
    const nowMs = Date.now();
    const h4Dur = 4 * 3600 * 1000;
    const h1Dur = 3600 * 1000;

    const bullH4 = buildTrendCandles('XAUUSD', 'H4', 'BULLISH', 120, h4Dur, nowMs - 60_000);
    const bullH1 = buildTrendCandles('XAUUSD', 'H1', 'BULLISH', 120, h1Dur, nowMs - 60_000);
    const bullM15 = buildM15PullbackCandles('XAUUSD', 'BULLISH', 120, nowMs - 60_000, true);

    // Case A: Latest M15 candle is unclosed (isClosed: false) -> blocked
    const unclosedM15 = [...bullM15];
    unclosedM15[unclosedM15.length - 1] = {
      ...unclosedM15[unclosedM15.length - 1],
      isClosed: false,
    };

    const unclosedRes = await DualStageSignalAlertService.evaluateStage1ForConfig(testConfig, {
      timeframeCandles: { H4: bullH4, H1: bullH1, M15: unclosedM15 },
      nowMs,
    });
    expect(unclosedRes.state).toBe('SKIPPED_DATA_UNAVAILABLE');
    expect(unclosedRes.reason).toContain('Candle belum tertutup');

    // Case B: Lookahead bias (future candle timestamp > nowMs) -> blocked
    const futureM15 = [...bullM15];
    futureM15[futureM15.length - 1] = {
      ...futureM15[futureM15.length - 1],
      timestamp: nowMs + 600_000,
    };
    const lookaheadRes = await DualStageSignalAlertService.evaluateStage1ForConfig(testConfig, {
      timeframeCandles: { H4: bullH4, H1: bullH1, M15: futureM15 },
      nowMs,
    });
    expect(lookaheadRes.state).toBe('SKIPPED_DATA_UNAVAILABLE');
    expect(lookaheadRes.reason).toContain('Lookahead bias rejected');

    // Case C: Stale M15 data (3 hours old when M15 freshness threshold is 45m) -> blocked
    const staleM15 = buildM15PullbackCandles(
      'XAUUSD',
      'BULLISH',
      120,
      nowMs - 3 * 3600 * 1000,
      true
    );
    const staleRes = await DualStageSignalAlertService.evaluateStage1ForConfig(testConfig, {
      timeframeCandles: { H4: bullH4, H1: bullH1, M15: staleM15 },
      nowMs,
    });
    expect(staleRes.state).toBe('SKIPPED_DATA_UNAVAILABLE');
    expect(staleRes.reason).toContain('STALE');
  });

  it('8. Pengujian Wajib #8: Signal setup expiration and stop-loss invalidation', async () => {
    const nowMs = Date.now();
    const h4Dur = 4 * 3600 * 1000;
    const h1Dur = 3600 * 1000;

    const cfg: SignalAlertConfig = {
      ...testConfig,
      symbol: 'USDJPY',
      initialScoreThreshold: 45,
      confirmationScoreThreshold: 45,
      minAdx: 0,
    };

    const bullH4 = buildTrendCandles('USDJPY', 'H4', 'BULLISH', 120, h4Dur, nowMs - 120_000, 150);
    const bullH1 = buildTrendCandles('USDJPY', 'H1', 'BULLISH', 120, h1Dur, nowMs - 120_000, 150);
    const bullM15 = buildM15PullbackCandles('USDJPY', 'BULLISH', 120, nowMs - 120_000, true);

    const stage1 = await DualStageSignalAlertService.evaluateStage1ForConfig(cfg, {
      timeframeCandles: { H4: bullH4, H1: bullH1, M15: bullM15 },
      nowMs,
    });
    expect(stage1.signalEvent).toBeDefined();
    const event = stage1.signalEvent!;

    // Case A: Stop Loss Breach -> INVALIDATED
    const m5StopBreach = buildM5BosCandles('USDJPY', 'BUY', 120, nowMs - 10_000, {
      hasBos: false,
      validConfirmationCandle: false,
    });
    // Force last M5 candle low below event.stopLoss
    m5StopBreach[m5StopBreach.length - 1] = {
      ...m5StopBreach[m5StopBreach.length - 1],
      low: event.stopLoss - 5,
      close: event.stopLoss - 2,
    };

    const invalidatedRes = await DualStageSignalAlertService.evaluateStage2Confirmation(
      event,
      cfg,
      { timeframeCandles: { M5: m5StopBreach }, nowMs }
    );
    expect(invalidatedRes.newStatus).toBe('INVALIDATED');
    expect(invalidatedRes.reason).toContain('Invalidated by Stop Loss breach');

    // Case B: Expired setup -> EXPIRED
    const expiredClock = new Date(event.expiresAt).getTime() + 60_000;
    const expiredRes = await DualStageSignalAlertService.evaluateStage2Confirmation(
      { ...event, lifecycleStatus: 'PENDING_CONFIRMATION' },
      cfg,
      { timeframeCandles: { M5: m5StopBreach }, nowMs: expiredClock }
    );
    expect(expiredRes.newStatus).toBe('EXPIRED');
  }, 30000);

  it('9. Pengujian Wajib #9: Repeated evaluations on the same candle never create duplicate events or notifications', async () => {
    const nowMs = Date.now();
    const h4Dur = 4 * 3600 * 1000;
    const h1Dur = 3600 * 1000;

    const cfg: SignalAlertConfig = {
      ...testConfig,
      symbol: 'AUDUSD',
      initialScoreThreshold: 45,
      confirmationScoreThreshold: 45,
      minAdx: 0,
    };

    const bullH4 = buildTrendCandles('AUDUSD', 'H4', 'BULLISH', 120, h4Dur, nowMs - 120_000);
    const bullH1 = buildTrendCandles('AUDUSD', 'H1', 'BULLISH', 120, h1Dur, nowMs - 120_000);
    const bullM15 = buildM15PullbackCandles('AUDUSD', 'BULLISH', 120, nowMs - 120_000, true);
    const bullM5 = buildM5BosCandles('AUDUSD', 'BUY', 120, nowMs - 10_000, {
      hasBos: true,
      validConfirmationCandle: true,
    });

    const firstS1 = await DualStageSignalAlertService.evaluateStage1ForConfig(cfg, {
      timeframeCandles: { H4: bullH4, H1: bullH1, M15: bullM15 },
      nowMs,
    });
    expect(firstS1.createdNewEvent).toBe(true);

    // Second evaluation of exact same M15 candle
    const secondS1 = await DualStageSignalAlertService.evaluateStage1ForConfig(cfg, {
      timeframeCandles: { H4: bullH4, H1: bullH1, M15: bullM15 },
      nowMs,
    });
    expect(secondS1.createdNewEvent).toBe(false);
    expect(secondS1.signalEvent?.id).toBe(firstS1.signalEvent?.id);

    // Stage 2 first confirmation
    const firstS2 = await DualStageSignalAlertService.evaluateStage2Confirmation(
      firstS1.signalEvent!,
      cfg,
      { timeframeCandles: { M5: bullM5 }, nowMs }
    );
    expect(firstS2.newStatus).toBe('CONFIRMED');

    // Stage 2 repeated evaluation on already-confirmed event
    const confirmedEvent = await db.getSignalLifecycleEventById(firstS1.signalEvent!.id);
    const secondS2 = await DualStageSignalAlertService.evaluateStage2Confirmation(
      confirmedEvent!,
      cfg,
      { timeframeCandles: { M5: bullM5 }, nowMs }
    );
    expect(secondS2.newStatus).toBe('CONFIRMED');
    expect(secondS2.notificationQueued).toBe(false);
    expect(secondS2.reason).toContain('Idempotent guard');
  }, 30000);

  it('10. Pengujian Wajib #10: WhatsApp failure, ambiguous timeout (no retry), manual test prerequisite, template payload, and successful delivery', async () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAB_SUPER_SECRET_META_TOKEN_999';
    process.env.WHATSAPP_APP_SECRET = 'META_APP_SECRET_XYZ_888';
    process.env.WHATSAPP_RECIPIENT_NUMBER = '+6281234567890';

    const provider = new WhatsAppCloudProvider();
    expect(normalizeWhatsAppRecipient('+62 812-3456-7890')).toBe('6281234567890');
    expect(maskSensitiveIdentifier('123456789012345', 4)).toBe('123****2345');

    // Secret redaction check
    const redacted = provider.redactSecrets(
      'Error with EAAB_SUPER_SECRET_META_TOKEN_999 and META_APP_SECRET_XYZ_888'
    );
    expect(redacted).not.toContain('EAAB_SUPER_SECRET_META_TOKEN_999');
    expect(redacted).not.toContain('META_APP_SECRET_XYZ_888');

    // Proactive Template payload check (for outside 24h service window)
    const templatePayload = provider.buildCloudApiPayload({
      recipient: '6281234567890',
      messageBody: 'Fallback text',
      notificationType: 'INITIAL_SIGNAL',
      config: { ...testConfig, useTemplateMessage: true },
    });
    expect(templatePayload.type).toBe('template');
    expect(templatePayload.template.name).toBe('tradepilot_stage1_setup_alert');

    // 1. Ambiguous Timeout -> TIMEOUT_AMBIGUOUS, isRetryable: false
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortErr);

    const timeoutRes = await provider.dispatchPayloadToMeta({
      messaging_product: 'whatsapp',
      to: '6281234567890',
      type: 'text',
      text: { body: 'Test' },
    });
    expect(timeoutRes.status).toBe('TIMEOUT_AMBIGUOUS');
    expect(timeoutRes.isAmbiguousTimeout).toBe(true);
    expect(timeoutRes.isRetryable).toBe(false);

    // 2. HTTP 400 Meta API failure -> FAILED, non-retryable, secrets redacted
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: 'Invalid parameter with token EAAB_SUPER_SECRET_META_TOKEN_999',
            code: 100,
          },
        }),
        { status: 400 }
      )
    );
    const failRes = await provider.dispatchPayloadToMeta({
      messaging_product: 'whatsapp',
      to: '6281234567890',
      type: 'text',
      text: { body: 'Test' },
    });
    expect(failRes.status).toBe('FAILED');
    expect(failRes.sanitizedResponse).not.toContain('EAAB_SUPER_SECRET_META_TOKEN_999');

    // 3. Successful Manual Test via POST /api/alerts/whatsapp/test unlocks lastVerifiedTestAt
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.HBgNNjI4MTIzNDU2Nzg5MA==' }] }), {
        status: 200,
      })
    );

    const apiTestRes = await invokeApi({
      method: 'POST',
      path: '/api/alerts/whatsapp/test',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { recipient: '+6281234567890' },
    });

    expect(apiTestRes.status).toBe(200);
    expect(apiTestRes.body.success).toBe(true);
    expect(apiTestRes.body.job.status).toBe('SENT');
    expect(apiTestRes.body.whatsappStatus.verifiedByManualTest).toBe(true);
  }, 30000);

  it('11. Pengujian Wajib #11: XAUUSD entitlement / missing data / exhausted Twelve Data quota', async () => {
    process.env.TWELVEDATA_MAX_CREDITS_PER_MINUTE = '6';
    process.env.TWELVEDATA_MAX_CREDITS_PER_DAY = '750';
    twelveDataBudget.resetForTests();

    const now = Date.now();
    expect(twelveDataBudget.getMaxPerMinute()).toBe(6);
    expect(twelveDataBudget.getMaxPerDay()).toBe(750);

    // Exhaust the 6-credits/minute internal budget
    for (let i = 0; i < 6; i++) {
      expect(twelveDataBudget.canSpendBackgroundCredit(1, now).allowed).toBe(true);
      twelveDataBudget.recordCreditUsage(1, undefined, now);
    }

    const overQuota = twelveDataBudget.canSpendBackgroundCredit(1, now);
    expect(overQuota.allowed).toBe(false);
    expect(overQuota.reason).toContain('per-minute budget reached');

    // Audit symbol availability when quota is exhausted and no fresh DB candles exist for NZDUSD
    const auditReport = await DualStageSignalAlertService.auditSymbolAvailability(
      'NZDUSD',
      true,
      now
    );
    expect(auditReport.overallAccessible).toBe(false);
    expect(['QUOTA_EXCEEDED', 'PARTIAL_OR_STALE', 'NO_DATA']).toContain(auditReport.overallStatus);
    expect(auditReport.summaryReason).toContain('blocked');
  }, 30000);

  it('12. Pengujian Wajib #12: Endpoint authorization and strict multi-user data isolation', async () => {
    // 1. Unauthenticated request must return 401
    const unauthRes = await invokeApi({ method: 'GET', path: '/api/alerts/overview' });
    expect(unauthRes.status).toBe(401);

    // 2. Cron endpoint without CRON_SECRET must return 401
    process.env.CRON_SECRET = 'tradepilot_cron_secret_test';
    const badCron = await invokeApi({ method: 'GET', path: '/api/alerts/cron' });
    expect(badCron.status).toBe(401);

    // 3. Cron endpoint with valid CRON_SECRET but ALERT_SCHEDULER_ENABLED=false must skip execution safely
    const disabledCron = await invokeApi({
      method: 'GET',
      path: '/api/alerts/cron',
      headers: { Authorization: 'Bearer tradepilot_cron_secret_test' },
    });
    expect(disabledCron.status).toBe(200);
    expect(disabledCron.body.skipped).toBe(true);

    // 4. User B cannot delete or modify User A's SignalAlertConfig
    const deleteAttemptByB = await invokeApi({
      method: 'DELETE',
      path: `/api/alerts/configs/${testConfig.id}`,
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    expect(deleteAttemptByB.status).toBe(404);

    // 5. User B's overview only contains User B's configs and events, never User A's
    const userBOverview = await invokeApi({
      method: 'GET',
      path: '/api/alerts/overview',
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    expect(userBOverview.status).toBe(200);
    const userBConfigIds = (userBOverview.body.configs || []).map((c: any) => c.id);
    expect(userBConfigIds).not.toContain(testConfig.id);
  }, 30000);
});
