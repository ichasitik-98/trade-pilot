/**
 * IndicatorEngine: Central Technical Analysis Engine
 * Encapsulates calculation of SMA, EMA, RSI, MACD, ATR, Bollinger Bands, and ADX.
 * Adheres to zero-mutation of input candles and records calculationVersion.
 */

import { Candle, TechnicalIndicator } from '../../types/index.ts';
import { calculateSMA } from './sma.ts';
import { calculateEMA } from './ema.ts';
import { calculateRSI } from './rsi.ts';
import { calculateMACD } from './macd.ts';
import { calculateATR } from './atr.ts';
import { calculateBollingerBands } from './bollinger.ts';
import { calculateADX, interpretADX } from './adx.ts';

export * from './sma.ts';
export * from './ema.ts';
export * from './rsi.ts';
export * from './macd.ts';
export * from './atr.ts';
export * from './bollinger.ts';
export * from './adx.ts';

export const INDICATOR_CALCULATION_VERSION = '1.0.0';

export function sanitizeAndSortCandles(candles: Candle[]): Candle[] {
  if (!candles || candles.length === 0) return [];

  // Filter out corrupted/invalid candles
  const valid = candles.filter((c) => {
    return (
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.open > 0 &&
      c.high > 0 &&
      c.low > 0 &&
      c.close > 0 &&
      c.high >= c.low &&
      c.timestamp > 0
    );
  });

  // Sort ascending by UTC timestamp
  valid.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate timestamps (keep latest occurrence)
  const deduped: Candle[] = [];
  const seen = new Set<number>();
  for (let i = valid.length - 1; i >= 0; i--) {
    if (!seen.has(valid[i].timestamp)) {
      seen.add(valid[i].timestamp);
      deduped.unshift(valid[i]);
    }
  }

  return deduped;
}

export class IndicatorEngine {
  public static calculateIndicators(
    candles: Candle[],
    symbol?: string,
    timeframe?: string
  ): TechnicalIndicator[] {
    const sorted = sanitizeAndSortCandles(candles);
    if (sorted.length === 0) return [];

    const sym = symbol || sorted[0].symbol || 'UNKNOWN';
    const tf = timeframe || sorted[0].timeframe || 'H1';

    const closes = sorted.map((c) => c.close);
    const highs = sorted.map((c) => c.high);
    const lows = sorted.map((c) => c.low);

    // Calculate all series
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);

    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);

    const rsi14 = calculateRSI(closes, 14);
    const macdData = calculateMACD(closes, 12, 26, 9);
    const atrData = calculateATR(highs, lows, closes, 14);
    const bbData = calculateBollingerBands(closes, 20, 2);
    const adxData = calculateADX(highs, lows, closes, 14);

    const snapshots: TechnicalIndicator[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      snapshots.push({
        id: crypto.randomUUID(),
        symbol: sym,
        pair: sym,
        timeframe: tf,
        timestamp: c.timestamp,
        sma20: sma20[i],
        sma50: sma50[i],
        sma200: sma200[i],
        ema20: ema20[i],
        ema50: ema50[i],
        ema200: ema200[i],
        rsi14: rsi14[i],
        macd: macdData.macd[i],
        macdSignal: macdData.signal[i],
        macdHistogram: macdData.histogram[i],
        atr14: atrData.atr[i],
        atrPercent: atrData.atrPercent[i],
        bbUpper: bbData.upper[i],
        bbMiddle: bbData.middle[i],
        bbLower: bbData.lower[i],
        bbWidth: bbData.width[i],
        adx14: adxData.adx[i],
        plusDI: adxData.plusDI[i],
        minusDI: adxData.minusDI[i],
        calculatedAt: new Date().toISOString(),
        calculationVersion: INDICATOR_CALCULATION_VERSION,
      });
    }

    return snapshots;
  }

  public static computeLatestSnapshot(
    candles: Candle[],
    symbol?: string,
    timeframe?: string
  ): TechnicalIndicator {
    const snapshots = IndicatorEngine.calculateIndicators(candles, symbol, timeframe);
    if (snapshots.length === 0) {
      const sym = symbol || 'EURUSD';
      const tf = timeframe || 'H1';
      return {
        symbol: sym,
        pair: sym,
        timeframe: tf,
        timestamp: Date.now(),
        sma20: null,
        sma50: null,
        sma200: null,
        ema20: null,
        ema50: null,
        ema200: null,
        rsi14: null,
        macd: null,
        macdSignal: null,
        macdHistogram: null,
        atr14: null,
        atrPercent: null,
        bbUpper: null,
        bbMiddle: null,
        bbLower: null,
        bbWidth: null,
        adx14: null,
        plusDI: null,
        minusDI: null,
        calculatedAt: new Date().toISOString(),
        calculationVersion: INDICATOR_CALCULATION_VERSION,
      };
    }
    return snapshots[snapshots.length - 1];
  }
}

// Global convenience wrapper maintaining exact compatibility with existing codebase
export function computeAllIndicators(
  candles: Candle[],
  pair: string = 'EURUSD',
  timeframe: string = 'H1'
): TechnicalIndicator {
  return IndicatorEngine.computeLatestSnapshot(candles, pair, timeframe);
}
