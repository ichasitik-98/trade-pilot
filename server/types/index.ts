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
    macdSignal?: number | null;
    macdHistogram?: number | null;
    adx?: number | null;
    plusDI?: number | null;
    minusDI?: number | null;
    atr?: number | null;
    atrPercent?: number | null;
    ema20?: number | null;
    ema50?: number | null;
    ema200?: number | null;
    bbUpper?: number | null;
    bbMiddle?: number | null;
    bbLower?: number | null;
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

export interface BottomUpTimeframeStep {
  stepOrder: number;
  timeframe: string;
  roleLabel: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  structure: string;
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  rsi?: number | null;
  adx?: number | null;
  ema20?: number | null;
  ema50?: number | null;
  isAligned: boolean;
  summary: string;
}

export interface OpenPositionRiskRewardPlan {
  pair: string;
  timeframe: string;
  direction: TradeDirection;
  recommendedAction: 'OPEN_LONG' | 'OPEN_SHORT' | 'WAIT_CONFIRMATION' | 'NO_TRADE';
  actionLabel: string;
  executionType: 'MARKET' | 'LIMIT' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  orderTypeLabel?: string;
  currentReferencePrice?: number;
  entryDistancePips?: number;
  entryBasisMethod?: string;
  entryBasisReason?: string;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  stopLossDistance: number;
  tp1Distance: number;
  tp2Distance: number;
  tp3Distance: number;
  stopLossPips: number;
  tp1Pips: number;
  tp2Pips: number;
  tp3Pips: number;
  stopLossPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  riskReward1: number;
  riskReward2: number;
  riskReward3: number;
  atrValue: number;
  atrMultiplierSl: number;
  breakevenWinRateTp1: number;
  breakevenWinRateTp2: number;
  pipSize: number;
  contractSize: number;
  pricePrecision: number;
  invalidationReason: string;
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
  currentReferencePrice?: number;
  entryDistancePips?: number;
  executionType?: 'MARKET' | 'LIMIT' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  orderTypeLabel?: string;
  entryBasisMethod?: string;
  entryBasisReason?: string;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3?: number;
  riskReward: number;
  riskReward2?: number;
  riskReward3?: number;
  stopLossPips?: number;
  tp1Pips?: number;
  tp2Pips?: number;
  tp3Pips?: number;
  recommendedAction?: 'OPEN_LONG' | 'OPEN_SHORT' | 'WAIT_CONFIRMATION' | 'NO_TRADE';
  actionLabel?: string;
  isPotential?: boolean;
  potentialVerdict?: 'SANGAT POTENSIAL' | 'POTENSIAL' | 'KURANG POTENSIAL' | 'TIDAK POTENSIAL';
  potentialSummary?: string;
  potentialReasons?: string[];
  nonPotentialReasons?: string[];
  bottomUpTimeframeSteps?: BottomUpTimeframeStep[];
  positionPlan?: OpenPositionRiskRewardPlan;
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

// ============================================================================
// DUAL-STAGE TRADING SIGNAL ALERT & WHATSAPP AUTOMATION TYPES
// ============================================================================

export type SignalLifecycleStatus =
  | 'DETECTED'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'INVALIDATED';

export type SignalNotificationDeliveryStatus =
  | 'NOT_QUEUED'
  | 'NOTIFICATION_PENDING'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_FAILED';

export type NotificationJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'RETRY_SCHEDULED';

export type NotificationType = 'INITIAL_SIGNAL' | 'CONFIRMED_SIGNAL' | 'MANUAL_TEST';

export type InvalidationPolicy = 'OPPOSITE_SIGNAL' | 'PRICE_STOP_BREACH' | 'OPPOSITE_OR_STOP';

export interface SignalAlertConfig {
  id: string;
  userId: string;
  symbol: string;
  enabled: boolean;
  htfDirectionTimeframe?: Timeframe;
  htfConfirmationTimeframe?: Timeframe;
  primaryTimeframe: Timeframe;
  confirmationTimeframe: Timeframe;
  initialScoreThreshold: number;
  confirmationScoreThreshold: number;
  requireClosedCandle: boolean;
  requireTrendAlignment: boolean;
  requireStructureAlignment: boolean;
  requireMomentumAlignment: boolean;
  minAdx: number;
  expirationMinutes: number;
  invalidationPolicy: InvalidationPolicy;
  enableInitialAlert: boolean;
  enableConfirmationAlert: boolean;
  whatsappEnabled: boolean;
  whatsappRecipient?: string | null;
  useTemplateMessage: boolean;
  initialTemplateName?: string | null;
  confirmationTemplateName?: string | null;
  templateLanguage: string;
  configVersion: number;
  lastVerifiedTestAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignalEvaluationRecord {
  id: string;
  signalEventId: string;
  stage: 'INITIAL' | 'CONFIRMATION';
  timeframe: string;
  candleTimestamp?: string | null;
  evaluatedPrice?: number | null;
  score?: number | null;
  resultStatus: SignalLifecycleStatus;
  satisfiedRules: string[];
  failedRules: string[];
  reason: string;
  dataFreshness: string;
  evaluatedAt: string;
}

export interface SignalLifecycleEvent {
  id: string;
  userId: string;
  configId?: string | null;
  signalRunId?: string | null;
  idempotencyKey: string;
  confirmationIdempotencyKey?: string | null;
  symbol: string;
  direction: 'BUY' | 'SELL';
  htfDirectionTimeframe?: string;
  htfConfirmationTimeframe?: string;
  primaryTimeframe: string;
  confirmationTimeframe: string;
  h4Direction?: string | null;
  h1Trend?: string | null;
  m15PullbackValid?: boolean;
  m15PullbackReason?: string | null;
  m5BosDetected?: boolean;
  m5CandleConfirmed?: boolean;
  primaryCandleTimestamp: string;
  isClosedCandle: boolean;
  referencePrice: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number | null;
  riskReward: number;
  initialScore: number;
  initialStatus: string;
  lifecycleStatus: SignalLifecycleStatus;
  initialNotificationStatus: SignalNotificationDeliveryStatus;
  confirmationNotificationStatus: SignalNotificationDeliveryStatus;
  dataFreshnessStatus: string;
  initialExplanation: string;
  confirmationScore?: number | null;
  confirmationCandleTimestamp?: string | null;
  confirmedAt?: string | null;
  confirmationReason?: string | null;
  expiredAt?: string | null;
  expirationReason?: string | null;
  invalidatedAt?: string | null;
  invalidationReason?: string | null;
  conflictingDirection?: string | null;
  expiresAt: string;
  lastEvaluatedAt?: string | null;
  evaluationCount: number;
  createdAt: string;
  updatedAt: string;
  evaluations?: SignalEvaluationRecord[];
}

export interface NotificationAttempt {
  id: string;
  jobId: string;
  attemptNumber: number;
  status: 'SENT' | 'FAILED' | 'TIMEOUT_AMBIGUOUS';
  httpStatus?: number | null;
  providerMessageId?: string | null;
  errorCode?: string | null;
  sanitizedResponse?: string | null;
  durationMs: number;
  attemptedAt: string;
}

export interface NotificationJob {
  id: string;
  userId: string;
  signalEventId?: string | null;
  notificationType: NotificationType;
  idempotencyKey: string;
  channel: string;
  recipient: string;
  payloadJson: Record<string, any>;
  messageBody: string;
  status: NotificationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  lastAttemptAt?: string | null;
  sentAt?: string | null;
  providerMessageId?: string | null;
  sanitizedError?: string | null;
  isAmbiguousTimeout: boolean;
  createdAt: string;
  updatedAt: string;
  attempts?: NotificationAttempt[];
}

export interface WhatsAppConnectionStatus {
  configured: boolean;
  envEnabled: boolean;
  hasPhoneNumberId: boolean;
  hasAccessToken: boolean;
  hasDefaultRecipient: boolean;
  maskedPhoneNumberId: string | null;
  maskedDefaultRecipient: string | null;
  apiVersion: string;
  verifiedByManualTest: boolean;
  lastSuccessfulDeliveryAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
}

