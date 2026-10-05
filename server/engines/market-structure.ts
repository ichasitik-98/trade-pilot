import { Candle, MarketCandle, MarketStructure, MarketBias } from '../types/index.ts';
import { sanitizeAndSortCandles } from './indicators.ts';

export function detectSwingPoints(
  candles: (Candle | MarketCandle)[],
  lookback: number = 3
): {
  swingHighs: { timestamp: number; price: number; index: number }[];
  swingLows: { timestamp: number; price: number; index: number }[];
} {
  const highs: { timestamp: number; price: number; index: number }[] = [];
  const lows: { timestamp: number; price: number; index: number }[] = [];

  if (candles.length < lookback * 2 + 1) {
    return { swingHighs: highs, swingLows: lows };
  }

  for (let i = lookback; i < candles.length - lookback; i++) {
    const cur = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= cur.high || candles[i + j].high > cur.high) {
        isHigh = false;
      }
      if (candles[i - j].low <= cur.low || candles[i + j].low < cur.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      highs.push({ timestamp: cur.timestamp, price: cur.high, index: i });
    }
    if (isLow) {
      lows.push({ timestamp: cur.timestamp, price: cur.low, index: i });
    }
  }

  return { swingHighs: highs, swingLows: lows };
}

export function analyzeMarketStructure(
  candles: (Candle | MarketCandle)[],
  lookback: number = 3
): MarketStructure {
  const sanitized = sanitizeAndSortCandles(candles);
  if (sanitized.length < 10) {
    return {
      trend: 'NEUTRAL',
      swingHighs: [],
      swingLows: [],
      isHigherHigh: false,
      isHigherLow: false,
      isLowerHigh: false,
      isLowerLow: false,
      isBullishBOS: false,
      isBearishBOS: false,
      isPullback: false,
    };
  }

  const { swingHighs, swingLows } = detectSwingPoints(sanitized, lookback);
  const lastCandle = sanitized[sanitized.length - 1];

  let isHigherHigh = false;
  let isHigherLow = false;
  let isLowerHigh = false;
  let isLowerLow = false;

  if (swingHighs.length >= 2) {
    const lastHigh = swingHighs[swingHighs.length - 1].price;
    const prevHigh = swingHighs[swingHighs.length - 2].price;
    isHigherHigh = lastHigh > prevHigh;
    isLowerHigh = lastHigh < prevHigh;
  }

  if (swingLows.length >= 2) {
    const lastLow = swingLows[swingLows.length - 1].price;
    const prevLow = swingLows[swingLows.length - 2].price;
    isHigherLow = lastLow > prevLow;
    isLowerLow = lastLow < prevLow;
  }

  // Bullish Break of Structure: latest close > most recent swing high
  let isBullishBOS = false;
  if (swingHighs.length > 0) {
    const latestSwingHigh = swingHighs[swingHighs.length - 1].price;
    isBullishBOS = lastCandle.close > latestSwingHigh;
  }

  // Bearish Break of Structure: latest close < most recent swing low
  let isBearishBOS = false;
  if (swingLows.length > 0) {
    const latestSwingLow = swingLows[swingLows.length - 1].price;
    isBearishBOS = lastCandle.close < latestSwingLow;
  }

  // Pullback detection
  let isPullback = false;
  if (isHigherHigh && isHigherLow) {
    // Uptrend: if last candle closed below previous close but above swing low
    if (swingLows.length > 0) {
      const recentLow = swingLows[swingLows.length - 1].price;
      if (lastCandle.close < sanitized[sanitized.length - 2].close && lastCandle.low > recentLow) {
        isPullback = true;
      }
    }
  } else if (isLowerHigh && isLowerLow) {
    // Downtrend: if last candle closed above previous close but below swing high
    if (swingHighs.length > 0) {
      const recentHigh = swingHighs[swingHighs.length - 1].price;
      if (lastCandle.close > sanitized[sanitized.length - 2].close && lastCandle.high < recentHigh) {
        isPullback = true;
      }
    }
  }

  // Trend classification based on structure
  let trend: MarketBias = 'NEUTRAL';
  let lastStructureEvent: MarketStructure['lastStructureEvent'] = undefined;

  if (isBullishBOS) {
    trend = 'BULLISH';
    lastStructureEvent = 'BULLISH_BOS';
  } else if (isBearishBOS) {
    trend = 'BEARISH';
    lastStructureEvent = 'BEARISH_BOS';
  } else if (isHigherHigh && isHigherLow) {
    trend = 'BULLISH';
    lastStructureEvent = isPullback ? 'PULLBACK' : 'HH';
  } else if (isLowerHigh && isLowerLow) {
    trend = 'BEARISH';
    lastStructureEvent = isPullback ? 'PULLBACK' : 'LL';
  } else if (isHigherLow) {
    trend = 'BULLISH';
    lastStructureEvent = 'HL';
  } else if (isLowerHigh) {
    trend = 'BEARISH';
    lastStructureEvent = 'LH';
  }

  return {
    trend,
    swingHighs: swingHighs.map((h) => ({ timestamp: h.timestamp, price: h.price })),
    swingLows: swingLows.map((l) => ({ timestamp: l.timestamp, price: l.price })),
    isHigherHigh,
    isHigherLow,
    isLowerHigh,
    isLowerLow,
    isBullishBOS,
    isBearishBOS,
    isPullback,
    lastStructureEvent,
  };
}
