import {
  MarketCandle,
  TechnicalIndicator,
  MarketStructure,
  TradeDirection,
  SignalStatus,
  SignalRun,
  SignalComponent,
  MarketDataStatusCode,
} from '../types/index.ts';

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
    riskReward,
    status,
    explanation,
    components,
  };
}
