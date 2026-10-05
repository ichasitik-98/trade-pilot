import { describe, it, expect } from 'vitest';
import { evaluateSignal, validateGeometry } from '../server/engines/signal-scoring.ts';
import { MarketCandle, TechnicalIndicator, MarketStructure } from '../server/types/index.ts';

describe('Signal Engine & Confluence Scoring Tests', () => {
  const mockCandles: MarketCandle[] = Array.from({ length: 30 }, (_, i) => ({
    pair: 'EURUSD',
    timeframe: 'H1',
    timestamp: (i + 1) * 3600000,
    open: 1.0800 + i * 0.0005,
    high: 1.0820 + i * 0.0005,
    low: 1.0790 + i * 0.0005,
    close: 1.0815 + i * 0.0005,
    volume: 1500,
  }));

  const mockIndicator: TechnicalIndicator = {
    pair: 'EURUSD',
    timeframe: 'H1',
    timestamp: Date.now(),
    sma20: 1.0800,
    sma50: 1.0750,
    sma200: 1.0650,
    ema20: 1.0820,
    ema50: 1.0780,
    ema200: 1.0680,
    rsi14: 55.0,
    macd: 0.0015,
    macdSignal: 0.0010,
    macdHistogram: 0.0005,
    atr14: 0.0020,
    bbUpper: 1.0900,
    bbMiddle: 1.0820,
    bbLower: 1.0740,
    adx14: 28.0,
  };

  const mockStructure: MarketStructure = {
    trend: 'BULLISH',
    swingHighs: [{ timestamp: 1000, price: 1.0880 }],
    swingLows: [{ timestamp: 2000, price: 1.0760 }],
    isHigherHigh: true,
    isHigherLow: true,
    isLowerHigh: false,
    isLowerLow: false,
    isBullishBOS: true,
    isBearishBOS: false,
    isPullback: false,
    lastStructureEvent: 'BULLISH_BOS',
  };

  it('evaluates a clean LONG setup and produces explainable components summing to total score', () => {
    // entry 1.0850, SL 1.0820 (30 pips risk = 1.5x ATR), TP 1.0940 (90 pips reward = 3.0R)
    const signal = evaluateSignal({
      userId: 'u1',
      pair: 'EURUSD',
      timeframe: 'H1',
      direction: 'LONG',
      candles: mockCandles,
      indicator: mockIndicator,
      structure: mockStructure,
      entryPrice: 1.0850,
      stopLoss: 1.0820,
      takeProfit1: 1.0940,
      takeProfit2: 1.0980,
    });

    expect(signal.status).not.toBe('BLOCKED');
    expect(signal.score).toBeGreaterThanOrEqual(70);
    expect(signal.components.length).toBe(7);

    // Sum of components must equal total score
    const componentSum = signal.components.reduce((sum, c) => sum + c.score, 0);
    expect(componentSum).toBe(signal.score);

    // Total weights must equal 100
    const totalWeights = signal.components.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeights).toBe(100);
  });

  it('rejects trades where Risk/Reward is below 1:1 as BLOCKED', () => {
    // Entry 1.0850, SL 1.0800 (risk 50 pips), TP 1.0880 (reward 30 pips -> 0.6R < 1.0R)
    const blockedSignal = evaluateSignal({
      userId: 'u1',
      pair: 'EURUSD',
      timeframe: 'H1',
      direction: 'LONG',
      candles: mockCandles,
      indicator: mockIndicator,
      structure: mockStructure,
      entryPrice: 1.0850,
      stopLoss: 1.0800,
      takeProfit1: 1.0880,
      takeProfit2: 1.0920,
    });

    expect(blockedSignal.status).toBe('BLOCKED');
    expect(blockedSignal.explanation).toContain('Risk/Reward');
  });

  it('enforces directional geometry: LONG requires SL < Entry < TP; SHORT requires TP < Entry < SL', () => {
    // Invalid LONG: SL above Entry
    const invalidLong = validateGeometry('LONG', 100, 105, 115);
    expect(invalidLong.valid).toBe(false);

    // Invalid LONG: TP below Entry
    const invalidLongTP = validateGeometry('LONG', 100, 95, 90);
    expect(invalidLongTP.valid).toBe(false);

    // Valid LONG
    const validLong = validateGeometry('LONG', 100, 95, 110);
    expect(validLong.valid).toBe(true);

    // Invalid SHORT: SL below Entry
    const invalidShort = validateGeometry('SHORT', 100, 95, 90);
    expect(invalidShort.valid).toBe(false);

    // Valid SHORT
    const validShort = validateGeometry('SHORT', 100, 105, 90);
    expect(validShort.valid).toBe(true);
  });
});
