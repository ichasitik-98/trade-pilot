/**
 * Exponential Moving Average (EMA) Calculation Module
 * Formula:
 * alpha = 2 / (period + 1)
 * EMA_t = Price_t * alpha + EMA_{t-1} * (1 - alpha)
 *
 * Initialization / Seeding:
 * Seeded using the Simple Moving Average (SMA) of the first 'period' values
 * at index (period - 1), adhering to industry standard methodology.
 */

export function calculateEMA(series: number[], period: number): (number | null)[] {
  if (!series || series.length === 0 || period <= 0) return [];
  const result: (number | null)[] = new Array(series.length).fill(null);

  if (series.length < period) {
    return result;
  }

  // Seed with SMA of the first 'period' values
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += series[i];
  }
  let prevEma = initialSum / period;
  result[period - 1] = Number(prevEma.toFixed(5));

  const multiplier = 2 / (period + 1);

  for (let i = period; i < series.length; i++) {
    const curVal = series[i];
    prevEma = (curVal - prevEma) * multiplier + prevEma;
    result[i] = Number(prevEma.toFixed(5));
  }

  return result;
}

export function calculateLatestEMA(series: number[], period: number): number | null {
  const emaSeries = calculateEMA(series, period);
  return emaSeries.length > 0 ? emaSeries[emaSeries.length - 1] : null;
}
