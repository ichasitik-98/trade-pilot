import { Candle } from '../../server/types/index.ts';

const ONE_HOUR = 3600000;
const BASE_TIME = 1709280000000; // Fixed UTC epoch

/**
 * 1. Bullish Trend Fixture (300 candles with steadily rising prices)
 */
export const createBullishCandles = (count: number = 300): Candle[] => {
  const candles: Candle[] = [];
  let basePrice = 1.0800;

  for (let i = 0; i < count; i++) {
    const open = basePrice + i * 0.0003;
    const close = open + 0.0002;
    const high = close + 0.0003;
    const low = open - 0.0001;

    candles.push({
      symbol: 'EURUSD',
      timeframe: 'H1',
      timestamp: BASE_TIME + i * ONE_HOUR,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: 1500,
      source: 'TEST',
      isClosed: true,
    });
  }
  return candles;
};

/**
 * 2. Bearish Trend Fixture (300 candles with steadily falling prices)
 */
export const createBearishCandles = (count: number = 300): Candle[] => {
  const candles: Candle[] = [];
  let basePrice = 1.1500;

  for (let i = 0; i < count; i++) {
    const open = basePrice - i * 0.0003;
    const close = open - 0.0002;
    const high = open + 0.0001;
    const low = close - 0.0003;

    candles.push({
      symbol: 'EURUSD',
      timeframe: 'H1',
      timestamp: BASE_TIME + i * ONE_HOUR,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: 1500,
      source: 'TEST',
      isClosed: true,
    });
  }
  return candles;
};

/**
 * 3. Sideways / Ranging Market Fixture (300 candles oscillating around a mean)
 */
export const createSidewaysCandles = (count: number = 300): Candle[] => {
  const candles: Candle[] = [];
  const mean = 1.0850;

  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i * 0.2) * 0.0015;
    const open = mean + wave;
    const close = mean + Math.sin((i + 1) * 0.2) * 0.0015;
    const high = Math.max(open, close) + 0.0004;
    const low = Math.min(open, close) - 0.0004;

    candles.push({
      symbol: 'EURUSD',
      timeframe: 'H1',
      timestamp: BASE_TIME + i * ONE_HOUR,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: 1000,
      source: 'TEST',
      isClosed: true,
    });
  }
  return candles;
};

/**
 * 4. High Volatility Fixture (large candle ranges)
 */
export const createHighVolatilityCandles = (count: number = 50): Candle[] => {
  const candles: Candle[] = [];
  const base = 2350.0; // Gold scale

  for (let i = 0; i < count; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const open = base + sign * 15;
    const close = base - sign * 15;
    const high = Math.max(open, close) + 25;
    const low = Math.min(open, close) - 25;

    candles.push({
      symbol: 'XAUUSD',
      timeframe: 'H1',
      timestamp: BASE_TIME + i * ONE_HOUR,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 5000,
      source: 'TEST',
      isClosed: true,
    });
  }
  return candles;
};

/**
 * 5. Low Volatility Fixture (tiny candle ranges)
 */
export const createLowVolatilityCandles = (count: number = 50): Candle[] => {
  const candles: Candle[] = [];
  const base = 1.0850;

  for (let i = 0; i < count; i++) {
    const open = base;
    const close = base + 0.00005;
    const high = base + 0.00008;
    const low = base - 0.00004;

    candles.push({
      symbol: 'EURUSD',
      timeframe: 'H1',
      timestamp: BASE_TIME + i * ONE_HOUR,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: 200,
      source: 'TEST',
      isClosed: true,
    });
  }
  return candles;
};

/**
 * 6. Malformed Candles Fixture (invalid prices and bounds)
 */
export const malformedCandlesFixture = [
  { symbol: 'EURUSD', timeframe: 'H1', timestamp: BASE_TIME, open: -1.0, high: 1.08, low: 1.05, close: 1.06 }, // negative open
  { symbol: 'EURUSD', timeframe: 'H1', timestamp: BASE_TIME + ONE_HOUR, open: 1.08, high: 1.05, low: 1.09, close: 1.06 }, // high < low
  { symbol: 'EURUSD', timeframe: 'H1', timestamp: BASE_TIME + 2 * ONE_HOUR, open: 1.08, high: 1.07, low: 1.04, close: 1.06 }, // high < open
  { symbol: 'EURUSD', timeframe: 'H1', timestamp: 0, open: 1.08, high: 1.09, low: 1.07, close: 1.08 }, // invalid timestamp
  { symbol: '', timeframe: 'H1', timestamp: BASE_TIME + 3 * ONE_HOUR, open: 1.08, high: 1.09, low: 1.07, close: 1.08 }, // empty symbol
];

/**
 * 7. Gapped Candles Fixture (missing 10:00 timestamp)
 */
export const createGappedCandles = (): Candle[] => {
  return [
    { symbol: 'EURUSD', timeframe: 'H1', timestamp: BASE_TIME, open: 1.08, high: 1.09, low: 1.07, close: 1.085, volume: 100, source: 'TEST', isClosed: true },
    { symbol: 'EURUSD', timeframe: 'H1', timestamp: BASE_TIME + ONE_HOUR, open: 1.085, high: 1.095, low: 1.08, close: 1.09, volume: 100, source: 'TEST', isClosed: true },
    // Missing BASE_TIME + 2 * ONE_HOUR
    { symbol: 'EURUSD', timeframe: 'H1', timestamp: BASE_TIME + 3 * ONE_HOUR, open: 1.09, high: 1.10, low: 1.085, close: 1.095, volume: 100, source: 'TEST', isClosed: true },
  ];
};
