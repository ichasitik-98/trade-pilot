/**
 * Bollinger Bands Calculation Module
 * Formula:
 * Middle Band = 20-period SMA
 * Upper Band = Middle Band + (stdDevMultiplier * 20-period Standard Deviation)
 * Lower Band = Middle Band - (stdDevMultiplier * 20-period Standard Deviation)
 * Band Width = (Upper Band - Lower Band) / Middle Band
 */

import { calculateSMA } from './sma.ts';

export interface BollingerResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  width: (number | null)[];
}

export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerResult {
  const len = closes?.length ?? 0;
  const upper: (number | null)[] = new Array(len).fill(null);
  const middle: (number | null)[] = calculateSMA(closes, period);
  const lower: (number | null)[] = new Array(len).fill(null);
  const width: (number | null)[] = new Array(len).fill(null);

  if (len < period) {
    return { upper, middle, lower, width };
  }

  for (let i = period - 1; i < len; i++) {
    const mid = middle[i];
    if (mid === null) continue;

    // Calculate sample variance over the lookback window
    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      const diff = closes[i - j] - mid;
      varianceSum += diff * diff;
    }
    const stdDev = Math.sqrt(varianceSum / period);
    const up = Number((mid + stdDevMultiplier * stdDev).toFixed(5));
    const low = Number((mid - stdDevMultiplier * stdDev).toFixed(5));

    upper[i] = up;
    lower[i] = low;
    width[i] = mid > 0 ? Number(((up - low) / mid).toFixed(4)) : 0;
  }

  return { upper, middle, lower, width };
}

export function calculateLatestBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number | null; middle: number | null; lower: number | null; width: number | null } {
  const res = calculateBollingerBands(closes, period, stdDevMultiplier);
  const lastIdx = closes.length - 1;
  return {
    upper: lastIdx >= 0 ? res.upper[lastIdx] : null,
    middle: lastIdx >= 0 ? res.middle[lastIdx] : null,
    lower: lastIdx >= 0 ? res.lower[lastIdx] : null,
    width: lastIdx >= 0 ? res.width[lastIdx] : null,
  };
}
