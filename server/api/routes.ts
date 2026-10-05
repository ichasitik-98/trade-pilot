import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { db } from '../db/storage.ts';
import {
  hashPassword,
  comparePassword,
  createSession,
  getSession,
  destroySession,
  assertOwnership,
  sanitizeUser,
} from '../auth/session.ts';
import {
  calculateRMultiple,
  calculateTradeStatistics,
  calculateEquityAndDrawdown,
  roundTo,
} from '../engines/statistics.ts';
import {
  computeAllIndicators,
} from '../engines/indicators.ts';
import {
  analyzeMarketStructure,
} from '../engines/market-structure.ts';
import {
  evaluateSignal,
} from '../engines/signal-scoring.ts';
import {
  calculatePositionSize,
  checkPortfolioRisk,
} from '../engines/risk.ts';
import {
  defaultMarketDataProvider,
  normalizeSymbol,
  parseTimeframe,
} from '../providers/market-data/index.ts';
import { MarketDataSyncService } from '../services/market-data-sync.ts';
import { MultiTimeframeAnalysisService } from '../services/multi-timeframe.ts';
import { parseToUtcTimestamp } from '../utils/timezone.ts';
import { Trade, TradeDirection, TradeStatus, Timeframe } from '../types/index.ts';

export const apiRouter = Router();

// Express 4 Async Error Forwarding Wrapper:
// Automatically forwards any rejected promise from async route handlers or middleware to next(err).
const asyncMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;
for (const method of asyncMethods) {
  const original = (apiRouter as any)[method].bind(apiRouter);
  (apiRouter as any)[method] = (path: any, ...handlers: any[]) => {
    const wrapped = handlers.map((fn) =>
      typeof fn === 'function'
        ? (req: Request, res: Response, next: any) => {
            Promise.resolve(fn(req, res, next)).catch(next);
          }
        : fn
    );
    return original(path, ...wrapped);
  };
}

// Database Health Check Endpoint (Public / Monitoring)
apiRouter.get('/health/database', async (req: Request, res: Response) => {
  try {
    const { prisma } = await import('../db/prisma.ts');
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: 'healthy', database: 'postgresql' });
  } catch (err: any) {
    return res.status(503).json({ status: 'unhealthy', error: 'Database connection failure' });
  }
});

// Middleware: Authenticate Request via Bearer Token or Cookie
export async function authenticate(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies?.session_token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const user = await db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found or disabled' });
  }

  (req as any).user = user;
  (req as any).session = session;
  next();
}

// ----------------------------------------------------
// 1. AUTHENTICATION ROUTES
// ----------------------------------------------------

const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { name, email, password } = parsed.data;
    const existing = await db.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const userId = 'usr_' + crypto.randomUUID().slice(0, 8);
    const newUser = await db.createUser({
      id: userId,
      name,
      email,
      passwordHash,
      role: 'USER',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create default account
    const accId = 'acc_' + crypto.randomUUID().slice(0, 8);
    await db.createAccount(
      {
        id: accId,
        userId,
        name: 'Default Trading Account',
        broker: 'Demo Broker',
        currency: 'USD',
        balance: 10000.0,
        equity: 10000.0,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'risk_' + crypto.randomUUID().slice(0, 8),
        accountId: accId,
        riskPerTradePercent: 1.0,
        maxDailyRiskPercent: 3.0,
        maxPortfolioRiskPercent: 5.0,
        minRiskRewardRatio: 1.5,
        maxOpenPositions: 5,
      }
    );

    await db.addAuditLog({
      userId,
      action: 'ACCOUNT_CREATED',
      entity: 'USER',
      entityId: userId,
      details: 'Registered new user account',
      ipAddress: req.ip,
    });

    const token = createSession(newUser);
    return res.status(201).json({
      token,
      user: sanitizeUser(newUser),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Registration failed' });
  }
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid email and password required' });
    }

    const { email, password } = parsed.data;
    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await comparePassword(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createSession(user);

    await db.addAuditLog({
      userId: user.id,
      action: 'LOGIN',
      entity: 'USER',
      entityId: user.id,
      details: 'User authenticated successfully',
      ipAddress: req.ip,
    });

    return res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Login process encountered an error' });
  }
});

apiRouter.post('/auth/logout', authenticate, async (req: Request, res: Response) => {
  const session = (req as any).session;
  const user = (req as any).user;
  destroySession(session?.token);

  await db.addAuditLog({
    userId: user.id,
    action: 'LOGOUT',
    entity: 'USER',
    entityId: user.id,
    details: 'User logged out',
    ipAddress: req.ip,
  });

  return res.json({ message: 'Logged out successfully' });
});

apiRouter.get('/auth/me', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({ user: sanitizeUser(user) });
});

// ----------------------------------------------------
// 2. ACCOUNTS & RISK
// ----------------------------------------------------

apiRouter.get('/accounts', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const accounts = await db.getAccountsByUserId(user.id);
  return res.json({ accounts });
});

apiRouter.post('/accounts', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const schema = z.object({
    name: z.string().min(2),
    broker: z.string().default('Demo Broker'),
    currency: z.string().default('USD'),
    initialBalance: z.number().positive().default(10000),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const accId = 'acc_' + crypto.randomUUID().slice(0, 8);
  const account = await db.createAccount(
    {
      id: accId,
      userId: user.id,
      name: parsed.data.name,
      broker: parsed.data.broker,
      currency: parsed.data.currency,
      balance: parsed.data.initialBalance,
      equity: parsed.data.initialBalance,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'risk_' + crypto.randomUUID().slice(0, 8),
      accountId: accId,
      riskPerTradePercent: 1.0,
      maxDailyRiskPercent: 3.0,
      maxPortfolioRiskPercent: 5.0,
      minRiskRewardRatio: 1.5,
      maxOpenPositions: 5,
    }
  );

  await db.addAuditLog({
    userId: user.id,
    action: 'ACCOUNT_CREATED',
    entity: 'TRADING_ACCOUNT',
    entityId: accId,
    details: `Created trading account "${parsed.data.name}"`,
    ipAddress: req.ip,
  });

  return res.status(201).json({ account });
});

apiRouter.get('/accounts/:id/risk', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const account = await db.getAccountById(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  assertOwnership(account.userId, user.id, user.role);

  const risk = await db.getRiskSettingByAccountId(req.params.id);
  return res.json({ risk });
});

apiRouter.put('/accounts/:id/risk', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const account = await db.getAccountById(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  assertOwnership(account.userId, user.id, user.role);

  const schema = z.object({
    riskPerTradePercent: z.number().min(0.1).max(10).optional(),
    maxDailyRiskPercent: z.number().min(0.5).max(20).optional(),
    maxPortfolioRiskPercent: z.number().min(1).max(30).optional(),
    minRiskRewardRatio: z.number().min(1.0).max(10).optional(),
    maxOpenPositions: z.number().int().min(1).max(50).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const updated = await db.upsertRiskSetting(req.params.id, parsed.data);

  await db.addAuditLog({
    userId: user.id,
    action: 'SETTINGS_UPDATED',
    entity: 'RISK_SETTING',
    entityId: updated.id,
    details: 'Updated risk settings for account',
    ipAddress: req.ip,
  });

  return res.json({ risk: updated });
});

// ----------------------------------------------------
// 3. TRADING JOURNAL & CRUD
// ----------------------------------------------------

const CreateTradeSchema = z.object({
  accountId: z.string(),
  pair: z.string().min(2),
  direction: z.enum(['LONG', 'SHORT']),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']).default('OPEN'),
  timeframe: z.string().default('H1'),
  tradingSession: z.string().default('London'),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().optional(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive().optional(),
  lotSize: z.number().positive(),
  riskPercent: z.number().positive().default(1.0),
  riskAmount: z.number().nonnegative().optional(),
  setup: z.string().optional(),
  entryReason: z.string().optional(),
  exitReason: z.string().optional(),
  psychology: z.array(z.string()).default([]),
  mistakeTags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  fees: z.number().nonnegative().default(0),
  entryTime: z.string().optional(),
  exitTime: z.string().optional(),
});

apiRouter.get('/trades', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { accountId, status, pair, direction, timeframe, offset, limit } = req.query;

  const result = await db.getTrades({
    userId: user.id,
    accountId: accountId as string,
    status: status as string,
    pair: pair as string,
    direction: direction as string,
    timeframe: timeframe as string,
    offset: offset ? parseInt(offset as string, 10) : 0,
    limit: limit ? parseInt(limit as string, 10) : 50,
  });

  return res.json(result);
});

apiRouter.get('/trades/:id', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const trade = await db.getTradeById(req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  assertOwnership(trade.userId, user.id, user.role);

  return res.json({ trade });
});

apiRouter.post('/trades', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const parsed = CreateTradeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const data = parsed.data;
  const account = await db.getAccountById(data.accountId);
  if (!account) return res.status(404).json({ error: 'Target trading account not found' });
  assertOwnership(account.userId, user.id, user.role);

  // Directional sanity check
  if (data.direction === 'LONG' && data.stopLoss >= data.entryPrice) {
    return res.status(400).json({ error: 'LONG trade stop-loss must be lower than entry price' });
  }
  if (data.direction === 'SHORT' && data.stopLoss <= data.entryPrice) {
    return res.status(400).json({ error: 'SHORT trade stop-loss must be higher than entry price' });
  }

  let rMultiple: number | undefined = undefined;
  let grossPnL: number | undefined = undefined;
  let netPnL: number | undefined = undefined;
  let pnlPercent: number | undefined = undefined;

  if (data.status === 'CLOSED' && data.exitPrice) {
    rMultiple = calculateRMultiple(data.direction, data.entryPrice, data.exitPrice, data.stopLoss);
    const spec = defaultMarketDataProvider; // For Pip calculations
    const priceDiff = data.direction === 'LONG' ? data.exitPrice - data.entryPrice : data.entryPrice - data.exitPrice;
    grossPnL = roundTo(priceDiff * data.lotSize * 100000, 2); // standard normalized
    netPnL = roundTo(grossPnL - data.fees, 2);
    pnlPercent = roundTo((netPnL / account.balance) * 100, 2);
  }

  const tradeId = 'tr_' + crypto.randomUUID().slice(0, 8);
  const calculatedRiskAmount = data.riskAmount ?? roundTo((account.balance * data.riskPercent) / 100, 2);

  const newTrade: Trade = {
    ...data,
    id: tradeId,
    userId: user.id,
    riskAmount: calculatedRiskAmount,
    rMultiple,
    grossPnL,
    netPnL,
    pnlPercent,
    entryTime: data.entryTime || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.createTrade(newTrade);

  // Update account balance if closed trade added
  if (newTrade.status === 'CLOSED' && netPnL !== undefined) {
    await db.updateAccount(account.id, {
      balance: roundTo(account.balance + netPnL, 2),
      equity: roundTo(account.equity + netPnL, 2),
    });
  }

  await db.addAuditLog({
    userId: user.id,
    action: 'TRADE_CREATED',
    entity: 'TRADE',
    entityId: tradeId,
    details: `Created ${newTrade.direction} trade on ${newTrade.pair}`,
    ipAddress: req.ip,
  });

  return res.status(201).json({ trade: newTrade });
});

apiRouter.put('/trades/:id', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const existing = await db.getTradeById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trade not found' });
  assertOwnership(existing.userId, user.id, user.role);

  const updated = await db.updateTrade(req.params.id, req.body);

  await db.addAuditLog({
    userId: user.id,
    action: 'TRADE_UPDATED',
    entity: 'TRADE',
    entityId: req.params.id,
    details: `Updated trade details for ${existing.pair}`,
    ipAddress: req.ip,
  });

  return res.json({ trade: updated });
});

apiRouter.post('/trades/:id/close', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const existing = await db.getTradeById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trade not found' });
  assertOwnership(existing.userId, user.id, user.role);

  const schema = z.object({
    exitPrice: z.number().positive(),
    exitReason: z.string().optional(),
    fees: z.number().nonnegative().default(0),
    exitTime: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { exitPrice, exitReason, fees, exitTime } = parsed.data;
  const account = await db.getAccountById(existing.accountId);
  if (!account) return res.status(404).json({ error: 'Associated trading account not found' });

  const rMultiple = calculateRMultiple(existing.direction, existing.entryPrice, exitPrice, existing.stopLoss);
  const priceDiff = existing.direction === 'LONG' ? exitPrice - existing.entryPrice : existing.entryPrice - exitPrice;
  const grossPnL = roundTo(priceDiff * existing.lotSize * 100000, 2);
  const totalFees = fees || existing.fees || 0;
  const netPnL = roundTo(grossPnL - totalFees, 2);
  const pnlPercent = roundTo((netPnL / account.balance) * 100, 2);

  const updatedTrade = await db.updateTrade(req.params.id, {
    status: 'CLOSED',
    exitPrice,
    exitReason: exitReason || existing.exitReason,
    fees: totalFees,
    grossPnL,
    netPnL,
    pnlPercent,
    rMultiple,
    exitTime: exitTime || new Date().toISOString(),
  });

  await db.updateAccount(account.id, {
    balance: roundTo(account.balance + netPnL, 2),
    equity: roundTo(account.equity + netPnL, 2),
  });

  await db.addAuditLog({
    userId: user.id,
    action: 'TRADE_UPDATED',
    entity: 'TRADE',
    entityId: existing.id,
    details: `Closed trade on ${existing.pair} with Net PnL: ${netPnL}`,
    ipAddress: req.ip,
  });

  return res.json({ trade: updatedTrade });
});

apiRouter.delete('/trades/:id', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const existing = await db.getTradeById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trade not found' });
  assertOwnership(existing.userId, user.id, user.role);

  await db.deleteTrade(req.params.id);

  await db.addAuditLog({
    userId: user.id,
    action: 'TRADE_DELETED',
    entity: 'TRADE',
    entityId: req.params.id,
    details: `Deleted trade ${existing.pair} (${existing.direction})`,
    ipAddress: req.ip,
  });

  return res.json({ success: true });
});

// ----------------------------------------------------
// 4. ANALYTICS & DASHBOARD
// ----------------------------------------------------

apiRouter.get('/dashboard', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { accountId } = req.query;

  const accounts = await db.getAccountsByUserId(user.id);
  const activeAccount = accountId
    ? accounts.find((a) => a.id === accountId) || accounts[0]
    : accounts[0];

  if (!activeAccount) {
    return res.json({
      account: null,
      stats: null,
      recentTrades: [],
    });
  }

  const { trades } = await db.getTrades({ userId: user.id, accountId: activeAccount.id, limit: 100 });
  const stats = calculateTradeStatistics(trades, activeAccount.balance);

  return res.json({
    account: activeAccount,
    stats,
    recentTrades: trades.slice(0, 10),
  });
});

apiRouter.get('/analytics', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { accountId } = req.query;

  const accounts = await db.getAccountsByUserId(user.id);
  const activeAccount = accountId
    ? accounts.find((a) => a.id === accountId) || accounts[0]
    : accounts[0];

  if (!activeAccount) {
    return res.status(404).json({ error: 'No trading account found' });
  }

  const { trades } = await db.getTrades({ userId: user.id, accountId: activeAccount.id, limit: 1000 });
  const stats = calculateTradeStatistics(trades, activeAccount.balance);
  const { equityCurve } = calculateEquityAndDrawdown(trades, activeAccount.balance);

  // Group by pair
  const pairStatsMap = new Map<string, { trades: number; netPnL: number; wins: number }>();
  for (const t of trades.filter((tr) => tr.status === 'CLOSED')) {
    const existing = pairStatsMap.get(t.pair) || { trades: 0, netPnL: 0, wins: 0 };
    existing.trades++;
    existing.netPnL += t.netPnL ?? 0;
    if ((t.netPnL ?? 0) > 0) existing.wins++;
    pairStatsMap.set(t.pair, existing);
  }
  const pairBreakdown = Array.from(pairStatsMap.entries()).map(([pair, d]) => ({
    pair,
    trades: d.trades,
    netPnL: roundTo(d.netPnL, 2),
    winRate: roundTo((d.wins / d.trades) * 100, 1),
  }));

  // Group by setup
  const setupStatsMap = new Map<string, { trades: number; netPnL: number; wins: number }>();
  for (const t of trades.filter((tr) => tr.status === 'CLOSED')) {
    const setupName = t.setup || 'Unclassified';
    const existing = setupStatsMap.get(setupName) || { trades: 0, netPnL: 0, wins: 0 };
    existing.trades++;
    existing.netPnL += t.netPnL ?? 0;
    if ((t.netPnL ?? 0) > 0) existing.wins++;
    setupStatsMap.set(setupName, existing);
  }
  const setupBreakdown = Array.from(setupStatsMap.entries()).map(([setup, d]) => ({
    setup,
    trades: d.trades,
    netPnL: roundTo(d.netPnL, 2),
    winRate: roundTo((d.wins / d.trades) * 100, 1),
  }));

  return res.json({
    stats,
    equityCurve,
    pairBreakdown,
    setupBreakdown,
  });
});

// ----------------------------------------------------
// 5. MARKET SCANNER & PAIR ANALYSIS
// ----------------------------------------------------

apiRouter.get('/market/instruments', authenticate, async (_req: Request, res: Response) => {
  const instruments = await db.getInstruments(true);
  return res.json({ instruments });
});

// ----------------------------------------------------
// DEDICATED MARKET DATA ENDPOINTS (Status, Sync, Candles, Mappings, Gaps)
// ----------------------------------------------------

apiRouter.get('/market-data/status', authenticate, async (req: Request, res: Response) => {
  const { symbol, timeframe = 'H1' } = req.query;
  if (symbol) {
    const sym = normalizeSymbol(symbol as string);
    const tf = parseTimeframe(timeframe as string);
    const status = await db.getMarketDataStatus(sym, tf);
    return res.json({
      status: status || {
        symbol: sym,
        timeframe: tf,
        status: 'UNAVAILABLE',
        provider: defaultMarketDataProvider.name,
        dataQualityScore: 0,
      },
    });
  }

  const instruments = await db.getInstruments(true);
  const statuses = [];
  for (const inst of instruments) {
    const s = await db.getMarketDataStatus(inst.symbol, 'H1');
    if (s) statuses.push(s);
  }
  return res.json({ statuses });
});

apiRouter.post('/market-data/sync', authenticate, async (req: Request, res: Response) => {
  try {
    const { symbol = 'EURUSD', timeframe = 'H1', from, to, count } = req.body;
    const sym = normalizeSymbol(symbol);
    const tf = parseTimeframe(timeframe);

    const summary = await MarketDataSyncService.syncMarketData({
      symbol: sym,
      timeframe: tf,
      from,
      to,
      count: count ? Number(count) : undefined,
    });

    return res.json({ success: true, summary });
  } catch (err: any) {
    console.error('[MarketData Sync API] Error:', err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'TWELVEDATA_NETWORK_ERROR',
    });
  }
});

apiRouter.get('/market-data/candles', authenticate, async (req: Request, res: Response) => {
  try {
    const { symbol = 'EURUSD', timeframe = 'H1', limit = 300, from, to } = req.query;
    const sym = normalizeSymbol(symbol as string);
    const tf = parseTimeframe(timeframe as string);
    const maxLimit = Math.min(1000, Math.max(10, Number(limit)));

    const startTime = from ? new Date(parseToUtcTimestamp(from as string)).getTime() : undefined;
    const endTime = to ? new Date(parseToUtcTimestamp(to as string)).getTime() : undefined;

    let candles = await db.getCandles({
      symbol: sym,
      timeframe: tf,
      limit: maxLimit,
      startTime,
      endTime,
    });

    if (candles.length === 0) {
      await MarketDataSyncService.syncHistoricalCandles(sym, tf, maxLimit);
      candles = await db.getCandles({
        symbol: sym,
        timeframe: tf,
        limit: maxLimit,
        startTime,
        endTime,
      });
    }

    return res.json({
      symbol: sym,
      timeframe: tf,
      count: candles.length,
      candles,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'MARKET_DATA_ERROR',
    });
  }
});

apiRouter.get('/market-data/mappings', authenticate, async (req: Request, res: Response) => {
  const provider = (req.query.provider as string) || 'TWELVEDATA';
  const mappings = await db.getAllProviderSymbolMappings(provider);
  return res.json({ provider, mappings });
});

apiRouter.get('/market-data/gaps', authenticate, async (req: Request, res: Response) => {
  const { symbol, timeframe } = req.query;
  const gaps = await db.getMarketDataGaps(symbol ? String(symbol) : undefined, timeframe ? String(timeframe) : undefined);
  return res.json({ gaps });
});

apiRouter.get('/market/scanner', authenticate, async (_req: Request, res: Response) => {
  const instruments = await db.getInstruments(true);
  const symbols = instruments.map((i) => i.symbol);

  const rawItems = await Promise.all(
    symbols.map(async (sym) => {
      try {
        let candles = await db.getCandles({ symbol: sym, timeframe: 'H1', limit: 48 });
        if (candles.length === 0) {
          candles = await db.getCandles({ symbol: sym, timeframe: 'D1', limit: 30 });
        }
        if (candles.length === 0) {
          return null;
        }

        const analysis = await MarketDataSyncService.refreshSymbol(sym, false);
        const latestPrice = MarketDataSyncService.getLatestPriceFromCandles(sym, candles);

        return {
          symbol: sym,
          pair: sym,
          currentPrice: latestPrice.price,
          change24h: latestPrice.change24h,
          trend: analysis.trend,
          momentum: analysis.momentum,
          volatility: analysis.volatility,
          bias: analysis.overallBias,
          dataQuality: analysis.dataQuality,
          dataStatus: analysis.dataStatus,
          lastUpdated: analysis.lastUpdated,
          scanStatus: 'ANALYSIS READY' as const,
          isDemo: false,
          dataSourceLabel: 'REAL DATA (Twelve Data)',
        };
      } catch (err: any) {
        console.warn(`[Market Scanner] Failed processing ${sym}:`, err.message);
        return null;
      }
    })
  );

  const results = rawItems.filter((item): item is NonNullable<typeof item> => item !== null);

  return res.json({
    pairs: results,
    mode: 'REAL',
    dataSourceLabel: 'REAL DATA (Twelve Data)',
  });
});

apiRouter.get('/market/pair', authenticate, async (req: Request, res: Response) => {
  try {
    const { pair = 'EURUSD', timeframe = 'H1' } = req.query;
    const sym = normalizeSymbol(pair as string);
    const tf = parseTimeframe(timeframe as string);

    const syncResult = await MarketDataSyncService.syncHistoricalCandles(sym, tf, 100, false);
    const analysis = await MarketDataSyncService.refreshSymbol(sym, false);
    const latestPrice = MarketDataSyncService.getLatestPriceFromCandles(sym, syncResult.candles);
    const symbolInfo = await defaultMarketDataProvider.getSymbolInfo(sym);
    const structure = analyzeMarketStructure(syncResult.candles as any, 3);
    const hasCandles = syncResult.candles && syncResult.candles.length > 0;

    return res.json({
      symbol: sym,
      pair: sym,
      timeframe: tf,
      currentPrice: hasCandles ? latestPrice.price : 0,
      latestPrice,
      symbolInfo,
      candles: syncResult.candles,
      indicator: syncResult.indicators,
      indicators: syncResult.indicators,
      structure,
      marketAnalysis: analysis,
      support: analysis.nearestSupport,
      resistance: analysis.nearestResistance,
      multiTimeframe: analysis.multiTimeframe,
      dataStatus: hasCandles ? syncResult.dataStatus.status : 'NO_DATA',
      dataQuality: hasCandles ? syncResult.dataQuality : 0,
      lastUpdated: syncResult.dataStatus.lastSuccessfulSync || new Date().toISOString(),
      errorMessage: syncResult.dataStatus.errorMessage,
      isDemo: false,
      dataSourceLabel: hasCandles ? 'REAL DATA (Twelve Data)' : 'NO REAL DATA',
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'MARKET_DATA_ERROR',
    });
  }
});

apiRouter.get('/market/:symbol', authenticate, async (req: Request, res: Response) => {
  try {
    const rawSymbol = req.params.symbol;
    const timeframeQuery = (req.query.timeframe as string) || 'H1';
    const sym = normalizeSymbol(rawSymbol);
    const tf = parseTimeframe(timeframeQuery);

    const syncResult = await MarketDataSyncService.syncHistoricalCandles(sym, tf, 100, false);
    const analysis = await MarketDataSyncService.refreshSymbol(sym, false);
    const latestPrice = MarketDataSyncService.getLatestPriceFromCandles(sym, syncResult.candles);
    const symbolInfo = await defaultMarketDataProvider.getSymbolInfo(sym);
    const hasCandles = syncResult.candles && syncResult.candles.length > 0;

    return res.json({
      symbol: sym,
      timeframe: tf,
      currentPrice: hasCandles ? latestPrice.price : 0,
      latestPrice,
      symbolInfo,
      lastUpdated: analysis.lastUpdated,
      dataStatus: hasCandles ? syncResult.dataStatus.status : 'NO_DATA',
      dataQuality: hasCandles ? syncResult.dataQuality : 0,
      errorMessage: syncResult.dataStatus.errorMessage,
      latestCandles: syncResult.candles,
      candles: syncResult.candles,
      latestIndicators: syncResult.indicators,
      indicators: syncResult.indicators,
      marketAnalysis: analysis,
      support: analysis.nearestSupport,
      resistance: analysis.nearestResistance,
      multiTimeframe: analysis.multiTimeframe,
      isDemo: false,
      dataSourceLabel: hasCandles ? 'REAL DATA (Twelve Data)' : 'NO REAL DATA',
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'MARKET_DATA_ERROR',
    });
  }
});

apiRouter.post('/market/refresh/:symbol', authenticate, async (req: Request, res: Response) => {
  try {
    const sym = normalizeSymbol(req.params.symbol);
    const analysis = await MarketDataSyncService.refreshSymbol(sym, true);
    return res.json({ success: true, symbol: sym, analysis });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({
      error: err.message || 'Failed to refresh symbol',
      code: err.code || 'MARKET_DATA_ERROR',
    });
  }
});

apiRouter.post('/market/signal', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const schema = z.object({
    pair: z.string(),
    timeframe: z.string().default('H1'),
    direction: z.enum(['LONG', 'SHORT']),
    entryPrice: z.number().positive(),
    stopLoss: z.number().positive(),
    takeProfit1: z.number().positive(),
    takeProfit2: z.number().positive().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { pair, timeframe, direction, entryPrice, stopLoss, takeProfit1, takeProfit2 } = parsed.data;
  const sym = normalizeSymbol(pair);
  const tf = parseTimeframe(timeframe);

  const syncResult = await MarketDataSyncService.syncHistoricalCandles(sym, tf, 100);
  const analysis = await MarketDataSyncService.refreshSymbol(sym);
  const structure = analyzeMarketStructure(syncResult.candles as any, 3);

  const signal = evaluateSignal({
    userId: user.id,
    pair: sym,
    timeframe: tf,
    direction,
    candles: syncResult.candles as any,
    indicator: syncResult.indicators,
    structure,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2: takeProfit2 || (direction === 'LONG' ? entryPrice + (entryPrice - stopLoss) * 2 : entryPrice - (stopLoss - entryPrice) * 2),
    dataStatus: syncResult.dataStatus.status,
    dataQuality: syncResult.dataQuality,
    marketAnalysis: analysis,
  });

  await db.createSignalRun(signal);

  await db.addAuditLog({
    userId: user.id,
    action: 'SIGNAL_ANALYZED',
    entity: 'SIGNAL_RUN',
    entityId: signal.id,
    details: `Evaluated ${direction} signal for ${sym} [Score: ${signal.score}, Status: ${signal.status}, Feed: ${syncResult.dataStatus.status}]`,
    ipAddress: req.ip,
  });

  return res.json({
    signal,
    marketAnalysis: analysis,
    dataStatus: syncResult.dataStatus.status,
    dataQuality: syncResult.dataQuality,
  });
});

apiRouter.post('/market/position-size', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const schema = z.object({
    pair: z.string(),
    accountId: z.string(),
    riskPercent: z.number().positive(),
    entryPrice: z.number().positive(),
    stopLoss: z.number().positive(),
    takeProfit: z.number().positive().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { pair, accountId, riskPercent, entryPrice, stopLoss, takeProfit } = parsed.data;
  const account = await db.getAccountById(accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  assertOwnership(account.userId, user.id, user.role);

  const riskSetting = await db.getRiskSettingByAccountId(accountId);
  const { trades } = await db.getTrades({ userId: user.id, accountId, status: 'OPEN' });

  // Risk limit check
  const riskCheck = riskSetting
    ? checkPortfolioRisk(account.balance, trades, riskPercent, riskSetting)
    : { allowed: true };

  const sizing = calculatePositionSize({
    pair,
    accountBalance: account.balance,
    riskPercent,
    entryPrice,
    stopLoss,
    takeProfit,
  });

  return res.json({
    sizing,
    riskCheck,
  });
});

// ----------------------------------------------------
// 6. WATCHLIST
// ----------------------------------------------------

apiRouter.get('/watchlists', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const watchlists = await db.getWatchlistsByUserId(user.id);
  return res.json({ watchlists });
});

apiRouter.post('/watchlists', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { pair, notes } = req.body;
  if (!pair) return res.status(400).json({ error: 'Pair is required' });

  const added = await db.addWatchlist({
    id: 'wl_' + crypto.randomUUID().slice(0, 8),
    userId: user.id,
    pair: pair.toUpperCase().trim(),
    notes,
    createdAt: new Date().toISOString(),
  });

  return res.json({ watchlist: added });
});

apiRouter.delete('/watchlists/:pair', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const success = await db.removeWatchlist(user.id, req.params.pair);
  return res.json({ success });
});

// ----------------------------------------------------
// 7. AI ANALYST (Server-side Gemini 2.5 Flash)
// ----------------------------------------------------

apiRouter.post('/ai/ask', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { query, accountId } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  const accounts = await db.getAccountsByUserId(user.id);
  const activeAccount = accountId ? accounts.find((a) => a.id === accountId) : accounts[0];
  const { trades } = await db.getTrades({ userId: user.id, accountId: activeAccount?.id, limit: 100 });
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');
  const stats = calculateTradeStatistics(trades, activeAccount?.balance || 10000);

  // If insufficient trade data exists
  if (closedTrades.length < 2) {
    const fallbackResponse = `Insufficient data for a reliable conclusion. TradePilot requires at least 2 closed trades in this account to deliver meaningful performance diagnosis. You currently have ${closedTrades.length} closed trade(s). Log or import additional closed trades to generate personalized analytics.`;
    return res.json({
      response: fallbackResponse,
      contextUsed: { closedCount: closedTrades.length },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Deterministic rule-based analysis if API key is not configured
    const winRate = stats.winRate;
    const avgWin = stats.averageWin;
    const avgLoss = stats.averageLoss;
    const profitFactor = stats.profitFactor;

    let diagnosis = `### Analytical Diagnostic Summary (Deterministic Engine)\n\n`;
    diagnosis += `* **Sample Size**: Analyzed ${closedTrades.length} closed trades.\n`;
    diagnosis += `* **Win Rate**: ${winRate}% (${stats.winningTrades} wins, ${stats.losingTrades} losses).\n`;
    diagnosis += `* **Profit Factor**: ${profitFactor > 0 ? profitFactor.toFixed(2) : 'N/A'}.\n`;
    diagnosis += `* **Risk/Reward Delivery**: Average win is $${avgWin.toFixed(2)} vs Average loss of $${avgLoss.toFixed(2)}.\n\n`;

    if (stats.consecutiveLosses >= 3) {
      diagnosis += `⚠️ **Risk Note**: Maximum consecutive loss streak of ${stats.consecutiveLosses} detected. Review position sizing to protect capital during drawdowns.\n`;
    }
    diagnosis += `\n*Disclaimer: TradePilot is an analytical decision-support platform. Past performance does not guarantee future results.*`;

    return res.json({ response: diagnosis, contextUsed: { closedCount: closedTrades.length } });
  }

  try {
    const ai = new GoogleGenAI();
    const tradeSummary = closedTrades.slice(0, 30).map((t) => ({
      pair: t.pair,
      direction: t.direction,
      netPnL: t.netPnL,
      rMultiple: t.rMultiple,
      setup: t.setup,
      mistakes: t.mistakeTags,
      psychology: t.psychology,
    }));

    const systemPrompt = `You are the AI Performance Mentor for TradePilot, a professional personal trading journal & market intelligence decision-support platform.
Guidelines:
1. Ground your answers strictly in the user's provided trade data and calculated statistics.
2. DO NOT invent trades, fabricated statistics, or market prices.
3. If data is insufficient for a claim, explicitly say: "Insufficient data for a reliable conclusion."
4. Never promise future profits, guarantee market outcomes, or give financial advice. Clearly state that signals and setups are decision-support candidates.
5. Format responses with clean Markdown headers, bullet points, and scannable insights.

User's Real Account Stats:
- Account Balance: $${activeAccount?.balance ?? 10000}
- Total Closed Trades: ${stats.closedTrades}
- Win Rate: ${stats.winRate}%
- Gross Profit: $${stats.grossProfit} | Gross Loss: $${stats.grossLoss} | Net PnL: $${stats.netPnL}
- Profit Factor: ${stats.profitFactor}
- Expectancy: $${stats.expectancy} per trade
- Average R: ${stats.averageR}R
- Max Drawdown: $${stats.maxDrawdown} (${stats.maxDrawdownPercent}%)
- Max Win Streak: ${stats.consecutiveWins} | Max Loss Streak: ${stats.consecutiveLosses}
- Sample Trades: ${JSON.stringify(tradeSummary)}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${query}` }] }
      ],
    });

    const aiText = response.text || 'Unable to generate analysis at this time.';

    await db.createAiAnalysis({
      id: crypto.randomUUID(),
      userId: user.id,
      query,
      response: aiText,
      context: `Closed trades: ${closedTrades.length}`,
      timestamp: new Date().toISOString(),
    });

    await db.addAuditLog({
      userId: user.id,
      action: 'AI_ANALYSIS_CREATED',
      entity: 'AI_ANALYSIS',
      details: `Generated AI analysis for prompt: "${query.substring(0, 50)}..."`,
      ipAddress: req.ip,
    });

    return res.json({ response: aiText, contextUsed: { closedCount: closedTrades.length } });
  } catch (err: any) {
    return res.status(500).json({ error: 'AI processing failed' });
  }
});

// ----------------------------------------------------
// 8. AUDIT LOGS
// ----------------------------------------------------

apiRouter.get('/audit-logs', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const logs = await db.getAuditLogs(user.id, 50);
  return res.json({ logs });
});
