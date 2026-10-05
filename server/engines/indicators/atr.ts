/**
 * Average True Range (ATR) Calculation Module
 * Formula:
 * TR = max(high - low, abs(high - prevClose), abs(low - prevClose))
 * ATR14 = Wilder's smoothed average of TR over 14 periods
 * ATR Percentage = (ATR / Close) * 100
 */

export interface ATRResult {
  atr: (number | null)[];
  atrPercent: (number | null)[];
  trueRanges: number[];
}

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): ATRResult {
  const len = highs?.length ?? 0;
  const atr: (number | null)[] = new Array(len).fill(null);
  const atrPercent: (number | null)[] = new Array(len).fill(null);
  const trueRanges: number[] = [];

  if (len < period + 1) {
    return { atr, atrPercent, trueRanges };
  }

  // Calculate True Range series
  trueRanges.push(highs[0] - lows[0]);
  for (let i = 1; i < len; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  // Initial ATR is simple average of first 'period' true ranges
  let initialTrSum = 0;
  for (let i = 0; i < period; i++) {
    initialTrSum += trueRanges[i];
  }
  let prevAtr = initialTrSum / period;
  atr[period - 1] = Number(prevAtr.toFixed(5));
  atrPercent[period - 1] = closes[period - 1] > 0
    ? Number(((prevAtr / closes[period - 1]) * 100).toFixed(4))
    : 0;

  // Wilder's smoothing for subsequent periods
  for (let i = period; i < len; i++) {
    prevAtr = (prevAtr * (period - 1) + trueRanges[i]) / period;
    atr[i] = Number(prevAtr.toFixed(5));
    atrPercent[i] = closes[i] > 0
      ? Number(((prevAtr / closes[i]) * 100).toFixed(4))
      : 0;
  }

  return { atr, atrPercent, trueRanges };
}

export function calculateLatestATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): { atr: number | null; atrPercent: number | null } {
  const res = calculateATR(highs, lows, closes, period);
  const lastIdx = closes.length - 1;
  return {
    atr: lastIdx >= 0 ? res.atr[lastIdx] : null,
    atrPercent: lastIdx >= 0 ? res.atrPercent[lastIdx] : null,
  };
}
