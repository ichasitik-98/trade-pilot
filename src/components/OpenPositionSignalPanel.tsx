import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  FileSpreadsheet,
  Layers,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
} from 'lucide-react';
import { TradingAccount, TradeDirection, BottomUpTimeframeStep } from '../types.ts';
import { api } from '../services/api.ts';

interface OpenPositionSignalPanelProps {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  hasRealData: boolean;
  atr?: number | null;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  indicator?: any | null;
  multiTimeframe?: Record<string, any> | null;
  signal: any | null;
  activeAccount: TradingAccount | null;
  onSignalUpdated: (updatedSignal: any) => void;
  onOpenTradeModalWithSignal: (params: {
    pair: string;
    direction: TradeDirection;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    timeframe: string;
    lotSize: number;
    riskPercent: number;
    setup: string;
  }) => void;
  onTradeExecuted?: () => void;
}

interface InstrumentSizingSpec {
  contractSize: number;
  pipSize: number;
  minLot: number;
  lotStep: number;
  precision: number;
}

function getClientInstrumentSpec(pair: string): InstrumentSizingSpec {
  const sym = pair.toUpperCase().replace('/', '').replace('-', '').trim();
  if (sym === 'XAUUSD') {
    return { contractSize: 100, pipSize: 0.01, minLot: 0.01, lotStep: 0.01, precision: 2 };
  }
  if (sym.includes('BTC')) {
    return { contractSize: 1, pipSize: 1.0, minLot: 0.01, lotStep: 0.01, precision: 2 };
  }
  if (sym.includes('ETH')) {
    return { contractSize: 1, pipSize: 0.1, minLot: 0.01, lotStep: 0.01, precision: 2 };
  }
  if (sym === 'US30' || sym === 'NAS100' || sym === 'SPX500') {
    return { contractSize: 1, pipSize: 1.0, minLot: 0.1, lotStep: 0.1, precision: 2 };
  }
  if (sym.includes('JPY')) {
    return { contractSize: 100000, pipSize: 0.01, minLot: 0.01, lotStep: 0.01, precision: 2 };
  }
  return { contractSize: 100000, pipSize: 0.0001, minLot: 0.01, lotStep: 0.01, precision: 4 };
}

export const OpenPositionSignalPanel: React.FC<OpenPositionSignalPanelProps> = ({
  symbol,
  timeframe,
  currentPrice,
  hasRealData,
  atr,
  supportLevel,
  resistanceLevel,
  indicator,
  multiTimeframe,
  signal,
  activeAccount,
  onSignalUpdated,
  onOpenTradeModalWithSignal,
  onTradeExecuted,
}) => {
  const spec = useMemo(() => getClientInstrumentSpec(symbol), [symbol]);
  const effectiveAtr = useMemo(
    () => (atr && atr > 0 ? atr : currentPrice > 0 ? currentPrice * 0.0025 : 0.002),
    [atr, currentPrice]
  );

  // Helper to compute Technical Retest Entry from Smallest Timeframe (M15/H1) — NEVER raw currentPrice
  const computeTechnicalEntryFromLtf = (
    dir: TradeDirection,
    preset: 'BACKTEST_OPTIMAL' | 'SCALP' | 'STANDARD' | 'SWING' | 'STRUCTURE'
  ): { entryPrice: number; methodLabel: string } => {
    const minOffset =
      preset === 'BACKTEST_OPTIMAL'
        ? Math.max(spec.pipSize * 2, effectiveAtr * 0.12)
        : Math.max(spec.pipSize * 3, effectiveAtr * 0.28);
    const maxOffset = effectiveAtr * 1.35;

    const m15Ema20 = multiTimeframe?.M15?.indicators?.ema20 ?? indicator?.ema20 ?? null;
    const m15Ema50 = multiTimeframe?.M15?.indicators?.ema50 ?? indicator?.ema50 ?? null;
    const m15BbLower = multiTimeframe?.M15?.indicators?.bbLower ?? indicator?.bbLower ?? null;
    const m15BbUpper = multiTimeframe?.M15?.indicators?.bbUpper ?? indicator?.bbUpper ?? null;

    if (dir === 'LONG') {
      if (preset === 'BACKTEST_OPTIMAL') {
        if (
          m15BbLower &&
          m15BbLower < currentPrice - minOffset * 0.5 &&
          currentPrice - m15BbLower <= maxOffset
        ) {
          return {
            entryPrice: Number((m15BbLower + effectiveAtr * 0.08).toFixed(spec.precision)),
            methodLabel: 'Buy Limit pada Bollinger Lower Band (20,2) + Zona Diskon M15 (Backtest 64% WR)',
          };
        }
        return {
          entryPrice: Number((currentPrice - Math.max(minOffset, effectiveAtr * 0.12)).toFixed(spec.precision)),
          methodLabel: 'Buy Limit Retest 0.12x ATR (Model Backtest #1 Adaptive Hybrid • 60% WR)',
        };
      }
      if (
        preset === 'STRUCTURE' &&
        supportLevel &&
        supportLevel < currentPrice - minOffset * 0.5 &&
        currentPrice - supportLevel <= effectiveAtr * 1.8
      ) {
        return {
          entryPrice: Number((supportLevel + effectiveAtr * 0.15).toFixed(spec.precision)),
          methodLabel: 'Buy Limit pada Retest Support Struktur + Buffer ATR',
        };
      }
      if (
        m15Ema20 &&
        m15Ema20 < currentPrice - minOffset * 0.5 &&
        currentPrice - m15Ema20 <= maxOffset
      ) {
        return {
          entryPrice: Number(Number(m15Ema20).toFixed(spec.precision)),
          methodLabel: 'Buy Limit pada Pullback Dynamic EMA20 Timeframe Kecil (M15)',
        };
      }
      if (
        m15Ema50 &&
        m15Ema50 < currentPrice - minOffset * 0.5 &&
        currentPrice - m15Ema50 <= maxOffset
      ) {
        return {
          entryPrice: Number(Number(m15Ema50).toFixed(spec.precision)),
          methodLabel: 'Buy Limit pada Pullback Dynamic EMA50 Timeframe Kecil (M15)',
        };
      }
      const mult = preset === 'SCALP' ? 0.32 : preset === 'SWING' ? 0.55 : 0.42;
      const fallbackEntry = currentPrice - Math.max(minOffset, effectiveAtr * mult);
      return {
        entryPrice: Number(fallbackEntry.toFixed(spec.precision)),
        methodLabel: `Buy Limit pada Zona Diskon Pullback (${mult}x ATR di bawah harga terkini)`,
      };
    } else {
      if (preset === 'BACKTEST_OPTIMAL') {
        if (
          m15BbUpper &&
          m15BbUpper > currentPrice + minOffset * 0.5 &&
          m15BbUpper - currentPrice <= maxOffset
        ) {
          return {
            entryPrice: Number((m15BbUpper - effectiveAtr * 0.08).toFixed(spec.precision)),
            methodLabel: 'Sell Limit pada Bollinger Upper Band (20,2) + Zona Premium M15 (Backtest 64% WR)',
          };
        }
        return {
          entryPrice: Number((currentPrice + Math.max(minOffset, effectiveAtr * 0.12)).toFixed(spec.precision)),
          methodLabel: 'Sell Limit Retest 0.12x ATR (Model Backtest #1 Adaptive Hybrid • 60% WR)',
        };
      }
      if (
        preset === 'STRUCTURE' &&
        resistanceLevel &&
        resistanceLevel > currentPrice + minOffset * 0.5 &&
        resistanceLevel - currentPrice <= effectiveAtr * 1.8
      ) {
        return {
          entryPrice: Number((resistanceLevel - effectiveAtr * 0.15).toFixed(spec.precision)),
          methodLabel: 'Sell Limit pada Retest Resistance Struktur - Buffer ATR',
        };
      }
      if (
        m15Ema20 &&
        m15Ema20 > currentPrice + minOffset * 0.5 &&
        m15Ema20 - currentPrice <= maxOffset
      ) {
        return {
          entryPrice: Number(Number(m15Ema20).toFixed(spec.precision)),
          methodLabel: 'Sell Limit pada Rally Dynamic EMA20 Timeframe Kecil (M15)',
        };
      }
      if (
        m15Ema50 &&
        m15Ema50 > currentPrice + minOffset * 0.5 &&
        m15Ema50 - currentPrice <= maxOffset
      ) {
        return {
          entryPrice: Number(Number(m15Ema50).toFixed(spec.precision)),
          methodLabel: 'Sell Limit pada Rally Dynamic EMA50 Timeframe Kecil (M15)',
        };
      }
      const mult = preset === 'SCALP' ? 0.32 : preset === 'SWING' ? 0.55 : 0.42;
      const fallbackEntry = currentPrice + Math.max(minOffset, effectiveAtr * mult);
      return {
        entryPrice: Number(fallbackEntry.toFixed(spec.precision)),
        methodLabel: `Sell Limit pada Zona Premium Rally (${mult}x ATR di atas harga terkini)`,
      };
    }
  };

  const [direction, setDirection] = useState<TradeDirection>('LONG');
  const [entryInput, setEntryInput] = useState<string>('');
  const [slInput, setSlInput] = useState<string>('');
  const [tp1Input, setTp1Input] = useState<string>('');
  const [tp2Input, setTp2Input] = useState<string>('');
  const [tp3Input, setTp3Input] = useState<string>('');
  const [riskPercent, setRiskPercent] = useState<string>('1.0');
  const [selectedTpTarget, setSelectedTpTarget] = useState<'TP1' | 'TP2' | 'TP3'>('TP1');
  const [activePreset, setActivePreset] = useState<'BACKTEST_OPTIMAL' | 'SCALP' | 'STANDARD' | 'SWING' | 'STRUCTURE'>('BACKTEST_OPTIMAL');
  const [evaluating, setEvaluating] = useState(false);
  const [executingTrade, setExecutingTrade] = useState(false);
  const [executedSuccess, setExecutedSuccess] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  // Sync local inputs when incoming signal or symbol changes
  useEffect(() => {
    if (!signal || !hasRealData) return;
    const dir: TradeDirection = signal.direction === 'SHORT' ? 'SHORT' : 'LONG';
    setDirection(dir);

    let ep = Number(signal.entryPrice || 0);
    // Ensure Entry Price is never identical to raw currentPrice
    if (ep <= 0 || Math.abs(ep - currentPrice) < spec.pipSize * 0.5) {
      ep = computeTechnicalEntryFromLtf(dir, 'STANDARD').entryPrice;
    }

    const sl = Number(signal.stopLoss || 0);
    const tp1 = Number(signal.takeProfit1 || 0);
    const slDist = Math.abs(ep - sl) || effectiveAtr * 1.5;
    const tp2 = Number(
      signal.takeProfit2 || (dir === 'LONG' ? ep + slDist * 3.0 : ep - slDist * 3.0)
    );
    const tp3 = Number(
      signal.takeProfit3 || (dir === 'LONG' ? ep + slDist * 4.5 : ep - slDist * 4.5)
    );

    if (ep > 0) setEntryInput(ep.toFixed(spec.precision));
    if (sl > 0) setSlInput(sl.toFixed(spec.precision));
    if (tp1 > 0) setTp1Input(tp1.toFixed(spec.precision));
    if (tp2 > 0) setTp2Input(tp2.toFixed(spec.precision));
    if (tp3 > 0) setTp3Input(tp3.toFixed(spec.precision));
    setExecutedSuccess(null);
    setExecError(null);
  }, [
    symbol,
    timeframe,
    signal?.id,
    signal?.direction,
    signal?.entryPrice,
    signal?.stopLoss,
    signal?.takeProfit1,
    hasRealData,
    spec.precision,
  ]);

  const numericEntry = parseFloat(entryInput) || 0;
  const numericSl = parseFloat(slInput) || 0;
  const numericTp1 = parseFloat(tp1Input) || 0;
  const numericTp2 = parseFloat(tp2Input) || 0;
  const numericTp3 = parseFloat(tp3Input) || 0;
  const numericRiskPct = Math.max(0.1, Math.min(20, parseFloat(riskPercent) || 1.0));
  const accountBalance = activeAccount?.balance && activeAccount.balance > 0 ? activeAccount.balance : 10000;

  // Compute live Risk & Reward metrics
  const rrMetrics = useMemo(() => {
    const slDist = Math.abs(numericEntry - numericSl);
    const tp1Dist = Math.abs(numericTp1 - numericEntry);
    const tp2Dist = Math.abs(numericTp2 - numericEntry);
    const tp3Dist = Math.abs(numericTp3 - numericEntry);
    const entryOffsetFromCurrent = Math.abs(numericEntry - currentPrice);

    const geometryValid =
      direction === 'LONG'
        ? numericSl > 0 && numericSl < numericEntry && numericTp1 > numericEntry
        : numericSl > numericEntry && numericTp1 > 0 && numericTp1 < numericEntry;

    const entryDistancePips =
      spec.pipSize > 0 ? Number((entryOffsetFromCurrent / spec.pipSize).toFixed(1)) : 0;
    const slPips = spec.pipSize > 0 ? Number((slDist / spec.pipSize).toFixed(1)) : 0;
    const tp1Pips = spec.pipSize > 0 ? Number((tp1Dist / spec.pipSize).toFixed(1)) : 0;
    const tp2Pips = spec.pipSize > 0 ? Number((tp2Dist / spec.pipSize).toFixed(1)) : 0;
    const tp3Pips = spec.pipSize > 0 ? Number((tp3Dist / spec.pipSize).toFixed(1)) : 0;

    const slPct = numericEntry > 0 ? Number(((slDist / numericEntry) * 100).toFixed(2)) : 0;
    const tp1Pct = numericEntry > 0 ? Number(((tp1Dist / numericEntry) * 100).toFixed(2)) : 0;
    const tp2Pct = numericEntry > 0 ? Number(((tp2Dist / numericEntry) * 100).toFixed(2)) : 0;
    const tp3Pct = numericEntry > 0 ? Number(((tp3Dist / numericEntry) * 100).toFixed(2)) : 0;

    const rr1 = slDist > 0 ? Number((tp1Dist / slDist).toFixed(2)) : 0;
    const rr2 = slDist > 0 ? Number((tp2Dist / slDist).toFixed(2)) : 0;
    const rr3 = slDist > 0 ? Number((tp3Dist / slDist).toFixed(2)) : 0;

    const atrMult = effectiveAtr > 0 ? Number((slDist / effectiveAtr).toFixed(2)) : 1.5;

    const breakevenWinRate1 = rr1 > 0 ? Number(((1 / (1 + rr1)) * 100).toFixed(1)) : 100;
    const breakevenWinRate2 = rr2 > 0 ? Number(((1 / (1 + rr2)) * 100).toFixed(1)) : 100;

    // Determine Pending Order Type relative to currentPrice
    let orderTypeBadge = direction === 'LONG' ? 'BUY LIMIT (Retest Pullback)' : 'SELL LIMIT (Retest Supply)';
    if (direction === 'LONG') {
      orderTypeBadge =
        numericEntry < currentPrice
          ? 'BUY LIMIT (Retest Pullback TF Kecil)'
          : 'BUY STOP (Breakout Struktur TF Kecil)';
    } else {
      orderTypeBadge =
        numericEntry > currentPrice
          ? 'SELL LIMIT (Retest Supply TF Kecil)'
          : 'SELL STOP (Breakdown Struktur TF Kecil)';
    }

    // Position sizing math
    const targetRiskAmount = Number(((accountBalance * numericRiskPct) / 100).toFixed(2));
    const riskPerFullLot = slDist * spec.contractSize;
    let rawLots = riskPerFullLot > 0 ? targetRiskAmount / riskPerFullLot : spec.minLot;
    rawLots = Math.floor(rawLots / spec.lotStep) * spec.lotStep;
    if (!Number.isFinite(rawLots) || rawLots < spec.minLot) {
      rawLots = spec.minLot;
    }
    const lotSize = Number(rawLots.toFixed(2));

    const actualDollarRisk = Number((lotSize * spec.contractSize * slDist).toFixed(2));
    const profitTp1 = Number((lotSize * spec.contractSize * tp1Dist).toFixed(2));
    const profitTp2 = Number((lotSize * spec.contractSize * tp2Dist).toFixed(2));
    const profitTp3 = Number((lotSize * spec.contractSize * tp3Dist).toFixed(2));

    return {
      geometryValid,
      entryDistancePips,
      orderTypeBadge,
      slDist,
      tp1Dist,
      tp2Dist,
      tp3Dist,
      slPips,
      tp1Pips,
      tp2Pips,
      tp3Pips,
      slPct,
      tp1Pct,
      tp2Pct,
      tp3Pct,
      rr1,
      rr2,
      rr3,
      atrMult,
      breakevenWinRate1,
      breakevenWinRate2,
      targetRiskAmount,
      lotSize,
      actualDollarRisk,
      profitTp1,
      profitTp2,
      profitTp3,
    };
  }, [
    numericEntry,
    numericSl,
    numericTp1,
    numericTp2,
    numericTp3,
    currentPrice,
    direction,
    spec,
    effectiveAtr,
    accountBalance,
    numericRiskPct,
  ]);

  const applyPresetLevels = async (
    newDir: TradeDirection,
    preset: 'BACKTEST_OPTIMAL' | 'SCALP' | 'STANDARD' | 'SWING' | 'STRUCTURE'
  ) => {
    setDirection(newDir);
    setActivePreset(preset);

    // Compute Entry from Smallest Timeframe structure/EMA — NEVER raw currentPrice
    const { entryPrice: ep } = computeTechnicalEntryFromLtf(newDir, preset);

    let slDist = effectiveAtr * 2.0;
    let mult1 = 1.5;
    let mult2 = 2.5;
    let mult3 = 3.5;

    if (preset === 'BACKTEST_OPTIMAL') {
      // Exact Backtest #1 Winner: 2.0x ATR Stop Loss, TP1 1.5R (60-64% WR), TP2 2.5R, TP3 3.5R
      slDist = effectiveAtr * 2.0;
      mult1 = 1.5;
      mult2 = 2.5;
      mult3 = 3.5;
    } else if (preset === 'SCALP') {
      slDist = effectiveAtr * 1.0;
      mult1 = 1.5;
      mult2 = 2.5;
      mult3 = 3.5;
    } else if (preset === 'STANDARD') {
      slDist = effectiveAtr * 1.5;
      mult1 = 2.0;
      mult2 = 3.0;
      mult3 = 4.5;
    } else if (preset === 'SWING') {
      slDist = effectiveAtr * 2.0;
      mult1 = 2.5;
      mult2 = 4.0;
      mult3 = 5.5;
    } else if (preset === 'STRUCTURE') {
      if (newDir === 'LONG' && supportLevel && supportLevel < ep) {
        slDist = Math.max(effectiveAtr * 0.7, ep - supportLevel + effectiveAtr * 0.25);
      } else if (newDir === 'SHORT' && resistanceLevel && resistanceLevel > ep) {
        slDist = Math.max(effectiveAtr * 0.7, resistanceLevel - ep + effectiveAtr * 0.25);
      } else {
        slDist = effectiveAtr * 1.5;
      }
      mult1 = 2.0;
      mult2 = 3.0;
      mult3 = 4.5;
    }

    const sl = Number((newDir === 'LONG' ? ep - slDist : ep + slDist).toFixed(spec.precision));
    const actualDist = Math.abs(ep - sl) || slDist;
    const tp1 = Number((newDir === 'LONG' ? ep + actualDist * mult1 : ep - actualDist * mult1).toFixed(spec.precision));
    const tp2 = Number((newDir === 'LONG' ? ep + actualDist * mult2 : ep - actualDist * mult2).toFixed(spec.precision));
    const tp3 = Number((newDir === 'LONG' ? ep + actualDist * mult3 : ep - actualDist * mult3).toFixed(spec.precision));

    setEntryInput(ep.toFixed(spec.precision));
    setSlInput(sl.toFixed(spec.precision));
    setTp1Input(tp1.toFixed(spec.precision));
    setTp2Input(tp2.toFixed(spec.precision));
    setTp3Input(tp3.toFixed(spec.precision));

    await triggerSignalEvaluation(newDir, ep, sl, tp1, tp2, tp3);
  };

  const triggerSignalEvaluation = async (
    dirToEval: TradeDirection = direction,
    epToEval: number = numericEntry,
    slToEval: number = numericSl,
    tp1ToEval: number = numericTp1,
    tp2ToEval: number = numericTp2,
    tp3ToEval: number = numericTp3
  ) => {
    if (!hasRealData || epToEval <= 0 || slToEval <= 0 || tp1ToEval <= 0) return;
    try {
      setEvaluating(true);
      setExecError(null);
      const res = await api.evaluateSignal({
        pair: symbol,
        timeframe,
        direction: dirToEval,
        entryPrice: epToEval,
        stopLoss: slToEval,
        takeProfit1: tp1ToEval,
        takeProfit2: tp2ToEval > 0 ? tp2ToEval : undefined,
      });
      if (res?.signal) {
        onSignalUpdated({
          ...res.signal,
          takeProfit2: tp2ToEval,
          takeProfit3: tp3ToEval,
        });
      }
    } catch (err: any) {
      setExecError(err.message || 'Failed to evaluate custom signal geometry');
    } finally {
      setEvaluating(false);
    }
  };

  const activeTpPrice =
    selectedTpTarget === 'TP3'
      ? numericTp3
      : selectedTpTarget === 'TP2'
      ? numericTp2
      : numericTp1;

  const activeTpRr =
    selectedTpTarget === 'TP3'
      ? rrMetrics.rr3
      : selectedTpTarget === 'TP2'
      ? rrMetrics.rr2
      : rrMetrics.rr1;

  const activeTpProfit =
    selectedTpTarget === 'TP3'
      ? rrMetrics.profitTp3
      : selectedTpTarget === 'TP2'
      ? rrMetrics.profitTp2
      : rrMetrics.profitTp1;

  const handleDirectExecutePosition = async () => {
    if (!activeAccount) {
      setExecError('No active trading account found. Please select or create an account.');
      return;
    }
    if (!rrMetrics.geometryValid) {
      setExecError(
        direction === 'LONG'
          ? 'Invalid LONG geometry: Stop Loss must be below Entry and Take Profit must be above Entry.'
          : 'Invalid SHORT geometry: Stop Loss must be above Entry and Take Profit must be below Entry.'
      );
      return;
    }

    try {
      setExecutingTrade(true);
      setExecError(null);
      setExecutedSuccess(null);

      await api.createTrade({
        accountId: activeAccount.id,
        pair: symbol,
        direction,
        status: 'OPEN',
        timeframe,
        tradingSession: 'London',
        entryPrice: numericEntry,
        stopLoss: numericSl,
        takeProfit: activeTpPrice,
        lotSize: rrMetrics.lotSize,
        riskPercent: numericRiskPct,
        fees: 0,
        setup: `Signal ${direction} (${rrMetrics.orderTypeBadge} • 1:${activeTpRr}R)`,
        entryReason: signal?.potentialSummary || signal?.explanation || `${direction} Bottom-Up Signal (${timeframe})`,
        psychology: ['Disciplined'],
        mistakeTags: [],
        notes: `Executed from Bottom-Up Signal Panel (M15→H1→H4→D1) | Verdict: ${signal?.potentialVerdict ?? 'POTENSIAL'} (${signal?.score ?? 0}/100) | Entry: $${numericEntry.toFixed(spec.precision)} (Spot: $${currentPrice.toFixed(spec.precision)}) | SL: $${numericSl.toFixed(spec.precision)} (-${rrMetrics.slPips} pips) | ${selectedTpTarget}: $${activeTpPrice.toFixed(spec.precision)} (${activeTpRr}R)`,
      });

      setExecutedSuccess(
        `Posisi ${direction} (${rrMetrics.orderTypeBadge}) untuk ${symbol} (${rrMetrics.lotSize} Lot @ Entry Teknikal $${numericEntry.toFixed(spec.precision)}, SL: $${numericSl.toFixed(spec.precision)}, ${selectedTpTarget}: $${activeTpPrice.toFixed(spec.precision)}) berhasil dicatat ke ${activeAccount.name}.`
      );
      onTradeExecuted?.();
    } catch (err: any) {
      setExecError(err.message || 'Failed to open position');
    } finally {
      setExecutingTrade(false);
    }
  };

  if (!hasRealData) {
    return null;
  }

  const isLong = direction === 'LONG';
  const score = signal?.score ?? 0;
  const status = signal?.status ?? 'WATCH';
  const potentialVerdict: string =
    signal?.potentialVerdict ||
    (score >= 80
      ? 'SANGAT POTENSIAL'
      : score >= 65
      ? 'POTENSIAL'
      : score >= 50
      ? 'KURANG POTENSIAL'
      : 'TIDAK POTENSIAL');
  const isPotential = signal?.isPotential ?? (score >= 65 && status !== 'BLOCKED');

  const bottomUpSteps: BottomUpTimeframeStep[] = signal?.bottomUpTimeframeSteps || [];
  const potentialReasons: string[] = signal?.potentialReasons || [];
  const nonPotentialReasons: string[] = signal?.nonPotentialReasons || [];

  // Proportional bar percentages for visual Risk vs Reward representation
  const totalSpanR = 1 + Math.max(1, rrMetrics.rr2 || rrMetrics.rr1 || 2);
  const riskBarWidthPct = Math.min(50, Math.max(15, Math.round((1 / totalSpanR) * 100)));
  const rewardBarWidthPct = 100 - riskBarWidthPct;

  return (
    <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800/90 shadow-xl space-y-6">
      {/* Top Signal Banner: Direction, Potentiality Verdict, Confluence Score & Strategy Presets */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-mono text-xs sm:text-sm font-black tracking-tight border ${
                isLong
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              }`}
            >
              {isLong ? (
                <ArrowUpRight className="w-4 h-4 shrink-0" />
              ) : (
                <ArrowDownRight className="w-4 h-4 shrink-0" />
              )}
              <span>SIGNAL: {rrMetrics.orderTypeBadge.split(' ')[0]} {rrMetrics.orderTypeBadge.split(' ')[1]} ({isLong ? 'LONG' : 'SHORT'})</span>
            </div>

            <span
              className={`px-3 py-1 rounded-lg font-mono text-xs font-black border ${
                potentialVerdict === 'SANGAT POTENSIAL' || potentialVerdict === 'POTENSIAL'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : potentialVerdict === 'KURANG POTENSIAL'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}
            >
              {potentialVerdict} &bull; {score}/100
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-300 font-mono text-[11px] font-semibold">
              Model Backtest #1: Adaptive Hybrid ({bottomUpSteps.map((s) => s.timeframe).join(' → ') || 'M15 → H1 → H4 → D1'} &bull; 60%–64% WR)
            </span>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">
            {signal?.entryBasisReason ||
              `Signal diproses menggunakan Model Backtest #1 (Adaptive Bottom-Up Hybrid Confluence: EMA 20/50/200 + Bollinger 20,2 + RSI Anti-Exhaustion 32–68 + MACD + ADX/DI). Harga Entry ($${numericEntry.toFixed(
                spec.precision
              )}) ditentukan dari area limit retest struktur & zona nilai timeframe kecil, BUKAN dari harga pasar terkini ($${currentPrice.toFixed(
                spec.precision
              )}).`}
          </p>
        </div>

        {/* Direction Switcher & R:R Preset Selector */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => applyPresetLevels('LONG', activePreset)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                isLong
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>LONG (BUY LIMIT)</span>
            </button>
            <button
              type="button"
              onClick={() => applyPresetLevels('SHORT', activePreset)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                !isLong
                  ? 'bg-rose-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>SHORT (SELL LIMIT)</span>
            </button>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono">
            {(
              [
                { id: 'BACKTEST_OPTIMAL', label: 'Backtest #1 (60% WR)' },
                { id: 'SCALP', label: 'Scalp 1:1.5R' },
                { id: 'STANDARD', label: 'Standard 1:2R' },
                { id: 'SWING', label: 'Swing 1:2.5R' },
                { id: 'STRUCTURE', label: 'S/R Retest' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPresetLevels(direction, p.id)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap ${
                  activePreset === p.id
                    ? 'bg-zinc-800 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 1: Bottom-Up Multi-Timeframe Cascade (Mulai dari Timeframe Terkecil M5/M15 -> H1 -> H4 -> D1) */}
      {bottomUpSteps.length > 0 && (
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h4 className="text-xs sm:text-sm font-bold text-zinc-100">
                Alur Analisis Adaptive Bottom-Up Hybrid ({bottomUpSteps.map((s) => s.timeframe).join(' → ')})
              </h4>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              {bottomUpSteps.filter((s) => s.isAligned).length} dari {bottomUpSteps.length} Timeframe Searah ({direction})
            </span>
          </div>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              bottomUpSteps.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
            } gap-3`}
          >
            {bottomUpSteps.map((step, idx) => (
              <div
                key={step.timeframe}
                className={`p-3 rounded-xl border space-y-1.5 font-mono text-xs relative ${
                  step.isAligned
                    ? 'bg-emerald-950/20 border-emerald-500/30'
                    : 'bg-zinc-900/70 border-amber-500/25'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-black text-zinc-100 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-sky-400">
                      #{step.stepOrder}
                    </span>
                    {step.timeframe}
                    {idx === 0 && (
                      <span className="text-[10px] font-normal text-sky-400">(TF Terkecil)</span>
                    )}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      step.isAligned
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    {step.isAligned ? 'SEARAH' : 'DIVERGEN'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                  <span>Tren: <strong className={step.trend === 'BULLISH' ? 'text-emerald-400' : step.trend === 'BEARISH' ? 'text-rose-400' : 'text-zinc-300'}>{step.trend}</strong></span>
                  <span>Mom: <strong className="text-zinc-200">{step.momentum}</strong></span>
                </div>

                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed pt-1 border-t border-zinc-800/80">
                  {step.summary}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: Keterangan Alasan Kenapa Signal POTENSIAL vs TIDAK POTENSIAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Box: Alasan Kenapa Signal Ini POTENSIAL */}
        <div className="p-4 rounded-xl bg-emerald-950/15 border border-emerald-500/30 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <ThumbsUp className="w-4 h-4 text-emerald-400 shrink-0" />
              <h4 className="text-xs sm:text-sm font-bold text-emerald-300">
                Alasan Kenapa Signal Ini POTENSIAL ({potentialReasons.length} Faktor Pendukung)
              </h4>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
              PRO / KONFLUENSI
            </span>
          </div>

          {potentialReasons.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">
              Belum ada faktor konfluensi kuat yang mendukung setup ini pada kondisi pasar saat ini.
            </p>
          ) : (
            <ul className="space-y-2 text-xs text-zinc-200 leading-relaxed">
              {potentialReasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right Box: Alasan Kenapa Signal Ini TIDAK POTENSIAL / Faktor Risiko & Kelemahan */}
        <div className="p-4 rounded-xl bg-rose-950/15 border border-rose-500/30 space-y-3">
          <div className="flex items-center justify-between border-b border-rose-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <ThumbsDown className="w-4 h-4 text-rose-400 shrink-0" />
              <h4 className="text-xs sm:text-sm font-bold text-rose-300">
                Alasan Kenapa Signal Ini TIDAK POTENSIAL / Risiko Kelemahan ({nonPotentialReasons.length} Faktor)
              </h4>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300">
              KONTRA / RISIKO
            </span>
          </div>

          <ul className="space-y-2 text-xs text-zinc-200 leading-relaxed">
            {nonPotentialReasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* SECTION 3: Main Grid: Left = Open Position Price Ladder (Entry, SL, TP1, TP2, TP3) | Right = Risk & Reward Position Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 Columns: Entry, Stop Loss, and Multi-Stage Take Profit Ladder */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-zinc-100">
                Level Open Posisi Teknikal (Bukan Harga Terkini) &amp; Target R:R
              </h4>
            </div>
            <button
              type="button"
              onClick={() => triggerSignalEvaluation()}
              disabled={evaluating}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-emerald-500/40 text-[11px] font-mono text-zinc-300 hover:text-emerald-400 transition cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3 h-3 ${evaluating ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{evaluating ? 'Scoring...' : 'Recalculate Score'}</span>
            </button>
          </div>

          {/* Price Ladder Table / Rows */}
          <div className="space-y-2.5 font-mono text-xs">
            {/* ENTRY PRICE ROW (Technical Retest Entry vs Spot Price Comparison) */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-sky-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sky-400 font-bold">
                    HARGA ENTRY SIGNAL ({rrMetrics.orderTypeBadge})
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-2">
                  <span>
                    Harga Terkini (Spot): <strong className="text-zinc-200">${currentPrice.toFixed(spec.precision)}</strong>
                  </span>
                  <span>&middot;</span>
                  <span className="text-sky-300">
                    Jarak Retest: {rrMetrics.entryDistancePips} pips dari harga terkini
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  Basis TF Kecil: {signal?.entryBasisMethod || 'Pullback Dynamic EMA20/50 & Struktur M15'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="Signal Entry Price"
                  value={entryInput}
                  onChange={(e) => setEntryInput(e.target.value)}
                  onBlur={() => triggerSignalEvaluation()}
                  className="w-32 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-sky-500 text-right font-mono font-bold text-zinc-100 tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => applyPresetLevels(direction, activePreset)}
                  title="Hitung ulang harga Entry teknikal dari struktur timeframe terkecil (bukan harga terkini)"
                  className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 hover:bg-sky-500/25 text-[11px] text-sky-300 font-semibold cursor-pointer whitespace-nowrap"
                >
                  Reset Retest TF
                </button>
              </div>
            </div>

            {/* STOP LOSS (SL) ROW */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-rose-400 font-bold">STOP LOSS (SL &bull; 1.0R RISK)</span>
                  <span className="text-zinc-500">&middot;</span>
                  <span className="text-rose-300 tabular-nums">
                    -{rrMetrics.slPips} pips (-{rrMetrics.slPct}%)
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 tabular-nums">
                  ATR Buffer: {rrMetrics.atrMult}x ATR &middot; Risiko Modal: -${rrMetrics.actualDollarRisk.toFixed(2)} ({numericRiskPct}%)
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="Signal Stop Loss"
                  value={slInput}
                  onChange={(e) => setSlInput(e.target.value)}
                  onBlur={() => triggerSignalEvaluation()}
                  className="w-32 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-rose-500 text-right font-mono font-bold text-rose-400 tabular-nums outline-none"
                />
                <span className="w-16 text-right text-[11px] font-bold text-rose-400 tabular-nums">
                  -1.00 R
                </span>
              </div>
            </div>

            {/* TAKE PROFIT 1 (TP1) ROW */}
            <div
              className={`p-3.5 rounded-xl bg-zinc-950 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                selectedTpTarget === 'TP1'
                  ? 'border-emerald-500/50'
                  : 'border-zinc-800/80'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">TAKE PROFIT 1 (TP1 &bull; CONSERVATIVE)</span>
                  <span className="text-zinc-500">&middot;</span>
                  <span className="text-emerald-300 tabular-nums">
                    +{rrMetrics.tp1Pips} pips (+{rrMetrics.tp1Pct}%)
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 tabular-nums">
                  Estimasi Reward: +${rrMetrics.profitTp1.toFixed(2)} &middot; Breakeven Win Rate: {rrMetrics.breakevenWinRate1}%
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="Signal Take Profit 1"
                  value={tp1Input}
                  onChange={(e) => setTp1Input(e.target.value)}
                  onBlur={() => triggerSignalEvaluation()}
                  className="w-32 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-emerald-500 text-right font-mono font-bold text-emerald-400 tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSelectedTpTarget('TP1')}
                  className={`w-16 py-1 rounded-md text-center text-[11px] font-bold tabular-nums cursor-pointer transition ${
                    selectedTpTarget === 'TP1'
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'bg-zinc-900 text-emerald-400 hover:bg-zinc-800'
                  }`}
                >
                  1:{rrMetrics.rr1}R
                </button>
              </div>
            </div>

            {/* TAKE PROFIT 2 (TP2) ROW */}
            <div
              className={`p-3.5 rounded-xl bg-zinc-950 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                selectedTpTarget === 'TP2'
                  ? 'border-emerald-500/50'
                  : 'border-zinc-800/80'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">TAKE PROFIT 2 (TP2 &bull; STANDARD)</span>
                  <span className="text-zinc-500">&middot;</span>
                  <span className="text-emerald-300 tabular-nums">
                    +{rrMetrics.tp2Pips} pips (+{rrMetrics.tp2Pct}%)
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 tabular-nums">
                  Estimasi Reward: +${rrMetrics.profitTp2.toFixed(2)} &middot; Breakeven Win Rate: {rrMetrics.breakevenWinRate2}%
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="Signal Take Profit 2"
                  value={tp2Input}
                  onChange={(e) => setTp2Input(e.target.value)}
                  onBlur={() => triggerSignalEvaluation()}
                  className="w-32 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-emerald-500 text-right font-mono font-bold text-emerald-400 tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSelectedTpTarget('TP2')}
                  className={`w-16 py-1 rounded-md text-center text-[11px] font-bold tabular-nums cursor-pointer transition ${
                    selectedTpTarget === 'TP2'
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'bg-zinc-900 text-emerald-400 hover:bg-zinc-800'
                  }`}
                >
                  1:{rrMetrics.rr2}R
                </button>
              </div>
            </div>

            {/* TAKE PROFIT 3 (TP3) ROW */}
            <div
              className={`p-3.5 rounded-xl bg-zinc-950 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                selectedTpTarget === 'TP3'
                  ? 'border-emerald-500/50'
                  : 'border-zinc-800/80'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-teal-400 font-bold">TAKE PROFIT 3 (TP3 &bull; RUNNER)</span>
                  <span className="text-zinc-500">&middot;</span>
                  <span className="text-teal-300 tabular-nums">
                    +{rrMetrics.tp3Pips} pips (+{rrMetrics.tp3Pct}%)
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 tabular-nums">
                  Estimasi Reward: +${rrMetrics.profitTp3.toFixed(2)} &middot; Extended Trend Target
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="Signal Take Profit 3"
                  value={tp3Input}
                  onChange={(e) => setTp3Input(e.target.value)}
                  className="w-32 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-teal-500 text-right font-mono font-bold text-teal-400 tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSelectedTpTarget('TP3')}
                  className={`w-16 py-1 rounded-md text-center text-[11px] font-bold tabular-nums cursor-pointer transition ${
                    selectedTpTarget === 'TP3'
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'bg-zinc-900 text-teal-400 hover:bg-zinc-800'
                  }`}
                >
                  1:{rrMetrics.rr3}R
                </button>
              </div>
            </div>
          </div>

          {/* Visual Risk vs Reward Spectrum Bar */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-rose-400 font-bold tabular-nums">
                RISK (1.0R): -{rrMetrics.slPips} pips (-${rrMetrics.actualDollarRisk.toFixed(2)})
              </span>
              <span className="text-zinc-300 font-bold tabular-nums">
                R:R Ratio = 1 : {activeTpRr} R ({selectedTpTarget})
              </span>
              <span className="text-emerald-400 font-bold tabular-nums">
                REWARD ({activeTpRr}R): +${activeTpProfit.toFixed(2)}
              </span>
            </div>

            <div className="w-full h-3 rounded-lg overflow-hidden flex bg-zinc-900 border border-zinc-800">
              <div
                style={{ width: `${riskBarWidthPct}%` }}
                className="bg-rose-500/80 h-full flex items-center justify-center text-[9px] font-bold text-zinc-950"
              >
                -1R
              </div>
              <div
                style={{ width: `${rewardBarWidthPct}%` }}
                className="bg-emerald-500/85 h-full flex items-center justify-center text-[9px] font-bold text-zinc-950"
              >
                +{activeTpRr}R
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 pt-0.5">
              <span>
                Titik Batal (Invalidation): {isLong ? 'Tutup di bawah' : 'Tutup di atas'} ${numericSl.toFixed(spec.precision)}
              </span>
              <span className="tabular-nums">
                Min Win Rate Impas: <strong className="text-zinc-200">{rrMetrics.breakevenWinRate1}%</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Position Sizing, Risk/Reward Summary & Execution Controls */}
        <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-zinc-100">Kalkulator Lot &amp; Risk/Reward</h4>
              </div>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                Balance: ${accountBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Risk % Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="text-zinc-400 font-medium">Alokasi Risiko (% dari Ekuitas)</label>
                <span className="font-mono font-bold text-zinc-200 tabular-nums">
                  {numericRiskPct}% (${rrMetrics.targetRiskAmount.toFixed(2)})
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5 font-mono text-xs">
                {['0.5', '1.0', '1.5', '2.0', '3.0'].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setRiskPercent(pct)}
                    className={`py-1.5 rounded-lg font-bold border transition cursor-pointer ${
                      riskPercent === pct
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Sizing & R:R Readout Grid */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                <div className="text-[10px] text-zinc-400">Ukuran Lot Rekomendasi</div>
                <div className="text-xl font-black text-zinc-100 tabular-nums">
                  {rrMetrics.lotSize} <span className="text-xs font-normal text-zinc-400">Lots</span>
                </div>
                <div className="text-[10px] text-zinc-500 tabular-nums">
                  Kontrak: {spec.contractSize.toLocaleString()} unit
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                <div className="text-[10px] text-zinc-400">Rasio Risk / Reward</div>
                <div
                  className={`text-xl font-black tabular-nums ${
                    activeTpRr >= 2.0
                      ? 'text-emerald-400'
                      : activeTpRr >= 1.5
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  1 : {activeTpRr} R
                </div>
                <div className="text-[10px] text-zinc-500 tabular-nums">
                  Target: {selectedTpTarget} (${activeTpPrice.toFixed(spec.precision)})
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/90 border border-rose-500/20 space-y-1">
                <div className="text-[10px] text-zinc-400">Risiko Maksimal di SL (-1R)</div>
                <div className="text-base font-bold text-rose-400 tabular-nums">
                  -${rrMetrics.actualDollarRisk.toFixed(2)}
                </div>
                <div className="text-[10px] text-zinc-500 tabular-nums">
                  -{rrMetrics.slPips} pips &middot; -{numericRiskPct}% Eq
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/90 border border-emerald-500/20 space-y-1">
                <div className="text-[10px] text-zinc-400">Potensi Profit di {selectedTpTarget}</div>
                <div className="text-base font-bold text-emerald-400 tabular-nums">
                  +${activeTpProfit.toFixed(2)}
                </div>
                <div className="text-[10px] text-zinc-500 tabular-nums">
                  +{selectedTpTarget === 'TP3' ? rrMetrics.tp3Pips : selectedTpTarget === 'TP2' ? rrMetrics.tp2Pips : rrMetrics.tp1Pips} pips &middot; +{(numericRiskPct * activeTpRr).toFixed(2)}% Eq
                </div>
              </div>
            </div>

            {/* Verdict Summary Box */}
            <div
              className={`p-3 rounded-xl border text-xs leading-relaxed ${
                isPotential
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <div className="font-bold mb-0.5">
                Kesimpulan Kelayakan: {potentialVerdict}
              </div>
              <div className="text-[11px] opacity-90">
                {signal?.potentialSummary ||
                  `Evaluasi bottom-up M15 → H1 → H4 → D1 menghasilkan skor ${score}/100 dengan Entry teknikal di $${numericEntry.toFixed(spec.precision)}.`}
              </div>
            </div>

            {/* Geometry / Risk Governance Warning if applicable */}
            {!rrMetrics.geometryValid && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Geometri {direction} tidak valid: Stop Loss harus {isLong ? 'di bawah' : 'di atas'} Harga Entry dan Take Profit harus {isLong ? 'di atas' : 'di bawah'} Harga Entry.
                </span>
              </div>
            )}

            {rrMetrics.geometryValid && rrMetrics.rr1 < 1.0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Peringatan Risk/Reward: Rasio TP1 saat ini ({rrMetrics.rr1}R) berada di bawah batas minimum 1.0R.
                </span>
              </div>
            )}

            {execError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{execError}</span>
              </div>
            )}

            {executedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{executedSuccess}</span>
              </div>
            )}
          </div>

          {/* Action Buttons: Direct Open Position & Pre-fill in Journal */}
          <div className="space-y-2.5 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>Target Take Profit Aktif:</span>
              <div className="flex items-center gap-1">
                {(['TP1', 'TP2', 'TP3'] as const).map((tpKey) => (
                  <button
                    key={tpKey}
                    type="button"
                    onClick={() => setSelectedTpTarget(tpKey)}
                    className={`px-2 py-0.5 rounded font-bold cursor-pointer transition ${
                      selectedTpTarget === tpKey
                        ? 'bg-emerald-500 text-zinc-950'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tpKey}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={executingTrade || !rrMetrics.geometryValid}
                onClick={handleDirectExecutePosition}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                  isLong
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                    : 'bg-rose-500 hover:bg-rose-400 text-zinc-950'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {executingTrade
                    ? 'Menyimpan...'
                    : `Open ${direction} (${rrMetrics.lotSize} Lot)`}
                </span>
              </button>

              <button
                type="button"
                disabled={!rrMetrics.geometryValid}
                onClick={() =>
                  onOpenTradeModalWithSignal({
                    pair: symbol,
                    direction,
                    entryPrice: numericEntry,
                    stopLoss: numericSl,
                    takeProfit: activeTpPrice,
                    timeframe,
                    lotSize: rrMetrics.lotSize,
                    riskPercent: numericRiskPct,
                    setup: `Signal ${direction} (${rrMetrics.orderTypeBadge} • 1:${activeTpRr}R)`,
                  })
                }
                className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pre-fill in Journal</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
