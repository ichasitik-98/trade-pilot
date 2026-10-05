import { Trade, TradeDirection, TradeStatistics } from '../types/index.ts';

export function roundTo(val: number, decimals: number = 2): number {
  if (!Number.isFinite(val) || Number.isNaN(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

export function calculateRMultiple(
  direction: TradeDirection,
  entryPrice: number,
  exitPrice?: number | null,
  stopLoss?: number | null
): number {
  if (exitPrice === undefined || exitPrice === null || stopLoss === undefined || stopLoss === null) {
    return 0;
  }
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(stopLoss)) {
    return 0;
  }

  if (direction === 'LONG') {
    const risk = entryPrice - stopLoss;
    if (risk <= 0) return 0; // Invalid SL for long
    const reward = exitPrice - entryPrice;
    return roundTo(reward / risk, 2);
  } else {
    const risk = stopLoss - entryPrice;
    if (risk <= 0) return 0; // Invalid SL for short
    const reward = entryPrice - exitPrice;
    return roundTo(reward / risk, 2);
  }
}

export function calculateEquityAndDrawdown(
  trades: Trade[],
  initialBalance: number = 10000
): {
  equityCurve: { time: string; balance: number; equity: number }[];
  maxDrawdown: number;
  maxDrawdownPercent: number;
} {
  const sorted = [...trades]
    .filter((t) => t.status === 'CLOSED' && t.exitTime)
    .sort((a, b) => new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime());

  let currentBalance = initialBalance;
  let peakBalance = initialBalance;
  let maxDD = 0;
  let maxDDPercent = 0;

  const curve: { time: string; balance: number; equity: number }[] = [
    {
      time: sorted.length > 0 && sorted[0].entryTime ? sorted[0].entryTime : new Date().toISOString(),
      balance: initialBalance,
      equity: initialBalance,
    },
  ];

  for (const t of sorted) {
    const pnl = (t.netPnL ?? 0);
    currentBalance += pnl;

    if (currentBalance > peakBalance) {
      peakBalance = currentBalance;
    }

    const dd = peakBalance - currentBalance;
    if (dd > maxDD) {
      maxDD = dd;
    }

    const ddPct = peakBalance > 0 ? (dd / peakBalance) * 100 : 0;
    if (ddPct > maxDDPercent) {
      maxDDPercent = ddPct;
    }

    curve.push({
      time: t.exitTime!,
      balance: roundTo(currentBalance, 2),
      equity: roundTo(currentBalance, 2),
    });
  }

  return {
    equityCurve: curve,
    maxDrawdown: roundTo(maxDD, 2),
    maxDrawdownPercent: roundTo(maxDDPercent, 2),
  };
}

export function calculateTradeStatistics(
  trades: Trade[],
  initialBalance: number = 10000
): TradeStatistics {
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const open = trades.filter((t) => t.status === 'OPEN');

  const totalTrades = trades.length;
  const closedTrades = closed.length;
  const openTrades = open.length;

  if (closedTrades === 0) {
    return {
      totalTrades,
      closedTrades: 0,
      openTrades,
      winningTrades: 0,
      losingTrades: 0,
      breakevenTrades: 0,
      winRate: 0,
      lossRate: 0,
      grossProfit: 0,
      grossLoss: 0,
      totalFees: 0,
      netPnL: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      expectancy: 0,
      averageR: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      recoveryFactor: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      sharpeRatio: 0,
    };
  }

  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalFees = 0;
  let totalNetPnL = 0;
  let sumR = 0;

  let currentWinStreak = 0;
  let maxWinStreak = 0;
  let currentLossStreak = 0;
  let maxLossStreak = 0;

  const returnPercentages: number[] = [];

  for (const t of closed) {
    const net = t.netPnL ?? ((t.grossPnL ?? 0) - (t.fees ?? 0));
    const fees = t.fees ?? 0;
    totalFees += fees;
    totalNetPnL += net;

    const r = t.rMultiple ?? calculateRMultiple(t.direction, t.entryPrice, t.exitPrice, t.stopLoss);
    sumR += r;

    if (t.riskAmount && t.riskAmount > 0) {
      returnPercentages.push(net / t.riskAmount);
    } else {
      returnPercentages.push(net / initialBalance);
    }

    if (net > 0.00001) {
      winningTrades++;
      grossProfit += (t.grossPnL ?? net);
      currentWinStreak++;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      currentLossStreak = 0;
    } else if (net < -0.00001) {
      losingTrades++;
      grossLoss += Math.abs(t.grossPnL ?? net);
      currentLossStreak++;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      currentWinStreak = 0;
    } else {
      breakevenTrades++;
      currentWinStreak = 0;
      currentLossStreak = 0;
    }
  }

  const winRate = roundTo((winningTrades / closedTrades) * 100, 2);
  const lossRate = roundTo((losingTrades / closedTrades) * 100, 2);

  const averageWin = winningTrades > 0 ? roundTo(grossProfit / winningTrades, 2) : 0;
  const averageLoss = losingTrades > 0 ? roundTo(grossLoss / losingTrades, 2) : 0;

  let profitFactor = 0;
  if (grossLoss === 0) {
    profitFactor = grossProfit > 0 ? roundTo(grossProfit, 2) : 0;
  } else {
    profitFactor = roundTo(grossProfit / grossLoss, 2);
  }

  // Expectancy = (winRate * averageWin) - (lossRate * averageLoss) / 100
  const winProbability = winningTrades / closedTrades;
  const lossProbability = losingTrades / closedTrades;
  const expectancy = roundTo(winProbability * averageWin - lossProbability * averageLoss, 2);

  const averageR = roundTo(sumR / closedTrades, 2);

  const { maxDrawdown, maxDrawdownPercent } = calculateEquityAndDrawdown(trades, initialBalance);

  let recoveryFactor = 0;
  if (maxDrawdown > 0) {
    recoveryFactor = roundTo(totalNetPnL / maxDrawdown, 2);
  } else if (totalNetPnL > 0) {
    recoveryFactor = roundTo(totalNetPnL, 2);
  }

  // Sharpe Ratio: average return / stdDev * sqrt(252)
  let sharpeRatio = 0;
  if (returnPercentages.length > 1) {
    const mean = returnPercentages.reduce((a, b) => a + b, 0) / returnPercentages.length;
    const variance =
      returnPercentages.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      (returnPercentages.length - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      sharpeRatio = roundTo((mean / stdDev) * Math.sqrt(252), 2);
    }
  }

  return {
    totalTrades,
    closedTrades,
    openTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRate,
    lossRate,
    grossProfit: roundTo(grossProfit, 2),
    grossLoss: roundTo(grossLoss, 2),
    totalFees: roundTo(totalFees, 2),
    netPnL: roundTo(totalNetPnL, 2),
    averageWin,
    averageLoss,
    profitFactor,
    expectancy,
    averageR,
    maxDrawdown,
    maxDrawdownPercent,
    recoveryFactor,
    consecutiveWins: maxWinStreak,
    consecutiveLosses: maxLossStreak,
    sharpeRatio,
  };
}
