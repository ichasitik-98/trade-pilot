import { MarketCandle, SupportResistanceLevel } from '../types/index.ts';
import { detectSwingPoints } from './market-structure.ts';

export function calculateSupportResistance(
  candles: MarketCandle[],
  currentPrice: number,
  lookback: number = 3
): {
  nearestSupport: SupportResistanceLevel | null;
  nearestResistance: SupportResistanceLevel | null;
  allSupports: SupportResistanceLevel[];
  allResistances: SupportResistanceLevel[];
} {
  if (!candles || candles.length === 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return {
      nearestSupport: null,
      nearestResistance: null,
      allSupports: [],
      allResistances: [],
    };
  }

  const { swingHighs, swingLows } = detectSwingPoints(candles, lookback);

  // Group and cluster swing highs as resistance
  const resistances: SupportResistanceLevel[] = swingHighs
    .filter((sh) => sh.price > currentPrice)
    .sort((a, b) => a.price - b.price) // ascending distance from price
    .map((sh, idx) => {
      const distancePercent = Number((((sh.price - currentPrice) / currentPrice) * 100).toFixed(2));
      const strength = Math.max(30, 90 - idx * 15); // closer levels have higher relevance
      return {
        price: sh.price,
        strength,
        distancePercent,
        source: 'Technical Resistance' as const,
      };
    });

  // Group and cluster swing lows as support
  const supports: SupportResistanceLevel[] = swingLows
    .filter((sl) => sl.price < currentPrice)
    .sort((a, b) => b.price - a.price) // ascending distance below price
    .map((sl, idx) => {
      const distancePercent = Number((((currentPrice - sl.price) / currentPrice) * 100).toFixed(2));
      const strength = Math.max(30, 90 - idx * 15);
      return {
        price: sl.price,
        strength,
        distancePercent,
        source: 'Technical Support' as const,
      };
    });

  const nearestResistance = resistances.length > 0 ? resistances[0] : null;
  const nearestSupport = supports.length > 0 ? supports[0] : null;

  return {
    nearestSupport,
    nearestResistance,
    allSupports: supports,
    allResistances: resistances,
  };
}
