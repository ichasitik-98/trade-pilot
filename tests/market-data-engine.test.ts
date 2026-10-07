import { describe, it, expect } from 'vitest';
import {
  normalizeSymbol,
  isValidSymbol,
  parseTimeframe,
  CandleValidator,
  getTradingSession,
} from '../server/providers/market-data/normalization.ts';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  calculateADX,
  interpretADX,
  IndicatorEngine,
} from '../server/engines/indicators/index.ts';
import {
  classifyTrend,
  classifyMomentum,
  classifyVolatility,
} from '../server/services/multi-timeframe.ts';
import { calculateSupportResistance } from '../server/engines/support-resistance.ts';
import { MarketDataSyncService } from '../server/services/market-data-sync.ts';
import { MarketDataProviderError } from '../server/providers/market-data/types.ts';
import { TIMEFRAMES } from '../server/types/index.ts';
import {
  createBullishCandles,
  createBearishCandles,
  createSidewaysCandles,
  createHighVolatilityCandles,
  createLowVolatilityCandles,
  malformedCandlesFixture,
  createGappedCandles,
} from './fixtures/market-candles.ts';

describe('1. Symbol Normalization & Validation', () => {
  it('normalizes slash, underscore, and broker suffixes to canonical format', () => {
    expect(normalizeSymbol('EUR/USD')).toBe('EURUSD');
    expect(normalizeSymbol('EUR_USD')).toBe('EURUSD');
    expect(normalizeSymbol('EURUSD=X')).toBe('EURUSD');
    expect(normalizeSymbol('BTC/USDT')).toBe('BTCUSD');
    expect(normalizeSymbol('XAU/USD')).toBe('XAUUSD');
    expect(normalizeSymbol('GOLD')).toBe('XAUUSD');
    expect(normalizeSymbol('BTC')).toBe('BTCUSD');
  });

  it('validates symbol characters and rejection of invalid strings', () => {
    expect(isValidSymbol('EURUSD')).toBe(true);
    expect(isValidSymbol('BTCUSD')).toBe(true);
    expect(isValidSymbol('')).toBe(false);
    expect(isValidSymbol('$$$')).toBe(false);
  });
});

describe('2. Timeframe System', () => {
  it('maps timeframes to exact standardized durations in seconds', () => {
    expect(TIMEFRAMES.M1.durationSeconds).toBe(60);
    expect(TIMEFRAMES.M5.durationSeconds).toBe(300);
    expect(TIMEFRAMES.M15.durationSeconds).toBe(900);
    expect(TIMEFRAMES.M30.durationSeconds).toBe(1800);
    expect(TIMEFRAMES.H1.durationSeconds).toBe(3600);
    expect(TIMEFRAMES.H4.durationSeconds).toBe(14400);
    expect(TIMEFRAMES.D1.durationSeconds).toBe(86400);
    expect(TIMEFRAMES.W1.durationSeconds).toBe(604800);
  });

  it('parses timeframe variations safely into canonical Timeframe enum', () => {
    expect(parseTimeframe('15m')).toBe('M15');
    expect(parseTimeframe('1h')).toBe('H1');
    expect(parseTimeframe('4h')).toBe('H4');
    expect(parseTimeframe('1d')).toBe('D1');
    expect(parseTimeframe('INVALID')).toBe('H1'); // safe fallback
  });
});

describe('3. Candle Validation Engine', () => {
  it('accepts perfectly structured candles', () => {
    const valid = {
      symbol: 'EURUSD',
      timeframe: 'H1',
      timestamp: 1709280000000,
      open: 1.0850,
      high: 1.0880,
      low: 1.0840,
      close: 1.0870,
      volume: 1200,
    };
    const res = CandleValidator.validate(valid);
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('strictly rejects malformed candles with negative prices or invalid bounds', () => {
    for (const c of malformedCandlesFixture) {
      const res = CandleValidator.validate(c);
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  it('filters invalid candles in batch validation without crashing', () => {
    const batch = [
      ...createBullishCandles(5),
      ...malformedCandlesFixture,
    ];
    const { validCandles, invalidCount } = CandleValidator.validateBatch(batch);
    expect(validCandles.length).toBe(5);
    expect(invalidCount).toBe(malformedCandlesFixture.length);
  });
});

describe('4. Technical Indicators Engine', () => {
  const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  it('SMA: calculates moving averages and returns null for insufficient lookback', () => {
    const sma5 = calculateSMA(closes, 5);
    expect(sma5[0]).toBeNull();
    expect(sma5[3]).toBeNull();
    expect(sma5[4]).toBe(12); // (10+11+12+13+14)/5 = 12
    expect(sma5[5]).toBe(13);
  });

  it('EMA: initializes consistently with SMA seed and updates with exponential weighting', () => {
    const ema5 = calculateEMA(closes, 5);
    expect(ema5[0]).toBeNull();
    expect(ema5[4]).toBe(12); // initial seed
    expect(ema5[5]).toBeGreaterThan(12);
  });

  it('RSI: handles zero-loss edge cases cleanly without Infinity or NaN', () => {
    const rising = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const rsi = calculateRSI(rising, 14);
    const lastRsi = rsi[rsi.length - 1];
    expect(lastRsi).toBe(100);
    expect(Number.isFinite(lastRsi)).toBe(true);
  });

  it('MACD: calculates MACD Line, Signal Line, and Histogram', () => {
    const series = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5);
    const macd = calculateMACD(series, 12, 26, 9);
    expect(macd.macd.length).toBe(40);
    expect(macd.signal.length).toBe(40);
    expect(macd.histogram.length).toBe(40);
    // In strong uptrend, MACD should be positive
    expect(macd.macd[39]).toBeGreaterThan(0);
  });

  it('ATR: calculates Wilder True Range and ATR Percentage', () => {
    const highs = Array.from({ length: 30 }, (_, i) => 100 + i + 2);
    const lows = Array.from({ length: 30 }, (_, i) => 100 + i - 2);
    const testCloses = Array.from({ length: 30 }, (_, i) => 100 + i);

    const atrRes = calculateATR(highs, lows, testCloses, 14);
    const lastAtr = atrRes.atr[29];
    const lastAtrPct = atrRes.atrPercent[29];

    expect(lastAtr).toBeGreaterThan(0);
    expect(lastAtrPct).toBeGreaterThan(0);
  });

  it('Bollinger Bands: enforces Upper >= Middle >= Lower and computes Band Width', () => {
    const series = Array.from({ length: 35 }, (_, i) => 100 + Math.sin(i) * 5);
    const bb = calculateBollingerBands(series, 20, 2);

    for (let i = 19; i < 35; i++) {
      expect(bb.upper[i]).toBeGreaterThanOrEqual(bb.middle[i]!);
      expect(bb.middle[i]).toBeGreaterThanOrEqual(bb.lower[i]!);
      expect(bb.width[i]).toBeGreaterThan(0);
    }
  });

  it('ADX: calculates +DI, -DI, ADX and classifies trend strength', () => {
    const bullish = createBullishCandles(40);
    const highs = bullish.map((c) => c.high);
    const lows = bullish.map((c) => c.low);
    const testCloses = bullish.map((c) => c.close);

    const adxRes = calculateADX(highs, lows, testCloses, 14);
    const lastAdx = adxRes.adx[39];
    expect(lastAdx).toBeDefined();

    expect(interpretADX(15)).toBe('WEAK');
    expect(interpretADX(22)).toBe('DEVELOPING');
    expect(interpretADX(32)).toBe('STRONGER_TREND');
  });

  it('IndicatorEngine: computes snapshot without mutating input candles', () => {
    const candles = createBullishCandles(50);
    const originalFirstClose = candles[0].close;

    const snapshot = IndicatorEngine.computeLatestSnapshot(candles, 'EURUSD', 'H1');
    expect(candles[0].close).toBe(originalFirstClose);
    expect(snapshot.calculationVersion).toBe('1.0.0');
    expect(snapshot.sma20).toBeDefined();
    expect(snapshot.ema20).toBeDefined();
    expect(snapshot.rsi14).toBeDefined();
  });
});

describe('5. Trend, Momentum, Volatility & Levels Classification', () => {
  it('classifies bullish trend when price > EMA50 and EMA20 > EMA50 > EMA200', () => {
    const indicator: any = {
      ema20: 1.0900,
      ema50: 1.0850,
      ema200: 1.0700,
    };
    const res = classifyTrend(1.0950, indicator);
    expect(res.trend).toBe('BULLISH');
    expect(res.trendStrength).toBeGreaterThanOrEqual(70);
  });

  it('classifies bearish trend when price < EMA50 and EMA20 < EMA50 < EMA200', () => {
    const indicator: any = {
      ema20: 1.0700,
      ema50: 1.0800,
      ema200: 1.0900,
    };
    const res = classifyTrend(1.0650, indicator);
    expect(res.trend).toBe('BEARISH');
    expect(res.trendStrength).toBeGreaterThanOrEqual(70);
  });

  it('classifies volatility appropriately per asset class thresholds', () => {
    expect(classifyVolatility(0.2, 'FOREX').volatility).toBe('LOW');
    expect(classifyVolatility(0.5, 'FOREX').volatility).toBe('NORMAL');
    expect(classifyVolatility(1.0, 'FOREX').volatility).toBe('HIGH');
    expect(classifyVolatility(1.6, 'FOREX').volatility).toBe('EXTREME');

    // Crypto has wider normal bounds
    expect(classifyVolatility(2.5, 'CRYPTO').volatility).toBe('NORMAL');
  });

  it('identifies nearest technical support and resistance levels from swing points', () => {
    const candles = createSidewaysCandles(50);
    const currentPrice = 1.0850;
    const sr = calculateSupportResistance(candles as any, currentPrice, 2);

    if (sr.nearestSupport) {
      expect(sr.nearestSupport.price).toBeLessThan(currentPrice);
      expect(sr.nearestSupport.source).toBe('Technical Support');
    }
    if (sr.nearestResistance) {
      expect(sr.nearestResistance.price).toBeGreaterThan(currentPrice);
      expect(sr.nearestResistance.source).toBe('Technical Resistance');
    }
  });
});

describe('6. Data Freshness, Quality & Gap Detection', () => {
  it('detects missing candles in gapped dataset', () => {
    const gapped = createGappedCandles();
    const gaps = MarketDataSyncService.detectGaps(gapped, 'H1');
    expect(gaps.length).toBe(1);
  });

  it('calculates data quality score dynamically', () => {
    const perfectScore = MarketDataSyncService.calculateDataQualityScore({
      candleCount: 500,
      targetCount: 500,
      invalidCount: 0,
      gapsCount: 0,
      isStale: false,
      hasProviderError: false,
    });
    expect(perfectScore).toBe(100);

    const degradedScore = MarketDataSyncService.calculateDataQualityScore({
      candleCount: 200,
      targetCount: 500,
      invalidCount: 2,
      gapsCount: 1,
      isStale: true,
      hasProviderError: false,
    });
    expect(degradedScore).toBeLessThan(75);
  });

  it('evaluates live candle freshness as current and not stale when within timeframe window', () => {
    const freshCheck = MarketDataSyncService.checkFreshness(Date.now() - 15 * 60 * 1000, 'H1', 'FOREX');
    expect(freshCheck.isStale).toBe(false);
    expect(freshCheck.isCurrent).toBe(true);
    expect(freshCheck.status).toBe('FRESH');
    expect(freshCheck.ageSeconds).toBeGreaterThanOrEqual(890);

    const staleCheck = MarketDataSyncService.checkFreshness(Date.now() - 10 * 24 * 3600 * 1000, 'H1', 'FOREX');
    expect(staleCheck.isStale).toBe(true);
    expect(staleCheck.isCurrent).toBe(false);
    expect(staleCheck.status).toBe('STALE');
  });

  it('identifies trading sessions correctly based on UTC time', () => {
    // 04:00 UTC -> ASIA
    const asiaDate = new Date('2026-03-02T04:00:00Z');
    expect(getTradingSession(asiaDate)).toBe('ASIA');

    // 10:00 UTC -> LONDON
    const londonDate = new Date('2026-03-02T10:00:00Z');
    expect(getTradingSession(londonDate)).toBe('LONDON');

    // 14:00 UTC -> OVERLAP (London + NY)
    const overlapDate = new Date('2026-03-02T14:00:00Z');
    expect(getTradingSession(overlapDate)).toBe('OVERLAP');
  });

  it('constructs structured MarketDataProviderError with retryability status', () => {
    const retryableErr = new MarketDataProviderError('Server timeout', 'twelvedata', 503, true);
    expect(retryableErr.isRetryable).toBe(true);
    expect(retryableErr.statusCode).toBe(503);

    const authErr = new MarketDataProviderError('Invalid API key', 'twelvedata', 401, false);
    expect(authErr.isRetryable).toBe(false);
    expect(authErr.statusCode).toBe(401);
  });
});
