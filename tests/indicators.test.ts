import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  calculateADX,
  sanitizeAndSortCandles,
} from '../server/engines/indicators.ts';
import { MarketCandle } from '../server/types/index.ts';

describe('Technical Indicators Engine Tests', () => {
  it('calculates SMA correctly based on sum / n definition', () => {
    const data = [10, 20, 30, 40, 50];
    const sma3 = calculateSMA(data, 3);
    // index 0: null, index 1: null, index 2: 20 (10+20+30)/3, index 3: 30 (20+30+40)/3, index 4: 40 (30+40+50)/3
    expect(sma3[0]).toBeNull();
    expect(sma3[1]).toBeNull();
    expect(sma3[2]).toBe(20);
    expect(sma3[3]).toBe(30);
    expect(sma3[4]).toBe(40);
  });

  it('calculates EMA with standard alpha = 2/(n+1) formula', () => {
    const data = [10, 10, 10, 20, 30];
    const ema3 = calculateEMA(data, 3);
    // first EMA at index 2 = (10+10+10)/3 = 10
    expect(ema3[2]).toBe(10);
    // next EMA: alpha = 2/(3+1) = 0.5. 20*0.5 + 10*0.5 = 15
    expect(ema3[3]).toBe(15);
    // next EMA: 30*0.5 + 15*0.5 = 22.5
    expect(ema3[4]).toBe(22.5);
  });

  it('calculates RSI and handles zero loss without infinity', () => {
    // 15 strictly rising prices -> averageLoss = 0 -> RSI = 100
    const risingCloses = Array.from({ length: 16 }, (_, i) => 100 + i * 2);
    const rsi = calculateRSI(risingCloses, 14);
    expect(rsi[14]).toBe(100);
    expect(Number.isFinite(rsi[14]!)).toBe(true);

    // 15 strictly falling prices -> averageGain = 0 -> RSI = 0
    const fallingCloses = Array.from({ length: 16 }, (_, i) => 100 - i * 2);
    const fallingRSI = calculateRSI(fallingCloses, 14);
    expect(fallingRSI[14]).toBe(0);
  });

  it('calculates Bollinger Bands with mean and standard deviation', () => {
    // Constant prices: stdDev = 0, upper = middle = lower
    const flatCloses = Array.from({ length: 25 }, () => 100);
    const bb = calculateBollingerBands(flatCloses, 20);
    expect(bb.middle[20]).toBe(100);
    expect(bb.upper[20]).toBe(100);
    expect(bb.lower[20]).toBe(100);
  });

  it('sanitizes unordered candles, negative prices, and deduplicates timestamps', () => {
    const rawCandles: MarketCandle[] = [
      { pair: 'EURUSD', timeframe: 'H1', timestamp: 3000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 100 },
      { pair: 'EURUSD', timeframe: 'H1', timestamp: 1000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 100 },
      { pair: 'EURUSD', timeframe: 'H1', timestamp: 2000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 100 },
      { pair: 'EURUSD', timeframe: 'H1', timestamp: 2000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 200 }, // duplicate
      { pair: 'EURUSD', timeframe: 'H1', timestamp: 4000, open: -1.1, high: 1.2, low: 1.0, close: 1.15, volume: 100 }, // negative price (invalid)
      { pair: 'EURUSD', timeframe: 'H1', timestamp: 5000, open: 1.1, high: 1.0, low: 1.2, close: 1.15, volume: 100 }, // high < low (invalid)
    ];

    const clean = sanitizeAndSortCandles(rawCandles);
    expect(clean.length).toBe(3);
    expect(clean[0].timestamp).toBe(1000);
    expect(clean[1].timestamp).toBe(2000);
    expect(clean[2].timestamp).toBe(3000);
  });

  it('fails safely with nulls when candle dataset is insufficient', () => {
    const insufficient = [10, 20];
    const sma20 = calculateSMA(insufficient, 20);
    expect(sma20.every((v) => v === null)).toBe(true);

    const rsi14 = calculateRSI(insufficient, 14);
    expect(rsi14.every((v) => v === null)).toBe(true);
  });
});
