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
    await this.init();
    const data: any = {};
    if (updates.status !== undefined) {
      data.status =
        updates.status === 'CLOSED'
          ? PrismaTradeStatus.CLOSED
          : updates.status === 'CANCELLED'
          ? PrismaTradeStatus.CANCELLED
          : PrismaTradeStatus.OPEN;
    }
    if (updates.exitPrice !== undefined) data.exitPrice = updates.exitPrice;
    if (updates.exitTime !== undefined) data.exitTime = updates.exitTime ? new Date(updates.exitTime) : null;
    if (updates.grossPnL !== undefined) data.grossPnL = updates.grossPnL;
    if (updates.netPnL !== undefined) data.netPnL = updates.netPnL;
    if (updates.fees !== undefined) data.fees = updates.fees;
    if (updates.pnlPercent !== undefined) data.pnlPercent = updates.pnlPercent;
    if (updates.rMultiple !== undefined) data.rMultiple = updates.rMultiple;
    if (updates.exitReason !== undefined) data.exitReason = updates.exitReason;
    if (updates.notes !== undefined) data.notes = updates.notes;
    if (updates.psychology !== undefined) data.psychology = updates.psychology;
    if (updates.mistakeTags !== undefined) data.mistakeTags = updates.mistakeTags;
    if (updates.setupId !== undefined) data.setupId = updates.setupId;

    const updated = await prisma.trade.update({
      where: { id },
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
}

export const db = new DatabaseStore();
