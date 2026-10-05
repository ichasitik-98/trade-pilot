/**
 * Moving Average Convergence Divergence (MACD) Calculation Module
 * Formula:
 * MACD Line = EMA12 - EMA26
 * Signal Line = EMA9(MACD Line)
 * MACD Histogram = MACD Line - Signal Line
 */

import { calculateEMA } from './ema.ts';

export interface MACDResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const len = closes?.length ?? 0;
  const macd: (number | null)[] = new Array(len).fill(null);
  const signal: (number | null)[] = new Array(len).fill(null);
  const histogram: (number | null)[] = new Array(len).fill(null);

  if (len < slowPeriod) {
    return { macd, signal, histogram };
  }

  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  // Compute MACD Line = Fast EMA - Slow EMA
  const validMacdValues: number[] = [];
  const validMacdIndices: number[] = [];

  for (let i = 0; i < len; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      const val = Number((fastEMA[i]! - slowEMA[i]!).toFixed(5));
      macd[i] = val;
      validMacdValues.push(val);
      validMacdIndices.push(i);
    }
  }

  // Calculate Signal Line = EMA(signalPeriod) of MACD values
  if (validMacdValues.length >= signalPeriod) {
    const rawSignal = calculateEMA(validMacdValues, signalPeriod);
    for (let j = 0; j < validMacdValues.length; j++) {
      const originalIdx = validMacdIndices[j];
      const sigVal = rawSignal[j];
      signal[originalIdx] = sigVal;
      if (sigVal !== null && macd[originalIdx] !== null) {
        histogram[originalIdx] = Number((macd[originalIdx]! - sigVal).toFixed(5));
      }
    }
  }

  return { macd, signal, histogram };
}

export function calculateLatestMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number | null; signal: number | null; histogram: number | null } {
  const res = calculateMACD(closes, fastPeriod, slowPeriod, signalPeriod);
  const lastIdx = closes.length - 1;
  return {
    macd: lastIdx >= 0 ? res.macd[lastIdx] : null,
    signal: lastIdx >= 0 ? res.signal[lastIdx] : null,
    histogram: lastIdx >= 0 ? res.histogram[lastIdx] : null,
  };
}
