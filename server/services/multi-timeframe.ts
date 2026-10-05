import {
  AssetClass,
  Candle,
  MarketAnalysis,
  MarketBias,
  TechnicalIndicator,
  Timeframe,
  TimeframeAnalysis,
} from '../types/index.ts';
import { IndicatorEngine } from '../engines/indicators/index.ts';
import { analyzeMarketStructure } from '../engines/market-structure.ts';
import { calculateSupportResistance } from '../engines/support-resistance.ts';

export function classifyTrend(
  currentPrice: number,
  indicator: TechnicalIndicator
): {
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendStrength: number;
  explanation: string;
} {
  const { ema20, ema50, ema200 } = indicator;

  if (ema20 === null || ema50 === null || ema200 === null) {
    return {
      trend: 'NEUTRAL',
      trendStrength: 50,
      explanation: 'Insufficient historical data for complete 200-period EMA trend classification',
    };
  }

  // Bullish conditions: price > EMA50, EMA20 > EMA50, EMA50 > EMA200
  const isBullishStack = ema20 > ema50 && ema50 > ema200;
  const isBullishPrice = currentPrice > ema50;

  // Bearish conditions: price < EMA50, EMA20 < EMA50, EMA50 < EMA200
  const isBearishStack = ema20 < ema50 && ema50 < ema200;
  const isBearishPrice = currentPrice < ema50;

  if (isBullishStack && isBullishPrice) {
    const strength = currentPrice > ema20 ? 85 : 70;
    return {
      trend: 'BULLISH',
      trendStrength: strength,
      explanation: 'Bullish alignment: Price above EMA50 with bullish EMA stack (20 > 50 > 200)',
    };
  }

  if (isBearishStack && isBearishPrice) {
    const strength = currentPrice < ema20 ? 85 : 70;
    return {
      trend: 'BEARISH',
      trendStrength: strength,
      explanation: 'Bearish alignment: Price below EMA50 with bearish EMA stack (20 < 50 < 200)',
    };
  }

  // Intermediate / Transition
  if (isBullishStack && !isBullishPrice) {
    return {
      trend: 'NEUTRAL',
      trendStrength: 55,
      explanation: 'Bullish EMA stack with price pulling back below short-term EMA50',
    };
  }

  if (isBearishStack && !isBearishPrice) {
    return {
      trend: 'NEUTRAL',
      trendStrength: 45,
      explanation: 'Bearish EMA stack with counter-trend bounce above short-term EMA50',
    };
  }

  return {
    trend: 'NEUTRAL',
    trendStrength: 50,
    explanation: 'Mixed moving average signals indicating consolidation or market transition',
  };
}

export function classifyMomentum(
  indicator: TechnicalIndicator
): {
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  explanation: string;
} {
  const { rsi14, macdHistogram, adx14, plusDI, minusDI } = indicator;

  let bullishPoints = 0;
  let bearishPoints = 0;

  if (rsi14 !== null) {
    if (rsi14 > 52 && rsi14 < 75) bullishPoints += 1.5;
    else if (rsi14 < 48 && rsi14 > 25) bearishPoints += 1.5;
  }

  if (macdHistogram !== null) {
    if (macdHistogram > 0) bullishPoints += 1.5;
    else if (macdHistogram < 0) bearishPoints += 1.5;
  }

  if (adx14 != null && typeof plusDI === 'number' && typeof minusDI === 'number') {
    if (plusDI > minusDI) bullishPoints += 1.0;
    else if (minusDI > plusDI) bearishPoints += 1.0;
  }

  if (bullishPoints >= 3.0 && bullishPoints > bearishPoints) {
    return {
      momentum: 'BULLISH',
      explanation: `Bullish momentum supported by RSI (${rsi14?.toFixed(1) ?? 'N/A'}) and positive MACD histogram`,
    };
  }

  if (bearishPoints >= 3.0 && bearishPoints > bullishPoints) {
    return {
      momentum: 'BEARISH',
      explanation: `Bearish momentum supported by RSI (${rsi14?.toFixed(1) ?? 'N/A'}) and negative MACD histogram`,
    };
  }

  return {
    momentum: 'NEUTRAL',
    explanation: 'Balanced momentum oscillators without dominant directional force',
  };
}

export function classifyVolatility(
  atrPercent: number | null,
  assetClass: AssetClass = 'FOREX'
): {
  volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  explanation: string;
} {
  if (atrPercent === null || !Number.isFinite(atrPercent) || atrPercent <= 0) {
    return { volatility: 'NORMAL', explanation: 'Baseline volatility assumed' };
  }

  // Asset class specific thresholds
  let lowThresh = 0.3;
  let highThresh = 0.75;
  let extremeThresh = 1.3;

  if (assetClass === 'CRYPTO') {
    lowThresh = 1.5;
    highThresh = 4.0;
    extremeThresh = 8.0;
  } else if (assetClass === 'METAL') {
    lowThresh = 0.5;
    highThresh = 1.2;
    extremeThresh = 2.2;
  } else if (assetClass === 'INDEX') {
    lowThresh = 0.6;
    highThresh = 1.5;
    extremeThresh = 2.8;
  }

  if (atrPercent < lowThresh) {
    return {
      volatility: 'LOW',
      explanation: `Low volatility environment (${atrPercent.toFixed(2)}% ATR). Range expansion possible.`,
    };
  }
  if (atrPercent <= highThresh) {
    return {
      volatility: 'NORMAL',
      explanation: `Normal healthy volatility (${atrPercent.toFixed(2)}% ATR) conducive to standard setups.`,
    };
  }
  if (atrPercent <= extremeThresh) {
    return {
      volatility: 'HIGH',
      explanation: `Elevated market volatility (${atrPercent.toFixed(2)}% ATR). Wider stops advised.`,
    };
  }
  return {
    volatility: 'EXTREME',
    explanation: `Extreme market expansion/volatility (${atrPercent.toFixed(2)}% ATR). Heightened risk.`,
  };
}

export class MultiTimeframeAnalysisService {
  public static analyzeTimeframe(
    candles: Candle[],
    timeframe: Timeframe,
    assetClass: AssetClass = 'FOREX'
  ): TimeframeAnalysis {
    if (!candles || candles.length === 0) {
      return {
        timeframe,
        trend: 'NEUTRAL',
        trendStrength: 50,
        structure: 'NO_DATA',
        momentum: 'NEUTRAL',
        volatility: 'NORMAL',
        indicators: {},
        lastUpdated: new Date().toISOString(),
        dataQuality: 0,
      };
    }

    const indicator = IndicatorEngine.computeLatestSnapshot(candles, candles[0].symbol, timeframe);
    const structure = analyzeMarketStructure(candles as any, 3);
    const currentPrice = candles[candles.length - 1].close;

    const { trend, trendStrength } = classifyTrend(currentPrice, indicator);
    const { momentum } = classifyMomentum(indicator);
    const { volatility } = classifyVolatility(indicator.atrPercent ?? null, assetClass);

    return {
      timeframe,
      trend,
      trendStrength,
      structure: structure.trend,
      momentum,
      volatility,
      indicators: {
        rsi: indicator.rsi14,
        macd: indicator.macd,
        adx: indicator.adx14,
        atrPercent: indicator.atrPercent,
        ema20: indicator.ema20,
        ema50: indicator.ema50,
        ema200: indicator.ema200,
      },
      lastUpdated: new Date().toISOString(),
      dataQuality: candles.length >= 100 ? 100 : Math.round((candles.length / 100) * 100),
    };
  }

  public static synthesizeMarketAnalysis(params: {
    symbol: string;
    primaryTimeframe?: Timeframe;
    timeframeCandles: Partial<Record<Timeframe, Candle[]>>;
    assetClass?: AssetClass;
    dataStatus?: any;
    dataQuality?: number;
  }): MarketAnalysis {
    const {
      symbol,
      primaryTimeframe = 'H1',
      timeframeCandles,
      assetClass = 'FOREX',
      dataStatus = 'LIVE',
      dataQuality = 100,
    } = params;

    const tfList: Timeframe[] = ['D1', 'H4', 'H1', 'M15'];
    const mtfMap: Record<string, TimeframeAnalysis> = {};

    for (const tf of tfList) {
      const candles = timeframeCandles[tf] || [];
      mtfMap[tf] = this.analyzeTimeframe(candles, tf, assetClass);
    }

    // Determine primary timeframe analysis
    const primaryAnalysis = mtfMap[primaryTimeframe] || mtfMap['H1'];
    const primaryCandles = timeframeCandles[primaryTimeframe] || timeframeCandles['H1'] || [];
    const currentPrice = primaryCandles.length > 0 ? primaryCandles[primaryCandles.length - 1].close : 1.0;

    // Confluence weighting across D1, H4, H1
    let bullishWeight = 0;
    let bearishWeight = 0;

    const weights: Record<string, number> = { D1: 3, H4: 2.5, H1: 2, M15: 1 };
    for (const tf of tfList) {
      const an = mtfMap[tf];
      const w = weights[tf] || 1;
      if (an.trend === 'BULLISH') bullishWeight += w;
      else if (an.trend === 'BEARISH') bearishWeight += w;

      if (an.momentum === 'BULLISH') bullishWeight += w * 0.5;
      else if (an.momentum === 'BEARISH') bearishWeight += w * 0.5;
    }

    let overallBias: MarketBias = 'NEUTRAL';
    if (bullishWeight > bearishWeight + 2) {
      overallBias = 'BULLISH';
    } else if (bearishWeight > bullishWeight + 2) {
      overallBias = 'BEARISH';
    }

    // Support and Resistance calculation
    const sr = calculateSupportResistance(primaryCandles as any, currentPrice, 3);

    const explanation = `Multi-timeframe analysis: D1 is ${mtfMap.D1?.trend || 'N/A'}, H4 is ${mtfMap.H4?.trend || 'N/A'}, H1 is ${mtfMap.H1?.trend || 'N/A'}, M15 is ${mtfMap.M15?.trend || 'N/A'}. Overall technical bias is ${overallBias}.`;

    return {
      id: crypto.randomUUID(),
      symbol,
      pair: symbol,
      timeframe: primaryTimeframe,
      timestamp: new Date().toISOString(),
      overallBias,
      bias: overallBias,
      trend: primaryAnalysis.trend,
      trendStrength: primaryAnalysis.trendStrength,
      structure: primaryAnalysis.structure,
      structureState: primaryAnalysis.structure,
      momentum: primaryAnalysis.momentum,
      volatility: primaryAnalysis.volatility,
      currentPrice,
      keySupport: sr.nearestSupport?.price ?? currentPrice * 0.99,
      keyResistance: sr.nearestResistance?.price ?? currentPrice * 1.01,
      nearestSupport: sr.nearestSupport,
      nearestResistance: sr.nearestResistance,
      multiTimeframe: mtfMap,
      dataQuality,
      dataStatus,
      explanation,
      lastUpdated: new Date().toISOString(),
    };
  }
}
