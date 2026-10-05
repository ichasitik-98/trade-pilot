/**
 * Simple Moving Average (SMA) Calculation Module
 * Formula: sum(close over n candles) / n
 */

export function calculateSMA(series: number[], period: number): (number | null)[] {
  if (!series || series.length === 0 || period <= 0) return [];
  const result: (number | null)[] = new Array(series.length).fill(null);

  if (series.length < period) {
    return result;
  }

  let windowSum = 0;
  for (let i = 0; i < period; i++) {
    windowSum += series[i];
  }
  result[period - 1] = Number((windowSum / period).toFixed(5));

  for (let i = period; i < series.length; i++) {
    windowSum += series[i] - series[i - period];
    result[i] = Number((windowSum / period).toFixed(5));
  }

  return result;
}

export function calculateLatestSMA(series: number[], period: number): number | null {
  const smaSeries = calculateSMA(series, period);
  return smaSeries.length > 0 ? smaSeries[smaSeries.length - 1] : null;
}
