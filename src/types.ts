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
  recommendedAction?: 'OPEN_LONG' | 'OPEN_SHORT' | 'WAIT_CONFIRMATION' | 'NO_TRADE';
  actionLabel?: string;
  executionType?: 'MARKET' | 'LIMIT' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  orderTypeLabel?: string;
  entryDistancePips?: number;
  entryBasisMethod?: string;
  entryBasisReason?: string;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  takeProfit3?: number;
  stopLossPips?: number;
  tp1Pips?: number;
  tp2Pips?: number;
  riskReward?: number;
  riskReward2?: number;
  isPotential?: boolean;
  potentialVerdict?: 'SANGAT POTENSIAL' | 'POTENSIAL' | 'KURANG POTENSIAL' | 'TIDAK POTENSIAL';
  potentialSummary?: string;
  potentialReasons?: string[];
  nonPotentialReasons?: string[];
  bottomUpTimeframeSteps?: BottomUpTimeframeStep[];
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

export type InvalidationPolicy = 'OPPOSITE_SIGNAL' | 'PRICE_STOP_BREACH' | 'OPPOSITE_OR_STOP';

export interface SignalAlertConfig {
  id: string;
  userId: string;
  symbol: string;
  enabled: boolean;
  htfDirectionTimeframe?: string;
  htfConfirmationTimeframe?: string;
  primaryTimeframe: string;
  confirmationTimeframe: string;
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
  notificationType: 'INITIAL_SIGNAL' | 'CONFIRMED_SIGNAL' | 'MANUAL_TEST';
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

export interface TwelveDataQuotaBudgetStatus {
  creditsUsedThisMinute: number;
  maxCreditsPerMinute: number;
  creditsUsedToday: number;
  maxCreditsPerDay: number;
  providerReportedCreditsUsed?: number | null;
  providerReportedCreditsLeft?: number | null;
  isRateLimited: boolean;
  rateLimitResetAt?: string | null;
}

