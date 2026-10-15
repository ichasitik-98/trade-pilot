/**
 * DatabaseStore — Production Persistence Layer powered by Prisma & Neon PostgreSQL
 *
 * Single Source of Truth: Neon PostgreSQL via Prisma ORM
 * Legacy data/database.json is retained strictly as an offline backup artifact and is
 * NEVER read or written during normal application runtime.
 */

import { prisma } from './prisma.ts';
import {
  Role as PrismaRole,
  TradeDirection as PrismaTradeDirection,
  TradeStatus as PrismaTradeStatus,
  MarketBias as PrismaMarketBias,
  AssetClass as PrismaAssetClass,
} from '@prisma/client';
import {
  User,
  TradingAccount,
  RiskSetting,
  Trade,
  Watchlist,
  MarketCandle,
  TechnicalIndicator,
  MarketAnalysis,
  SignalRun,
  AiAnalysis,
  AuditLog,
  Instrument,
  MarketDataStatus,
  MarketDataGap,
  Candle,
  Role,
  TradeDirection,
  TradeStatus,
  MarketBias,
  AssetClass,
  Timeframe,
  SignalAlertConfig,
  SignalLifecycleEvent,
  SignalEvaluationRecord,
  NotificationJob,
  NotificationAttempt,
  SignalLifecycleStatus,
  SignalNotificationDeliveryStatus,
  NotificationJobStatus,
  NotificationType,
  InvalidationPolicy,
} from '../types/index.ts';

// ----------------------------------------------------
// ENTITY MAPPERS: PRISMA -> APPLICATION DOMAIN
// ----------------------------------------------------

function mapUser(u: any): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    passwordHash: u.passwordHash,
    role: u.role as Role,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

function mapAccount(a: any): TradingAccount {
  return {
    id: a.id,
    userId: a.userId,
    name: a.name,
    broker: a.broker,
    accountNumber: a.accountNumber || undefined,
    currency: a.currency,
    balance: Number(a.balance),
    equity: Number(a.equity),
    isDefault: a.isDefault,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function mapRiskSetting(r: any): RiskSetting {
  return {
    id: r.id,
    accountId: r.accountId,
    riskPerTradePercent: Number(r.riskPerTradePercent),
    maxDailyRiskPercent: Number(r.maxDailyRiskPercent),
    maxPortfolioRiskPercent: Number(r.maxPortfolioRiskPercent),
    minRiskRewardRatio: Number(r.minRiskRewardRatio),
    maxOpenPositions: r.maxOpenPositions,
  };
}

function mapTrade(t: any): Trade {
  return {
    id: t.id,
    userId: t.userId,
    accountId: t.accountId,
    setupId: t.setupId || undefined,
    pair: t.pair,
    direction: t.direction as TradeDirection,
    status: t.status as TradeStatus,
    timeframe: t.timeframe,
    tradingSession: t.tradingSession,
    entryPrice: Number(t.entryPrice),
    exitPrice: t.exitPrice !== null && t.exitPrice !== undefined ? Number(t.exitPrice) : undefined,
    stopLoss: Number(t.stopLoss),
    takeProfit: t.takeProfit !== null && t.takeProfit !== undefined ? Number(t.takeProfit) : undefined,
    lotSize: Number(t.lotSize),
    riskPercent: Number(t.riskPercent),
    riskAmount: Number(t.riskAmount),
    grossPnL: t.grossPnL !== null && t.grossPnL !== undefined ? Number(t.grossPnL) : undefined,
    fees: Number(t.fees),
    netPnL: t.netPnL !== null && t.netPnL !== undefined ? Number(t.netPnL) : undefined,
    pnlPercent: t.pnlPercent !== null && t.pnlPercent !== undefined ? Number(t.pnlPercent) : undefined,
    rMultiple: t.rMultiple !== null && t.rMultiple !== undefined ? Number(t.rMultiple) : undefined,
    entryTime: t.entryTime.toISOString(),
    exitTime: t.exitTime ? t.exitTime.toISOString() : undefined,
    setup: t.setup || undefined,
    entryReason: t.entryReason || undefined,
    exitReason: t.exitReason || undefined,
    psychology: t.psychology || [],
    mistakeTags: t.mistakeTags || [],
    notes: t.notes || undefined,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function mapWatchlist(w: any): Watchlist {
  return {
    id: w.id,
    userId: w.userId,
    pair: w.pair,
    notes: w.notes || undefined,
    createdAt: w.createdAt.toISOString(),
  };
}

function mapSignalRun(s: any): SignalRun {
  return {
    id: s.id,
    userId: s.userId,
    pair: s.pair,
    timeframe: s.timeframe,
    timestamp: s.timestamp.toISOString(),
    direction: s.direction as TradeDirection,
    score: s.score,
    trendScore: s.trendScore,
    structureScore: s.structureScore,
    momentumScore: s.momentumScore,
    srScore: s.srScore,
    volatilityScore: s.volatilityScore,
    rrScore: s.rrScore,
    confirmationScore: s.confirmationScore,
    entryPrice: Number(s.entryPrice),
    stopLoss: Number(s.stopLoss),
    takeProfit1: Number(s.takeProfit1),
    takeProfit2: Number(s.takeProfit2),
    riskReward: Number(s.riskReward),
    status: s.status,
    explanation: s.explanation,
    components: (s.components || []).map((c: any) => ({
      component: c.component,
      score: c.score,
      weight: c.weight,
      reason: c.reason,
      rawValue: c.rawValue,
    })),
  };
}

function mapAiAnalysis(a: any): AiAnalysis {
  return {
    id: a.id,
    userId: a.userId,
    query: a.query,
    response: a.response,
    context: a.context || undefined,
    timestamp: a.timestamp.toISOString(),
  };
}

function mapAuditLog(l: any): AuditLog {
  return {
    id: l.id,
    userId: l.userId,
    action: l.action,
    entity: l.entity,
    entityId: l.entityId || undefined,
    details: l.details || undefined,
    ipAddress: l.ipAddress || undefined,
    timestamp: l.timestamp.toISOString(),
  };
}

function mapInstrument(i: any): Instrument {
  return {
    id: i.id,
    symbol: i.symbol,
    displayName: i.displayName,
    assetClass: i.assetClass as AssetClass,
    baseCurrency: i.baseCurrency,
    quoteCurrency: i.quoteCurrency,
    pipSize: Number(i.pipSize),
    tickSize: Number(i.tickSize),
    contractSize: Number(i.contractSize),
    pricePrecision: i.pricePrecision,
    volumePrecision: i.volumePrecision,
    isActive: i.isActive,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

function mapMarketCandle(c: any): MarketCandle {
  return {
    id: c.id,
    instrumentId: c.instrumentId || undefined,
    symbol: c.symbol,
    pair: c.pair,
    timeframe: c.timeframe,
    timestamp: c.timestamp instanceof Date ? c.timestamp.getTime() : new Date(c.timestamp).getTime(),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume),
    source: c.source,
    isClosed: c.isClosed,
    createdAt: c.createdAt ? c.createdAt.toISOString() : undefined,
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : undefined,
  };
}

function mapTechnicalIndicator(t: any): TechnicalIndicator {
  return {
    id: t.id,
    symbol: t.symbol,
    pair: t.pair,
    timeframe: t.timeframe,
    timestamp: t.timestamp instanceof Date ? t.timestamp.getTime() : new Date(t.timestamp).getTime(),
    sma20: t.sma20 !== null && t.sma20 !== undefined ? Number(t.sma20) : null,
    sma50: t.sma50 !== null && t.sma50 !== undefined ? Number(t.sma50) : null,
    sma200: t.sma200 !== null && t.sma200 !== undefined ? Number(t.sma200) : null,
    ema20: t.ema20 !== null && t.ema20 !== undefined ? Number(t.ema20) : null,
    ema50: t.ema50 !== null && t.ema50 !== undefined ? Number(t.ema50) : null,
    ema200: t.ema200 !== null && t.ema200 !== undefined ? Number(t.ema200) : null,
    rsi14: t.rsi14 !== null && t.rsi14 !== undefined ? Number(t.rsi14) : null,
    macd: t.macd !== null && t.macd !== undefined ? Number(t.macd) : null,
    macdSignal: t.macdSignal !== null && t.macdSignal !== undefined ? Number(t.macdSignal) : null,
    macdHistogram: t.macdHistogram !== null && t.macdHistogram !== undefined ? Number(t.macdHistogram) : null,
    atr14: t.atr14 !== null && t.atr14 !== undefined ? Number(t.atr14) : null,
    atrPercent: t.atrPercent !== null && t.atrPercent !== undefined ? Number(t.atrPercent) : null,
    bbUpper: t.bbUpper !== null && t.bbUpper !== undefined ? Number(t.bbUpper) : null,
    bbMiddle: t.bbMiddle !== null && t.bbMiddle !== undefined ? Number(t.bbMiddle) : null,
    bbLower: t.bbLower !== null && t.bbLower !== undefined ? Number(t.bbLower) : null,
    bbWidth: t.bbWidth !== null && t.bbWidth !== undefined ? Number(t.bbWidth) : null,
    adx14: t.adx14 !== null && t.adx14 !== undefined ? Number(t.adx14) : null,
    plusDI: t.plusDI !== null && t.plusDI !== undefined ? Number(t.plusDI) : null,
    minusDI: t.minusDI !== null && t.minusDI !== undefined ? Number(t.minusDI) : null,
    calculatedAt: t.calculatedAt ? t.calculatedAt.toISOString() : undefined,
    calculationVersion: t.calculationVersion || '1.0.0',
  };
}

function mapMarketDataStatus(s: any): MarketDataStatus {
  return {
    id: s.id,
    symbol: s.symbol,
    timeframe: s.timeframe,
    lastCandleTimestamp: s.lastCandleTimestamp ? s.lastCandleTimestamp.toISOString() : null,
    lastSuccessfulSync: s.lastSuccessfulSync ? s.lastSuccessfulSync.toISOString() : null,
    provider: s.provider,
    status: s.status as any,
    dataQualityScore: s.dataQualityScore,
    errorMessage: s.errorMessage || undefined,
  };
}

function mapMarketAnalysis(a: any): MarketAnalysis {
  return {
    id: a.id,
    symbol: a.symbol,
    pair: a.pair,
    timeframe: a.timeframe,
    timestamp: a.timestamp ? a.timestamp.toISOString() : new Date().toISOString(),
    overallBias: a.overallBias as MarketBias,
    bias: a.bias as MarketBias,
    trend: a.trend,
    trendStrength: Number(a.trendStrength),
    structure: a.structure,
    structureState: a.structureState,
    momentum: a.momentum,
    volatility: a.volatility,
    currentPrice: Number(a.currentPrice),
    keySupport: a.keySupport ? Number(a.keySupport) : 0,
    keyResistance: a.keyResistance ? Number(a.keyResistance) : 0,
    nearestSupport: a.nearestSupport
      ? { price: Number(a.nearestSupport), strength: 80, distancePercent: 0.5, source: 'Technical Support' }
      : null,
    nearestResistance: a.nearestResistance
      ? { price: Number(a.nearestResistance), strength: 80, distancePercent: 0.5, source: 'Technical Resistance' }
      : null,
    multiTimeframe: (a.multiTimeframe as any) || undefined,
    dataQuality: a.dataQuality,
    dataStatus: a.dataStatus as any,
    explanation: a.explanation,
    lastUpdated: a.lastUpdated ? a.lastUpdated.toISOString() : new Date().toISOString(),
  };
}

function mapMarketDataGap(g: any): MarketDataGap {
  return {
    id: g.id,
    symbol: g.symbol,
    timeframe: g.timeframe,
    expectedTimestamp: g.expectedTimestamp.toISOString(),
    detectedAt: g.detectedAt ? g.detectedAt.toISOString() : new Date().toISOString(),
    resolvedAt: g.resolvedAt ? g.resolvedAt.toISOString() : undefined,
    status: g.status as any,
  };
}

function mapSignalAlertConfig(c: any): SignalAlertConfig {
  return {
    id: c.id,
    userId: c.userId,
    symbol: c.symbol,
    enabled: Boolean(c.enabled),
    htfDirectionTimeframe: (c.htfDirectionTimeframe || 'H4') as Timeframe,
    htfConfirmationTimeframe: (c.htfConfirmationTimeframe || 'H1') as Timeframe,
    primaryTimeframe: c.primaryTimeframe as Timeframe,
    confirmationTimeframe: c.confirmationTimeframe as Timeframe,
    initialScoreThreshold: Number(c.initialScoreThreshold),
    confirmationScoreThreshold: Number(c.confirmationScoreThreshold),
    requireClosedCandle: Boolean(c.requireClosedCandle),
    requireTrendAlignment: Boolean(c.requireTrendAlignment),
    requireStructureAlignment: Boolean(c.requireStructureAlignment),
    requireMomentumAlignment: Boolean(c.requireMomentumAlignment),
    minAdx: Number(c.minAdx),
    expirationMinutes: Number(c.expirationMinutes),
    invalidationPolicy: (c.invalidationPolicy || 'OPPOSITE_OR_STOP') as InvalidationPolicy,
    enableInitialAlert: Boolean(c.enableInitialAlert),
    enableConfirmationAlert: Boolean(c.enableConfirmationAlert),
    whatsappEnabled: Boolean(c.whatsappEnabled),
    whatsappRecipient: c.whatsappRecipient || null,
    useTemplateMessage: Boolean(c.useTemplateMessage),
    initialTemplateName: c.initialTemplateName || null,
    confirmationTemplateName: c.confirmationTemplateName || null,
    templateLanguage: c.templateLanguage || 'en_US',
    configVersion: Number(c.configVersion || 1),
    lastVerifiedTestAt: c.lastVerifiedTestAt ? c.lastVerifiedTestAt.toISOString() : null,
    createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : new Date().toISOString(),
  };
}

function mapSignalEvaluationRecord(e: any): SignalEvaluationRecord {
  return {
    id: e.id,
    signalEventId: e.signalEventId,
    stage: e.stage === 'CONFIRMATION' ? 'CONFIRMATION' : 'INITIAL',
    timeframe: e.timeframe,
    candleTimestamp: e.candleTimestamp ? e.candleTimestamp.toISOString() : null,
    evaluatedPrice: e.evaluatedPrice !== null && e.evaluatedPrice !== undefined ? Number(e.evaluatedPrice) : null,
    score: e.score !== null && e.score !== undefined ? Number(e.score) : null,
    resultStatus: e.resultStatus as SignalLifecycleStatus,
    satisfiedRules: Array.isArray(e.satisfiedRules) ? e.satisfiedRules : [],
    failedRules: Array.isArray(e.failedRules) ? e.failedRules : [],
    reason: e.reason,
    dataFreshness: e.dataFreshness || 'CURRENT',
    evaluatedAt: e.evaluatedAt ? e.evaluatedAt.toISOString() : new Date().toISOString(),
  };
}

function mapSignalLifecycleEvent(ev: any): SignalLifecycleEvent {
  return {
    id: ev.id,
    userId: ev.userId,
    configId: ev.configId || null,
    signalRunId: ev.signalRunId || null,
    idempotencyKey: ev.idempotencyKey,
    confirmationIdempotencyKey: ev.confirmationIdempotencyKey || null,
    symbol: ev.symbol,
    direction: ev.direction === 'SELL' ? 'SELL' : 'BUY',
    htfDirectionTimeframe: ev.htfDirectionTimeframe || 'H4',
    htfConfirmationTimeframe: ev.htfConfirmationTimeframe || 'H1',
    primaryTimeframe: ev.primaryTimeframe,
    confirmationTimeframe: ev.confirmationTimeframe,
    h4Direction: ev.h4Direction || null,
    h1Trend: ev.h1Trend || null,
    m15PullbackValid: Boolean(ev.m15PullbackValid),
    m15PullbackReason: ev.m15PullbackReason || null,
    m5BosDetected: Boolean(ev.m5BosDetected),
    m5CandleConfirmed: Boolean(ev.m5CandleConfirmed),
    primaryCandleTimestamp: ev.primaryCandleTimestamp.toISOString(),
    isClosedCandle: Boolean(ev.isClosedCandle),
    referencePrice: Number(ev.referencePrice),
    entryPrice: Number(ev.entryPrice),
    stopLoss: Number(ev.stopLoss),
    takeProfit1: Number(ev.takeProfit1),
    takeProfit2: ev.takeProfit2 !== null && ev.takeProfit2 !== undefined ? Number(ev.takeProfit2) : null,
    riskReward: Number(ev.riskReward),
    initialScore: Number(ev.initialScore),
    initialStatus: ev.initialStatus,
    lifecycleStatus: ev.lifecycleStatus as SignalLifecycleStatus,
    initialNotificationStatus: ev.initialNotificationStatus as SignalNotificationDeliveryStatus,
    confirmationNotificationStatus: ev.confirmationNotificationStatus as SignalNotificationDeliveryStatus,
    dataFreshnessStatus: ev.dataFreshnessStatus || 'CURRENT',
    initialExplanation: ev.initialExplanation,
    confirmationScore: ev.confirmationScore !== null && ev.confirmationScore !== undefined ? Number(ev.confirmationScore) : null,
    confirmationCandleTimestamp: ev.confirmationCandleTimestamp ? ev.confirmationCandleTimestamp.toISOString() : null,
    confirmedAt: ev.confirmedAt ? ev.confirmedAt.toISOString() : null,
    confirmationReason: ev.confirmationReason || null,
    expiredAt: ev.expiredAt ? ev.expiredAt.toISOString() : null,
    expirationReason: ev.expirationReason || null,
    invalidatedAt: ev.invalidatedAt ? ev.invalidatedAt.toISOString() : null,
    invalidationReason: ev.invalidationReason || null,
    conflictingDirection: ev.conflictingDirection || null,
    expiresAt: ev.expiresAt.toISOString(),
    lastEvaluatedAt: ev.lastEvaluatedAt ? ev.lastEvaluatedAt.toISOString() : null,
    evaluationCount: Number(ev.evaluationCount || 0),
    createdAt: ev.createdAt ? ev.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: ev.updatedAt ? ev.updatedAt.toISOString() : new Date().toISOString(),
    evaluations: Array.isArray(ev.evaluations) ? ev.evaluations.map(mapSignalEvaluationRecord) : undefined,
  };
}

function mapNotificationAttempt(a: any): NotificationAttempt {
  return {
    id: a.id,
    jobId: a.jobId,
    attemptNumber: Number(a.attemptNumber),
    status: a.status as 'SENT' | 'FAILED' | 'TIMEOUT_AMBIGUOUS',
    httpStatus: a.httpStatus !== null && a.httpStatus !== undefined ? Number(a.httpStatus) : null,
    providerMessageId: a.providerMessageId || null,
    errorCode: a.errorCode || null,
    sanitizedResponse: a.sanitizedResponse || null,
    durationMs: Number(a.durationMs || 0),
    attemptedAt: a.attemptedAt ? a.attemptedAt.toISOString() : new Date().toISOString(),
  };
}

function mapNotificationJob(j: any): NotificationJob {
  return {
    id: j.id,
    userId: j.userId,
    signalEventId: j.signalEventId || null,
    notificationType: j.notificationType as NotificationType,
    idempotencyKey: j.idempotencyKey,
    channel: j.channel || 'WHATSAPP',
    recipient: j.recipient,
    payloadJson: (j.payloadJson as Record<string, any>) || {},
    messageBody: j.messageBody,
    status: j.status as NotificationJobStatus,
    attemptCount: Number(j.attemptCount || 0),
    maxAttempts: Number(j.maxAttempts || 3),
    nextRetryAt: j.nextRetryAt ? j.nextRetryAt.toISOString() : null,
    lastAttemptAt: j.lastAttemptAt ? j.lastAttemptAt.toISOString() : null,
    sentAt: j.sentAt ? j.sentAt.toISOString() : null,
    providerMessageId: j.providerMessageId || null,
    sanitizedError: j.sanitizedError || null,
    isAmbiguousTimeout: Boolean(j.isAmbiguousTimeout),
    createdAt: j.createdAt ? j.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: j.updatedAt ? j.updatedAt.toISOString() : new Date().toISOString(),
    attempts: Array.isArray(j.attempts) ? j.attempts.map(mapNotificationAttempt) : undefined,
  };
}

// ----------------------------------------------------
// DATABASE STORE CLASS
// ----------------------------------------------------

export class DatabaseStore {
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Verify connectivity via TLS to Neon PostgreSQL
      await prisma.$queryRaw`SELECT 1`;

      // Check if baseline instruments exist; if empty, run automated seed
      const count = await prisma.instrument.count();
      if (count === 0) {
        console.log('[DatabaseStore] Instruments table empty on Neon, executing seed...');
        const { main: runSeed } = await import('../../prisma/seed.ts');
        await runSeed();
      }

      // Ensure default provider symbol mappings exist
      const mappingCount = await prisma.providerSymbolMapping.count();
      if (mappingCount === 0) {
        await this.seedDefaultProviderMappings();
      }

      this.initialized = true;
      console.log('[DatabaseStore] Connected to Neon PostgreSQL database.');
    } catch (err: any) {
      console.error('[DatabaseStore] Critical: Neon PostgreSQL connection error:', err.message);
      // Fail explicitly per architecture requirements; do not silently switch to local JSON
      throw new Error(`Database connection failed: ${err.message}`);
    }
  }

  // ----------------------------------------------------
  // USERS
  // ----------------------------------------------------

  public async findUserByEmail(email: string): Promise<User | undefined> {
    await this.init();
    const u = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    return u ? mapUser(u) : undefined;
  }

  public async findUserById(id: string): Promise<User | undefined> {
    await this.init();
    const u = await prisma.user.findUnique({ where: { id } });
    return u ? mapUser(u) : undefined;
  }

  public async createUser(user: User): Promise<User> {
    await this.init();
    const created = await prisma.user.create({
      data: {
        id: user.id || crypto.randomUUID(),
        email: user.email.toLowerCase().trim(),
        name: user.name,
        passwordHash: user.passwordHash,
        role: user.role === 'ADMIN' ? PrismaRole.ADMIN : PrismaRole.USER,
      },
    });
    return mapUser(created);
  }

  // ----------------------------------------------------
  // TRADING ACCOUNTS
  // ----------------------------------------------------

  public async getAccountsByUserId(userId: string): Promise<TradingAccount[]> {
    await this.init();
    const list = await prisma.tradingAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return list.map(mapAccount);
  }

  public async getAccountById(id: string): Promise<TradingAccount | undefined> {
    await this.init();
    const a = await prisma.tradingAccount.findUnique({ where: { id } });
    return a ? mapAccount(a) : undefined;
  }

  public async createAccount(account: TradingAccount, risk?: RiskSetting): Promise<TradingAccount> {
    await this.init();
    const created = await prisma.$transaction(async (tx) => {
      const acc = await tx.tradingAccount.create({
        data: {
          id: account.id || crypto.randomUUID(),
          userId: account.userId,
          name: account.name,
          broker: account.broker,
          accountNumber: account.accountNumber,
          currency: account.currency,
          balance: account.balance,
          equity: account.equity,
          isDefault: account.isDefault,
        },
      });

      if (risk) {
        await tx.riskSetting.create({
          data: {
            id: risk.id || crypto.randomUUID(),
            accountId: acc.id,
            riskPerTradePercent: risk.riskPerTradePercent,
            maxDailyRiskPercent: risk.maxDailyRiskPercent,
            maxPortfolioRiskPercent: risk.maxPortfolioRiskPercent,
            minRiskRewardRatio: risk.minRiskRewardRatio,
            maxOpenPositions: risk.maxOpenPositions,
          },
        });
      }

      return acc;
    });

    return mapAccount(created);
  }

  public async updateAccount(id: string, updates: Partial<TradingAccount>): Promise<TradingAccount | undefined> {
    await this.init();
    const data: any = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.broker !== undefined) data.broker = updates.broker;
    if (updates.accountNumber !== undefined) data.accountNumber = updates.accountNumber;
    if (updates.currency !== undefined) data.currency = updates.currency;
    if (updates.balance !== undefined) data.balance = updates.balance;
    if (updates.equity !== undefined) data.equity = updates.equity;
    if (updates.isDefault !== undefined) data.isDefault = updates.isDefault;

    const updated = await prisma.tradingAccount.update({
      where: { id },
      data,
    });
    return mapAccount(updated);
  }

  // ----------------------------------------------------
  // RISK SETTINGS
  // ----------------------------------------------------

  public async getRiskSettingByAccountId(accountId: string): Promise<RiskSetting | undefined> {
    await this.init();
    const r = await prisma.riskSetting.findUnique({ where: { accountId } });
    return r ? mapRiskSetting(r) : undefined;
  }

  public async upsertRiskSetting(accountId: string, setting: Partial<RiskSetting>): Promise<RiskSetting> {
    await this.init();
    const upserted = await prisma.riskSetting.upsert({
      where: { accountId },
      update: {
        ...(setting.riskPerTradePercent !== undefined ? { riskPerTradePercent: setting.riskPerTradePercent } : {}),
        ...(setting.maxDailyRiskPercent !== undefined ? { maxDailyRiskPercent: setting.maxDailyRiskPercent } : {}),
        ...(setting.maxPortfolioRiskPercent !== undefined ? { maxPortfolioRiskPercent: setting.maxPortfolioRiskPercent } : {}),
        ...(setting.minRiskRewardRatio !== undefined ? { minRiskRewardRatio: setting.minRiskRewardRatio } : {}),
        ...(setting.maxOpenPositions !== undefined ? { maxOpenPositions: setting.maxOpenPositions } : {}),
      },
      create: {
        accountId,
        riskPerTradePercent: setting.riskPerTradePercent ?? 1.0,
        maxDailyRiskPercent: setting.maxDailyRiskPercent ?? 3.0,
        maxPortfolioRiskPercent: setting.maxPortfolioRiskPercent ?? 5.0,
        minRiskRewardRatio: setting.minRiskRewardRatio ?? 1.5,
        maxOpenPositions: setting.maxOpenPositions ?? 5,
      },
    });
    return mapRiskSetting(upserted);
  }

  // ----------------------------------------------------
  // TRADES
  // ----------------------------------------------------

  public async getTrades(params: {
    userId: string;
    accountId?: string;
    status?: string;
    pair?: string;
    direction?: string;
    timeframe?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ trades: Trade[]; total: number }> {
    await this.init();

    const where: any = { userId: params.userId };

    if (params.accountId) where.accountId = params.accountId;
    if (params.status) {
      where.status =
        params.status === 'CLOSED'
          ? PrismaTradeStatus.CLOSED
          : params.status === 'CANCELLED'
          ? PrismaTradeStatus.CANCELLED
          : PrismaTradeStatus.OPEN;
    }
    if (params.pair) where.pair = { equals: params.pair, mode: 'insensitive' };
    if (params.direction) {
      where.direction = params.direction === 'SHORT' ? PrismaTradeDirection.SHORT : PrismaTradeDirection.LONG;
    }
    if (params.timeframe) where.timeframe = params.timeframe;

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: { entryTime: 'desc' },
        skip: params.offset ?? 0,
        take: params.limit ?? 50,
      }),
      prisma.trade.count({ where }),
    ]);

    return { trades: trades.map(mapTrade), total };
  }

  public async getTradeById(id: string): Promise<Trade | undefined> {
    await this.init();
    const t = await prisma.trade.findUnique({ where: { id } });
    return t ? mapTrade(t) : undefined;
  }

  public async createTrade(trade: Trade): Promise<Trade> {
    await this.init();
    const created = await prisma.trade.create({
      data: {
        id: trade.id || crypto.randomUUID(),
        userId: trade.userId,
        accountId: trade.accountId,
        setupId: trade.setupId || null,
        pair: trade.pair,
        direction: trade.direction === 'SHORT' ? PrismaTradeDirection.SHORT : PrismaTradeDirection.LONG,
        status:
          trade.status === 'CLOSED'
            ? PrismaTradeStatus.CLOSED
            : trade.status === 'CANCELLED'
            ? PrismaTradeStatus.CANCELLED
            : PrismaTradeStatus.OPEN,
        timeframe: trade.timeframe || 'H1',
        tradingSession: trade.tradingSession || 'London',
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice ?? null,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit ?? null,
        lotSize: trade.lotSize,
        riskPercent: trade.riskPercent,
        riskAmount: trade.riskAmount,
        grossPnL: trade.grossPnL ?? null,
        fees: trade.fees || 0,
        netPnL: trade.netPnL ?? null,
        pnlPercent: trade.pnlPercent ?? null,
        rMultiple: trade.rMultiple ?? null,
        entryTime: new Date(trade.entryTime),
        exitTime: trade.exitTime ? new Date(trade.exitTime) : null,
        setup: trade.setup || null,
        entryReason: trade.entryReason || null,
        exitReason: trade.exitReason || null,
        psychology: trade.psychology || [],
        mistakeTags: trade.mistakeTags || [],
        notes: trade.notes || null,
      },
    });
    return mapTrade(created);
  }

  public async updateTrade(id: string, updates: Partial<Trade>): Promise<Trade | undefined> {
    const cleanId = typeof id === 'string' ? id.trim() : '';
    if (!cleanId) {
      throw new Error('Cannot update trade: tradeId is missing');
    }
    await this.init();
    const data: any = {};

    if (typeof updates.pair === 'string' && updates.pair.trim().length >= 2) {
      data.pair = updates.pair.trim().toUpperCase();
    }
    if (updates.direction === 'LONG' || updates.direction === 'SHORT') {
      data.direction =
        updates.direction === 'SHORT' ? PrismaTradeDirection.SHORT : PrismaTradeDirection.LONG;
    }
    if (
      updates.status === 'OPEN' ||
      updates.status === 'CLOSED' ||
      updates.status === 'CANCELLED'
    ) {
      data.status =
        updates.status === 'CLOSED'
          ? PrismaTradeStatus.CLOSED
          : updates.status === 'CANCELLED'
          ? PrismaTradeStatus.CANCELLED
          : PrismaTradeStatus.OPEN;
    }
    if (typeof updates.timeframe === 'string' && updates.timeframe.trim().length > 0) {
      data.timeframe = updates.timeframe.trim();
    }
    if (typeof updates.tradingSession === 'string' && updates.tradingSession.trim().length > 0) {
      data.tradingSession = updates.tradingSession.trim();
    }
    if (
      typeof updates.entryPrice === 'number' &&
      Number.isFinite(updates.entryPrice) &&
      updates.entryPrice > 0
    ) {
      data.entryPrice = updates.entryPrice;
    }
    if (
      typeof updates.exitPrice === 'number' &&
      Number.isFinite(updates.exitPrice) &&
      updates.exitPrice > 0
    ) {
      data.exitPrice = updates.exitPrice;
    }
    if (
      typeof updates.stopLoss === 'number' &&
      Number.isFinite(updates.stopLoss) &&
      updates.stopLoss > 0
    ) {
      data.stopLoss = updates.stopLoss;
    }
    if (
      typeof updates.takeProfit === 'number' &&
      Number.isFinite(updates.takeProfit) &&
      updates.takeProfit > 0
    ) {
      data.takeProfit = updates.takeProfit;
    }
    if (
      typeof updates.lotSize === 'number' &&
      Number.isFinite(updates.lotSize) &&
      updates.lotSize > 0
    ) {
      data.lotSize = updates.lotSize;
    }
    if (
      typeof updates.riskPercent === 'number' &&
      Number.isFinite(updates.riskPercent) &&
      updates.riskPercent > 0
    ) {
      data.riskPercent = updates.riskPercent;
    }
    if (
      typeof updates.riskAmount === 'number' &&
      Number.isFinite(updates.riskAmount) &&
      updates.riskAmount >= 0
    ) {
      data.riskAmount = updates.riskAmount;
    }
    if (typeof updates.entryTime === 'string' && updates.entryTime.trim().length > 0) {
      const parsedEntry = new Date(updates.entryTime);
      if (!isNaN(parsedEntry.getTime())) data.entryTime = parsedEntry;
    }
    if (typeof updates.exitTime === 'string' && updates.exitTime.trim().length > 0) {
      const parsedExit = new Date(updates.exitTime);
      if (!isNaN(parsedExit.getTime())) data.exitTime = parsedExit;
    }
    if (typeof updates.grossPnL === 'number' && Number.isFinite(updates.grossPnL)) {
      data.grossPnL = updates.grossPnL;
    }
    if (typeof updates.netPnL === 'number' && Number.isFinite(updates.netPnL)) {
      data.netPnL = updates.netPnL;
    }
    if (typeof updates.fees === 'number' && Number.isFinite(updates.fees) && updates.fees >= 0) {
      data.fees = updates.fees;
    }
    if (typeof updates.pnlPercent === 'number' && Number.isFinite(updates.pnlPercent)) {
      data.pnlPercent = updates.pnlPercent;
    }
    if (typeof updates.rMultiple === 'number' && Number.isFinite(updates.rMultiple)) {
      data.rMultiple = updates.rMultiple;
    }
    if (typeof updates.setup === 'string' && updates.setup.trim().length > 0) {
      data.setup = updates.setup.trim();
    }
    if (typeof updates.entryReason === 'string') {
      data.entryReason = updates.entryReason;
    }
    if (typeof updates.exitReason === 'string') {
      data.exitReason = updates.exitReason;
    }
    if (typeof updates.notes === 'string') {
      data.notes = updates.notes;
    }
    if (Array.isArray(updates.psychology)) {
      data.psychology = updates.psychology;
    }
    if (Array.isArray(updates.mistakeTags)) {
      data.mistakeTags = updates.mistakeTags;
    }
    if (typeof updates.setupId === 'string' && updates.setupId.trim().length > 0) {
      data.setupId = updates.setupId.trim();
    }

    const updated = await prisma.trade.update({
      where: { id: cleanId },
      data,
    });
    return mapTrade(updated);
  }

  public async deleteTrade(id: string): Promise<boolean> {
    await this.init();
    try {
      await prisma.trade.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // ----------------------------------------------------
  // WATCHLISTS
  // ----------------------------------------------------

  public async getWatchlistsByUserId(userId: string): Promise<Watchlist[]> {
    await this.init();
    const list = await prisma.watchlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(mapWatchlist);
  }

  public async addWatchlist(watchlist: Watchlist): Promise<Watchlist> {
    await this.init();
    const pair = watchlist.pair.toUpperCase();
    const upserted = await prisma.watchlist.upsert({
      where: {
        userId_pair: {
          userId: watchlist.userId,
          pair,
        },
      },
      update: {
        notes: watchlist.notes || null,
      },
      create: {
        id: watchlist.id || crypto.randomUUID(),
        userId: watchlist.userId,
        pair,
        notes: watchlist.notes || null,
      },
    });
    return mapWatchlist(upserted);
  }

  public async removeWatchlist(userId: string, pair: string): Promise<boolean> {
    await this.init();
    const res = await prisma.watchlist.deleteMany({
      where: {
        userId,
        pair: { equals: pair.toUpperCase(), mode: 'insensitive' },
      },
    });
    return res.count > 0;
  }

  // ----------------------------------------------------
  // SIGNAL RUNS
  // ----------------------------------------------------

  public async createSignalRun(signal: SignalRun): Promise<SignalRun> {
    await this.init();
    const signalId = signal.id || crypto.randomUUID();

    const created = await prisma.$transaction(async (tx) => {
      const run = await tx.signalRun.create({
        data: {
          id: signalId,
          userId: signal.userId,
          pair: signal.pair,
          timeframe: signal.timeframe,
          timestamp: new Date(signal.timestamp),
          direction: signal.direction === 'SHORT' ? PrismaTradeDirection.SHORT : PrismaTradeDirection.LONG,
          score: signal.score,
          trendScore: signal.trendScore,
          structureScore: signal.structureScore,
          momentumScore: signal.momentumScore,
          srScore: signal.srScore,
          volatilityScore: signal.volatilityScore,
          rrScore: signal.rrScore,
          confirmationScore: signal.confirmationScore,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit1: signal.takeProfit1,
          takeProfit2: signal.takeProfit2,
          riskReward: signal.riskReward,
          status: signal.status,
          explanation: signal.explanation,
        },
      });

      if (signal.components && signal.components.length > 0) {
        await tx.signalComponent.createMany({
          data: signal.components.map((c) => ({
            id: crypto.randomUUID(),
            signalRunId: signalId,
            component: c.component,
            score: c.score,
            weight: c.weight,
            reason: c.reason,
            rawValue: c.rawValue,
          })),
        });
      }

      return run;
    });

    return mapSignalRun({ ...created, components: signal.components || [] });
  }

  public async getSignalRuns(userId: string, pair?: string, limit: number = 20): Promise<SignalRun[]> {
    await this.init();
    const where: any = { userId };
    if (pair) where.pair = { equals: pair, mode: 'insensitive' };

    const runs = await prisma.signalRun.findMany({
      where,
      include: { components: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return runs.map(mapSignalRun);
  }

  // ----------------------------------------------------
  // AI ANALYSES
  // ----------------------------------------------------

  public async createAiAnalysis(analysis: AiAnalysis): Promise<AiAnalysis> {
    await this.init();
    const created = await prisma.aiAnalysis.create({
      data: {
        id: analysis.id || crypto.randomUUID(),
        userId: analysis.userId,
        query: analysis.query,
        response: analysis.response,
        context: analysis.context || null,
        timestamp: new Date(analysis.timestamp || Date.now()),
      },
    });
    return mapAiAnalysis(created);
  }

  public async getAiAnalyses(userId: string, limit: number = 20): Promise<AiAnalysis[]> {
    await this.init();
    const list = await prisma.aiAnalysis.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return list.map(mapAiAnalysis);
  }

  // ----------------------------------------------------
  // AUDIT LOGS
  // ----------------------------------------------------

  public async addAuditLog(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    await this.init();
    const created = await prisma.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId || null,
        details: entry.details || null,
        ipAddress: entry.ipAddress || null,
        timestamp: new Date(),
      },
    });
    return mapAuditLog(created);
  }

  public async getAuditLogs(userId: string, limit: number = 50): Promise<AuditLog[]> {
    await this.init();
    const logs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return logs.map(mapAuditLog);
  }

  // ----------------------------------------------------
  // INSTRUMENTS
  // ----------------------------------------------------

  public async getInstruments(activeOnly: boolean = true): Promise<Instrument[]> {
    await this.init();
    const list = await prisma.instrument.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { symbol: 'asc' },
    });
    return list.map(mapInstrument);
  }

  public async getInstrumentBySymbol(symbol: string): Promise<Instrument | undefined> {
    await this.init();
    const sym = symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const inst = await prisma.instrument.findUnique({
      where: { symbol: sym },
    });
    return inst ? mapInstrument(inst) : undefined;
  }

  public async upsertInstrument(instrument: Instrument): Promise<Instrument> {
    await this.init();
    const sym = instrument.symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const upserted = await prisma.instrument.upsert({
      where: { symbol: sym },
      update: {
        displayName: instrument.displayName,
        assetClass: instrument.assetClass,
        baseCurrency: instrument.baseCurrency,
        quoteCurrency: instrument.quoteCurrency,
        pipSize: instrument.pipSize,
        tickSize: instrument.tickSize,
        contractSize: instrument.contractSize,
        pricePrecision: instrument.pricePrecision,
        volumePrecision: instrument.volumePrecision,
        isActive: instrument.isActive,
      },
      create: {
        id: instrument.id || crypto.randomUUID(),
        symbol: sym,
        displayName: instrument.displayName,
        assetClass: instrument.assetClass,
        baseCurrency: instrument.baseCurrency,
        quoteCurrency: instrument.quoteCurrency,
        pipSize: instrument.pipSize,
        tickSize: instrument.tickSize,
        contractSize: instrument.contractSize,
        pricePrecision: instrument.pricePrecision,
        volumePrecision: instrument.volumePrecision,
        isActive: instrument.isActive,
      },
    });
    return mapInstrument(upserted);
  }

  // ----------------------------------------------------
  // PROVIDER SYMBOL MAPPINGS
  // ----------------------------------------------------

  public async seedDefaultProviderMappings(): Promise<void> {
    const defaultTwelveDataMappings = [
      { internalSymbol: 'EURUSD', externalSymbol: 'EUR/USD' },
      { internalSymbol: 'GBPUSD', externalSymbol: 'GBP/USD' },
      { internalSymbol: 'USDJPY', externalSymbol: 'USD/JPY' },
      { internalSymbol: 'USDCHF', externalSymbol: 'USD/CHF' },
      { internalSymbol: 'USDCAD', externalSymbol: 'USD/CAD' },
      { internalSymbol: 'AUDUSD', externalSymbol: 'AUD/USD' },
      { internalSymbol: 'NZDUSD', externalSymbol: 'NZD/USD' },
      { internalSymbol: 'EURJPY', externalSymbol: 'EUR/JPY' },
      { internalSymbol: 'GBPJPY', externalSymbol: 'GBP/JPY' },
      { internalSymbol: 'XAUUSD', externalSymbol: 'XAU/USD' },
      { internalSymbol: 'BTCUSD', externalSymbol: 'BTC/USD' },
    ];

    for (const m of defaultTwelveDataMappings) {
      await prisma.providerSymbolMapping.upsert({
        where: {
          provider_internalSymbol: {
            provider: 'TWELVEDATA',
            internalSymbol: m.internalSymbol,
          },
        },
        update: { externalSymbol: m.externalSymbol },
        create: {
          provider: 'TWELVEDATA',
          internalSymbol: m.internalSymbol,
          externalSymbol: m.externalSymbol,
        },
      });
    }
  }

  public async getProviderSymbolMapping(provider: string, internalSymbol: string): Promise<string | null> {
    await this.init();
    const cleanSym = internalSymbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const mapping = await prisma.providerSymbolMapping.findUnique({
      where: {
        provider_internalSymbol: {
          provider: provider.toUpperCase(),
          internalSymbol: cleanSym,
        },
      },
    });
    return mapping ? mapping.externalSymbol : null;
  }

  public async getAllProviderSymbolMappings(provider?: string): Promise<{ id: string; provider: string; internalSymbol: string; externalSymbol: string }[]> {
    await this.init();
    const where = provider ? { provider: provider.toUpperCase() } : {};
    const mappings = await prisma.providerSymbolMapping.findMany({
      where,
      orderBy: { internalSymbol: 'asc' },
    });
    return mappings.map((m) => ({
      id: m.id,
      provider: m.provider,
      internalSymbol: m.internalSymbol,
      externalSymbol: m.externalSymbol,
    }));
  }

  public async setProviderSymbolMapping(provider: string, internalSymbol: string, externalSymbol: string): Promise<void> {
    await this.init();
    const cleanSym = internalSymbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    await prisma.providerSymbolMapping.upsert({
      where: {
        provider_internalSymbol: {
          provider: provider.toUpperCase(),
          internalSymbol: cleanSym,
        },
      },
      update: { externalSymbol },
      create: {
        provider: provider.toUpperCase(),
        internalSymbol: cleanSym,
        externalSymbol,
      },
    });
  }

  // ----------------------------------------------------
  // MARKET CANDLES
  // ----------------------------------------------------

  public async getCandles(params: {
    symbol: string;
    timeframe: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<MarketCandle[]> {
    await this.init();
    const sym = params.symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const tf = params.timeframe.toUpperCase();

    const isRealMode = (process.env.MARKET_DATA_MODE || 'REAL').toUpperCase() === 'REAL';
    const where: any = {
      symbol: sym,
      timeframe: tf,
    };
    if (isRealMode) {
      where.source = 'TWELVEDATA';
    }

    if (params.startTime || params.endTime) {
      where.timestamp = {};
      if (params.startTime) where.timestamp.gte = new Date(params.startTime);
      if (params.endTime) where.timestamp.lte = new Date(params.endTime);
    }

    const candles = await prisma.marketCandle.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: params.limit || 500,
    });

    return candles.reverse().map(mapMarketCandle);
  }

  public async getLatestCandle(symbol: string, timeframe: string): Promise<MarketCandle | undefined> {
    await this.init();
    const sym = symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const tf = timeframe.toUpperCase();
    const isRealMode = (process.env.MARKET_DATA_MODE || 'REAL').toUpperCase() === 'REAL';

    const where: any = { symbol: sym, timeframe: tf };
    if (isRealMode) {
      where.source = 'TWELVEDATA';
    }

    const c = await prisma.marketCandle.findFirst({
      where,
      orderBy: { timestamp: 'desc' },
    });
    return c ? mapMarketCandle(c) : undefined;
  }

  public async upsertCandles(candles: Candle[]): Promise<{ upsertedCount: number; insertedCount?: number; updatedCount?: number }> {
    await this.init();
    if (!candles || candles.length === 0) return { upsertedCount: 0, insertedCount: 0, updatedCount: 0 };

    // Cache existing instrument IDs for fast foreign key linking
    const instruments = await prisma.instrument.findMany({ select: { id: true, symbol: true } });
    const instrumentIdMap = new Map(instruments.map((i) => [i.symbol, i.id]));

    const normalized = candles.map((c) => {
      const sym = (c.symbol || c.pair || 'EURUSD').toUpperCase().replace(/[\/\_\-\.]/g, '');
      const tf = (c.timeframe || 'H1').toUpperCase();
      const ts = new Date(c.timestamp);
      const instId = instrumentIdMap.get(sym) || null;
      return {
        symbol: sym,
        pair: sym,
        timeframe: tf,
        timestamp: ts,
        timestampMs: ts.getTime(),
        instrumentId: instId,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        source: c.source || 'TWELVEDATA',
        isClosed: c.isClosed !== false,
      };
    });

    const symbols = Array.from(new Set(normalized.map((c) => c.symbol)));
    const timeframes = Array.from(new Set(normalized.map((c) => c.timeframe)));
    const minTs = new Date(Math.min(...normalized.map((c) => c.timestampMs)));
    const maxTs = new Date(Math.max(...normalized.map((c) => c.timestampMs)));

    const existingRows = await prisma.marketCandle.findMany({
      where: {
        symbol: { in: symbols },
        timeframe: { in: timeframes },
        timestamp: { gte: minTs, lte: maxTs },
      },
      select: {
        symbol: true,
        timeframe: true,
        timestamp: true,
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
        source: true,
        isClosed: true,
      },
    });

    const existingMap = new Map<string, (typeof existingRows)[0]>();
    for (const row of existingRows) {
      existingMap.set(`${row.symbol}:${row.timeframe}:${row.timestamp.getTime()}`, row);
    }

    const toCreate: typeof normalized = [];
    const toUpdate: typeof normalized = [];

    // Always include the latest 2 candles in toUpdate if they exist so the forming/closing bar is guaranteed current
    const tailThresholdIdx = Math.max(0, normalized.length - 2);

    for (let idx = 0; idx < normalized.length; idx++) {
      const c = normalized[idx];
      const key = `${c.symbol}:${c.timeframe}:${c.timestampMs}`;
      const existing = existingMap.get(key);

      if (!existing) {
        toCreate.push(c);
      } else {
        const isTail = idx >= tailThresholdIdx;
        const hasDiff =
          isTail ||
          Math.abs(Number(existing.close) - c.close) > 1e-7 ||
          Math.abs(Number(existing.high) - c.high) > 1e-7 ||
          Math.abs(Number(existing.low) - c.low) > 1e-7 ||
          Math.abs(Number(existing.open) - c.open) > 1e-7 ||
          existing.isClosed !== c.isClosed ||
          existing.source !== c.source;

        if (hasDiff) {
          toUpdate.push(c);
        }
      }
    }

    if (toCreate.length > 0) {
      await prisma.marketCandle.createMany({
        data: toCreate.map((c) => ({
          id: crypto.randomUUID(),
          instrumentId: c.instrumentId,
          symbol: c.symbol,
          pair: c.pair,
          timeframe: c.timeframe,
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          source: c.source,
          isClosed: c.isClosed,
        })),
        skipDuplicates: true,
      });
    }

    const CHUNK_SIZE = 5;
    for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((c) =>
          prisma.marketCandle.upsert({
            where: {
              symbol_timeframe_timestamp: {
                symbol: c.symbol,
                timeframe: c.timeframe,
                timestamp: c.timestamp,
              },
            },
            update: {
              instrumentId: c.instrumentId,
              pair: c.pair,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
              source: c.source,
              isClosed: c.isClosed,
            },
            create: {
              instrumentId: c.instrumentId,
              symbol: c.symbol,
              pair: c.pair,
              timeframe: c.timeframe,
              timestamp: c.timestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
              source: c.source,
              isClosed: c.isClosed,
            },
          })
        )
      );
    }

    return {
      upsertedCount: normalized.length,
      insertedCount: toCreate.length,
      updatedCount: toUpdate.length,
    };
  }

  // ----------------------------------------------------
  // TECHNICAL INDICATORS
  // ----------------------------------------------------

  public async getTechnicalIndicators(
    symbol: string,
    timeframe: string,
    limit: number = 300
  ): Promise<TechnicalIndicator[]> {
    await this.init();
    const sym = symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const tf = timeframe.toUpperCase();

    const indicators = await prisma.technicalIndicator.findMany({
      where: { symbol: sym, timeframe: tf },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return indicators.reverse().map(mapTechnicalIndicator);
  }

  public async upsertTechnicalIndicators(indicators: TechnicalIndicator[]): Promise<void> {
    await this.init();
    if (!indicators || indicators.length === 0) return;

    const CHUNK_SIZE = 5;
    for (let i = 0; i < indicators.length; i += CHUNK_SIZE) {
      const chunk = indicators.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (ind) => {
          const sym = (ind.symbol || ind.pair || 'EURUSD').toUpperCase().replace(/[\/\_\-\.]/g, '');
          const tf = ind.timeframe.toUpperCase();
          const ts = new Date(ind.timestamp);

          await prisma.technicalIndicator.upsert({
            where: {
              symbol_timeframe_timestamp: {
                symbol: sym,
                timeframe: tf,
                timestamp: ts,
              },
            },
            update: {
              pair: sym,
              sma20: ind.sma20 ?? null,
              sma50: ind.sma50 ?? null,
              sma200: ind.sma200 ?? null,
              ema20: ind.ema20 ?? null,
              ema50: ind.ema50 ?? null,
              ema200: ind.ema200 ?? null,
              rsi14: ind.rsi14 ?? null,
              macd: ind.macd ?? null,
              macdSignal: ind.macdSignal ?? null,
              macdHistogram: ind.macdHistogram ?? null,
              atr14: ind.atr14 ?? null,
              atrPercent: ind.atrPercent ?? null,
              bbUpper: ind.bbUpper ?? null,
              bbMiddle: ind.bbMiddle ?? null,
              bbLower: ind.bbLower ?? null,
              bbWidth: ind.bbWidth ?? null,
              adx14: ind.adx14 ?? null,
              plusDI: ind.plusDI ?? null,
              minusDI: ind.minusDI ?? null,
              calculatedAt: new Date(),
              calculationVersion: ind.calculationVersion || '1.0.0',
            },
            create: {
              symbol: sym,
              pair: sym,
              timeframe: tf,
              timestamp: ts,
              sma20: ind.sma20 ?? null,
              sma50: ind.sma50 ?? null,
              sma200: ind.sma200 ?? null,
              ema20: ind.ema20 ?? null,
              ema50: ind.ema50 ?? null,
              ema200: ind.ema200 ?? null,
              rsi14: ind.rsi14 ?? null,
              macd: ind.macd ?? null,
              macdSignal: ind.macdSignal ?? null,
              macdHistogram: ind.macdHistogram ?? null,
              atr14: ind.atr14 ?? null,
              atrPercent: ind.atrPercent ?? null,
              bbUpper: ind.bbUpper ?? null,
              bbMiddle: ind.bbMiddle ?? null,
              bbLower: ind.bbLower ?? null,
              bbWidth: ind.bbWidth ?? null,
              adx14: ind.adx14 ?? null,
              plusDI: ind.plusDI ?? null,
              minusDI: ind.minusDI ?? null,
              calculatedAt: new Date(),
              calculationVersion: ind.calculationVersion || '1.0.0',
            },
          });
        })
      );
    }
  }

  // ----------------------------------------------------
  // MARKET ANALYSIS
  // ----------------------------------------------------

  public async getMarketAnalysis(symbol: string, timeframe: string = 'H1'): Promise<MarketAnalysis | undefined> {
    await this.init();
    const sym = symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const tf = timeframe.toUpperCase();

    const a = await prisma.marketAnalysis.findFirst({
      where: { symbol: sym, timeframe: tf },
      orderBy: { timestamp: 'desc' },
    });
    return a ? mapMarketAnalysis(a) : undefined;
  }

  public async upsertMarketAnalysis(analysis: MarketAnalysis): Promise<MarketAnalysis> {
    await this.init();
    const sym = (analysis.symbol || analysis.pair).toUpperCase().replace(/[\/\_\-\.]/g, '');
    const tf = analysis.timeframe.toUpperCase();

    const existing = await prisma.marketAnalysis.findFirst({
      where: { symbol: sym, timeframe: tf },
    });

    let saved: any;
    if (existing) {
      saved = await prisma.marketAnalysis.update({
        where: { id: existing.id },
        data: {
          overallBias:
            analysis.overallBias === 'BULLISH'
              ? PrismaMarketBias.BULLISH
              : analysis.overallBias === 'BEARISH'
              ? PrismaMarketBias.BEARISH
              : PrismaMarketBias.NEUTRAL,
          bias:
            analysis.bias === 'BULLISH'
              ? PrismaMarketBias.BULLISH
              : analysis.bias === 'BEARISH'
              ? PrismaMarketBias.BEARISH
              : PrismaMarketBias.NEUTRAL,
          trend: analysis.trend,
          trendStrength: analysis.trendStrength,
          structure: analysis.structure,
          structureState: analysis.structureState,
          momentum: analysis.momentum,
          volatility: analysis.volatility,
          currentPrice: analysis.currentPrice,
          keySupport: analysis.keySupport || 0,
          keyResistance: analysis.keyResistance || 0,
          nearestSupport: analysis.nearestSupport?.price ?? null,
          nearestResistance: analysis.nearestResistance?.price ?? null,
          multiTimeframe: (analysis.multiTimeframe as any) || null,
          dataQuality: analysis.dataQuality,
          dataStatus: analysis.dataStatus,
          explanation: analysis.explanation,
          lastUpdated: new Date(),
        },
      });
    } else {
      saved = await prisma.marketAnalysis.create({
        data: {
          id: analysis.id || crypto.randomUUID(),
          symbol: sym,
          pair: sym,
          timeframe: tf,
          overallBias:
            analysis.overallBias === 'BULLISH'
              ? PrismaMarketBias.BULLISH
              : analysis.overallBias === 'BEARISH'
              ? PrismaMarketBias.BEARISH
              : PrismaMarketBias.NEUTRAL,
          bias:
            analysis.bias === 'BULLISH'
              ? PrismaMarketBias.BULLISH
              : analysis.bias === 'BEARISH'
              ? PrismaMarketBias.BEARISH
              : PrismaMarketBias.NEUTRAL,
          trend: analysis.trend,
          trendStrength: analysis.trendStrength,
          structure: analysis.structure,
          structureState: analysis.structureState,
          momentum: analysis.momentum,
          volatility: analysis.volatility,
          currentPrice: analysis.currentPrice,
          keySupport: analysis.keySupport || 0,
          keyResistance: analysis.keyResistance || 0,
          nearestSupport: analysis.nearestSupport?.price ?? null,
          nearestResistance: analysis.nearestResistance?.price ?? null,
          multiTimeframe: (analysis.multiTimeframe as any) || null,
          dataQuality: analysis.dataQuality,
          dataStatus: analysis.dataStatus,
          explanation: analysis.explanation,
          lastUpdated: new Date(),
        },
      });
    }

    return mapMarketAnalysis(saved);
  }

  // ----------------------------------------------------
  // MARKET DATA STATUS
  // ----------------------------------------------------

  public async getMarketDataStatus(symbol: string, timeframe: string = 'H1'): Promise<MarketDataStatus | undefined> {
    await this.init();
    const sym = symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const tf = timeframe.toUpperCase();

    const s = await prisma.marketDataStatus.findUnique({
      where: {
        symbol_timeframe: { symbol: sym, timeframe: tf },
      },
    });
    return s ? mapMarketDataStatus(s) : undefined;
  }

  public async upsertMarketDataStatus(status: MarketDataStatus): Promise<MarketDataStatus> {
    await this.init();
    const sym = status.symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const tf = status.timeframe.toUpperCase();

    const upserted = await prisma.marketDataStatus.upsert({
      where: {
        symbol_timeframe: { symbol: sym, timeframe: tf },
      },
      update: {
        lastCandleTimestamp: status.lastCandleTimestamp ? new Date(status.lastCandleTimestamp) : null,
        lastSuccessfulSync: status.lastSuccessfulSync ? new Date(status.lastSuccessfulSync) : new Date(),
        provider: status.provider || 'Twelve Data',
        status: status.status || 'FRESH',
        dataQualityScore: status.dataQualityScore ?? 100,
        errorMessage: status.errorMessage || null,
      },
      create: {
        id: status.id || crypto.randomUUID(),
        symbol: sym,
        timeframe: tf,
        lastCandleTimestamp: status.lastCandleTimestamp ? new Date(status.lastCandleTimestamp) : null,
        lastSuccessfulSync: status.lastSuccessfulSync ? new Date(status.lastSuccessfulSync) : new Date(),
        provider: status.provider || 'Twelve Data',
        status: status.status || 'FRESH',
        dataQualityScore: status.dataQualityScore ?? 100,
        errorMessage: status.errorMessage || null,
      },
    });

    return mapMarketDataStatus(upserted);
  }

  /**
   * Database-backed atomic distributed lock for Vercel serverless multi-instance concurrency control.
   * Uses PostgreSQL ON CONFLICT ("symbol", "timeframe") DO UPDATE ... WHERE with automatic expiry/recovery.
   */
  public async acquireDistributedLock(params: {
    lockKey: string;
    lockId: string;
    leaseSeconds?: number;
  }): Promise<{ acquired: boolean; lockKey: string; lockId: string; reason?: string }> {
    await this.init();
    const { lockKey, lockId, leaseSeconds = 30 } = params;
    const lockSymbol = 'DIST_LOCK';
    const lockTimeframe = lockKey.toUpperCase();

    try {
      const acquireSql = `
        INSERT INTO "MarketDataStatus" ("id", "symbol", "timeframe", "status", "errorMessage", "lastSuccessfulSync", "lastCandleTimestamp", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, 'LOCKED', $3, NOW(), NOW() + ($4 || ' seconds')::interval, NOW())
        ON CONFLICT ("symbol", "timeframe") DO UPDATE
        SET "status" = 'LOCKED',
            "errorMessage" = EXCLUDED."errorMessage",
            "lastSuccessfulSync" = NOW(),
            "lastCandleTimestamp" = NOW() + ($4 || ' seconds')::interval,
            "updatedAt" = NOW()
        WHERE "MarketDataStatus"."status" != 'LOCKED'
           OR "MarketDataStatus"."lastCandleTimestamp" IS NULL
           OR "MarketDataStatus"."lastCandleTimestamp" < NOW()
        RETURNING "id", "errorMessage", "status";
      `;

      const rows: any[] = await prisma.$queryRawUnsafe(
        acquireSql,
        lockSymbol,
        lockTimeframe,
        lockId,
        String(leaseSeconds)
      );

      if (rows && rows.length > 0) {
        return { acquired: true, lockKey, lockId };
      }

      return {
        acquired: false,
        lockKey,
        lockId,
        reason: `Active distributed lock '${lockKey}' held by another serverless instance.`,
      };
    } catch (err: any) {
      console.warn(`[DatabaseStore] Warning acquiring distributed lock '${lockKey}':`, err?.message);
      return {
        acquired: false,
        lockKey,
        lockId,
        reason: `Database error acquiring distributed lock: ${err?.message}`,
      };
    }
  }

  /**
   * Safely releases a database-backed distributed lock if held by the matching lockId.
   */
  public async releaseDistributedLock(params: {
    lockKey: string;
    lockId: string;
  }): Promise<boolean> {
    await this.init();
    const { lockKey, lockId } = params;
    const lockSymbol = 'DIST_LOCK';
    const lockTimeframe = lockKey.toUpperCase();

    try {
      const releaseSql = `
        UPDATE "MarketDataStatus"
        SET "status" = 'IDLE',
            "errorMessage" = NULL,
            "lastCandleTimestamp" = NULL,
            "updatedAt" = NOW()
        WHERE "symbol" = $1 AND "timeframe" = $2 AND "errorMessage" = $3
        RETURNING "id";
      `;

      const rows: any[] = await prisma.$queryRawUnsafe(
        releaseSql,
        lockSymbol,
        lockTimeframe,
        lockId
      );

      return rows && rows.length > 0;
    } catch (err: any) {
      console.warn(`[DatabaseStore] Warning releasing distributed lock '${lockKey}':`, err?.message);
      return false;
    }
  }

  // ----------------------------------------------------
  // MARKET DATA GAPS
  // ----------------------------------------------------

  public async getMarketDataGaps(symbol?: string, timeframe?: string): Promise<MarketDataGap[]> {
    await this.init();
    const where: any = {};
    if (symbol) where.symbol = symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    if (timeframe) where.timeframe = timeframe.toUpperCase();

    const list = await prisma.marketDataGap.findMany({
      where,
      orderBy: { expectedTimestamp: 'asc' },
    });
    return list.map(mapMarketDataGap);
  }

  public async addMarketDataGap(gap: MarketDataGap): Promise<MarketDataGap> {
    await this.init();
    const created = await prisma.marketDataGap.create({
      data: {
        id: gap.id || crypto.randomUUID(),
        symbol: gap.symbol.toUpperCase().replace(/[\/\_\-\.]/g, ''),
        timeframe: gap.timeframe.toUpperCase(),
        expectedTimestamp: new Date(gap.expectedTimestamp),
        detectedAt: gap.detectedAt ? new Date(gap.detectedAt) : new Date(),
        status: gap.status || 'OPEN',
      },
    });
    return mapMarketDataGap(created);
  }

  // ----------------------------------------------------
  // DUAL-STAGE SIGNAL ALERT CONFIGS
  // ----------------------------------------------------

  /**
   * Ensures the default XAUUSD 4-timeframe (H4 -> H1 -> M15 -> M5) configuration is initialized first
   * for the user without activating all 11 symbols for continuous background polling by default.
   */
  public async ensureDefaultXauusdAlertConfig(userId: string): Promise<SignalAlertConfig[]> {
    await this.init();
    const existing = await prisma.signalAlertConfig.findMany({
      where: { userId },
      orderBy: [{ enabled: 'desc' }, { symbol: 'asc' }],
    });

    if (existing.length > 0) {
      // Automatically upgrade uncustomized v1 default XAUUSD (M15 -> H1) to the 4-timeframe chain (H4 -> H1 -> M15 -> M5)
      if (
        existing.length === 1 &&
        existing[0].symbol === 'XAUUSD' &&
        existing[0].primaryTimeframe === 'M15' &&
        existing[0].confirmationTimeframe === 'H1' &&
        existing[0].configVersion === 1
      ) {
        const upgraded = await prisma.signalAlertConfig.update({
          where: { id: existing[0].id },
          data: {
            htfDirectionTimeframe: 'H4',
            htfConfirmationTimeframe: 'H1',
            primaryTimeframe: 'M15',
            confirmationTimeframe: 'M5',
          },
        });
        return [mapSignalAlertConfig(upgraded)];
      }
      return existing.map(mapSignalAlertConfig);
    }

    const defaultRecipient = (process.env.WHATSAPP_RECIPIENT_NUMBER || '').trim() || null;
    const created = await prisma.signalAlertConfig.create({
      data: {
        userId,
        symbol: 'XAUUSD',
        enabled: true,
        htfDirectionTimeframe: 'H4',
        htfConfirmationTimeframe: 'H1',
        primaryTimeframe: 'M15',
        confirmationTimeframe: 'M5',
        initialScoreThreshold: 65,
        confirmationScoreThreshold: 65,
        requireClosedCandle: true,
        requireTrendAlignment: true,
        requireStructureAlignment: true,
        requireMomentumAlignment: false,
        minAdx: 18.0,
        expirationMinutes: 240,
        invalidationPolicy: 'OPPOSITE_OR_STOP',
        enableInitialAlert: true,
        enableConfirmationAlert: true,
        whatsappEnabled: false,
        whatsappRecipient: defaultRecipient,
        useTemplateMessage: false,
        templateLanguage: 'en_US',
        configVersion: 1,
      },
    });

    return [mapSignalAlertConfig(created)];
  }

  public async getSignalAlertConfigsByUserId(userId: string): Promise<SignalAlertConfig[]> {
    return this.ensureDefaultXauusdAlertConfig(userId);
  }

  public async getEnabledSignalAlertConfigs(params?: {
    userId?: string;
    symbol?: string;
  }): Promise<SignalAlertConfig[]> {
    await this.init();
    const where: any = { enabled: true };
    if (params?.userId) where.userId = params.userId;
    if (params?.symbol) where.symbol = params.symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');

    const list = await prisma.signalAlertConfig.findMany({
      where,
      orderBy: [{ symbol: 'asc' }, { updatedAt: 'desc' }],
    });
    return list.map(mapSignalAlertConfig);
  }

  public async getSignalAlertConfigById(id: string): Promise<SignalAlertConfig | undefined> {
    await this.init();
    const c = await prisma.signalAlertConfig.findUnique({ where: { id } });
    return c ? mapSignalAlertConfig(c) : undefined;
  }

  public async upsertSignalAlertConfig(
    userId: string,
    input: Partial<SignalAlertConfig> & {
      symbol: string;
      primaryTimeframe: Timeframe;
      confirmationTimeframe: Timeframe;
    }
  ): Promise<SignalAlertConfig> {
    await this.init();
    const sym = input.symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    const pTf = input.primaryTimeframe.toUpperCase();
    const cTf = input.confirmationTimeframe.toUpperCase();

    const htfDirTf = (input.htfDirectionTimeframe || 'H4').toUpperCase();
    const htfConfTf = (input.htfConfirmationTimeframe || 'H1').toUpperCase();

    if (input.id) {
      const existingById = await prisma.signalAlertConfig.findFirst({
        where: { id: input.id, userId },
      });
      if (existingById) {
        const recipientChanged =
          input.whatsappRecipient !== undefined &&
          (input.whatsappRecipient || null) !== (existingById.whatsappRecipient || null);
        const updated = await prisma.signalAlertConfig.update({
          where: { id: existingById.id },
          data: {
            symbol: sym,
            htfDirectionTimeframe: htfDirTf,
            htfConfirmationTimeframe: htfConfTf,
            primaryTimeframe: pTf,
            confirmationTimeframe: cTf,
            ...(input.enabled !== undefined ? { enabled: Boolean(input.enabled) } : {}),
            ...(input.initialScoreThreshold !== undefined ? { initialScoreThreshold: Number(input.initialScoreThreshold) } : {}),
            ...(input.confirmationScoreThreshold !== undefined ? { confirmationScoreThreshold: Number(input.confirmationScoreThreshold) } : {}),
            ...(input.requireClosedCandle !== undefined ? { requireClosedCandle: Boolean(input.requireClosedCandle) } : {}),
            ...(input.requireTrendAlignment !== undefined ? { requireTrendAlignment: Boolean(input.requireTrendAlignment) } : {}),
            ...(input.requireStructureAlignment !== undefined ? { requireStructureAlignment: Boolean(input.requireStructureAlignment) } : {}),
            ...(input.requireMomentumAlignment !== undefined ? { requireMomentumAlignment: Boolean(input.requireMomentumAlignment) } : {}),
            ...(input.minAdx !== undefined ? { minAdx: Number(input.minAdx) } : {}),
            ...(input.expirationMinutes !== undefined ? { expirationMinutes: Number(input.expirationMinutes) } : {}),
            ...(input.invalidationPolicy !== undefined ? { invalidationPolicy: input.invalidationPolicy } : {}),
            ...(input.enableInitialAlert !== undefined ? { enableInitialAlert: Boolean(input.enableInitialAlert) } : {}),
            ...(input.enableConfirmationAlert !== undefined ? { enableConfirmationAlert: Boolean(input.enableConfirmationAlert) } : {}),
            ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: Boolean(input.whatsappEnabled) } : {}),
            ...(input.whatsappRecipient !== undefined ? { whatsappRecipient: input.whatsappRecipient || null } : {}),
            ...(recipientChanged ? { lastVerifiedTestAt: null } : {}),
            ...(input.useTemplateMessage !== undefined ? { useTemplateMessage: Boolean(input.useTemplateMessage) } : {}),
            ...(input.initialTemplateName !== undefined ? { initialTemplateName: input.initialTemplateName || null } : {}),
            ...(input.confirmationTemplateName !== undefined ? { confirmationTemplateName: input.confirmationTemplateName || null } : {}),
            ...(input.templateLanguage !== undefined ? { templateLanguage: input.templateLanguage || 'en_US' } : {}),
            configVersion: { increment: 1 },
          },
        });
        return mapSignalAlertConfig(updated);
      }
    }

    const existingComposite = await prisma.signalAlertConfig.findUnique({
      where: {
        userId_symbol_primaryTimeframe_confirmationTimeframe: {
          userId,
          symbol: sym,
          primaryTimeframe: pTf,
          confirmationTimeframe: cTf,
        },
      },
    });
    const compositeRecipientChanged =
      existingComposite &&
      input.whatsappRecipient !== undefined &&
      (input.whatsappRecipient || null) !== (existingComposite.whatsappRecipient || null);

    const upserted = await prisma.signalAlertConfig.upsert({
      where: {
        userId_symbol_primaryTimeframe_confirmationTimeframe: {
          userId,
          symbol: sym,
          primaryTimeframe: pTf,
          confirmationTimeframe: cTf,
        },
      },
      update: {
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        ...(input.enabled !== undefined ? { enabled: Boolean(input.enabled) } : {}),
        ...(input.initialScoreThreshold !== undefined ? { initialScoreThreshold: Number(input.initialScoreThreshold) } : {}),
        ...(input.confirmationScoreThreshold !== undefined ? { confirmationScoreThreshold: Number(input.confirmationScoreThreshold) } : {}),
        ...(input.requireClosedCandle !== undefined ? { requireClosedCandle: Boolean(input.requireClosedCandle) } : {}),
        ...(input.requireTrendAlignment !== undefined ? { requireTrendAlignment: Boolean(input.requireTrendAlignment) } : {}),
        ...(input.requireStructureAlignment !== undefined ? { requireStructureAlignment: Boolean(input.requireStructureAlignment) } : {}),
        ...(input.requireMomentumAlignment !== undefined ? { requireMomentumAlignment: Boolean(input.requireMomentumAlignment) } : {}),
        ...(input.minAdx !== undefined ? { minAdx: Number(input.minAdx) } : {}),
        ...(input.expirationMinutes !== undefined ? { expirationMinutes: Number(input.expirationMinutes) } : {}),
        ...(input.invalidationPolicy !== undefined ? { invalidationPolicy: input.invalidationPolicy } : {}),
        ...(input.enableInitialAlert !== undefined ? { enableInitialAlert: Boolean(input.enableInitialAlert) } : {}),
        ...(input.enableConfirmationAlert !== undefined ? { enableConfirmationAlert: Boolean(input.enableConfirmationAlert) } : {}),
        ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: Boolean(input.whatsappEnabled) } : {}),
        ...(input.whatsappRecipient !== undefined ? { whatsappRecipient: input.whatsappRecipient || null } : {}),
        ...(compositeRecipientChanged ? { lastVerifiedTestAt: null } : {}),
        ...(input.useTemplateMessage !== undefined ? { useTemplateMessage: Boolean(input.useTemplateMessage) } : {}),
        ...(input.initialTemplateName !== undefined ? { initialTemplateName: input.initialTemplateName || null } : {}),
        ...(input.confirmationTemplateName !== undefined ? { confirmationTemplateName: input.confirmationTemplateName || null } : {}),
        ...(input.templateLanguage !== undefined ? { templateLanguage: input.templateLanguage || 'en_US' } : {}),
        configVersion: { increment: 1 },
      },
      create: {
        userId,
        symbol: sym,
        enabled: input.enabled ?? true,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        initialScoreThreshold: input.initialScoreThreshold ?? 65,
        confirmationScoreThreshold: input.confirmationScoreThreshold ?? 65,
        requireClosedCandle: input.requireClosedCandle ?? true,
        requireTrendAlignment: input.requireTrendAlignment ?? true,
        requireStructureAlignment: input.requireStructureAlignment ?? true,
        requireMomentumAlignment: input.requireMomentumAlignment ?? false,
        minAdx: input.minAdx ?? 18.0,
        expirationMinutes: input.expirationMinutes ?? 240,
        invalidationPolicy: input.invalidationPolicy || 'OPPOSITE_OR_STOP',
        enableInitialAlert: input.enableInitialAlert ?? true,
        enableConfirmationAlert: input.enableConfirmationAlert ?? true,
        whatsappEnabled: input.whatsappEnabled ?? false,
        whatsappRecipient: input.whatsappRecipient || null,
        useTemplateMessage: input.useTemplateMessage ?? false,
        initialTemplateName: input.initialTemplateName || null,
        confirmationTemplateName: input.confirmationTemplateName || null,
        templateLanguage: input.templateLanguage || 'en_US',
        configVersion: 1,
      },
    });

    return mapSignalAlertConfig(upserted);
  }

  public async deleteSignalAlertConfig(id: string, userId: string): Promise<boolean> {
    await this.init();
    const existing = await prisma.signalAlertConfig.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await prisma.signalAlertConfig.delete({ where: { id } });
    return true;
  }

  public async markWhatsAppVerifiedForUser(userId: string, verifiedAt: Date = new Date()): Promise<void> {
    await this.init();
    await prisma.signalAlertConfig.updateMany({
      where: { userId },
      data: { lastVerifiedTestAt: verifiedAt },
    });
  }

  // ----------------------------------------------------
  // SIGNAL LIFECYCLE EVENTS & EVALUATION RECORDS
  // ----------------------------------------------------

  public async getSignalLifecycleEvents(params: {
    userId?: string;
    symbol?: string;
    lifecycleStatus?: string;
    limit?: number;
  }): Promise<SignalLifecycleEvent[]> {
    await this.init();
    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.symbol) where.symbol = params.symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');
    if (params.lifecycleStatus) where.lifecycleStatus = params.lifecycleStatus;

    const events = await prisma.signalLifecycleEvent.findMany({
      where,
      include: {
        evaluations: {
          orderBy: { evaluatedAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
    });

    return events.map(mapSignalLifecycleEvent);
  }

  public async getSignalLifecycleEventById(id: string): Promise<SignalLifecycleEvent | undefined> {
    await this.init();
    const ev = await prisma.signalLifecycleEvent.findUnique({
      where: { id },
      include: {
        evaluations: {
          orderBy: { evaluatedAt: 'asc' },
        },
      },
    });
    return ev ? mapSignalLifecycleEvent(ev) : undefined;
  }

  public async getSignalLifecycleEventByIdempotencyKey(
    idempotencyKey: string
  ): Promise<SignalLifecycleEvent | undefined> {
    await this.init();
    const ev = await prisma.signalLifecycleEvent.findUnique({
      where: { idempotencyKey },
      include: {
        evaluations: {
          orderBy: { evaluatedAt: 'asc' },
        },
      },
    });
    return ev ? mapSignalLifecycleEvent(ev) : undefined;
  }

  public async getPendingConfirmationEvents(params?: {
    userId?: string;
    symbol?: string;
  }): Promise<SignalLifecycleEvent[]> {
    await this.init();
    const where: any = {
      lifecycleStatus: 'PENDING_CONFIRMATION',
    };
    if (params?.userId) where.userId = params.userId;
    if (params?.symbol) where.symbol = params.symbol.toUpperCase().replace(/[\/\_\-\.]/g, '');

    const list = await prisma.signalLifecycleEvent.findMany({
      where,
      include: {
        evaluations: {
          orderBy: { evaluatedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return list.map(mapSignalLifecycleEvent);
  }

  public async createSignalLifecycleEvent(
    event: Omit<SignalLifecycleEvent, 'createdAt' | 'updatedAt' | 'evaluations'>,
    initialEval?: Omit<SignalEvaluationRecord, 'id' | 'signalEventId' | 'evaluatedAt'>
  ): Promise<SignalLifecycleEvent> {
    await this.init();

    // Idempotent check first
    const existing = await prisma.signalLifecycleEvent.findUnique({
      where: { idempotencyKey: event.idempotencyKey },
      include: { evaluations: true },
    });
    if (existing) {
      return mapSignalLifecycleEvent(existing);
    }

    try {
      const created = await prisma.signalLifecycleEvent.create({
        data: {
          id: event.id || crypto.randomUUID(),
          userId: event.userId,
          configId: event.configId || null,
          signalRunId: event.signalRunId || null,
          idempotencyKey: event.idempotencyKey,
          confirmationIdempotencyKey: event.confirmationIdempotencyKey || null,
          symbol: event.symbol.toUpperCase().replace(/[\/\_\-\.]/g, ''),
          direction: event.direction === 'SELL' ? 'SELL' : 'BUY',
          htfDirectionTimeframe: (event.htfDirectionTimeframe || 'H4').toUpperCase(),
          htfConfirmationTimeframe: (event.htfConfirmationTimeframe || 'H1').toUpperCase(),
          primaryTimeframe: event.primaryTimeframe.toUpperCase(),
          confirmationTimeframe: event.confirmationTimeframe.toUpperCase(),
          h4Direction: event.h4Direction || null,
          h1Trend: event.h1Trend || null,
          m15PullbackValid: Boolean(event.m15PullbackValid),
          m15PullbackReason: event.m15PullbackReason || null,
          m5BosDetected: Boolean(event.m5BosDetected),
          m5CandleConfirmed: Boolean(event.m5CandleConfirmed),
          primaryCandleTimestamp: new Date(event.primaryCandleTimestamp),
          isClosedCandle: event.isClosedCandle,
          referencePrice: event.referencePrice,
          entryPrice: event.entryPrice,
          stopLoss: event.stopLoss,
          takeProfit1: event.takeProfit1,
          takeProfit2: event.takeProfit2 ?? null,
          riskReward: event.riskReward,
          initialScore: event.initialScore,
          initialStatus: event.initialStatus,
          lifecycleStatus: event.lifecycleStatus,
          initialNotificationStatus: event.initialNotificationStatus || 'NOT_QUEUED',
          confirmationNotificationStatus: event.confirmationNotificationStatus || 'NOT_QUEUED',
          dataFreshnessStatus: event.dataFreshnessStatus || 'CURRENT',
          initialExplanation: event.initialExplanation,
          expiresAt: new Date(event.expiresAt),
          lastEvaluatedAt: event.lastEvaluatedAt ? new Date(event.lastEvaluatedAt) : new Date(),
          evaluationCount: event.evaluationCount ?? 1,
          ...(initialEval
            ? {
                evaluations: {
                  create: {
                    stage: initialEval.stage,
                    timeframe: initialEval.timeframe,
                    candleTimestamp: initialEval.candleTimestamp ? new Date(initialEval.candleTimestamp) : null,
                    evaluatedPrice: initialEval.evaluatedPrice ?? null,
                    score: initialEval.score ?? null,
                    resultStatus: initialEval.resultStatus,
                    satisfiedRules: initialEval.satisfiedRules || [],
                    failedRules: initialEval.failedRules || [],
                    reason: initialEval.reason,
                    dataFreshness: initialEval.dataFreshness || 'CURRENT',
                  },
                },
              }
            : {}),
        },
        include: {
          evaluations: {
            orderBy: { evaluatedAt: 'asc' },
          },
        },
      });

      return mapSignalLifecycleEvent(created);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const raceExisting = await prisma.signalLifecycleEvent.findUnique({
          where: { idempotencyKey: event.idempotencyKey },
          include: {
            evaluations: {
              orderBy: { evaluatedAt: 'asc' },
            },
          },
        });
        if (raceExisting) {
          return mapSignalLifecycleEvent(raceExisting);
        }
      }
      throw err;
    }
  }

  public async updateSignalLifecycleEvent(
    id: string,
    updates: Partial<SignalLifecycleEvent>,
    evaluationRecord?: Omit<SignalEvaluationRecord, 'id' | 'signalEventId' | 'evaluatedAt'>
  ): Promise<SignalLifecycleEvent> {
    await this.init();
    const data: any = {
      lastEvaluatedAt: new Date(),
    };

    if (updates.lifecycleStatus !== undefined) data.lifecycleStatus = updates.lifecycleStatus;
    if (updates.initialNotificationStatus !== undefined) {
      data.initialNotificationStatus = updates.initialNotificationStatus;
    }
    if (updates.confirmationNotificationStatus !== undefined) {
      data.confirmationNotificationStatus = updates.confirmationNotificationStatus;
    }
    if (updates.confirmationIdempotencyKey !== undefined) {
      data.confirmationIdempotencyKey = updates.confirmationIdempotencyKey;
    }
    if (updates.confirmationScore !== undefined) data.confirmationScore = updates.confirmationScore;
    if (updates.confirmationCandleTimestamp !== undefined) {
      data.confirmationCandleTimestamp = updates.confirmationCandleTimestamp
        ? new Date(updates.confirmationCandleTimestamp)
        : null;
    }
    if (updates.confirmedAt !== undefined) {
      data.confirmedAt = updates.confirmedAt ? new Date(updates.confirmedAt) : null;
    }
    if (updates.confirmationReason !== undefined) data.confirmationReason = updates.confirmationReason;
    if (updates.expiredAt !== undefined) {
      data.expiredAt = updates.expiredAt ? new Date(updates.expiredAt) : null;
    }
    if (updates.expirationReason !== undefined) data.expirationReason = updates.expirationReason;
    if (updates.invalidatedAt !== undefined) {
      data.invalidatedAt = updates.invalidatedAt ? new Date(updates.invalidatedAt) : null;
    }
    if (updates.invalidationReason !== undefined) data.invalidationReason = updates.invalidationReason;
    if (updates.conflictingDirection !== undefined) data.conflictingDirection = updates.conflictingDirection;
    if (updates.h4Direction !== undefined) data.h4Direction = updates.h4Direction;
    if (updates.h1Trend !== undefined) data.h1Trend = updates.h1Trend;
    if (updates.m15PullbackValid !== undefined) data.m15PullbackValid = Boolean(updates.m15PullbackValid);
    if (updates.m15PullbackReason !== undefined) data.m15PullbackReason = updates.m15PullbackReason;
    if (updates.m5BosDetected !== undefined) data.m5BosDetected = Boolean(updates.m5BosDetected);
    if (updates.m5CandleConfirmed !== undefined) data.m5CandleConfirmed = Boolean(updates.m5CandleConfirmed);
    if (evaluationRecord) {
      data.evaluationCount = { increment: 1 };
      data.evaluations = {
        create: {
          stage: evaluationRecord.stage,
          timeframe: evaluationRecord.timeframe,
          candleTimestamp: evaluationRecord.candleTimestamp ? new Date(evaluationRecord.candleTimestamp) : null,
          evaluatedPrice: evaluationRecord.evaluatedPrice ?? null,
          score: evaluationRecord.score ?? null,
          resultStatus: evaluationRecord.resultStatus,
          satisfiedRules: evaluationRecord.satisfiedRules || [],
          failedRules: evaluationRecord.failedRules || [],
          reason: evaluationRecord.reason,
          dataFreshness: evaluationRecord.dataFreshness || 'CURRENT',
        },
      };
    }

    try {
      const updated = await prisma.signalLifecycleEvent.update({
        where: { id },
        data,
        include: {
          evaluations: {
            orderBy: { evaluatedAt: 'asc' },
          },
        },
      });

      return mapSignalLifecycleEvent(updated);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const raceExisting = await prisma.signalLifecycleEvent.findUnique({
          where: { id },
          include: {
            evaluations: {
              orderBy: { evaluatedAt: 'asc' },
            },
          },
        });
        if (raceExisting) {
          return mapSignalLifecycleEvent(raceExisting);
        }
      }
      throw err;
    }
  }

  // ----------------------------------------------------
  // WHATSAPP NOTIFICATION JOBS & ATTEMPTS
  // ----------------------------------------------------

  public async getNotificationJobByIdempotencyKey(
    idempotencyKey: string
  ): Promise<NotificationJob | undefined> {
    await this.init();
    const job = await prisma.notificationJob.findUnique({
      where: { idempotencyKey },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
    return job ? mapNotificationJob(job) : undefined;
  }

  public async createNotificationJob(
    job: Omit<NotificationJob, 'createdAt' | 'updatedAt' | 'attempts'>
  ): Promise<NotificationJob> {
    await this.init();
    const existing = await prisma.notificationJob.findUnique({
      where: { idempotencyKey: job.idempotencyKey },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
    if (existing) {
      return mapNotificationJob(existing);
    }

    try {
      const created = await prisma.notificationJob.create({
        data: {
          id: job.id || crypto.randomUUID(),
          userId: job.userId,
          signalEventId: job.signalEventId || null,
          notificationType: job.notificationType,
          idempotencyKey: job.idempotencyKey,
          channel: job.channel || 'WHATSAPP',
          recipient: job.recipient,
          payloadJson: job.payloadJson as any,
          messageBody: job.messageBody,
          status: job.status || 'PENDING',
          attemptCount: job.attemptCount ?? 0,
          maxAttempts: job.maxAttempts ?? 3,
          nextRetryAt: job.nextRetryAt ? new Date(job.nextRetryAt) : new Date(),
          isAmbiguousTimeout: job.isAmbiguousTimeout ?? false,
        },
        include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
      });

      return mapNotificationJob(created);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const raceExisting = await prisma.notificationJob.findUnique({
          where: { idempotencyKey: job.idempotencyKey },
          include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
        });
        if (raceExisting) {
          return mapNotificationJob(raceExisting);
        }
      }
      throw err;
    }
  }

  public async getPendingNotificationJobs(limit: number = 15, userId?: string): Promise<NotificationJob[]> {
    await this.init();
    const now = new Date();
    const where: any = {
      status: { in: ['PENDING', 'RETRY_SCHEDULED'] },
      isAmbiguousTimeout: false,
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    };
    if (userId) {
      where.userId = userId;
    }
    const jobs = await prisma.notificationJob.findMany({
      where,
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return jobs.map(mapNotificationJob);
  }

  public async getNotificationJobsByUserId(userId: string, limit: number = 40): Promise<NotificationJob[]> {
    await this.init();
    const jobs = await prisma.notificationJob.findMany({
      where: { userId },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return jobs.map(mapNotificationJob);
  }

  public async recordNotificationAttempt(params: {
    jobId: string;
    status: 'SENT' | 'FAILED' | 'TIMEOUT_AMBIGUOUS';
    httpStatus?: number | null;
    providerMessageId?: string | null;
    errorCode?: string | null;
    sanitizedResponse?: string | null;
    durationMs: number;
    nextRetryAt?: Date | null;
    isAmbiguousTimeout?: boolean;
  }): Promise<NotificationJob> {
    await this.init();
    const current = await prisma.notificationJob.findUnique({ where: { id: params.jobId } });
    if (!current) {
      throw new Error(`NotificationJob not found: ${params.jobId}`);
    }

    const attemptNumber = current.attemptCount + 1;
    let nextJobStatus: NotificationJobStatus = 'FAILED';

    if (params.status === 'SENT') {
      nextJobStatus = 'SENT';
    } else if (params.isAmbiguousTimeout || params.status === 'TIMEOUT_AMBIGUOUS') {
      // Never auto-retry an ambiguous timeout to avoid duplicate WhatsApp message spam
      nextJobStatus = 'FAILED';
    } else if (params.nextRetryAt && attemptNumber < current.maxAttempts) {
      nextJobStatus = 'RETRY_SCHEDULED';
    } else {
      nextJobStatus = 'FAILED';
    }

    const updated = await prisma.notificationJob.update({
      where: { id: params.jobId },
      data: {
        status: nextJobStatus,
        attemptCount: attemptNumber,
        lastAttemptAt: new Date(),
        sentAt: params.status === 'SENT' ? new Date() : current.sentAt,
        providerMessageId: params.providerMessageId || current.providerMessageId,
        sanitizedError:
          params.status === 'SENT'
            ? null
            : params.sanitizedResponse || params.errorCode || 'Delivery attempt failed',
        nextRetryAt: nextJobStatus === 'RETRY_SCHEDULED' ? params.nextRetryAt : null,
        isAmbiguousTimeout: Boolean(params.isAmbiguousTimeout || params.status === 'TIMEOUT_AMBIGUOUS'),
        attempts: {
          create: {
            attemptNumber,
            status: params.status,
            httpStatus: params.httpStatus ?? null,
            providerMessageId: params.providerMessageId || null,
            errorCode: params.errorCode || null,
            sanitizedResponse: params.sanitizedResponse || null,
            durationMs: params.durationMs,
          },
        },
      },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });

    // Sync delivery status back to SignalLifecycleEvent if linked (without altering signal lifecycleStatus!)
    if (updated.signalEventId) {
      const deliveryStatus: SignalNotificationDeliveryStatus =
        nextJobStatus === 'SENT'
          ? 'NOTIFICATION_SENT'
          : nextJobStatus === 'RETRY_SCHEDULED'
          ? 'NOTIFICATION_PENDING'
          : 'NOTIFICATION_FAILED';

      const fieldToUpdate =
        updated.notificationType === 'CONFIRMED_SIGNAL'
          ? { confirmationNotificationStatus: deliveryStatus }
          : updated.notificationType === 'INITIAL_SIGNAL'
          ? { initialNotificationStatus: deliveryStatus }
          : {};

      if (Object.keys(fieldToUpdate).length > 0) {
        await prisma.signalLifecycleEvent
          .update({
            where: { id: updated.signalEventId },
            data: fieldToUpdate,
          })
          .catch(() => {});
      }
    }

    return mapNotificationJob(updated);
  }
}

export const db = new DatabaseStore();
