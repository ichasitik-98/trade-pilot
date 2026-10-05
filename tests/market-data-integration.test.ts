import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../server/db/storage.ts';
import { MarketDataSyncService } from '../server/services/market-data-sync.ts';
import { MarketDataProviderFactory } from '../server/providers/market-data/factory.ts';
import { MultiTimeframeAnalysisService } from '../server/services/multi-timeframe.ts';
import { evaluateSignal } from '../server/engines/signal-scoring.ts';
import { analyzeMarketStructure } from '../server/engines/market-structure.ts';
import { IndicatorEngine } from '../server/engines/indicators/index.ts';
import {
  createBullishCandles,
  createBearishCandles,
  createSidewaysCandles,
} from './fixtures/market-candles.ts';

describe('Market Data Architecture Integration Tests', () => {
  beforeEach(async () => {
    await db.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Pipeline: Provider -> Normalizer -> Validator -> Storage -> Indicators -> Market Analysis', async () => {
    const symbol = 'EURUSD';
    const timeframe = 'H1';

    // Mock provider to return existing persisted real Twelve Data candles without making external HTTP calls
    const provider = MarketDataProviderFactory.getProvider();
    vi.spyOn(provider, 'getCandles').mockImplementation(async (sym, tf) => {
      const existing = await db.getCandles({ symbol: sym, timeframe: tf, limit: 150 });
      return existing;
    });

    // 1. Synchronize candles through pipeline
    const syncRes = await MarketDataSyncService.syncHistoricalCandles(symbol, timeframe, 100);

    expect(syncRes.candles.length).toBeGreaterThanOrEqual(50);
    expect(syncRes.dataStatus.status).toBeDefined();
    expect(syncRes.dataQuality).toBeGreaterThanOrEqual(70);

    // 2. Indicators calculated and cached
    const storedIndicators = await db.getTechnicalIndicators(symbol, timeframe, 1);
    expect(storedIndicators.length).toBe(1);
    expect(storedIndicators[0].rsi14).toBeDefined();

    // 3. Multi-timeframe synthesis
    const marketAnalysis = await MarketDataSyncService.refreshSymbol(symbol);
    expect(marketAnalysis.symbol).toBe(symbol);
    expect(marketAnalysis.overallBias).toBeDefined();
    expect(marketAnalysis.multiTimeframe).toBeDefined();
    expect(marketAnalysis.nearestSupport).toBeDefined();
    expect(marketAnalysis.nearestResistance).toBeDefined();
  }, 30000);

  it('Signal Engine: Successfully consumes validated MarketAnalysis & indicators', async () => {
    const symbol = 'EURUSD';
    const timeframe = 'H1';

    const candles = createBullishCandles(100);
    const indicator = IndicatorEngine.computeLatestSnapshot(candles, symbol, timeframe);
    const structure = analyzeMarketStructure(candles as any, 3);
    const currentPrice = candles[candles.length - 1].close;

    const signal = evaluateSignal({
      userId: 'test_user_01',
      pair: symbol,
      timeframe,
      direction: 'LONG',
      candles: candles as any,
      indicator,
      structure,
      entryPrice: currentPrice,
      stopLoss: currentPrice - 0.0030,
      takeProfit1: currentPrice + 0.0060,
      takeProfit2: currentPrice + 0.0090,
      dataStatus: 'LIVE',
      dataQuality: 98,
    });

    expect(signal.status).not.toBe('BLOCKED');
    expect(signal.score).toBeGreaterThan(0);

    // Verifies transparency component exists
    const qualityComp = signal.components.find((c) => c.component === 'Data Quality & Provenance');
    expect(qualityComp).toBeDefined();
    expect(qualityComp?.rawValue).toContain('Quality: 98/100');
  });

  it('Safety Block: Rejects signal generation when market data is STALE', () => {
    const symbol = 'EURUSD';
    const timeframe = 'H1';
    const candles = createBullishCandles(100);
    const indicator = IndicatorEngine.computeLatestSnapshot(candles, symbol, timeframe);
    const structure = analyzeMarketStructure(candles as any, 3);
    const currentPrice = candles[candles.length - 1].close;

    const signal = evaluateSignal({
      userId: 'test_user_01',
      pair: symbol,
      timeframe,
      direction: 'LONG',
      candles: candles as any,
      indicator,
      structure,
      entryPrice: currentPrice,
      stopLoss: currentPrice - 0.0030,
      takeProfit1: currentPrice + 0.0060,
      takeProfit2: currentPrice + 0.0090,
      dataStatus: 'STALE', // STALE data feed
      dataQuality: 60,
    });

    expect(signal.status).toBe('BLOCKED');
    expect(signal.explanation).toContain('STALE');
  });

  it('Safety Block: Rejects signal generation when data quality is low (< 50)', () => {
    const symbol = 'EURUSD';
    const timeframe = 'H1';
    const candles = createBullishCandles(100);
    const indicator = IndicatorEngine.computeLatestSnapshot(candles, symbol, timeframe);
    const structure = analyzeMarketStructure(candles as any, 3);
    const currentPrice = candles[candles.length - 1].close;

    const signal = evaluateSignal({
      userId: 'test_user_01',
      pair: symbol,
      timeframe,
      direction: 'LONG',
      candles: candles as any,
      indicator,
      structure,
      entryPrice: currentPrice,
      stopLoss: currentPrice - 0.0030,
      takeProfit1: currentPrice + 0.0060,
      takeProfit2: currentPrice + 0.0090,
      dataStatus: 'LIVE',
      dataQuality: 40, // Low data quality
    });

    expect(signal.status).toBe('BLOCKED');
    expect(signal.explanation).toContain('quality score (40/100)');
  });

  it('Safety Block: Rejects signal generation when insufficient candles (< 20)', () => {
    const symbol = 'EURUSD';
    const timeframe = 'H1';
    const candles = createBullishCandles(10); // only 10 candles
    const indicator = IndicatorEngine.computeLatestSnapshot(candles, symbol, timeframe);
    const structure = analyzeMarketStructure(candles as any, 3);
    const currentPrice = candles[candles.length - 1].close;

    const signal = evaluateSignal({
      userId: 'test_user_01',
      pair: symbol,
      timeframe,
      direction: 'LONG',
      candles: candles as any,
      indicator,
      structure,
      entryPrice: currentPrice,
      stopLoss: currentPrice - 0.0030,
      takeProfit1: currentPrice + 0.0060,
      takeProfit2: currentPrice + 0.0090,
      dataStatus: 'LIVE',
      dataQuality: 100,
    });

    expect(signal.status).toBe('BLOCKED');
    expect(signal.explanation).toContain('Insufficient market candle data');
  });

  it('Safety Block: Rejects signal generation when provider is in ERROR state', () => {
    const symbol = 'EURUSD';
    const timeframe = 'H1';
    const candles = createBullishCandles(50);
    const indicator = IndicatorEngine.computeLatestSnapshot(candles, symbol, timeframe);
    const structure = analyzeMarketStructure(candles as any, 3);
    const currentPrice = candles[candles.length - 1].close;

    const signal = evaluateSignal({
      userId: 'test_user_01',
      pair: symbol,
      timeframe,
      direction: 'LONG',
      candles: candles as any,
      indicator,
      structure,
      entryPrice: currentPrice,
      stopLoss: currentPrice - 0.0030,
      takeProfit1: currentPrice + 0.0060,
      takeProfit2: currentPrice + 0.0090,
      dataStatus: 'ERROR',
      dataQuality: 20,
    });

    expect(signal.status).toBe('BLOCKED');
    expect(signal.explanation).toContain('ERROR');
  });
});
