import { describe, it, expect } from 'vitest';
import { analyzeMarketStructure, detectSwingPoints } from '../server/engines/market-structure.ts';
import { MarketCandle } from '../server/types/index.ts';

describe('Market Structure Engine Tests', () => {
  it('detects swing highs and swing lows with configurable lookback', () => {
    // Construct a V-top candle sequence: 10, 12, 14, 20 (high), 15, 13, 11
    const prices = [10, 12, 14, 20, 15, 13, 11];
    const candles: MarketCandle[] = prices.map((p, i) => ({
      pair: 'EURUSD',
      timeframe: 'H1',
      timestamp: (i + 1) * 3600000,
      open: p - 0.5,
      high: p + 1.0,
      low: p - 1.0,
      close: p,
      volume: 1000,
    }));

    // With lookback = 2, index 3 (high = 21.0) is higher than 2 bars before and 2 bars after
    const { swingHighs } = detectSwingPoints(candles, 2);
    expect(swingHighs.length).toBe(1);
    expect(swingHighs[0].price).toBe(21.0);
  });

  it('identifies Higher Highs, Higher Lows, and Bullish BOS in uptrend', () => {
    // 25 ascending wavy candles
    const candles: MarketCandle[] = [];
    let price = 100;
    for (let i = 0; i < 25; i++) {
      const wave = (i % 6) < 3 ? 2 : -1;
      price += wave;
      candles.push({
        pair: 'EURUSD',
        timeframe: 'H1',
        timestamp: (i + 1) * 3600000,
        open: price,
        high: price + 1.5,
        low: price - 0.5,
        close: price + 1.0,
        volume: 1000,
      });
    }

    const structure = analyzeMarketStructure(candles, 2);
    expect(structure.trend).toBe('BULLISH');
    expect(structure.swingHighs.length).toBeGreaterThan(0);
  });

  it('fails safely with NEUTRAL trend when dataset has fewer than 10 candles', () => {
    const candles: MarketCandle[] = Array.from({ length: 5 }, (_, i) => ({
      pair: 'EURUSD',
      timeframe: 'H1',
      timestamp: (i + 1) * 3600000,
      open: 1.08,
      high: 1.09,
      low: 1.07,
      close: 1.085,
      volume: 1000,
    }));

    const structure = analyzeMarketStructure(candles, 3);
    expect(structure.trend).toBe('NEUTRAL');
    expect(structure.isBullishBOS).toBe(false);
  });
});
