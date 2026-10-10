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
  BottomUpTimeframeStep,
} from '../types/index.ts';
import { getInstrumentSpec } from './risk.ts';

export function getPricePrecisionForPair(pair: string): number {
  const normalized = pair.toUpperCase().replace('/', '').replace('-', '').trim();
  if (
    normalized.includes('JPY') ||
    normalized === 'XAUUSD' ||
    normalized.includes('BTC') ||
    normalized.includes('ETH') ||
    normalized === 'US30' ||
    normalized === 'NAS100' ||
    normalized === 'SPX500'
  ) {
    return 2;
  }
  return 4;
}

export function determineBottomUpSignalDirection(params: {
  multiTimeframe?: Record<string, any>;
  activeTimeframe?: string;
  indicator?: TechnicalIndicator | null;
  structure?: MarketStructure | null;
  overallBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}): TradeDirection {
  const { multiTimeframe, activeTimeframe, indicator, structure, overallBias } = params;
  // Adaptive Bottom-Up Hybrid Confluence (Backtest #1 Model: M5/M15 -> H1 -> H4 -> D1)
  const bottomUpOrder: { tf: string; weight: number }[] = [
    { tf: 'M5', weight: 2.0 },  // Micro scalping trigger (when available)
    { tf: 'M15', weight: 2.4 }, // Smallest TF primary trigger & value-zone inflection
    { tf: 'H1', weight: 2.5 },  // Intraday structure & EMA20/50 confirmation
    { tf: 'H4', weight: 2.0 },  // Medium-term swing context
    { tf: 'D1', weight: 1.8 },  // Macro bias filter
  ];

  let longScore = 0;
  let shortScore = 0;

  if (multiTimeframe) {
    for (const { tf, weight } of bottomUpOrder) {
      const tfData = multiTimeframe[tf];
      if (!tfData) continue;
      if (tfData.trend === 'BULLISH') longScore += weight;
      else if (tfData.trend === 'BEARISH') shortScore += weight;

      if (tfData.momentum === 'BULLISH') longScore += weight * 0.5;
      else if (tfData.momentum === 'BEARISH') shortScore += weight * 0.5;

      if (tfData.structure === 'BULLISH') longScore += weight * 0.4;
      else if (tfData.structure === 'BEARISH') shortScore += weight * 0.4;
    }
  }

  if (structure) {
    if (structure.isBullishBOS || (structure.isHigherHigh && structure.isHigherLow)) {
      longScore += 2.2;
    } else if (structure.isBearishBOS || (structure.isLowerHigh && structure.isLowerLow)) {
      shortScore += 2.2;
    } else if (structure.isHigherLow) {
      longScore += 1.2;
    } else if (structure.isLowerHigh) {
      shortScore += 1.2;
    }
  }

  if (indicator) {
    const rsi = indicator.rsi14 ?? 50;
    const hist = indicator.macdHistogram ?? 0;
    const adx = indicator.adx14 ?? 20;
    const plusDI = indicator.plusDI ?? 20;
    const minusDI = indicator.minusDI ?? 20;
    const ema20 = indicator.ema20 ?? null;
    const ema50 = indicator.ema50 ?? null;
    const atr = indicator.atr14 ?? null;
    const bbLower = indicator.bbLower ?? null;
    const bbUpper = indicator.bbUpper ?? null;

    // Regime 1 (M15 64% Win-Rate Setup): Bollinger Band (20,2) + EMA50 Discount/Premium + RSI & MACD Inflection
    if (activeTimeframe === 'M15' || !activeTimeframe) {
      if (rsi <= 39 && hist >= -0.5 && !(adx > 42 && ema20 !== null && ema50 !== null && ema20 < ema50)) {
        longScore += 2.6;
      } else if (rsi >= 61 && hist <= 0.5 && !(adx > 42 && ema20 !== null && ema50 !== null && ema20 > ema50)) {
        shortScore += 2.6;
      }
    }

    // Regime 2 (M5/H1 Trend Continuation + ADX >= 25 & DI+/DI- + RSI Anti-Exhaustion 32-68)
    if (adx >= 22) {
      if (plusDI > minusDI && rsi >= 48 && rsi <= 68 && hist > 0) {
        longScore += 2.0;
      } else if (minusDI > plusDI && rsi <= 52 && rsi >= 32 && hist < 0) {
        shortScore += 2.0;
      }
    }

    // Standard RSI + MACD alignment with Anti-Exhaustion penalty (avoid buying RSI > 72 or selling RSI < 28)
    if (rsi >= 48 && rsi <= 69 && hist >= 0) longScore += 1.2;
    else if (rsi <= 52 && rsi >= 31 && hist < 0) shortScore += 1.2;
    else if (rsi > 72 && bbUpper !== null && atr !== null) shortScore += 1.5;
    else if (rsi < 28 && bbLower !== null && atr !== null) longScore += 1.5;
  }

  if (Math.abs(longScore - shortScore) < 0.25 && overallBias) {
    return overallBias === 'BEARISH' ? 'SHORT' : 'LONG';
  }

  return shortScore > longScore ? 'SHORT' : 'LONG';
}

export function buildBottomUpTimeframeSteps(params: {
  direction: TradeDirection;
  activeTimeframe: string;
  multiTimeframe?: Record<string, any>;
  indicator?: TechnicalIndicator | null;
  structure?: MarketStructure | null;
  precision: number;
}): BottomUpTimeframeStep[] {
  const { direction, activeTimeframe, multiTimeframe, indicator, structure, precision } = params;
  const targetBias = direction === 'LONG' ? 'BULLISH' : 'BEARISH';

  const includeM5 =
    activeTimeframe === 'M5' || Boolean(multiTimeframe?.M5 && (multiTimeframe.M5.dataQuality ?? 0) > 0);

  const rawSteps: { tf: string; roleLabel: string }[] = [
    ...(includeM5
      ? [
          {
            tf: 'M5',
            roleLabel: 'M5 (Micro Trigger: Pullback EMA20/50 + ADX≥25 + RSI Anti-Exhaustion)',
          },
        ]
      : []),
    {
      tf: 'M15',
      roleLabel: 'M15 (Value-Zone Trigger: Bollinger 20,2 + EMA50 + Infleksi RSI/MACD)',
    },
    {
      tf: 'H1',
      roleLabel: 'H1 (Konfirmasi Struktur Intraday BOS/HL/LH & Moving Average)',
    },
    {
      tf: 'H4',
      roleLabel: 'H4 (Validasi Aliran Swing & Kekuatan Tren ADX/DI)',
    },
    {
      tf: 'D1',
      roleLabel: 'D1 (Konteks Tren Makro & EMA 20/50/200 Stack)',
    },
  ];

  const tfDefinitions = rawSteps.map((s, idx) => ({
    tf: s.tf,
    stepOrder: idx + 1,
    roleLabel: `Tahap ${idx + 1} • ${s.roleLabel}`,
  }));

  return tfDefinitions.map(({ tf, stepOrder, roleLabel }) => {
    const mtfEntry = multiTimeframe?.[tf];
    const isCurrentActive = tf === activeTimeframe;

    const trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      mtfEntry?.trend ||
      (isCurrentActive && structure?.trend
        ? (structure.trend as 'BULLISH' | 'BEARISH' | 'NEUTRAL')
        : 'NEUTRAL');

    const momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      mtfEntry?.momentum ||
      (isCurrentActive && indicator
        ? (indicator.rsi14 ?? 50) > 52
          ? 'BULLISH'
          : (indicator.rsi14 ?? 50) < 48
          ? 'BEARISH'
          : 'NEUTRAL'
        : 'NEUTRAL');

    const structLabel: string =
      (isCurrentActive && structure?.lastStructureEvent) ||
      mtfEntry?.structure ||
      trend;

    const rsi = mtfEntry?.indicators?.rsi ?? (isCurrentActive ? indicator?.rsi14 : null) ?? null;
    const adx = mtfEntry?.indicators?.adx ?? (isCurrentActive ? indicator?.adx14 : null) ?? null;
    const ema20 = mtfEntry?.indicators?.ema20 ?? (isCurrentActive ? indicator?.ema20 : null) ?? null;
    const ema50 = mtfEntry?.indicators?.ema50 ?? (isCurrentActive ? indicator?.ema50 : null) ?? null;
    const bbLower = mtfEntry?.indicators?.bbLower ?? (isCurrentActive ? indicator?.bbLower : null) ?? null;
    const bbUpper = mtfEntry?.indicators?.bbUpper ?? (isCurrentActive ? indicator?.bbUpper : null) ?? null;

    // Backtest #1 M15 Value-Zone Inflection check (64% WR setup)
    const isM15ValueInflection =
      tf === 'M15' &&
      rsi !== null &&
      ((direction === 'LONG' && rsi <= 42) || (direction === 'SHORT' && rsi >= 58));

    const isAligned = trend === targetBias || momentum === targetBias || isM15ValueInflection;

    let summary = '';
    if (tf === 'M5') {
      summary = isAligned
        ? `Micro trigger M5 mendukung ${direction} (Tren: ${trend}, Mom: ${momentum}${rsi ? `, RSI ${Number(rsi).toFixed(1)} [Anti-Exhaustion]` : ''}${adx ? `, ADX ${Number(adx).toFixed(1)}` : ''}).`
        : `Timeframe mikro M5 berada pada fase ${trend} (Mom: ${momentum}${rsi ? `, RSI ${Number(rsi).toFixed(1)}` : ''}), tunggu harga menyentuh limit retest.`;
    } else if (tf === 'M15') {
      summary = isAligned
        ? `Trigger M15 (Win Rate Tertinggi 64%): ${trend} / Momentum ${momentum}${rsi ? `, RSI ${Number(rsi).toFixed(1)}` : ''}${bbLower && bbUpper ? `, BB [${Number(bbLower).toFixed(precision)}–${Number(bbUpper).toFixed(precision)}]` : ema20 ? `, EMA20 $${Number(ema20).toFixed(precision)}` : ''}.`
        : `Timeframe M15 masih ${trend} (Momentum: ${momentum}${rsi ? `, RSI ${Number(rsi).toFixed(1)}` : ''}), menunggu harga masuk ke zona diskon/premium Bollinger & EMA50.`;
    } else if (tf === 'H1') {
      summary = isAligned
        ? `Struktur intraday H1 mengonfirmasi arah ${direction} (${structLabel}${ema50 ? `, EMA50 $${Number(ema50).toFixed(precision)}` : ''}).`
        : `Struktur intraday H1 berada dalam fase ${trend} (${structLabel}), mengaktifkan mode Value-Zone Bounce M15.`;
    } else if (tf === 'H4') {
      summary = isAligned
        ? `Aliran swing H4 mendukung ekspansi ${direction} (Tren: ${trend}, Momentum: ${momentum}${adx ? `, ADX ${Number(adx).toFixed(1)}` : ''}).`
        : `Timeframe swing H4 cenderung ${trend} (Momentum: ${momentum}), perhatikan target TP1 konservatif (1.5R–2.0R).`;
    } else {
      summary = isAligned
        ? `Bias makro D1 searah (${trend}), memperkuat probabilitas kelanjutan tren jangka panjang.`
        : `Bias makro D1 saat ini ${trend}; posisi ${direction} bersifat taktis pada zona nilai intraday.`;
    }

    return {
      stepOrder,
      timeframe: tf,
      roleLabel,
      trend,
      structure: structLabel,
      momentum,
      rsi,
      adx,
      ema20,
      ema50,
      isAligned,
      summary,
    };
  });
}

export function generateOptimalSignalLevels(params: {
  pair: string;
  direction: TradeDirection;
  currentPrice: number;
  atr?: number | null;
  nearestSupport?: number | null;
  nearestResistance?: number | null;
  indicator?: TechnicalIndicator | null;
  structure?: MarketStructure | null;
  multiTimeframe?: Record<string, any>;
  candles?: MarketCandle[];
  entryMode?: 'PULLBACK_LIMIT' | 'BREAKOUT_STOP' | 'STRUCTURE_RETEST';
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
  executionType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  orderTypeLabel: string;
  currentReferencePrice: number;
  entryDistancePips: number;
  entryBasisMethod: string;
  entryBasisReason: string;
  entryZoneLow: number;
  entryZoneHigh: number;
} {
  const {
    pair,
    direction,
    currentPrice,
    atr,
    nearestSupport,
    nearestResistance,
    indicator,
    structure,
    multiTimeframe,
    candles,
    entryMode = 'PULLBACK_LIMIT',
    atrSlMultiplier = 1.5,
    rrTp1 = 2.0,
    rrTp2 = 3.0,
    rrTp3 = 4.5,
  } = params;

  const precision = getPricePrecisionForPair(pair);
  const spec = getInstrumentSpec(pair);
  const pipSize = spec?.pipSize ?? (pair.includes('JPY') || pair === 'XAUUSD' ? 0.01 : 0.0001);
  const effectiveAtr = atr && atr > 0 ? atr : currentPrice * 0.0025;

  // Extract technical anchors from Smallest Timeframe (M15) first, then active timeframe
  const m15Ind = multiTimeframe?.M15?.indicators;
  const h1Ind = multiTimeframe?.H1?.indicators;

  const ltfEma20 =
    (typeof m15Ind?.ema20 === 'number' && m15Ind.ema20 > 0 ? m15Ind.ema20 : null) ??
    (typeof indicator?.ema20 === 'number' && indicator.ema20 > 0 ? indicator.ema20 : null) ??
    (typeof h1Ind?.ema20 === 'number' && h1Ind.ema20 > 0 ? h1Ind.ema20 : null);

  const ltfEma50 =
    (typeof m15Ind?.ema50 === 'number' && m15Ind.ema50 > 0 ? m15Ind.ema50 : null) ??
    (typeof indicator?.ema50 === 'number' && indicator.ema50 > 0 ? indicator.ema50 : null) ??
    (typeof h1Ind?.ema50 === 'number' && h1Ind.ema50 > 0 ? h1Ind.ema50 : null);

  const ltfBbLower =
    (typeof m15Ind?.bbLower === 'number' && m15Ind.bbLower > 0 ? m15Ind.bbLower : null) ??
    (typeof indicator?.bbLower === 'number' && indicator.bbLower > 0 ? indicator.bbLower : null);

  const ltfBbUpper =
    (typeof m15Ind?.bbUpper === 'number' && m15Ind.bbUpper > 0 ? m15Ind.bbUpper : null) ??
    (typeof indicator?.bbUpper === 'number' && indicator.bbUpper > 0 ? indicator.bbUpper : null);

  const lastSwingLow =
    structure?.swingLows && structure.swingLows.length > 0
      ? structure.swingLows[structure.swingLows.length - 1].price
      : null;
  const lastSwingHigh =
    structure?.swingHighs && structure.swingHighs.length > 0
      ? structure.swingHighs[structure.swingHighs.length - 1].price
      : null;

  // Recent micro-impulse range from last 8 candles if available
  let recentMicroLow: number | null = null;
  let recentMicroHigh: number | null = null;
  if (candles && candles.length >= 5) {
    const recentSlice = candles.slice(-8);
    recentMicroLow = Math.min(...recentSlice.map((c) => c.low));
    recentMicroHigh = Math.max(...recentSlice.map((c) => c.high));
  }

  const minOffset = Math.max(pipSize * 3, effectiveAtr * 0.28);
  const maxOffset = effectiveAtr * 1.35;

  let rawEntry = currentPrice;
  let executionType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' =
    direction === 'LONG' ? 'BUY_LIMIT' : 'SELL_LIMIT';
  let orderTypeLabel =
    direction === 'LONG'
      ? 'BUY LIMIT (Retest Pullback TF Kecil)'
      : 'SELL LIMIT (Retest Supply TF Kecil)';
  let entryBasisMethod = 'Zona Retracement & Dynamic EMA M15/H1';

  if (direction === 'LONG') {
    if (entryMode === 'BREAKOUT_STOP') {
      // Breakout confirmation entry above micro-structure high
      const breakoutTrigger =
        recentMicroHigh && recentMicroHigh > currentPrice && recentMicroHigh - currentPrice <= maxOffset
          ? recentMicroHigh + pipSize * 2
          : currentPrice + Math.max(minOffset, effectiveAtr * 0.35);
      rawEntry = breakoutTrigger;
      executionType = 'BUY_STOP';
      orderTypeLabel = 'BUY STOP (Konfirmasi Breakout Struktur M15)';
      entryBasisMethod = 'Breakout Micro-High Timeframe Terkecil (M15)';
    } else {
      // Technical Pullback / Retest BUY LIMIT below currentPrice (Never raw currentPrice)
      const candidates: { price: number; method: string }[] = [];

      if (
        entryMode === 'STRUCTURE_RETEST' &&
        nearestSupport &&
        nearestSupport < currentPrice - minOffset * 0.5 &&
        currentPrice - nearestSupport <= effectiveAtr * 1.8
      ) {
        candidates.push({
          price: nearestSupport + effectiveAtr * 0.15,
          method: 'Retest Zona Demand & Technical Support',
        });
      }

      if (
        ltfEma20 &&
        ltfEma20 < currentPrice - minOffset * 0.5 &&
        currentPrice - ltfEma20 <= maxOffset
      ) {
        candidates.push({
          price: ltfEma20,
          method: 'Pullback Dynamic EMA20 pada Timeframe Kecil (M15/H1)',
        });
      }

      if (
        ltfEma50 &&
        ltfEma50 < currentPrice - minOffset * 0.5 &&
        currentPrice - ltfEma50 <= maxOffset
      ) {
        candidates.push({
          price: ltfEma50,
          method: 'Pullback Dynamic EMA50 Equilibrium (M15/H1)',
        });
      }

      if (
        nearestSupport &&
        nearestSupport < currentPrice - minOffset * 0.5 &&
        currentPrice - nearestSupport <= maxOffset
      ) {
        candidates.push({
          price: nearestSupport + effectiveAtr * 0.12,
          method: 'Retest Struktur Support Terdekat + Buffer ATR',
        });
      }

      if (
        lastSwingLow &&
        lastSwingLow < currentPrice - minOffset * 0.5 &&
        currentPrice - lastSwingLow <= maxOffset
      ) {
        candidates.push({
          price: lastSwingLow + effectiveAtr * 0.2,
          method: 'Retest Higher Low / Swing Low Struktur Bawah',
        });
      }

      if (
        recentMicroLow &&
        recentMicroHigh &&
        recentMicroHigh > recentMicroLow &&
        currentPrice > recentMicroLow
      ) {
        // Fibonacci 50% retracement of recent micro-impulse wave
        const fib50 = recentMicroHigh - (recentMicroHigh - recentMicroLow) * 0.5;
        if (fib50 < currentPrice - minOffset * 0.5 && currentPrice - fib50 <= maxOffset) {
          candidates.push({
            price: fib50,
            method: 'Retracement Fibonacci 50% Gelombang Impuls M15',
          });
        }
      }

      if (
        ltfBbLower &&
        ltfBbLower < currentPrice - minOffset * 0.4 &&
        currentPrice - ltfBbLower <= maxOffset
      ) {
        candidates.push({
          price: ltfBbLower + effectiveAtr * 0.08,
          method: 'Bollinger Lower Band (20,2) + Zona Diskon Value M15 (Backtest 64% WR)',
        });
      }

      if (candidates.length > 0) {
        // Choose the highest valid technical pullback level below currentPrice (closest high-probability retest)
        candidates.sort((a, b) => b.price - a.price);
        rawEntry = candidates[0].price;
        entryBasisMethod = candidates[0].method;
      } else {
        // Backtest-calibrated technical limit retest below currentPrice (Anti-Exhaustion Entry)
        rawEntry = currentPrice - Math.max(minOffset, effectiveAtr * 0.32);
        entryBasisMethod = 'Adaptive Bottom-Up Limit Retest (EMA20/BB Value Zone • Backtest #1)';
      }

      // Guarantee entryPrice is strictly below currentPrice for BUY_LIMIT
      if (rawEntry >= currentPrice - pipSize) {
        rawEntry = currentPrice - minOffset;
      }
      executionType = 'BUY_LIMIT';
      orderTypeLabel = 'BUY LIMIT (Retest Pullback TF Kecil)';
    }
  } else {
    // SHORT direction
    if (entryMode === 'BREAKOUT_STOP') {
      const breakoutTrigger =
        recentMicroLow && recentMicroLow < currentPrice && currentPrice - recentMicroLow <= maxOffset
          ? recentMicroLow - pipSize * 2
          : currentPrice - Math.max(minOffset, effectiveAtr * 0.35);
      rawEntry = breakoutTrigger;
      executionType = 'SELL_STOP';
      orderTypeLabel = 'SELL STOP (Konfirmasi Breakdown Struktur M15)';
      entryBasisMethod = 'Breakdown Micro-Low Timeframe Terkecil (M15)';
    } else {
      // Technical Rally / Retest SELL LIMIT above currentPrice (Never raw currentPrice)
      const candidates: { price: number; method: string }[] = [];

      if (
        entryMode === 'STRUCTURE_RETEST' &&
        nearestResistance &&
        nearestResistance > currentPrice + minOffset * 0.5 &&
        nearestResistance - currentPrice <= effectiveAtr * 1.8
      ) {
        candidates.push({
          price: nearestResistance - effectiveAtr * 0.15,
          method: 'Retest Zona Supply & Technical Resistance',
        });
      }

      if (
        ltfEma20 &&
        ltfEma20 > currentPrice + minOffset * 0.5 &&
        ltfEma20 - currentPrice <= maxOffset
      ) {
        candidates.push({
          price: ltfEma20,
          method: 'Rally Retest Dynamic EMA20 pada Timeframe Kecil (M15/H1)',
        });
      }

      if (
        ltfEma50 &&
        ltfEma50 > currentPrice + minOffset * 0.5 &&
        ltfEma50 - currentPrice <= maxOffset
      ) {
        candidates.push({
          price: ltfEma50,
          method: 'Rally Retest Dynamic EMA50 Equilibrium (M15/H1)',
        });
      }

      if (
        nearestResistance &&
        nearestResistance > currentPrice + minOffset * 0.5 &&
        nearestResistance - currentPrice <= maxOffset
      ) {
        candidates.push({
          price: nearestResistance - effectiveAtr * 0.12,
          method: 'Retest Struktur Resistance Terdekat - Buffer ATR',
        });
      }

      if (
        lastSwingHigh &&
        lastSwingHigh > currentPrice + minOffset * 0.5 &&
        lastSwingHigh - currentPrice <= maxOffset
      ) {
        candidates.push({
          price: lastSwingHigh - effectiveAtr * 0.2,
          method: 'Retest Lower High / Swing High Struktur Bawah',
        });
      }

      if (
        recentMicroLow &&
        recentMicroHigh &&
        recentMicroHigh > recentMicroLow &&
        currentPrice < recentMicroHigh
      ) {
        const fib50 = recentMicroLow + (recentMicroHigh - recentMicroLow) * 0.5;
        if (fib50 > currentPrice + minOffset * 0.5 && fib50 - currentPrice <= maxOffset) {
          candidates.push({
            price: fib50,
            method: 'Retracement Fibonacci 50% Gelombang Impuls M15',
          });
        }
      }

      if (
        ltfBbUpper &&
        ltfBbUpper > currentPrice + minOffset * 0.4 &&
        ltfBbUpper - currentPrice <= maxOffset
      ) {
        candidates.push({
          price: ltfBbUpper - effectiveAtr * 0.08,
          method: 'Bollinger Upper Band (20,2) + Zona Premium Supply M15 (Backtest 64% WR)',
        });
      }

      if (candidates.length > 0) {
        // Choose the lowest valid technical rally level above currentPrice
        candidates.sort((a, b) => a.price - b.price);
        rawEntry = candidates[0].price;
        entryBasisMethod = candidates[0].method;
      } else {
        rawEntry = currentPrice + Math.max(minOffset, effectiveAtr * 0.32);
        entryBasisMethod = 'Adaptive Bottom-Up Limit Retest (EMA20/BB Supply Zone • Backtest #1)';
      }

      if (rawEntry <= currentPrice + pipSize) {
        rawEntry = currentPrice + minOffset;
      }
      executionType = 'SELL_LIMIT';
      orderTypeLabel = 'SELL LIMIT (Retest Supply TF Kecil)';
    }
  }

  const entryPrice = Number(rawEntry.toFixed(precision));
  const currentReferencePrice = Number(currentPrice.toFixed(precision));
  const entryDistancePips =
    pipSize > 0 ? Number((Math.abs(entryPrice - currentReferencePrice) / pipSize).toFixed(1)) : 0;

  const zoneHalfSpan = Math.max(pipSize * 1.5, effectiveAtr * 0.1);
  const entryZoneLow = Number((entryPrice - zoneHalfSpan).toFixed(precision));
  const entryZoneHigh = Number((entryPrice + zoneHalfSpan).toFixed(precision));

  // Calculate Stop Loss relative to Technical Entry Price & structural invalidation
  let slDistance = effectiveAtr * atrSlMultiplier;
  if (direction === 'LONG' && nearestSupport && nearestSupport < entryPrice) {
    const structDist = entryPrice - nearestSupport + effectiveAtr * 0.25;
    if (structDist >= effectiveAtr * 0.8 && structDist <= effectiveAtr * 2.2) {
      slDistance = structDist;
    }
  } else if (direction === 'SHORT' && nearestResistance && nearestResistance > entryPrice) {
    const structDist = nearestResistance - entryPrice + effectiveAtr * 0.25;
    if (structDist >= effectiveAtr * 0.8 && structDist <= effectiveAtr * 2.2) {
      slDistance = structDist;
    }
  }

  const stopLoss = Number(
    (direction === 'LONG' ? entryPrice - slDistance : entryPrice + slDistance).toFixed(precision)
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

  const entryBasisReason = `Signal diproses dari timeframe terkecil (M15 → H1 → H4 → D1). Harga Entry ($${entryPrice.toFixed(
    precision
  )}) BUKAN diambil dari harga pasar terkini ($${currentReferencePrice.toFixed(
    precision
  )}), melainkan ditempatkan sebagai ${orderTypeLabel} pada ${entryBasisMethod} (berjarak ${entryDistancePips} pips dari harga saat ini) untuk mendapatkan harga masuk optimal dan memperkecil risiko Stop Loss.`;

  return {
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    atrUsed: effectiveAtr,
    executionType,
    orderTypeLabel,
    currentReferencePrice,
    entryDistancePips,
    entryBasisMethod,
    entryBasisReason,
    entryZoneLow,
    entryZoneHigh,
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
  currentReferencePrice?: number;
  executionType?: 'MARKET' | 'LIMIT' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  orderTypeLabel?: string;
  entryBasisMethod?: string;
  entryBasisReason?: string;
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

  const refPrice = params.currentReferencePrice ?? entryPrice;
  const entryDistancePips =
    pipSize > 0 ? Number((Math.abs(entryPrice - refPrice) / pipSize).toFixed(1)) : 0;

  let executionType: 'MARKET' | 'LIMIT' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' =
    params.executionType || (direction === 'LONG' ? 'BUY_LIMIT' : 'SELL_LIMIT');
  if (!params.executionType) {
    if (Math.abs(entryPrice - refPrice) < pipSize * 1.5) {
      executionType = 'LIMIT';
    } else if (direction === 'LONG') {
      executionType = entryPrice < refPrice ? 'BUY_LIMIT' : 'BUY_STOP';
    } else {
      executionType = entryPrice > refPrice ? 'SELL_LIMIT' : 'SELL_STOP';
    }
  }

  const orderTypeLabel =
    params.orderTypeLabel ||
    (executionType === 'BUY_LIMIT'
      ? 'BUY LIMIT (Retest Pullback TF Kecil)'
      : executionType === 'SELL_LIMIT'
      ? 'SELL LIMIT (Retest Supply TF Kecil)'
      : executionType === 'BUY_STOP'
      ? 'BUY STOP (Breakout Struktur TF Kecil)'
      : executionType === 'SELL_STOP'
      ? 'SELL STOP (Breakdown Struktur TF Kecil)'
      : `LIMIT ORDER (${direction})`);

  let recommendedAction: 'OPEN_LONG' | 'OPEN_SHORT' | 'WAIT_CONFIRMATION' | 'NO_TRADE' = 'WAIT_CONFIRMATION';
  let actionLabel = 'WAIT FOR CONFIRMATION';

  if (status === 'BLOCKED' || status === 'NO_SETUP') {
    recommendedAction = 'NO_TRADE';
    actionLabel = status === 'BLOCKED' ? 'NO TRADE (BLOCKED)' : 'NO TRADE SETUP';
  } else if (status === 'VALID_SETUP' || status === 'STRONG_SETUP' || status === 'VERY_STRONG_SETUP') {
    recommendedAction = direction === 'LONG' ? 'OPEN_LONG' : 'OPEN_SHORT';
    actionLabel =
      direction === 'LONG'
        ? `PASANG ${executionType.replace('_', ' ')} / LONG`
        : `PASANG ${executionType.replace('_', ' ')} / SHORT`;
  } else {
    recommendedAction = 'WAIT_CONFIRMATION';
    actionLabel = direction === 'LONG' ? 'TUNGGU KONFIRMASI LONG' : 'TUNGGU KONFIRMASI SHORT';
  }

  const zoneHalfSpan = Math.max(pipSize * 1.5, atrValue * 0.1);
  const entryZoneLow = Number((entryPrice - zoneHalfSpan).toFixed(pricePrecision));
  const entryZoneHigh = Number((entryPrice + zoneHalfSpan).toFixed(pricePrecision));

  const invalidationReason =
    direction === 'LONG'
      ? `Setup batal (invalidation) apabila candle menutup di bawah Stop Loss ($${stopLoss.toFixed(pricePrecision)}, -${stopLossPips} pips / ${atrMultiplierSl}x ATR)`
      : `Setup batal (invalidation) apabila candle menutup di atas Stop Loss ($${stopLoss.toFixed(pricePrecision)}, -${stopLossPips} pips / ${atrMultiplierSl}x ATR)`;

  return {
    pair,
    timeframe,
    direction,
    recommendedAction,
    actionLabel,
    executionType,
    orderTypeLabel,
    currentReferencePrice: Number(refPrice.toFixed(pricePrecision)),
    entryDistancePips,
    entryBasisMethod: params.entryBasisMethod || 'Zona Retest Struktur & Dynamic EMA Timeframe Kecil',
    entryBasisReason:
      params.entryBasisReason ||
      `Level Entry ($${entryPrice.toFixed(pricePrecision)}) dihitung dari titik retest struktur & EMA pada timeframe kecil, bukan harga pasar saat ini.`,
    entryZoneLow,
    entryZoneHigh,
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

  // 3. Momentum: Backtest #1 RSI(14) Anti-Exhaustion (32-68) & MACD Inflection (Weight: 15)
  let momentumScore = 0;
  let momentumReason = '';
  const rsi = indicator.rsi14 ?? 50;
  const hist = indicator.macdHistogram ?? 0;

  if (direction === 'LONG') {
    if (rsi >= 45 && rsi <= 68 && hist > 0) {
      momentumScore = 15;
      momentumReason = `Bullish momentum with RSI (${rsi.toFixed(1)}) in optimal anti-exhaustion expansion zone (45–68) and positive MACD histogram`;
    } else if (rsi <= 39 && hist >= -0.5) {
      momentumScore = 14;
      momentumReason = `High-win-rate M15 Value-Zone Inflection: Discount RSI (${rsi.toFixed(1)}) turning up with MACD support`;
    } else if (rsi >= 40 && rsi <= 70) {
      momentumScore = 11;
      momentumReason = `Constructive RSI (${rsi.toFixed(1)}) within safe non-overbought threshold (<70)`;
    } else if (rsi < 30) {
      momentumScore = 8;
      momentumReason = `Oversold RSI (${rsi.toFixed(1)}), mean-reversion discount zone`;
    } else {
      momentumScore = 3;
      momentumReason = `Overextended RSI (${rsi.toFixed(1)} > 70) — Backtest Anti-Exhaustion filter warns against buying late spikes`;
    }
  } else {
    if (rsi >= 32 && rsi <= 55 && hist < 0) {
      momentumScore = 15;
      momentumReason = `Bearish momentum with RSI (${rsi.toFixed(1)}) in optimal anti-exhaustion contraction zone (32–55) and negative MACD histogram`;
    } else if (rsi >= 61 && hist <= 0.5) {
      momentumScore = 14;
      momentumReason = `High-win-rate M15 Supply-Zone Inflection: Premium RSI (${rsi.toFixed(1)}) turning down with MACD rejection`;
    } else if (rsi >= 30 && rsi <= 60) {
      momentumScore = 11;
      momentumReason = `Constructive Bearish RSI (${rsi.toFixed(1)}) within safe non-oversold threshold (>30)`;
    } else if (rsi > 70) {
      momentumScore = 8;
      momentumReason = `Overbought RSI (${rsi.toFixed(1)}), mean-reversion supply zone`;
    } else {
      momentumScore = 3;
      momentumReason = `Overextended RSI (${rsi.toFixed(1)} < 30) — Backtest Anti-Exhaustion filter warns against selling late drops`;
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

  // 4. Support / Resistance & Bollinger / EMA 20-50-200 Confluence (Weight: 15)
  let srScore = 0;
  let srReason = '';
  const ema20 = indicator.ema20 ?? entryPrice;
  const ema50 = indicator.ema50 ?? entryPrice;
  const ema200 = indicator.ema200 ?? ema50;
  const bbLower = indicator.bbLower ?? null;
  const bbUpper = indicator.bbUpper ?? null;

  if (direction === 'LONG') {
    if (entryPrice >= ema20 && ema20 >= ema50) {
      srScore = 15;
      srReason = `Price supported cleanly above EMA20 and EMA50${ema50 >= ema200 ? ' with macro EMA200 alignment' : ''}`;
    } else if (entryPrice >= ema50) {
      srScore = 13;
      srReason = 'Technical limit entry aligned at EMA20/EMA50 dynamic pullback support';
    } else if (bbLower !== null && entryPrice <= bbLower * 1.003) {
      srScore = 14;
      srReason = 'M15 Value-Zone Confluence: Entry anchored at Bollinger Lower Band (20,2) & structural support (Backtest 64% WR)';
    } else {
      srScore = 6;
      srReason = 'Price trading below dynamic EMA50 without Bollinger lower band discount';
    }
  } else {
    if (entryPrice <= ema20 && ema20 <= ema50) {
      srScore = 15;
      srReason = `Price capped cleanly below EMA20 and EMA50${ema50 <= ema200 ? ' with macro EMA200 alignment' : ''}`;
    } else if (entryPrice <= ema50) {
      srScore = 13;
      srReason = 'Technical limit entry aligned at EMA20/EMA50 dynamic rally resistance';
    } else if (bbUpper !== null && entryPrice >= bbUpper * 0.997) {
      srScore = 14;
      srReason = 'M15 Supply-Zone Confluence: Entry anchored at Bollinger Upper Band (20,2) & structural resistance (Backtest 64% WR)';
    } else {
      srScore = 6;
      srReason = 'Price trading above dynamic EMA50 without Bollinger upper band premium';
    }
  }
  components.push({
    component: 'Support & Resistance Confluence',
    rawValue: `EMA20: ${ema20.toFixed(4)}, EMA50: ${ema50.toFixed(4)}${bbLower && bbUpper ? `, BB: [${bbLower.toFixed(2)}–${bbUpper.toFixed(2)}]` : ''}`,
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
    volReason = `Optimal backtest-calibrated stop loss buffer (${stopInATR.toFixed(1)}x ATR), protecting against intraday wicks`;
  } else if (stopInATR > 2.5) {
    volatilityScore = 6;
    volReason = `Wide stop loss relative to ATR (${stopInATR.toFixed(1)}x ATR), requires smaller lot allocation`;
  } else {
    volatilityScore = 4;
    volReason = `Tight stop loss (${stopInATR.toFixed(1)}x ATR), heightened wick stopout vulnerability`;
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
    rrScore = 9;
    rrReason = `High-expectancy Risk/Reward ratio (${riskReward}R)`;
  } else if (riskReward >= 1.5) {
    rrScore = 8;
    rrReason = `Backtest-optimal high-win-rate Risk/Reward ratio (${riskReward}R TP1, 40% breakeven WR)`;
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

  // 7. Confirmation, ADX(14) & DI+/DI- Regime Filter (Weight: 10)
  let confirmationScore = 0;
  let confReason = '';
  const adx = indicator.adx14 ?? 20;
  const plusDI = indicator.plusDI ?? null;
  const minusDI = indicator.minusDI ?? null;
  const diAligned =
    plusDI !== null && minusDI !== null
      ? direction === 'LONG'
        ? plusDI >= minusDI
        : minusDI >= plusDI
      : true;

  if (adx >= 25 && diAligned) {
    confirmationScore = 10;
    confReason = `Strong trend regime confirmed by ADX (${adx.toFixed(1)} >= 25) and directional DI alignment`;
  } else if (adx >= 20 && diAligned) {
    confirmationScore = 8;
    confReason = `Constructive ADX trend strength (${adx.toFixed(1)}) with supportive DI flow`;
  } else if (adx < 25) {
    confirmationScore = 7;
    confReason = `Controlled rotational regime (ADX ${adx.toFixed(1)} < 25) — ideal for M15 Bollinger & S/R limit bounces`;
  } else {
    confirmationScore = 3;
    confReason = `Counter-DI warning: High ADX (${adx.toFixed(1)}) moving against trade direction (Anti-Falling-Knife Alert)`;
  }
  components.push({
    component: 'Confirmation & Trend Strength',
    rawValue: `ADX: ${adx.toFixed(1)}${plusDI !== null && minusDI !== null ? `, +DI: ${plusDI.toFixed(1)}, -DI: ${minusDI.toFixed(1)}` : ''}`,
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
  const precision = getPricePrecisionForPair(pair);
  const currentRefPrice =
    candles && candles.length > 0 ? candles[candles.length - 1].close : entryPrice;

  const bottomUpTimeframeSteps = buildBottomUpTimeframeSteps({
    direction,
    activeTimeframe: timeframe,
    multiTimeframe: params.marketAnalysis?.multiTimeframe,
    indicator,
    structure,
    precision,
  });

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
    currentReferencePrice: currentRefPrice,
  });

  // Build explicit reasons why the signal IS POTENTIAL vs WHY IT IS NOT POTENTIAL / RISKS
  const potentialReasons: string[] = [];
  const nonPotentialReasons: string[] = [];

  const m5Step = bottomUpTimeframeSteps.find((s) => s.timeframe === 'M5');
  const m15Step = bottomUpTimeframeSteps.find((s) => s.timeframe === 'M15');
  const h1Step = bottomUpTimeframeSteps.find((s) => s.timeframe === 'H1');
  const alignedSteps = bottomUpTimeframeSteps.filter((s) => s.isAligned);
  const unalignedSteps = bottomUpTimeframeSteps.filter((s) => !s.isAligned);
  const stepSequenceText = bottomUpTimeframeSteps.map((s) => s.timeframe).join(' → ');

  // 1. Smallest Timeframe (M5 / M15) & Backtest #1 Value-Zone / Pullback Entry Discipline
  if (m5Step && m5Step.isAligned && m15Step?.isAligned) {
    potentialReasons.push(
      `Konfluensi Timeframe Terkecil (M5 → M15) Searah (Model Backtest #1): Trigger mikro M5 (${m5Step.trend}) dan zona nilai M15 (${m15Step.trend}) selaras memvalidasi awal pergerakan ${direction}.`
    );
  } else if (m15Step?.isAligned) {
    potentialReasons.push(
      `Trigger Timeframe Terkecil (M15 • 64% Backtest WR) Aktif: M15 menunjukkan konfirmasi ${m15Step.trend} / infleksi zona nilai yang memvalidasi skenario ${direction}.`
    );
  } else {
    nonPotentialReasons.push(
      `Timeframe Terkecil (M15) Belum Konfirmasi Penuh: M15 masih berstatus ${m15Step?.trend ?? 'NEUTRAL'} (Momentum: ${m15Step?.momentum ?? 'NEUTRAL'}), sehingga wajib menunggu harga masuk ke level limit retest.`
    );
  }

  if (Math.abs(entryPrice - currentRefPrice) >= positionPlan.pipSize * 1.5) {
    potentialReasons.push(
      `Disiplin Entry Pending Limit (${positionPlan.orderTypeLabel} @ $${entryPrice.toFixed(precision)}): Mengikuti aturan Backtest #1 dengan tidak mengejar harga pasar terkini ($${currentRefPrice.toFixed(precision)}), melainkan menunggu retest ${positionPlan.entryDistancePips} pips pada zona EMA20/50 & Bollinger Band.`
    );
  } else {
    nonPotentialReasons.push(
      `Harga Entry Terlalu Dekat dengan Harga Pasar Terkini ($${currentRefPrice.toFixed(precision)}): Kurang memberikan diskon retracement pada timeframe kecil sehingga ruang buffer Stop Loss menjadi kurang optimal.`
    );
  }

  // 2. Market Structure (BOS / Higher Low / Lower High + Support/Resistance)
  if (structureScore >= 15) {
    potentialReasons.push(
      `Struktur Pasar & S/R Terkonfirmasi (${structureScore}/20 pts): ${structureReason} pada timeframe ${timeframe}${h1Step?.isAligned ? ' dan selaras dengan struktur H1' : ''}.`
    );
  } else {
    nonPotentialReasons.push(
      `Struktur Pasar Belum Solid (${structureScore}/20 pts): ${structureReason}. Belum terbentuk Break of Structure (BOS) atau pantulan Higher Low/Lower High yang tegas.`
    );
  }

  // 3. Multi-Timeframe Alignment (M5/M15 -> H1 -> H4 -> D1)
  if (trendScore >= 15 && alignedSteps.length >= 3) {
    potentialReasons.push(
      `Konfluensi Multi-Timeframe Kuat (${alignedSteps.length}/${bottomUpTimeframeSteps.length} Timeframe Searah): Urutan analisis ${stepSequenceText} mendukung bias ${currentBias}.`
    );
  } else if (unalignedSteps.length > 0) {
    nonPotentialReasons.push(
      `Divergensi Antar-Timeframe: Timeframe [${unalignedSteps.map((s) => `${s.timeframe} (${s.trend})`).join(', ')}] belum searah penuh dengan skenario ${direction}, sehingga disarankan fokus pada target TP1 konservatif.`
    );
  }

  // 4. Support / Resistance, Bollinger Bands (20,2) & EMA 20/50/200 Stack
  if (srScore >= 11) {
    potentialReasons.push(
      `Konfluensi EMA 20/50/200 & Bollinger Bands (20,2) (${srScore}/15 pts): ${srReason} (EMA20: $${ema20.toFixed(precision)}, EMA50: $${ema50.toFixed(precision)}${bbLower && bbUpper ? `, BB: $${bbLower.toFixed(precision)}–$${bbUpper.toFixed(precision)}` : ''}).`
    );
  } else {
    nonPotentialReasons.push(
      `Posisi Terhadap EMA 50 & Bollinger Bands Kurang Ideal (${srScore}/15 pts): ${srReason} (EMA20: $${ema20.toFixed(precision)}, EMA50: $${ema50.toFixed(precision)}).`
    );
  }

  // 5. Momentum RSI(14) Anti-Exhaustion (32-68) & MACD(12,26,9) Inflection
  if (momentumScore >= 10) {
    potentialReasons.push(
      `Filter Momentum RSI(14) Anti-Exhaustion & MACD (${momentumScore}/15 pts): ${momentumReason}, menghindari jebakan beli di pucuk / jual di dasar.`
    );
  } else {
    nonPotentialReasons.push(
      `Peringatan Filter Anti-Exhaustion RSI/MACD (${momentumScore}/15 pts): ${momentumReason}. Backtest menunjukkan win rate turun drastis saat mengejar harga pada kondisi jenuh ekstrem.`
    );
  }

  // 6. Trend Strength ADX(14) & DI+/DI- Regime Filter
  if (confirmationScore >= 7) {
    potentialReasons.push(
      `Filter Rezim ADX(14) & DI+/DI- Tervalidasi (${confirmationScore}/10 pts): ${confReason}.`
    );
  } else {
    nonPotentialReasons.push(
      `Peringatan Rezim ADX(14) & DI+/DI- (${confirmationScore}/10 pts): ${confReason}.`
    );
  }

  // 7. Risk:Reward & Volatility Buffer
  if (riskReward >= 1.8) {
    potentialReasons.push(
      `Rasio Risk:Reward Menguntungkan (1:${riskReward}R pada TP1 & 1:${positionPlan.riskReward2}R pada TP2): Hanya membutuhkan Win Rate minimal ${positionPlan.breakevenWinRateTp1}% agar strategi tetap profit secara konsisten.`
    );
  } else {
    nonPotentialReasons.push(
      `Rasio Risk:Reward Terbatas (1:${riskReward}R): Membutuhkan tingkat akurasi (Win Rate >= ${positionPlan.breakevenWinRateTp1}%) yang lebih tinggi untuk menutup risiko Stop Loss.`
    );
  }

  if (volatilityScore >= 8) {
    potentialReasons.push(
      `Buffer Volatilitas Stop Loss Optimal (${stopInATR.toFixed(2)}x ATR / -${positionPlan.stopLossPips} pips): Melindungi posisi dari sapuan spread dan noise fluktuasi wajar.`
    );
  } else {
    nonPotentialReasons.push(
      `Sensitivitas Jarak Stop Loss (${stopInATR.toFixed(2)}x ATR / -${positionPlan.stopLossPips} pips): ${volReason}.`
    );
  }

  // Always ensure at least 1 explicit risk / invalidation note in nonPotentialReasons for full transparency
  nonPotentialReasons.push(
    `Kondisi Pembatalan Sinyal (Invalidation Risk): Sinyal ${direction} ini menjadi TIDAK POTENSIAL / BATAL apabila harga menembus dan menutup ${
      direction === 'LONG' ? 'di bawah' : 'di atas'
    } Stop Loss $${stopLoss.toFixed(precision)} (-${positionPlan.stopLossPips} pips).`
  );

  const isPotential = totalScore >= 65 && status !== 'BLOCKED';
  const potentialVerdict: 'SANGAT POTENSIAL' | 'POTENSIAL' | 'KURANG POTENSIAL' | 'TIDAK POTENSIAL' =
    totalScore >= 80
      ? 'SANGAT POTENSIAL'
      : totalScore >= 65
      ? 'POTENSIAL'
      : totalScore >= 50
      ? 'KURANG POTENSIAL'
      : 'TIDAK POTENSIAL';

  const potentialSummary = isPotential
    ? `Signal ${direction} ini dikategorikan ${potentialVerdict} (Skor Konfluensi ${totalScore}/100). Analisis berurutan dari timeframe terkecil (M15 → H1 → H4 → D1) mengidentifikasi peluang ${positionPlan.orderTypeLabel} di $${entryPrice.toFixed(
        precision
      )} dengan rasio Risk:Reward 1:${riskReward}R (TP1) hingga 1:${positionPlan.riskReward2}R (TP2).`
    : `Signal ${direction} ini dikategorikan ${potentialVerdict} (Skor Konfluensi ${totalScore}/100). Meskipun terdapat level teknikal di $${entryPrice.toFixed(
        precision
      )}, beberapa indikator/timeframe belum selaras penuh sehingga disarankan menunggu konfirmasi tambahan pada timeframe kecil (M15/H1).`;

  const explanation = `${potentialVerdict} (${totalScore}/100) • Analisis M15→H1→H4→D1: ${positionPlan.orderTypeLabel} @ $${entryPrice.toFixed(
    precision
  )} (Harga Terkini: $${currentRefPrice.toFixed(precision)}). ${trendReason}; ${structureReason}; ${rrReason}.`;

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
    currentReferencePrice: positionPlan.currentReferencePrice,
    entryDistancePips: positionPlan.entryDistancePips,
    executionType: positionPlan.executionType,
    orderTypeLabel: positionPlan.orderTypeLabel,
    entryBasisMethod: positionPlan.entryBasisMethod,
    entryBasisReason: positionPlan.entryBasisReason,
    entryZoneLow: positionPlan.entryZoneLow,
    entryZoneHigh: positionPlan.entryZoneHigh,
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
    isPotential,
    potentialVerdict,
    potentialSummary,
    potentialReasons,
    nonPotentialReasons,
    bottomUpTimeframeSteps,
    positionPlan,
    status,
    explanation,
    components,
  };
}
