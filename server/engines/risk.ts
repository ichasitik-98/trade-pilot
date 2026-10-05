import { RiskSetting, Trade } from '../types/index.ts';

export interface InstrumentSpec {
  pair: string;
  category: 'FOREX' | 'METALS' | 'CRYPTO' | 'INDICES';
  contractSize: number;
  pipSize: number;
  minLot: number;
  lotStep: number;
}

export const INSTRUMENT_SPECS: Record<string, InstrumentSpec> = {
  EURUSD: { pair: 'EURUSD', category: 'FOREX', contractSize: 100000, pipSize: 0.0001, minLot: 0.01, lotStep: 0.01 },
  GBPUSD: { pair: 'GBPUSD', category: 'FOREX', contractSize: 100000, pipSize: 0.0001, minLot: 0.01, lotStep: 0.01 },
  USDJPY: { pair: 'USDJPY', category: 'FOREX', contractSize: 100000, pipSize: 0.01, minLot: 0.01, lotStep: 0.01 },
  AUDUSD: { pair: 'AUDUSD', category: 'FOREX', contractSize: 100000, pipSize: 0.0001, minLot: 0.01, lotStep: 0.01 },
  USDCAD: { pair: 'USDCAD', category: 'FOREX', contractSize: 100000, pipSize: 0.0001, minLot: 0.01, lotStep: 0.01 },
  USDCHF: { pair: 'USDCHF', category: 'FOREX', contractSize: 100000, pipSize: 0.0001, minLot: 0.01, lotStep: 0.01 },
  NZDUSD: { pair: 'NZDUSD', category: 'FOREX', contractSize: 100000, pipSize: 0.0001, minLot: 0.01, lotStep: 0.01 },
  EURGBP: { pair: 'EURGBP', category: 'FOREX', contractSize: 100000, pipSize: 0.0001, minLot: 0.01, lotStep: 0.01 },
  EURJPY: { pair: 'EURJPY', category: 'FOREX', contractSize: 100000, pipSize: 0.01, minLot: 0.01, lotStep: 0.01 },
  GBPJPY: { pair: 'GBPJPY', category: 'FOREX', contractSize: 100000, pipSize: 0.01, minLot: 0.01, lotStep: 0.01 },
  XAUUSD: { pair: 'XAUUSD', category: 'METALS', contractSize: 100, pipSize: 0.01, minLot: 0.01, lotStep: 0.01 },
  BTCUSD: { pair: 'BTCUSD', category: 'CRYPTO', contractSize: 1, pipSize: 1.0, minLot: 0.01, lotStep: 0.01 },
  ETHUSD: { pair: 'ETHUSD', category: 'CRYPTO', contractSize: 1, pipSize: 0.1, minLot: 0.01, lotStep: 0.01 },
  US30: { pair: 'US30', category: 'INDICES', contractSize: 1, pipSize: 1.0, minLot: 0.1, lotStep: 0.1 },
  NAS100: { pair: 'NAS100', category: 'INDICES', contractSize: 1, pipSize: 0.1, minLot: 0.1, lotStep: 0.1 },
  SPX500: { pair: 'SPX500', category: 'INDICES', contractSize: 1, pipSize: 0.1, minLot: 0.1, lotStep: 0.1 },
};

export function getInstrumentSpec(pair: string): InstrumentSpec | null {
  const normalized = pair.toUpperCase().replace('/', '').replace('-', '').trim();
  return INSTRUMENT_SPECS[normalized] || null;
}

export type PositionSizeResult =
  | {
      status: 'SUCCESS';
      riskAmount: number;
      lotSize: number;
      pipsAtRisk: number;
      potentialLoss: number;
      potentialProfit: number;
      riskRewardRatio: number;
    }
  | {
      status: 'POSITION_SIZE_UNAVAILABLE';
      reason: string;
    };

export function calculatePositionSize(params: {
  pair: string;
  accountBalance: number;
  riskPercent: number; // e.g. 1.0 = 1%
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
}): PositionSizeResult {
  const { pair, accountBalance, riskPercent, entryPrice, stopLoss, takeProfit } = params;

  const spec = getInstrumentSpec(pair);
  if (!spec) {
    return {
      status: 'POSITION_SIZE_UNAVAILABLE',
      reason: `Instrument specification not configured for pair ${pair}. Calculation rejected to prevent sizing errors.`,
    };
  }

  const stopDistance = Math.abs(entryPrice - stopLoss);
  if (stopDistance <= 0 || !Number.isFinite(stopDistance)) {
    return {
      status: 'POSITION_SIZE_UNAVAILABLE',
      reason: 'Stop loss distance cannot be zero or non-finite.',
    };
  }

  if (accountBalance <= 0 || riskPercent <= 0) {
    return {
      status: 'POSITION_SIZE_UNAVAILABLE',
      reason: 'Account balance and risk percentage must be positive.',
    };
  }

  const riskAmount = Number(((accountBalance * riskPercent) / 100).toFixed(2));
  const pipsAtRisk = Number((stopDistance / spec.pipSize).toFixed(1));

  // Risk per 1 full lot = stopDistance * contractSize
  const riskPerLot = stopDistance * spec.contractSize;
  if (riskPerLot <= 0) {
    return {
      status: 'POSITION_SIZE_UNAVAILABLE',
      reason: 'Invalid contract risk calculation.',
    };
  }

  let rawLots = riskAmount / riskPerLot;

  // Round to lot step
  rawLots = Math.floor(rawLots / spec.lotStep) * spec.lotStep;
  if (rawLots < spec.minLot) {
    rawLots = spec.minLot;
  }
  const lotSize = Number(rawLots.toFixed(2));

  const actualLoss = Number((lotSize * spec.contractSize * stopDistance).toFixed(2));

  let potentialProfit = 0;
  let riskRewardRatio = 0;
  if (takeProfit && takeProfit > 0) {
    const profitDistance = Math.abs(takeProfit - entryPrice);
    potentialProfit = Number((lotSize * spec.contractSize * profitDistance).toFixed(2));
    riskRewardRatio = Number((profitDistance / stopDistance).toFixed(2));
  }

  return {
    status: 'SUCCESS',
    riskAmount,
    lotSize,
    pipsAtRisk,
    potentialLoss: actualLoss,
    potentialProfit,
    riskRewardRatio,
  };
}

export function checkPortfolioRisk(
  accountBalance: number,
  openTrades: Trade[],
  newRiskPercent: number,
  settings: RiskSetting
): {
  allowed: boolean;
  currentRiskPercent: number;
  currentRiskAmount: number;
  projectedRiskPercent: number;
  openCount: number;
  reason?: string;
} {
  const openCount = openTrades.length;
  if (openCount >= settings.maxOpenPositions) {
    return {
      allowed: false,
      currentRiskPercent: 0,
      currentRiskAmount: 0,
      projectedRiskPercent: 0,
      openCount,
      reason: `Maximum open position limit reached (${openCount}/${settings.maxOpenPositions})`,
    };
  }

  let currentRiskAmount = 0;
  for (const t of openTrades) {
    currentRiskAmount += t.riskAmount ?? (accountBalance * (t.riskPercent ?? 1)) / 100;
  }

  const currentRiskPercent =
    accountBalance > 0 ? Number(((currentRiskAmount / accountBalance) * 100).toFixed(2)) : 0;
  const projectedRiskPercent = Number((currentRiskPercent + newRiskPercent).toFixed(2));

  if (newRiskPercent > settings.riskPerTradePercent) {
    return {
      allowed: false,
      currentRiskPercent,
      currentRiskAmount,
      projectedRiskPercent,
      openCount,
      reason: `Trade risk (${newRiskPercent}%) exceeds configured max per-trade limit (${settings.riskPerTradePercent}%)`,
    };
  }

  if (projectedRiskPercent > settings.maxPortfolioRiskPercent) {
    return {
      allowed: false,
      currentRiskPercent,
      currentRiskAmount,
      projectedRiskPercent,
      openCount,
      reason: `Total portfolio risk (${projectedRiskPercent}%) would exceed configured maximum portfolio risk limit (${settings.maxPortfolioRiskPercent}%)`,
    };
  }

  return {
    allowed: true,
    currentRiskPercent,
    currentRiskAmount,
    projectedRiskPercent,
    openCount,
  };
}
