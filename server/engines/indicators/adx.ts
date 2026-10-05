/**
 * Average Directional Index (ADX) & Directional Movement System Calculation Module
 * Standard Welles Wilder 14-period implementation:
 * 1. TR = max(high-low, abs(high-prevClose), abs(low-prevClose))
 * 2. +DM = (high - prevHigh > prevLow - low && high - prevHigh > 0) ? high - prevHigh : 0
 * 3. -DM = (prevLow - low > high - prevHigh && prevLow - low > 0) ? prevLow - low : 0
 * 4. Smoothed 14-period TR, +DM, -DM via Wilder's smoothing
 * 5. +DI = (+DM14 / TR14) * 100
 * 6. -DI = (-DM14 / TR14) * 100
 * 7. DX = abs(+DI - -DI) / (+DI + -DI) * 100
 * 8. ADX = Wilder's smoothing of DX
 */

export interface ADXResult {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

export type ADXTrendStrength = 'WEAK' | 'DEVELOPING' | 'STRONGER_TREND';

export interface ADXConfig {
  weakThreshold: number; // default 20
  strongThreshold: number; // default 25
}

export const DEFAULT_ADX_CONFIG: ADXConfig = {
  weakThreshold: 20,
  strongThreshold: 25,
};

export function interpretADX(
  adxValue: number | null,
  config: ADXConfig = DEFAULT_ADX_CONFIG
): ADXTrendStrength {
  if (adxValue === null || adxValue < config.weakThreshold) {
    return 'WEAK';
  }
  if (adxValue <= config.strongThreshold) {
    return 'DEVELOPING';
  }
  return 'STRONGER_TREND';
}

export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): ADXResult {
  const len = highs?.length ?? 0;
  const adx: (number | null)[] = new Array(len).fill(null);
  const plusDI: (number | null)[] = new Array(len).fill(null);
  const minusDI: (number | null)[] = new Array(len).fill(null);

  if (len < period * 2) {
    return { adx, plusDI, minusDI };
  }

  const trList: number[] = [];
  const plusDmList: number[] = [];
  const minusDmList: number[] = [];

  for (let i = 1; i < len; i++) {
    const h = highs[i];
    const l = lows[i];
    const prevH = highs[i - 1];
    const prevL = lows[i - 1];
    const prevC = closes[i - 1];

    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trList.push(tr);

    const upMove = h - prevH;
    const downMove = prevL - l;

    if (upMove > downMove && upMove > 0) {
      plusDmList.push(upMove);
    } else {
      plusDmList.push(0);
    }

    if (downMove > upMove && downMove > 0) {
      minusDmList.push(downMove);
    } else {
      minusDmList.push(0);
    }
  }

  // Smooth first 'period' values
  let smoothedTR = 0;
  let smoothedPlusDM = 0;
  let smoothedMinusDM = 0;

  for (let i = 0; i < period; i++) {
    smoothedTR += trList[i];
    smoothedPlusDM += plusDmList[i];
    smoothedMinusDM += minusDmList[i];
  }

  const dxList: { index: number; dx: number }[] = [];

  for (let i = period; i < trList.length; i++) {
    if (i === period) {
      // first smoothed value
    } else {
      smoothedTR = smoothedTR - (smoothedTR / period) + trList[i];
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDmList[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDmList[i];
    }

    const candleIdx = i + 1;
    const pDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const mDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

    plusDI[candleIdx] = Number(pDI.toFixed(2));
    minusDI[candleIdx] = Number(mDI.toFixed(2));

    const diSum = pDI + mDI;
    const dx = diSum > 0 ? (Math.abs(pDI - mDI) / diSum) * 100 : 0;
    dxList.push({ index: candleIdx, dx });
  }

  if (dxList.length >= period) {
    let initialDxSum = 0;
    for (let i = 0; i < period; i++) {
      initialDxSum += dxList[i].dx;
    }
    let curAdx = initialDxSum / period;
    adx[dxList[period - 1].index] = Number(curAdx.toFixed(2));

    for (let i = period; i < dxList.length; i++) {
      curAdx = (curAdx * (period - 1) + dxList[i].dx) / period;
      adx[dxList[i].index] = Number(curAdx.toFixed(2));
    }
  }

  return { adx, plusDI, minusDI };
}

export function calculateLatestADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): { adx: number | null; plusDI: number | null; minusDI: number | null } {
  const res = calculateADX(highs, lows, closes, period);
  const lastIdx = closes.length - 1;
  return {
    adx: lastIdx >= 0 ? res.adx[lastIdx] : null,
    plusDI: lastIdx >= 0 ? res.plusDI[lastIdx] : null,
    minusDI: lastIdx >= 0 ? res.minusDI[lastIdx] : null,
  };
}
