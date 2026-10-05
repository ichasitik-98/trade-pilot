/**
 * ChartDataAdapter: Adapts canonical raw MarketCandle records into visual chart series.
 * 
 * CORE ARCHITECTURAL INVARIANCE:
 * 1. Raw MarketCandle values (open, high, low, close, volume, timestamp) are NEVER altered.
 * 2. All technical indicators, market structures, and signals MUST be derived exclusively from
 *    raw OHLC data.
 * 3. Heikin Ashi and other transformations are in-memory visualization projections only.
 */

import { SupportedChartType, ChartVisualCandle } from './types.ts';

/**
 * Validates and falls back to CANDLESTICK for unknown or unsupported chart types
 */
export function validateChartType(type: string | undefined | null): SupportedChartType {
  const validTypes: SupportedChartType[] = ['CANDLESTICK', 'OHLC', 'LINE', 'AREA', 'HEIKIN_ASHI'];
  if (type && validTypes.includes(type as SupportedChartType)) {
    return type as SupportedChartType;
  }
  return 'CANDLESTICK';
}

/**
 * Transforms raw candles into Heikin Ashi visual candles.
 * 
 * Heikin Ashi Mathematical Formulas:
 * - HA Close = (Open + High + Low + Close) / 4
 * - HA Open (first) = (Open + Close) / 2
 * - HA Open (subsequent) = (previous HA Open + previous HA Close) / 2
 * - HA High = max(High, HA Open, HA Close)
 * - HA Low = min(Low, HA Open, HA Close)
 */
export function transformToHeikinAshi(
  rawCandles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>
): ChartVisualCandle[] {
  if (!rawCandles || rawCandles.length === 0) return [];

  const visualCandles: ChartVisualCandle[] = [];
  let prevHaOpen = 0;
  let prevHaClose = 0;

  for (let i = 0; i < rawCandles.length; i++) {
    const raw = rawCandles[i];
    const rawO = Number(raw.open);
    const rawH = Number(raw.high);
    const rawL = Number(raw.low);
    const rawC = Number(raw.close);
    const rawV = Number(raw.volume || 0);

    const haClose = (rawO + rawH + rawL + rawC) / 4;
    const haOpen = i === 0 ? (rawO + rawC) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(rawH, haOpen, haClose);
    const haLow = Math.min(rawL, haOpen, haClose);

    const isBullish = haClose >= haOpen;
    const color = isBullish ? '#10b981' : '#f43f5e';

    visualCandles.push({
      timestamp: raw.timestamp,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: rawV,
      isBullish,
      color,
      // Canonical raw data preserved immutably
      rawOpen: rawO,
      rawHigh: rawH,
      rawLow: rawL,
      rawClose: rawC,
      rawVolume: rawV,
    });

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  return visualCandles;
}

/**
 * Calculates rolling Simple Moving Average on a number series
 */
export function calculateSMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      result.push(sum / period);
    } else {
      result.push(null);
    }
  }
  return result;
}

/**
 * Calculates Exponential Moving Average on a number series
 */
export function calculateEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (values.length < period) {
    return values.map(() => null);
  }

  const alpha = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
    result.push(null);
  }

  let ema = sum / period;
  result[period - 1] = ema;

  for (let i = period; i < values.length; i++) {
    ema = values[i] * alpha + ema * (1 - alpha);
    result.push(ema);
  }

  return result;
}

/**
 * Calculates Bollinger Bands (period 20, multiplier 2)
 */
export function calculateBollingerBands(
  values: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): Array<{ upper: number | null; middle: number | null; lower: number | null }> {
  const sma = calculateSMA(values, period);
  const result: Array<{ upper: number | null; middle: number | null; lower: number | null }> = [];

  for (let i = 0; i < values.length; i++) {
    const mean = sma[i];
    if (mean === null) {
      result.push({ upper: null, middle: null, lower: null });
      continue;
    }

    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += Math.pow(values[j] - mean, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    result.push({
      upper: mean + stdDevMultiplier * stdDev,
      middle: mean,
      lower: mean - stdDevMultiplier * stdDev,
    });
  }

  return result;
}

/**
 * Calculates RSI (14) series with Wilder smoothing
 */
export function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (closes.length <= period) {
    return closes.map(() => null);
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  for (let i = 0; i < period; i++) {
    result.push(null);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  result.push(Math.max(0, Math.min(100, rsi)));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    result.push(Math.max(0, Math.min(100, rsi)));
  }

  return result;
}

/**
 * Calculates MACD (12, 26, 9) series
 */
export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): Array<{ macd: number | null; signal: number | null; histogram: number | null }> {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      macdLine.push((fastEMA[i] as number) - (slowEMA[i] as number));
    } else {
      macdLine.push(null);
    }
  }

  const validMacdValues = macdLine.filter((v): v is number => v !== null);
  const signalValues = calculateEMA(validMacdValues, signalPeriod);

  const result: Array<{ macd: number | null; signal: number | null; histogram: number | null }> = [];
  let signalIdx = 0;

  for (let i = 0; i < closes.length; i++) {
    const m = macdLine[i];
    if (m === null) {
      result.push({ macd: null, signal: null, histogram: null });
    } else {
      const s = signalValues[signalIdx++];
      const h = s !== null ? m - s : null;
      result.push({ macd: m, signal: s, histogram: h });
    }
  }

  return result;
}

/**
 * Adapts canonical market candles for rendering based on chosen ChartType.
 * Computes all technical indicator overlays strictly against the RAW OHLC closes/highs/lows.
 */
export function adaptCandlesForChart(
  rawCandles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>,
  chartType: SupportedChartType
): ChartVisualCandle[] {
  if (!rawCandles || rawCandles.length === 0) return [];

  // Sort ascending by timestamp
  const sorted = [...rawCandles].sort((a, b) => a.timestamp - b.timestamp);

  // ALWAYS calculate technical indicators using canonical RAW OHLC prices
  const rawCloses = sorted.map((c) => Number(c.close));

  const ema20Series = calculateEMA(rawCloses, 20);
  const ema50Series = calculateEMA(rawCloses, 50);
  const ema200Series = calculateEMA(rawCloses, 200);

  const sma20Series = calculateSMA(rawCloses, 20);
  const sma50Series = calculateSMA(rawCloses, 50);
  const sma200Series = calculateSMA(rawCloses, 200);

  const bbSeries = calculateBollingerBands(rawCloses, 20, 2);
  const rsiSeries = calculateRSI(rawCloses, 14);
  const macdSeries = calculateMACD(rawCloses, 12, 26, 9);

  // If chart type is Heikin Ashi, transform the visual coordinates
  let baseVisualCandles: ChartVisualCandle[];

  if (chartType === 'HEIKIN_ASHI') {
    baseVisualCandles = transformToHeikinAshi(sorted);
  } else {
    // CANDLESTICK, OHLC, LINE, AREA all use raw prices as primary coordinates
    baseVisualCandles = sorted.map((c) => {
      const open = Number(c.open);
      const high = Number(c.high);
      const low = Number(c.low);
      const close = Number(c.close);
      const volume = Number(c.volume || 0);
      const isBullish = close >= open;

      return {
        timestamp: c.timestamp,
        open,
        high,
        low,
        close,
        volume,
        isBullish,
        color: isBullish ? '#10b981' : '#f43f5e',
        rawOpen: open,
        rawHigh: high,
        rawLow: low,
        rawClose: close,
        rawVolume: volume,
      };
    });
  }

  // Attach the RAW-derived indicators to each visual candle
  return baseVisualCandles.map((vc, idx) => ({
    ...vc,
    ema20: ema20Series[idx] ?? null,
    ema50: ema50Series[idx] ?? null,
    ema200: ema200Series[idx] ?? null,
    sma20: sma20Series[idx] ?? null,
    sma50: sma50Series[idx] ?? null,
    sma200: sma200Series[idx] ?? null,
    bbUpper: bbSeries[idx]?.upper ?? null,
    bbMiddle: bbSeries[idx]?.middle ?? null,
    bbLower: bbSeries[idx]?.lower ?? null,
    rsi14: rsiSeries[idx] ?? null,
    macd: macdSeries[idx]?.macd ?? null,
    macdSignal: macdSeries[idx]?.signal ?? null,
    macdHistogram: macdSeries[idx]?.histogram ?? null,
  }));
}
