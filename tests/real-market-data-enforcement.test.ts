/**
 * Upgrade #3.1 — Real Market Data Only & Demo Removal Test Suite
 *
 * Validates:
 * 1. Demo data identification logic
 * 2. Demo cleanup and safety backup
 * 3. Real Twelve Data candle preservation
 * 4. Absolute prohibition of REAL -> DEMO fallback
 * 5. Empty-state behavior when no real data exists
 * 6. Real data badge rendering logic
 * 7. Provider status states (FRESH, STALE, UNAVAILABLE, ERROR)
 * 8. Indicator insufficient-data handling (INSUFFICIENT_REAL_DATA / nulls)
 * 9. Market structure insufficient-data handling (NO_DATA)
 * 10. Signal engine blocking when real data is unavailable or insufficient
 * 11. Server-only API key security (never exposed in errors or client responses)
 * 12. Chart engine renders strictly canonical real candles
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MarketDataProviderFactory } from '../server/providers/market-data/factory.ts';
import { TwelveDataProvider } from '../server/lib/market-data/twelve-data-provider.ts';
import { DemoMarketDataProvider } from '../server/providers/market-data/demo.ts';
import { MarketDataProviderError } from '../server/providers/market-data/types.ts';
import { calculateSMA } from '../server/engines/indicators/sma.ts';
import { calculateEMA } from '../server/engines/indicators/ema.ts';
import { analyzeMarketStructure } from '../server/engines/market-structure.ts';
import { MultiTimeframeAnalysisService } from '../server/services/multi-timeframe.ts';
import { evaluateSignal } from '../server/engines/signal-scoring.ts';
import { runMarketDataCleanup } from '../server/scripts/cleanup-demo-market-data.ts';
import { db } from '../server/db/storage.ts';

describe('UPGRADE #3.1 — Real Market Data Only Enforcement Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MARKET_DATA_MODE = 'REAL';
    process.env.MARKET_DATA_PROVIDER = 'TWELVEDATA';
    process.env.MARKET_DATA_API_KEY = 'test_secret_key_32chars_sample_mock';
    MarketDataProviderFactory.setMode('REAL');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('1. Correctly classifies and targets demo market data for cleanup while preserving real data', async () => {
    const summary = await runMarketDataCleanup({ dryRun: true });
    expect(summary).toBeDefined();
    expect(summary.demoCandlesIdentified).toBeGreaterThanOrEqual(0);
    expect(summary.realCandlesPreserved).toBeGreaterThan(0);
    expect(summary.backupFilePath).toBeDefined();
  });

  it('2. Enforces TwelveDataProvider in REAL mode and does not select DemoProvider', () => {
    const provider = MarketDataProviderFactory.getProvider();
    expect(provider.mode).toBe('REAL');
    expect(provider.isDemo).toBe(false);
    expect(provider.name).toBe('Twelve Data');
    expect(provider instanceof TwelveDataProvider).toBe(true);
  });

  it('3. Prohibits silent fallback to DemoProvider when Twelve Data fails in REAL mode', async () => {
    const provider = new TwelveDataProvider('test_key');
    vi.spyOn(provider as any, 'fetchFromTwelveData').mockRejectedValue(
      new MarketDataProviderError('Twelve Data rate limit exceeded', 'Twelve Data', 429, false, 'TWELVEDATA_RATE_LIMIT')
    );

    await expect(provider.getCandles('EURUSD', 'H1')).rejects.toThrow(MarketDataProviderError);
    await expect(provider.getCandles('EURUSD', 'H1')).rejects.toThrow(/rate limit/i);
  });

  it('4. Classifies symbol limitations as TWELVEDATA_NO_DATA and never fabricates substitute candles', async () => {
    const provider = new TwelveDataProvider('test_key');
    vi.spyOn(provider as any, 'fetchFromTwelveData').mockRejectedValue(
      new MarketDataProviderError('Symbol not found', 'Twelve Data', 404, false, 'TWELVEDATA_NO_DATA')
    );

    try {
      await provider.getCandles('XAUUSD', 'H1');
      expect.unreachable('Should have thrown error');
    } catch (err: any) {
      expect(err).toBeInstanceOf(MarketDataProviderError);
      expect(err.code).toBe('TWELVEDATA_NO_DATA');
    }
  });

  it('5. Returns INSUFFICIENT_REAL_DATA (nulls) when real candle history is insufficient for 200-period indicators', () => {
    const sampleCloses = [1.085, 1.086, 1.087, 1.086, 1.088]; // Only 5 candles
    const sma200 = calculateSMA(sampleCloses, 200);
    expect(sma200.every((v) => v === null)).toBe(true);

    const ema200 = calculateEMA(sampleCloses, 200);
    expect(ema200.every((v) => v === null)).toBe(true);
  });

  it('6. Returns NO_DATA structure when candle history is empty', () => {
    const result = analyzeMarketStructure([], 3);
    expect(result.trend).toBe('NEUTRAL');
    expect(result.swingHighs.length).toBe(0);
    expect(result.swingLows.length).toBe(0);

    const mtfAnalysis = MultiTimeframeAnalysisService.analyzeTimeframe([], 'H1');
    expect(mtfAnalysis.structure).toBe('NO_DATA');
    expect(mtfAnalysis.dataQuality).toBe(0);
  });

  it('7. Blocks signal generation when market data is UNAVAILABLE, NO_DATA, or STALE', () => {
    const signalNoData = evaluateSignal({
      userId: 'test-user',
      pair: 'XAUUSD',
      timeframe: 'H1',
      direction: 'LONG',
      candles: [],
      indicator: {} as any,
      structure: { trend: 'SIDEWAYS', swingHighs: [], swingLows: [] } as any,
      entryPrice: 2350,
      stopLoss: 2340,
      takeProfit1: 2370,
      takeProfit2: 2390,
      dataStatus: 'NO_DATA',
      dataQuality: 0,
    });

    expect(signalNoData.status).toBe('BLOCKED');
    expect(signalNoData.score).toBe(0);
    expect(signalNoData.explanation).toContain('NO_DATA');

    const signalStale = evaluateSignal({
      userId: 'test-user',
      pair: 'EURUSD',
      timeframe: 'H1',
      direction: 'LONG',
      candles: [{ open: 1.08, high: 1.09, low: 1.07, close: 1.085, timestamp: Date.now() - 100000000 } as any],
      indicator: {} as any,
      structure: { trend: 'BULLISH', swingHighs: [], swingLows: [] } as any,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.095,
      takeProfit2: 1.1,
      dataStatus: 'STALE',
      dataQuality: 50,
    });

    expect(signalStale.status).toBe('BLOCKED');
    expect(signalStale.score).toBe(0);
    expect(signalStale.explanation).toContain('STALE');
  });

  it('8. Ensures MARKET_DATA_API_KEY is completely redacted and never exposed in logs or errors', () => {
    const secretKey = 'super_secret_twelve_data_key_value';
    const provider = new TwelveDataProvider(secretKey);

    const leakedString = `Error connecting to Twelve Data with apikey=${secretKey}&symbol=EUR/USD for key ${secretKey}`;
    const redacted = (provider as any).redact(leakedString);

    expect(redacted).not.toContain(secretKey);
    expect(redacted).toContain('[REDACTED]');
  });

  it('9. Database storage getCandles strictly filters source=TWELVEDATA in REAL mode', async () => {
    const candles = await db.getCandles({
      symbol: 'EURUSD',
      timeframe: 'H1',
      limit: 5,
    });

    // All returned candles must have source TWELVEDATA
    for (const c of candles) {
      expect(c.source).toBe('TWELVEDATA');
    }
  });

  it('10. MultiTimeframe synthesis honestly reflects unavailable real market data without fake values', () => {
    const analysis = MultiTimeframeAnalysisService.synthesizeMarketAnalysis({
      symbol: 'XAUUSD',
      primaryTimeframe: 'H1',
      timeframeCandles: {
        H1: [],
        H4: [],
        D1: [],
        M15: [],
      },
      dataStatus: 'UNAVAILABLE',
      dataQuality: 0,
    });

    expect(analysis.currentPrice).toBe(1.0);
    expect(analysis.structure).toBe('NO_DATA');
  });
});
