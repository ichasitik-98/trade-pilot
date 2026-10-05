/**
 * Relative Strength Index (RSI) Calculation Module
 * Formula:
 * RS = Average Gain / Average Loss (Wilder's smoothing)
 * RSI = 100 - 100 / (1 + RS)
 * Edge case handling:
 * When Average Loss = 0: RSI = 100 (never Infinity or NaN)
 * When Average Gain = 0: RSI = 0
 */

export function calculateRSI(series: number[], period: number = 14): (number | null)[] {
  if (!series || series.length <= period || period <= 0) {
    return new Array(series ? series.length : 0).fill(null);
  }

  const result: (number | null)[] = new Array(series.length).fill(null);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = series[i] - series[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else if (avgGain === 0) {
    result[period] = 0;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = Number((100 - 100 / (1 + rs)).toFixed(2));
  }

  for (let i = period + 1; i < series.length; i++) {
    const diff = series[i] - series[i - 1];
    const currentGain = diff > 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    // Wilder's smoothing technique: prevAvg * (period - 1) + current) / period
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else if (avgGain === 0) {
      result[i] = 0;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = Number((100 - 100 / (1 + rs)).toFixed(2));
    }
  }

  return result;
}

export function calculateLatestRSI(series: number[], period: number = 14): number | null {
  const rsiSeries = calculateRSI(series, period);
  return rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : null;
}
