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
export type AssetClass = 'FOREX' | 'METAL' | 'CRYPTO' | 'INDEX' | 'STOCK' | 'OTHER';
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';
export type MarketDataStatusCode =
  | 'LIVE'
  | 'FRESH'
  | 'CURRENT'
  | 'UP_TO_DATE'
  | 'REFRESHING'
  | 'MARKET_CLOSED'
  | 'DELAYED'
  | 'STALE'
  | 'DEMO'
  | 'ERROR'
  | 'NO_DATA'
  | 'UNAVAILABLE';
export type TradingSession = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP' | 'OTHER';

export interface TimeframeConfig {
  code: Timeframe;
  displayName: string;
  durationSeconds: number;
}

export const TIMEFRAMES: Record<Timeframe, TimeframeConfig> = {
  M1: { code: 'M1', displayName: '1 Minute', durationSeconds: 60 },
  M5: { code: 'M5', displayName: '5 Minutes', durationSeconds: 300 },
  M15: { code: 'M15', displayName: '15 Minutes', durationSeconds: 900 },
  M30: { code: 'M30', displayName: '30 Minutes', durationSeconds: 1800 },
  H1: { code: 'H1', displayName: '1 Hour', durationSeconds: 3600 },
  H4: { code: 'H4', displayName: '4 Hours', durationSeconds: 14400 },
  D1: { code: 'D1', displayName: '1 Day', durationSeconds: 86400 },
  W1: { code: 'W1', displayName: '1 Week', durationSeconds: 604800 },
};

export interface Instrument {
  id: string;
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  baseCurrency: string;
  quoteCurrency: string;
  pipSize: number;
  tickSize: number;
  contractSize: number;
  pricePrecision: number;
  volumePrecision: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderSymbolMapping {
  id: string;
  provider: string;
  internalSymbol: string;
  externalSymbol: string;
  createdAt: string;
  updatedAt: string;
}

export interface Candle {
  symbol?: string;
  pair?: string;
  timeframe: string;
  timestamp: number; // UTC candle OPEN time in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
  isClosed?: boolean;
}

export interface MarketPrice {
  symbol: string;
  pair: string;
  price: number;
  bid?: number;
  ask?: number;
  change24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
  source: string;
  status: MarketDataStatusCode;
}

export interface SymbolInfo {
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  baseCurrency: string;
  quoteCurrency: string;
  pipSize: number;
  contractSize: number;
  pricePrecision: number;
  source: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
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
  riskPerTradePercent: number; // e.g. 1.00
  maxDailyRiskPercent: number; // e.g. 3.00
  maxPortfolioRiskPercent: number; // e.g. 5.00
  minRiskRewardRatio: number; // e.g. 1.50
  maxOpenPositions: number; // e.g. 5
}

export interface TradeSetup {
  id: string;
  userId: string;
  name: string;
  description?: string;
  winRate?: number;
  createdAt: string;
}

export interface TradeScreenshot {
  id: string;
  tradeId: string;
  type: 'BEFORE' | 'AFTER';
  url: string;
  caption?: string;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  tradeId?: string;
  date: string;
  title: string;
  content: string;
  mood?: 'EXCELLENT' | 'CONFIDENT' | 'NEUTRAL' | 'ANXIOUS' | 'FRUSTRATED';
  rating?: number; // 1-5
  createdAt: string;
  updatedAt: string;
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
  tradingSession: string; // "Asian" | "London" | "New York"
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
  screenshots?: TradeScreenshot[];
  createdAt: string;
  updatedAt: string;
}

export interface Watchlist {
  id: string;
  userId: string;
  pair: string;
  notes?: string;
  createdAt: string;
}

export interface MarketCandle extends Candle {
  id?: string;
  instrumentId?: string;
  pair: string;
  source?: string;
  isClosed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TechnicalIndicator {
  id?: string;
  symbol?: string;
  pair: string;
  timeframe: string;
  timestamp: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  atrPercent?: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bbWidth?: number | null;
  adx14: number | null;
  plusDI?: number | null;
  minusDI?: number | null;
  calculatedAt?: string;
  calculationVersion?: string;
}

export interface SupportResistanceLevel {
  price: number;
  strength: number; // 0-100
  distancePercent: number;
  source: 'Technical Support' | 'Technical Resistance';
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
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

export interface MarketDataStatus {
  id?: string;
  symbol: string;
  timeframe: string;
  lastCandleTimestamp?: string | null;
  lastSuccessfulSync?: string | null;
  provider: string;
  status: MarketDataStatusCode;
  dataQualityScore: number;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MarketDataGap {
  id?: string;
  symbol: string;
  timeframe: string;
  expectedTimestamp: string;
  detectedAt: string;
  resolvedAt?: string | null;
  status: 'OPEN' | 'RESOLVED' | 'IGNORED';
}

export interface MarketAnalysis {
  id: string;
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

export interface MarketStructure {
  trend: MarketBias;
  swingHighs: { timestamp: number; price: number }[];
  swingLows: { timestamp: number; price: number }[];
  isHigherHigh: boolean;
  isHigherLow: boolean;
  isLowerHigh: boolean;
  isLowerLow: boolean;
  isBullishBOS: boolean;
  isBearishBOS: boolean;
  isPullback: boolean;
  lastStructureEvent?: 'HH' | 'HL' | 'LH' | 'LL' | 'BULLISH_BOS' | 'BEARISH_BOS' | 'PULLBACK';
}

export interface SignalComponent {
  component: string;
  rawValue: string;
  score: number;
  weight: number;
  reason: string;
  isPositive: boolean;
}

export interface SignalRun {
  id: string;
  userId: string;
  pair: string;
  timeframe: string;
  timestamp: string;
  direction: TradeDirection;
  score: number;
  trendScore: number;
  structureScore: number;
  momentumScore: number;
  srScore: number;
  volatilityScore: number;
  rrScore: number;
  confirmationScore: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  status: SignalStatus;
  explanation: string;
  components: SignalComponent[];
}

export interface AccountSnapshot {
  id: string;
  accountId: string;
  date: string;
  balance: number;
  equity: number;
  openPnL: number;
  closedPnL: number;
}

export interface AiAnalysis {
  id: string;
  userId: string;
  query: string;
  response: string;
  context?: string;
  timestamp: string;
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
