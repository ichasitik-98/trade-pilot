import {
  MarketCandle,
  TechnicalIndicator,
  MarketStructure,
  TradeDirection,
  SignalStatus,
  SignalRun,
  SignalComponent,
  MarketDataStatusCode,
  OpenPositionRiskRewardPlan,
} from '../types/index.ts';
import { getInstrumentSpec } from './risk.ts';

export function getPricePrecisionForPair(pair: string): number {
  const normalized = pair.toUpperCase().replace('/', '').replace('-', '').trim();
  if (normalized.includes('JPY') || normalized === 'XAUUSD' || normalized.includes('BTC') || normalized.includes('ETH') || normalized === 'US30' || normalized === 'NAS100' || normalized === 'SPX500') {
    return 2;
  }
  return 4;
}

export function generateOptimalSignalLevels(params: {
  pair: string;
  direction: TradeDirection;
  currentPrice: number;
  atr?: number | null;
  nearestSupport?: number | null;
  nearestResistance?: number | null;
  atrSlMultiplier?: number;
  rrTp1?: number;
  rrTp2?: number;
  rrTp3?: number;
}): {
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  atrUsed: number;
} {
  const {
    pair,
    direction,
    currentPrice,
    atr,
    nearestSupport,
    nearestResistance,
    atrSlMultiplier = 1.5,
    rrTp1 = 2.0,
    rrTp2 = 3.0,
    rrTp3 = 4.5,
  } = params;

  const precision = getPricePrecisionForPair(pair);
  const effectiveAtr = atr && atr > 0 ? atr : currentPrice * 0.0025;
  let slDistance = effectiveAtr * atrSlMultiplier;

  // Snap to structural support/resistance with a small buffer if within reasonable ATR bounds (0.8x to 2.2x ATR)
  if (direction === 'LONG' && nearestSupport && nearestSupport < currentPrice) {
    const structDist = currentPrice - nearestSupport + effectiveAtr * 0.2;
    if (structDist >= effectiveAtr * 0.8 && structDist <= effectiveAtr * 2.2) {
      slDistance = structDist;
    }
  } else if (direction === 'SHORT' && nearestResistance && nearestResistance > currentPrice) {
    const structDist = nearestResistance - currentPrice + effectiveAtr * 0.2;
    if (structDist >= effectiveAtr * 0.8 && structDist <= effectiveAtr * 2.2) {
      slDistance = structDist;
    }
  }

  const entryPrice = Number(currentPrice.toFixed(precision));
  const stopLoss = Number(
    (direction === 'LONG' ? currentPrice - slDistance : currentPrice + slDistance).toFixed(precision)
  );
  const actualSlDist = Math.abs(entryPrice - stopLoss) || slDistance;
  const takeProfit1 = Number(
    (direction === 'LONG' ? entryPrice + actualSlDist * rrTp1 : entryPrice - actualSlDist * rrTp1).toFixed(precision)
  );
  const takeProfit2 = Number(
    (direction === 'LONG' ? entryPrice + actualSlDist * rrTp2 : entryPrice - actualSlDist * rrTp2).toFixed(precision)
  );
  const takeProfit3 = Number(
    (direction === 'LONG' ? entryPrice + actualSlDist * rrTp3 : entryPrice - actualSlDist * rrTp3).toFixed(precision)
  );

  return {
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    atrUsed: effectiveAtr,
  };
}

export function buildOpenPositionRiskRewardPlan(params: {
  pair: string;
  timeframe: string;
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  atr?: number | null;
  status: SignalStatus;
  score: number;
}): OpenPositionRiskRewardPlan {
  const {
    pair,
    timeframe,
    direction,
    entryPrice,
    stopLoss,
    takeProfit1,
    atr,
    status,
  } = params;

  const spec = getInstrumentSpec(pair);
  const pipSize = spec?.pipSize ?? (pair.includes('JPY') || pair === 'XAUUSD' ? 0.01 : 0.0001);
  const contractSize = spec?.contractSize ?? 100000;
  const pricePrecision = getPricePrecisionForPair(pair);

  const stopLossDistance = Math.abs(entryPrice - stopLoss);
  const tp1Distance = Math.abs(takeProfit1 - entryPrice);

  const computedTp2 =
    params.takeProfit2 && params.takeProfit2 > 0
      ? params.takeProfit2
      : Number(
          (direction === 'LONG'
            ? entryPrice + stopLossDistance * 3.0
            : entryPrice - stopLossDistance * 3.0
          ).toFixed(pricePrecision)
        );
  const computedTp3 =
    params.takeProfit3 && params.takeProfit3 > 0
      ? params.takeProfit3
      : Number(
          (direction === 'LONG'
            ? entryPrice + stopLossDistance * 4.5
            : entryPrice - stopLossDistance * 4.5
          ).toFixed(pricePrecision)
        );

  const tp2Distance = Math.abs(computedTp2 - entryPrice);
  const tp3Distance = Math.abs(computedTp3 - entryPrice);

  const stopLossPips = pipSize > 0 ? Number((stopLossDistance / pipSize).toFixed(1)) : 0;
  const tp1Pips = pipSize > 0 ? Number((tp1Distance / pipSize).toFixed(1)) : 0;
  const tp2Pips = pipSize > 0 ? Number((tp2Distance / pipSize).toFixed(1)) : 0;
  const tp3Pips = pipSize > 0 ? Number((tp3Distance / pipSize).toFixed(1)) : 0;

  const stopLossPercent = entryPrice > 0 ? Number(((stopLossDistance / entryPrice) * 100).toFixed(3)) : 0;
  const tp1Percent = entryPrice > 0 ? Number(((tp1Distance / entryPrice) * 100).toFixed(3)) : 0;
  const tp2Percent = entryPrice > 0 ? Number(((tp2Distance / entryPrice) * 100).toFixed(3)) : 0;
  const tp3Percent = entryPrice > 0 ? Number(((tp3Distance / entryPrice) * 100).toFixed(3)) : 0;

  const riskReward1 = stopLossDistance > 0 ? Number((tp1Distance / stopLossDistance).toFixed(2)) : 0;
  const riskReward2 = stopLossDistance > 0 ? Number((tp2Distance / stopLossDistance).toFixed(2)) : 0;
  const riskReward3 = stopLossDistance > 0 ? Number((tp3Distance / stopLossDistance).toFixed(2)) : 0;

  const atrValue = atr && atr > 0 ? atr : stopLossDistance / 1.5;
  const atrMultiplierSl = atrValue > 0 ? Number((stopLossDistance / atrValue).toFixed(2)) : 1.5;

  const breakevenWinRateTp1 = riskReward1 > 0 ? Number(((1 / (1 + riskReward1)) * 100).toFixed(1)) : 100;
  const breakevenWinRateTp2 = riskReward2 > 0 ? Number(((1 / (1 + riskReward2)) * 100).toFixed(1)) : 100;

  let recommendedAction: 'OPEN_LONG' | 'OPEN_SHORT' | 'WAIT_CONFIRMATION' | 'NO_TRADE' = 'WAIT_CONFIRMATION';
  let actionLabel = 'WAIT FOR CONFIRMATION';

  if (status === 'BLOCKED' || status === 'NO_SETUP') {
    recommendedAction = 'NO_TRADE';
    actionLabel = status === 'BLOCKED' ? 'NO TRADE (BLOCKED)' : 'NO TRADE SETUP';
  } else if (status === 'VALID_SETUP' || status === 'STRONG_SETUP' || status === 'VERY_STRONG_SETUP') {
    recommendedAction = direction === 'LONG' ? 'OPEN_LONG' : 'OPEN_SHORT';
    actionLabel = direction === 'LONG' ? 'OPEN BUY / LONG' : 'OPEN SELL / SHORT';
  } else {
    recommendedAction = 'WAIT_CONFIRMATION';
    actionLabel = direction === 'LONG' ? 'WATCH LONG CANDIDATE' : 'WATCH SHORT CANDIDATE';
  }

  const invalidationReason =
    direction === 'LONG'
      ? `Setup invalidated if price closes below Stop Loss ($${stopLoss.toFixed(pricePrecision)}, -${stopLossPips} pips / ${atrMultiplierSl}x ATR)`
      : `Setup invalidated if price closes above Stop Loss ($${stopLoss.toFixed(pricePrecision)}, -${stopLossPips} pips / ${atrMultiplierSl}x ATR)`;

  return {
    pair,
    timeframe,
    direction,
    recommendedAction,
    actionLabel,
    executionType: 'MARKET',
    entryPrice: Number(entryPrice.toFixed(pricePrecision)),
    stopLoss: Number(stopLoss.toFixed(pricePrecision)),
    takeProfit1: Number(takeProfit1.toFixed(pricePrecision)),
    takeProfit2: computedTp2,
    takeProfit3: computedTp3,
    stopLossDistance,
    tp1Distance,
    tp2Distance,
    tp3Distance,
    stopLossPips,
    tp1Pips,
    tp2Pips,
    tp3Pips,
    stopLossPercent,
    tp1Percent,
    tp2Percent,
    tp3Percent,
    riskReward1,
    riskReward2,
    riskReward3,
    atrValue,
    atrMultiplierSl,
    breakevenWinRateTp1,
    breakevenWinRateTp2,
    pipSize,
    contractSize,
    pricePrecision,
    invalidationReason,
  };
}

export function classifyScore(score: number): SignalStatus {
  if (score < 40) return 'NO_SETUP';
  if (score < 55) return 'WEAK';
  if (score < 70) return 'WATCH';
  if (score < 80) return 'VALID_SETUP';
  if (score < 90) return 'STRONG_SETUP';
  return 'VERY_STRONG_SETUP';
}

export function validateGeometry(
  direction: TradeDirection,
  entryPrice: number,
  stopLoss: number,
  takeProfit: number
): { valid: boolean; reason?: string } {
  if (direction === 'LONG') {
    if (stopLoss >= entryPrice) {
      return { valid: false, reason: 'Invalid LONG geometry: Stop loss must be strictly below entry price' };
    }
    if (takeProfit <= entryPrice) {
      return { valid: false, reason: 'Invalid LONG geometry: Take profit must be strictly above entry price' };
    }
  } else {
    if (stopLoss <= entryPrice) {
      return { valid: false, reason: 'Invalid SHORT geometry: Stop loss must be strictly above entry price' };
    }
    if (takeProfit >= entryPrice) {
      return { valid: false, reason: 'Invalid SHORT geometry: Take profit must be strictly below entry price' };
    }
  }
  return { valid: true };
}

export function evaluateSignal(params: {
  userId: string;
  pair: string;
  timeframe: string;
  direction: TradeDirection;
  candles: MarketCandle[];
  indicator: TechnicalIndicator;
  structure: MarketStructure;
  htfTrend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  dataStatus?: MarketDataStatusCode;
  dataQuality?: number;
  marketAnalysis?: any;
}): SignalRun {
  const {
    userId,
    pair,
    timeframe,
    direction,
    candles,
    indicator,
    structure,
    htfTrend,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    dataStatus,
    dataQuality = 100,
  } = params;

  const components: SignalComponent[] = [];

  // Hard Filter 0: Market Data Quality & Freshness Control
  if (dataStatus === 'STALE') {
    return {
      id: crypto.randomUUID(),
      userId,
      pair,
      timeframe,
      timestamp: new Date().toISOString(),
      direction,
      score: 0,
      trendScore: 0,
      structureScore: 0,
      momentumScore: 0,
      srScore: 0,
      volatilityScore: 0,
      rrScore: 0,
      confirmationScore: 0,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: 0,
      status: 'BLOCKED',
      explanation: 'Signal Blocked: Market data is STALE. Fresh market data required before evaluating setups.',
      components: [],
    };
  }

  if (dataStatus === 'ERROR') {
    return {
      id: crypto.randomUUID(),
      userId,
      pair,
      timeframe,
      timestamp: new Date().toISOString(),
      direction,
      score: 0,
      trendScore: 0,
      structureScore: 0,
      momentumScore: 0,
      srScore: 0,
      volatilityScore: 0,
      rrScore: 0,
      confirmationScore: 0,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: 0,
      status: 'BLOCKED',
      explanation: 'Signal Blocked: Market data provider ERROR state.',
      components: [],
    };
  }

  if (dataStatus === 'NO_DATA') {
    return {
      id: crypto.randomUUID(),
      userId,
      pair,
      timeframe,
      timestamp: new Date().toISOString(),
      direction,
      score: 0,
      trendScore: 0,
      structureScore: 0,
      momentumScore: 0,
      srScore: 0,
      volatilityScore: 0,
      rrScore: 0,
      confirmationScore: 0,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: 0,
      status: 'BLOCKED',
      explanation: 'Signal Blocked: NO_DATA available from market data provider.',
      components: [],
    };
  }

  if (dataQuality < 50) {
    return {
      id: crypto.randomUUID(),
      userId,
      pair,
      timeframe,
      timestamp: new Date().toISOString(),
      direction,
      score: 0,
      trendScore: 0,
      structureScore: 0,
      momentumScore: 0,
      srScore: 0,
      volatilityScore: 0,
      rrScore: 0,
      confirmationScore: 0,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: 0,
      status: 'BLOCKED',
      explanation: `Signal Blocked: Market data quality score (${dataQuality}/100) is below acceptable threshold.`,
      components: [],
    };
  }

  // Hard Filter 1: Check directional geometry
  const geometryCheck = validateGeometry(direction, entryPrice, stopLoss, takeProfit1);
  if (!geometryCheck.valid) {
    return {
      id: crypto.randomUUID(),
      userId,
      pair,
      timeframe,
      timestamp: new Date().toISOString(),
      direction,
      score: 0,
      trendScore: 0,
      structureScore: 0,
      momentumScore: 0,
      srScore: 0,
      volatilityScore: 0,
      rrScore: 0,
      confirmationScore: 0,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: 0,
      status: 'BLOCKED',
      explanation: `Signal Blocked: ${geometryCheck.reason}`,
      components: [],
    };
  }

  // Hard Filter 2: Calculate Risk:Reward and enforce R:R >= 1.0
  const riskDistance = Math.abs(entryPrice - stopLoss);
  const rewardDistance = Math.abs(takeProfit1 - entryPrice);
  const riskReward = riskDistance > 0 ? Number((rewardDistance / riskDistance).toFixed(2)) : 0;

  if (riskReward < 1.0) {
    return {
      id: crypto.randomUUID(),
      userId,
      pair,
      timeframe,
      timestamp: new Date().toISOString(),
      direction,
      score: 0,
      trendScore: 0,
      structureScore: 0,
      momentumScore: 0,
      srScore: 0,
      volatilityScore: 0,
      rrScore: 0,
      confirmationScore: 0,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward,
      status: 'BLOCKED',
      explanation: `Signal Blocked: Risk/Reward (${riskReward}R) is below minimum 1.0R threshold`,
      components: [],
    };
  }

  // Hard Filter 3: Check minimum data
  if (!candles || candles.length < 20) {
    return {
      id: crypto.randomUUID(),
      userId,
      pair,
      timeframe,
      timestamp: new Date().toISOString(),
      direction,
      score: 0,
      trendScore: 0,
      structureScore: 0,
      momentumScore: 0,
      srScore: 0,
      volatilityScore: 0,
      rrScore: 0,
      confirmationScore: 0,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward,
      status: 'BLOCKED',
      explanation: 'Signal Blocked: Insufficient market candle data to evaluate reliably',
      components: [],
    };
  }

  // 1. Higher Timeframe Trend (Weight: 20)
  let trendScore = 0;
  let trendReason = '';
  const currentBias = htfTrend ?? structure.trend;
  if (direction === 'LONG') {
    if (currentBias === 'BULLISH') {
      trendScore = 20;
      trendReason = 'Higher timeframe trend is fully aligned Bullish';
    } else if (currentBias === 'NEUTRAL') {
      trendScore = 10;
      trendReason = 'Higher timeframe trend is Neutral/Consolidating';
    } else {
      trendScore = 0;
      trendReason = 'Counter-trend: Higher timeframe is Bearish';
    }
  } else {
    if (currentBias === 'BEARISH') {
      trendScore = 20;
      trendReason = 'Higher timeframe trend is fully aligned Bearish';
    } else if (currentBias === 'NEUTRAL') {
      trendScore = 10;
      trendReason = 'Higher timeframe trend is Neutral/Consolidating';
    } else {
      trendScore = 0;
      trendReason = 'Counter-trend: Higher timeframe is Bullish';
    }
  }
  components.push({
    component: 'Higher Timeframe Trend',
    rawValue: currentBias,
    score: trendScore,
    weight: 20,
    reason: trendReason,
    isPositive: trendScore >= 15,
  });

  // 2. Market Structure (Weight: 20)
  let structureScore = 0;
  let structureReason = '';
  if (direction === 'LONG') {
    if (structure.isBullishBOS) {
      structureScore = 20;
      structureReason = 'Confirmed Bullish Break of Structure (BOS)';
    } else if (structure.isHigherHigh && structure.isHigherLow) {
      structureScore = structure.isPullback ? 18 : 16;
      structureReason = structure.isPullback
        ? 'Healthy pullback into support during Higher-High/Higher-Low sequence'
        : 'Active Higher-High and Higher-Low market structure';
    } else if (structure.isHigherLow) {
      structureScore = 12;
      structureReason = 'Forming Higher Low above key swing support';
    } else {
      structureScore = 4;
      structureReason = 'No clear bullish structure formed yet';
    }
  } else {
    if (structure.isBearishBOS) {
      structureScore = 20;
      structureReason = 'Confirmed Bearish Break of Structure (BOS)';
    } else if (structure.isLowerHigh && structure.isLowerLow) {
      structureScore = structure.isPullback ? 18 : 16;
      structureReason = structure.isPullback
        ? 'Rally into resistance during Lower-High/Lower-Low sequence'
        : 'Active Lower-High and Lower-Low market structure';
    } else if (structure.isLowerHigh) {
      structureScore = 12;
      structureReason = 'Forming Lower High below key swing resistance';
    } else {
      structureScore = 4;
      structureReason = 'No clear bearish structure formed yet';
    }
  }
  components.push({
    component: 'Market Structure',
    rawValue: structure.lastStructureEvent ?? 'NONE',
    score: structureScore,
    weight: 20,
    reason: structureReason,
    isPositive: structureScore >= 15,
  });

  // 3. Momentum (Weight: 15)
  let momentumScore = 0;
  let momentumReason = '';
  const rsi = indicator.rsi14 ?? 50;
  const hist = indicator.macdHistogram ?? 0;

  if (direction === 'LONG') {
    if (rsi >= 45 && rsi <= 65 && hist > 0) {
      momentumScore = 15;
      momentumReason = `Bullish momentum with RSI (${rsi.toFixed(1)}) in expansion zone and positive MACD histogram`;
    } else if (rsi >= 40 && rsi < 70) {
      momentumScore = 10;
      momentumReason = `Constructive RSI (${rsi.toFixed(1)}) with neutral-to-improving momentum`;
    } else if (rsi < 30) {
      momentumScore = 7;
      momentumReason = `Oversold RSI (${rsi.toFixed(1)}), potential mean-reversion setup`;
    } else {
      momentumScore = 3;
      momentumReason = `Weak or overextended momentum (RSI ${rsi.toFixed(1)})`;
    }
  } else {
    if (rsi >= 35 && rsi <= 55 && hist < 0) {
      momentumScore = 15;
      momentumReason = `Bearish momentum with RSI (${rsi.toFixed(1)}) in contraction zone and negative MACD histogram`;
    } else if (rsi > 30 && rsi <= 60) {
      momentumScore = 10;
      momentumReason = `Constructive Bearish RSI (${rsi.toFixed(1)}) with downward momentum`;
    } else if (rsi > 70) {
      momentumScore = 7;
      momentumReason = `Overbought RSI (${rsi.toFixed(1)}), potential exhaustion reversal`;
    } else {
      momentumScore = 3;
      momentumReason = `Weak or overextended momentum (RSI ${rsi.toFixed(1)})`;
    }
  }
  components.push({
    component: 'Momentum',
    rawValue: `RSI: ${rsi.toFixed(1)}, MACD Hist: ${hist.toFixed(4)}`,
    score: momentumScore,
    weight: 15,
    reason: momentumReason,
    isPositive: momentumScore >= 10,
  });

  // 4. Support / Resistance Confluence (Weight: 15)
  let srScore = 0;
  let srReason = '';
  const ema20 = indicator.ema20 ?? entryPrice;
  const ema50 = indicator.ema50 ?? entryPrice;

  if (direction === 'LONG') {
    if (entryPrice >= ema20 && ema20 >= ema50) {
      srScore = 15;
      srReason = 'Price supported cleanly above EMA20 and EMA50 moving averages';
    } else if (entryPrice >= ema50) {
      srScore = 11;
      srReason = 'Price bouncing above primary EMA50 dynamic support';
    } else {
      srScore = 5;
      srReason = 'Price trading below dynamic moving average levels';
    }
  } else {
    if (entryPrice <= ema20 && ema20 <= ema50) {
      srScore = 15;
      srReason = 'Price capped cleanly below EMA20 and EMA50 dynamic resistance';
    } else if (entryPrice <= ema50) {
      srScore = 11;
      srReason = 'Price testing dynamic EMA50 resistance from below';
    } else {
      srScore = 5;
      srReason = 'Price trading above dynamic moving averages';
    }
  }
  components.push({
    component: 'Support & Resistance Confluence',
    rawValue: `EMA20: ${ema20.toFixed(4)}, EMA50: ${ema50.toFixed(4)}`,
    score: srScore,
    weight: 15,
    reason: srReason,
    isPositive: srScore >= 10,
  });

  // 5. Volatility & ATR Quality (Weight: 10)
  let volatilityScore = 0;
  let volReason = '';
  const atr = indicator.atr14 ?? 0.001;
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const stopInATR = atr > 0 ? stopDistance / atr : 1;

  if (stopInATR >= 0.8 && stopInATR <= 2.5) {
    volatilityScore = 10;
    volReason = `Optimal stop loss buffer (${stopInATR.toFixed(1)}x ATR), reducing false stopout risk`;
  } else if (stopInATR > 2.5) {
    volatilityScore = 6;
    volReason = `Wide stop loss relative to ATR (${stopInATR.toFixed(1)}x ATR), requires larger balance allocation`;
  } else {
    volatilityScore = 4;
    volReason = `Tight stop loss (${stopInATR.toFixed(1)}x ATR), heightened noise vulnerability`;
  }
  components.push({
    component: 'Volatility & ATR Buffer',
    rawValue: `${stopInATR.toFixed(2)}x ATR`,
    score: volatilityScore,
    weight: 10,
    reason: volReason,
    isPositive: volatilityScore >= 8,
  });

  // 6. Risk / Reward Profile (Weight: 10)
  let rrScore = 0;
  let rrReason = '';
  if (riskReward >= 3.0) {
    rrScore = 10;
    rrReason = `Exceptional Risk/Reward ratio (${riskReward}R)`;
  } else if (riskReward >= 2.0) {
    rrScore = 8;
    rrReason = `Favorable Risk/Reward ratio (${riskReward}R)`;
  } else if (riskReward >= 1.5) {
    rrScore = 6;
    rrReason = `Acceptable standard Risk/Reward ratio (${riskReward}R)`;
  } else {
    rrScore = 3;
    rrReason = `Marginal Risk/Reward ratio (${riskReward}R)`;
  }
  components.push({
    component: 'Risk / Reward Profile',
    rawValue: `${riskReward}R`,
    score: rrScore,
    weight: 10,
    reason: rrReason,
    isPositive: rrScore >= 8,
  });

  // 7. Multi-Timeframe Confirmation (Weight: 10)
  let confirmationScore = 0;
  let confReason = '';
  const adx = indicator.adx14 ?? 20;
  if (adx >= 25) {
    confirmationScore = 10;
    confReason = `Strong trend momentum confirmed by ADX (${adx.toFixed(1)} > 25)`;
  } else if (adx >= 20) {
    confirmationScore = 7;
    confReason = `Moderate trend strength on ADX (${adx.toFixed(1)})`;
  } else {
    confirmationScore = 4;
    confReason = `Weak directional trend on ADX (${adx.toFixed(1)} < 20)`;
  }
  components.push({
    component: 'Confirmation & Trend Strength',
    rawValue: `ADX: ${adx.toFixed(1)}`,
    score: confirmationScore,
    weight: 10,
    reason: confReason,
    isPositive: confirmationScore >= 7,
  });

  // 8. Data Quality & Feed Provenance (Transparency metadata)
  if (dataStatus !== undefined) {
    components.push({
      component: 'Data Quality & Provenance',
      rawValue: `Status: ${dataStatus}, Quality: ${dataQuality}/100`,
      score: 0,
      weight: 0,
      reason: `Validated market feed (${dataStatus}) with ${dataQuality}/100 data quality score`,
      isPositive: dataQuality >= 75,
    });
  }

  const totalScore =
    trendScore +
    structureScore +
    momentumScore +
    srScore +
    volatilityScore +
    rrScore +
    confirmationScore;

  const status = classifyScore(totalScore);
  const explanation = `${direction} setup scored ${totalScore}/100 [${status}]. Key drivers: ${trendReason}; ${structureReason}; ${rrReason}.`;

  const positionPlan = buildOpenPositionRiskRewardPlan({
    pair,
    timeframe,
    direction,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    atr: indicator.atr14,
    status,
    score: totalScore,
  });

  return {
    id: crypto.randomUUID(),
    userId,
    pair,
    timeframe,
    timestamp: new Date().toISOString(),
    direction,
    score: totalScore,
    trendScore,
    structureScore,
    momentumScore,
    srScore,
    volatilityScore,
    rrScore,
    confirmationScore,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3: positionPlan.takeProfit3,
    riskReward,
    riskReward2: positionPlan.riskReward2,
    riskReward3: positionPlan.riskReward3,
    stopLossPips: positionPlan.stopLossPips,
    tp1Pips: positionPlan.tp1Pips,
    tp2Pips: positionPlan.tp2Pips,
    tp3Pips: positionPlan.tp3Pips,
    recommendedAction: positionPlan.recommendedAction,
    actionLabel: positionPlan.actionLabel,
    positionPlan,
    status,
    explanation,
    components,
  };
}
