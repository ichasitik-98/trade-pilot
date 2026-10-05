export type Role = 'USER' | 'ADMIN';
export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type SignalStatus = 
  | 'BLOCKED' 
  | 'NO_SETUP' 
  | 'WEAK' 
  | 'WATCH' 
  | 'VALID_SETUP' 
  | 'STRONG_SETUP' 
  | 'VERY_STRONG_SETUP';
export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface TradingAccount {
  id: string;
  userId: string;
  name: string;
  broker: string;
  accountNumber?: string;
  currency: string;
  balance: number;
  equity: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RiskSetting {
  id: string;
  accountId: string;
  riskPerTradePercent: number;
  maxDailyRiskPercent: number;
  maxPortfolioRiskPercent: number;
  minRiskRewardRatio: number;
  maxOpenPositions: number;
}

export interface Trade {
  id: string;
  userId: string;
  accountId: string;
  setupId?: string;
  pair: string;
  direction: TradeDirection;
  status: TradeStatus;
  timeframe: string;
  tradingSession: string;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit?: number;
  lotSize: number;
  riskPercent: number;
  riskAmount: number;
  grossPnL?: number;
  fees: number;
  netPnL?: number;
  pnlPercent?: number;
  rMultiple?: number;
  entryTime: string;
  exitTime?: string;
  setup?: string;
  entryReason?: string;
  exitReason?: string;
  psychology: string[];
  mistakeTags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeStatistics {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  lossRate: number;
  grossProfit: number;
  grossLoss: number;
  totalFees: number;
  netPnL: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  expectancy: number;
  averageR: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  recoveryFactor: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  sharpeRatio: number;
}

export type MarketDataStatusCode = 'LIVE' | 'FRESH' | 'DELAYED' | 'STALE' | 'DEMO' | 'ERROR' | 'NO_DATA' | 'UNAVAILABLE';

export interface SupportResistanceLevel {
  price: number;
  strength: number;
  distancePercent: number;
  source: 'Technical Support' | 'Technical Resistance';
}

export interface TimeframeAnalysis {
  timeframe: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendStrength: number;
  structure: string;
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  indicators: {
    rsi?: number | null;
    macd?: number | null;
    adx?: number | null;
    atrPercent?: number | null;
    ema20?: number | null;
    ema50?: number | null;
    ema200?: number | null;
  };
  lastUpdated: string;
  dataQuality: number;
}

export interface MarketAnalysis {
  id?: string;
  symbol: string;
  pair: string;
  timeframe: string;
  timestamp: string;
  overallBias: MarketBias;
  bias: MarketBias;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendStrength: number;
  structure: string;
  structureState: string;
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  currentPrice: number;
  keySupport: number;
  keyResistance: number;
  nearestSupport?: SupportResistanceLevel | null;
  nearestResistance?: SupportResistanceLevel | null;
  multiTimeframe?: Record<string, TimeframeAnalysis>;
  dataQuality: number;
  dataStatus: MarketDataStatusCode;
  explanation: string;
  lastUpdated: string;
}

export interface ScannerItem {
  symbol?: string;
  pair: string;
  currentPrice: number;
  change24h: number;
  bias: MarketBias;
  trend?: string;
  momentum?: string;
  volatility?: string;
  score?: number;
  direction?: TradeDirection;
  status?: SignalStatus;
  riskReward?: number;
  rsi?: number | null;
  adx?: number | null;
  lastStructureEvent?: string;
  dataQuality?: number;
  dataStatus?: MarketDataStatusCode;
  lastUpdated?: string;
  scanStatus?: 'ANALYSIS READY' | string;
  isDemo: boolean;
  dataSourceLabel: string;
}

export interface Watchlist {
  id: string;
  userId: string;
  pair: string;
  notes?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  timestamp: string;
}
