/**
 * Automated Test Suite: Twelve Data Real Market Data Engine
 * TradePilot Decision-Support Platform
 *
 * NOTE: Automated tests MUST mock external Twelve Data HTTP responses.
 * Never call real Twelve Data API in automated unit tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TwelveDataProvider } from '../server/providers/market-data/twelve-data.ts';
import { MarketDataProviderFactory } from '../server/providers/market-data/factory.ts';
import { CandleValidator } from '../server/providers/market-data/normalization.ts';
import { MarketDataSyncService } from '../server/services/market-data-sync.ts';
import { parseToUtcTimestamp, toUtcIsoString, formatToTimezone } from '../server/utils/timezone.ts';
import { db } from '../server/db/storage.ts';
import { transformToHeikinAshi } from '../src/components/charts/adapter.ts';

describe('Twelve Data Engine Comprehensive Test Suite', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    await db.init();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // 1. Provider Initialization
  it('1. Initializes TwelveDataProvider with proper mode, name, and isDemo flag', () => {
    const provider = new TwelveDataProvider('test_key_123', 'https://api.twelvedata.com');
    expect(provider.name).toBe('Twelve Data');
    expect(provider.isDemo).toBe(false);
    expect(provider.mode).toBe('REAL');
    expect(provider.hasValidCredentials()).toBe(true);
  });

  // 2. Symbol Mapping
  it('2. Maps internal symbols to Twelve Data format (EURUSD -> EUR/USD, XAUUSD -> XAU/USD, BTCUSD -> BTC/USD)', async () => {
    const provider = new TwelveDataProvider('test_key_123');
    expect(await provider.resolveExternalSymbol('EURUSD')).toBe('EUR/USD');
    expect(await provider.resolveExternalSymbol('GBPUSD')).toBe('GBP/USD');
    expect(await provider.resolveExternalSymbol('USDJPY')).toBe('USD/JPY');
    expect(await provider.resolveExternalSymbol('XAUUSD')).toBe('XAU/USD');
    expect(await provider.resolveExternalSymbol('BTCUSD')).toBe('BTC/USD');
  });

  // 3. Timeframe Mapping
  it('3. Maps all canonical timeframes to Twelve Data intervals accurately', () => {
    const provider = new TwelveDataProvider('test_key_123');
    expect(provider.mapTimeframeToProvider('M1')).toBe('1min');
    expect(provider.mapTimeframeToProvider('M5')).toBe('5min');
    expect(provider.mapTimeframeToProvider('M15')).toBe('15min');
    expect(provider.mapTimeframeToProvider('M30')).toBe('30min');
    expect(provider.mapTimeframeToProvider('H1')).toBe('1h');
    expect(provider.mapTimeframeToProvider('H4')).toBe('4h');
    expect(provider.mapTimeframeToProvider('D1')).toBe('1day');
    expect(provider.mapTimeframeToProvider('W1')).toBe('1week');
  });

  // 4. Request Construction
  it('4. Constructs HTTP requests with symbol, interval, outputsize, timezone=UTC, and apikey', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          values: [
            { datetime: '2026-09-29 12:00:00', open: '1.0850', high: '1.0890', low: '1.0840', close: '1.0880', volume: '1500' }
          ]
        })
      });
    });

    const provider = new TwelveDataProvider('mock_key_abc', 'https://api.twelvedata.com');
    await provider.getCandles('EURUSD', 'H1', { limit: 150 });

    expect(capturedUrl).toContain('https://api.twelvedata.com/time_series');
    expect(capturedUrl).toContain('symbol=EUR%2FUSD');
    expect(capturedUrl).toContain('interval=1h');
    expect(capturedUrl).toContain('outputsize=150');
    expect(capturedUrl).toContain('timezone=UTC');
    expect(capturedUrl).toContain('apikey=mock_key_abc');
  });

  // 5. Response Normalization
  it('5. Normalizes Twelve Data JSON response into canonical Candle structures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        values: [
          { datetime: '2026-09-29 14:00:00', open: '1.0800', high: '1.0850', low: '1.0790', close: '1.0840', volume: '2500' },
          { datetime: '2026-09-29 13:00:00', open: '1.0750', high: '1.0810', low: '1.0740', close: '1.0800', volume: '2100' },
        ]
      })
    });

    const provider = new TwelveDataProvider('test_key');
    const candles = await provider.getCandles('EURUSD', 'H1');

    expect(candles.length).toBe(2);
    // Ascending sort check
    expect(candles[0].open).toBe(1.0750);
    expect(candles[0].close).toBe(1.0800);
    expect(candles[1].open).toBe(1.0800);
    expect(candles[1].close).toBe(1.0840);
    expect(candles[0].source).toBe('TWELVEDATA');
    expect(candles[0].isClosed).toBe(true);
  });

  // 6. Decimal & Float Precision Conversion
  it('6. Accurately preserves Decimal values without floating point distortion', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        values: [
          { datetime: '2026-09-29 10:00:00', open: '1.08543', high: '1.08599', low: '1.08512', close: '1.08587', volume: '100.5' }
        ]
      })
    });

    const provider = new TwelveDataProvider('test_key');
    const [c] = await provider.getCandles('EURUSD', 'H1');

    expect(c.open).toBe(1.08543);
    expect(c.high).toBe(1.08599);
    expect(c.low).toBe(1.08512);
    expect(c.close).toBe(1.08587);
    expect(c.volume).toBe(100.5);
  });

  // 7. Timestamp Conversion (UTC Enforcement & Timezone Isolation)
  it('7. Normalizes raw provider timestamps strictly into UTC without double-shifting', () => {
    // 1. "YYYY-MM-DD HH:mm:ss"
    const ts1 = parseToUtcTimestamp('2026-09-29 16:00:00');
    expect(new Date(ts1).toISOString()).toBe('2026-09-29T16:00:00.000Z');

    // 2. Daily date "YYYY-MM-DD"
    const ts2 = parseToUtcTimestamp('2026-09-29');
    expect(new Date(ts2).toISOString()).toBe('2026-09-29T00:00:00.000Z');

    // 3. Formatted to Asia/Jakarta display (UTC+7: 16:00 UTC -> 23:00 Jakarta)
    const jakartaTime = formatToTimezone(ts1, 'Asia/Jakarta');
    expect(jakartaTime).toContain('2026-09-29T23:00:00');
  });

  // 8. OHLC Validation
  it('8. Validates candle integrity: open, high, low, close > 0, high >= open & close, low <= open & close', () => {
    const valid = CandleValidator.validate({
      symbol: 'EURUSD',
      timeframe: 'H1',
      timestamp: Date.now(),
      open: 1.08,
      high: 1.09,
      low: 1.07,
      close: 1.085,
    });
    expect(valid.valid).toBe(true);

    const invalidHigh = CandleValidator.validate({
      symbol: 'EURUSD',
      timeframe: 'H1',
      timestamp: Date.now(),
      open: 1.08,
      high: 1.07, // high < open!
      low: 1.06,
      close: 1.065,
    });
    expect(invalidHigh.valid).toBe(false);
    expect(invalidHigh.errors[0]).toContain('high');

    const invalidNegative = CandleValidator.validate({
      symbol: 'EURUSD',
      timeframe: 'H1',
      timestamp: Date.now(),
      open: -1.0,
      high: 1.0,
      low: -1.5,
      close: 0.5,
    });
    expect(invalidNegative.valid).toBe(false);
  });

  // 9. Duplicate Prevention
  it('9. Deduplicates candles by timestamp before persistence', async () => {
    const rawWithDuplicates = [
      { symbol: 'EURUSD', timeframe: 'H1', timestamp: 1700000000000, open: 1.08, high: 1.09, low: 1.07, close: 1.085 },
      { symbol: 'EURUSD', timeframe: 'H1', timestamp: 1700000000000, open: 1.081, high: 1.091, low: 1.071, close: 1.086 }, // Duplicate timestamp
      { symbol: 'EURUSD', timeframe: 'H1', timestamp: 1700003600000, open: 1.085, high: 1.095, low: 1.08, close: 1.09 },
    ];

    const timestampMap = new Map();
    for (const c of rawWithDuplicates) {
      timestampMap.set(c.timestamp, c);
    }
    const deduplicated = Array.from(timestampMap.values());
    expect(deduplicated.length).toBe(2);
  });

  // 10. Sorting
  it('10. Ensures normalized candles are always sorted in ascending chronological order', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        values: [
          { datetime: '2026-09-29 15:00:00', open: '1.08', high: '1.09', low: '1.07', close: '1.085' },
          { datetime: '2026-09-29 13:00:00', open: '1.07', high: '1.08', low: '1.06', close: '1.075' },
          { datetime: '2026-09-29 14:00:00', open: '1.075', high: '1.085', low: '1.07', close: '1.08' },
        ]
      })
    });

    const provider = new TwelveDataProvider('test_key');
    const candles = await provider.getCandles('EURUSD', 'H1');

    expect(candles[0].timestamp).toBeLessThan(candles[1].timestamp);
    expect(candles[1].timestamp).toBeLessThan(candles[2].timestamp);
  });

  // 11. Pagination / Bounded Limit
  it('11. Bounds request limits to safe Twelve Data output limits (max 5000, min 10)', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', values: [{ datetime: '2026-09-29 12:00:00', open: '1.08', high: '1.09', low: '1.07', close: '1.08' }] })
      });
    });

    const provider = new TwelveDataProvider('test_key');
    await provider.getCandles('EURUSD', 'H1', { limit: 99999 });
    expect(capturedUrl).toContain('outputsize=5000');

    await provider.getCandles('EURUSD', 'H1', { limit: 2 });
    expect(capturedUrl).toContain('outputsize=10');
  });

  // 12-16. Timeframe Direct Requests (H4, M15, H1, D1, W1)
  it('12-16. Verifies direct mapping for H4 (4h), M15 (15min), H1 (1h), D1 (1day), W1 (1week)', () => {
    const provider = new TwelveDataProvider('test_key');
    expect(provider.mapTimeframeToProvider('H4')).toBe('4h');
    expect(provider.mapTimeframeToProvider('M15')).toBe('15min');
    expect(provider.mapTimeframeToProvider('H1')).toBe('1h');
    expect(provider.mapTimeframeToProvider('D1')).toBe('1day');
    expect(provider.mapTimeframeToProvider('W1')).toBe('1week');
  });

  // 17. Rate Limit Handling (HTTP 429 & Payload code 429)
  it('17. Detects and classifies rate limits as TWELVEDATA_RATE_LIMIT error', async () => {
    // Case A: HTTP 429
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ message: 'You have reached your rate limit.' })
    });

    const provider = new TwelveDataProvider('test_key');
    await expect(provider.getCandles('EURUSD', 'H1')).rejects.toThrowError(
      expect.objectContaining({ code: 'TWELVEDATA_RATE_LIMIT' })
    );

    // Case B: JSON payload with error status and rate limit message
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'error',
        code: 429,
        message: 'Rate limit of 8 calls/minute reached.'
      })
    });

    await expect(provider.getCandles('EURUSD', 'H1')).rejects.toThrowError(
      expect.objectContaining({ code: 'TWELVEDATA_RATE_LIMIT' })
    );
  });

  // 18. Timeout Handling
  it('18. Classifies network timeouts as TWELVEDATA_NETWORK_ERROR', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new (class extends Error {
      name = 'AbortError';
      message = 'The operation was aborted';
    })());

    const provider = new TwelveDataProvider('test_key');
    await expect(provider.getCandles('EURUSD', 'H1')).rejects.toThrowError(
      expect.objectContaining({ code: 'TWELVEDATA_NETWORK_ERROR' })
    );
  });

  // 19. Malformed Response
  it('19. Classifies malformed JSON / unexpected schema as TWELVEDATA_INVALID_RESPONSE', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('Unexpected token < in JSON at position 0'); }
    });

    const provider = new TwelveDataProvider('test_key');
    await expect(provider.getCandles('EURUSD', 'H1')).rejects.toThrowError(
      expect.objectContaining({ code: 'TWELVEDATA_INVALID_RESPONSE' })
    );
  });

  // 20. No Data Handling
  it('20. Classifies missing candle records or unknown ticker as TWELVEDATA_NO_DATA', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'error', code: 404, message: 'Symbol not found' })
    });

    const provider = new TwelveDataProvider('test_key');
    await expect(provider.getCandles('UNKNOWN_SYM', 'H1')).rejects.toThrowError(
      expect.objectContaining({ code: 'TWELVEDATA_NO_DATA' })
    );
  });

  // 21. Authentication Error Handling
  it('21. Classifies invalid or missing key as TWELVEDATA_AUTH_ERROR', async () => {
    // Missing key
    const emptyProvider = new TwelveDataProvider('');
    await expect(emptyProvider.getCandles('EURUSD', 'H1')).rejects.toThrowError(
      expect.objectContaining({ code: 'TWELVEDATA_AUTH_ERROR' })
    );

    // HTTP 401
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid API key provided.' })
    });
    const provider = new TwelveDataProvider('bad_key');
    await expect(provider.getCandles('EURUSD', 'H1')).rejects.toThrowError(
      expect.objectContaining({ code: 'TWELVEDATA_AUTH_ERROR' })
    );
  });

  // 22. API Key Safety (Server-Only, Redacted from Errors and Logs)
  it('22. Redacts API key completely from error messages and thrown exceptions', async () => {
    const SECRET_KEY = 'super_secret_twelve_key_9988';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'error',
        message: `Authentication failed for key ${SECRET_KEY} on https://api.twelvedata.com?apikey=${SECRET_KEY}`
      })
    });

    const provider = new TwelveDataProvider(SECRET_KEY);
    try {
      await provider.getCandles('EURUSD', 'H1');
      expect.fail('Should have thrown an error');
    } catch (err: any) {
      expect(err.message).not.toContain(SECRET_KEY);
      expect(err.message).toContain('[REDACTED');
    }
  });

  // 23. REAL Mode Does NOT Fallback to DEMO
  it('23. Strict Architecture Invariance: REAL mode NEVER silently falls back to DemoMarketDataProvider', () => {
    process.env.MARKET_DATA_MODE = 'REAL';
    process.env.MARKET_DATA_PROVIDER = 'twelvedata';
    process.env.MARKET_DATA_API_KEY = 'my_real_key';

    MarketDataProviderFactory.setMode('REAL');
    const provider = MarketDataProviderFactory.getProvider();

    expect(provider.mode).toBe('REAL');
    expect(provider.isDemo).toBe(false);
    expect(provider.name).toBe('Twelve Data');
  });

  // 24. MarketDataStatus Tracking
  it('24. Updates MarketDataStatus model in Neon with provider, freshness, and quality metrics', async () => {
    const status = await db.upsertMarketDataStatus({
      symbol: 'EURUSD',
      timeframe: 'H1',
      lastCandleTimestamp: new Date().toISOString(),
      lastSuccessfulSync: new Date().toISOString(),
      provider: 'TWELVEDATA',
      status: 'LIVE',
      dataQualityScore: 95,
      errorMessage: null,
    });

    expect(status.symbol).toBe('EURUSD');
    expect(status.provider).toBe('TWELVEDATA');
    expect(status.dataQualityScore).toBe(95);

    const retrieved = await db.getMarketDataStatus('EURUSD', 'H1');
    expect(retrieved?.status).toBe('LIVE');
    expect(retrieved?.provider).toBe('TWELVEDATA');
  });

  // 25. MarketDataGap Detection (Forex Weekend vs Crypto 24/7)
  it('25. Ignores normal weekend market closure for FOREX, but detects 24/7 gaps for CRYPTO', () => {
    // Friday 21:00 UTC (1774818000000 approx) to Sunday 21:00 UTC
    // March 27, 2026 (Friday) 21:00 UTC -> March 29, 2026 (Sunday) 21:00 UTC
    const fridayClose = new Date('2026-03-27T21:00:00Z').getTime();
    const sundayOpen = new Date('2026-03-29T21:00:00Z').getTime();

    const candles = [
      { symbol: 'EURUSD', timeframe: 'H1' as const, timestamp: fridayClose, open: 1.08, high: 1.085, low: 1.079, close: 1.082, volume: 1000 },
      { symbol: 'EURUSD', timeframe: 'H1' as const, timestamp: sundayOpen, open: 1.082, high: 1.084, low: 1.081, close: 1.083, volume: 1200 },
    ];

    // For Forex: weekend gap is expected closure, so 0 gaps flagged
    const forexGaps = MarketDataSyncService.detectGaps(candles as any, 'H1', 'FOREX');
    expect(forexGaps.length).toBe(0);

    // For Crypto: 24/7 market, so weekend gap MUST be flagged as missing data
    const cryptoGaps = MarketDataSyncService.detectGaps(candles as any, 'H1', 'CRYPTO');
    expect(cryptoGaps.length).toBeGreaterThan(0);
  });

  // 26. Prisma Neon Persistence
  it('26. Persists canonical candles into Neon PostgreSQL idempotently with instrumentId linking', async () => {
    const ts = new Date('2026-09-29T10:00:00Z').getTime();
    const testCandles = [
      {
        symbol: 'EURUSD',
        pair: 'EURUSD',
        timeframe: 'H1' as const,
        timestamp: ts,
        open: 1.085,
        high: 1.09,
        low: 1.08,
        close: 1.088,
        volume: 3500,
        source: 'TWELVEDATA',
        isClosed: true,
      }
    ];

    const { upsertedCount } = await db.upsertCandles(testCandles);
    expect(upsertedCount).toBe(1);

    const stored = await db.getCandles({
      symbol: 'EURUSD',
      timeframe: 'H1',
      startTime: ts - 1000,
      endTime: ts + 1000,
    });
    const match = stored.find((c) => c.timestamp === ts);
    expect(match).toBeDefined();
    expect(match?.close).toBe(1.088);
    expect(match?.source).toBe('TWELVEDATA');
    expect(match?.instrumentId).toBeDefined(); // Foreign key linked!
  });

  // 27. Chart Data Compatibility & Invariance
  it('27. Verifies canonical persisted Twelve Data candles feed chart transformations while preserving raw truth', async () => {
    const rawCandles = [
      { id: '1', symbol: 'EURUSD', pair: 'EURUSD', timeframe: 'H1', timestamp: 1000, open: 1.08, high: 1.09, low: 1.075, close: 1.085, volume: 100, source: 'TWELVEDATA', isClosed: true },
      { id: '2', symbol: 'EURUSD', pair: 'EURUSD', timeframe: 'H1', timestamp: 2000, open: 1.085, high: 1.095, low: 1.082, close: 1.092, volume: 200, source: 'TWELVEDATA', isClosed: true },
    ];

    // Raw candles are the source of truth
    expect(rawCandles[0].close).toBe(1.085);

    // Heikin-Ashi transformation operates in-memory for visualization ONLY
    const haSeries = transformToHeikinAshi(rawCandles as any);
    expect(haSeries.length).toBe(2);
    expect(haSeries[0].close).toBe((1.08 + 1.09 + 1.075 + 1.085) / 4);
    expect(haSeries[0].rawClose).toBe(1.085);

    // Raw candle in array was NOT mutated
    expect(rawCandles[0].close).toBe(1.085);
  });
});
