/**
 * Prisma Seed Script for Neon PostgreSQL
 *
 * Populates:
 * 1. Master Instruments (11 core assets across FOREX, METAL, CRYPTO)
 * 2. Safe development demo user and primary account
 * 3. Idempotently imports existing historical demo records from legacy data/database.json
 */

import { PrismaClient, AssetClass, Role, TradeDirection, TradeStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const INSTRUMENTS_MASTER = [
  { symbol: 'EURUSD', displayName: 'EUR/USD', assetClass: AssetClass.FOREX, baseCurrency: 'EUR', quoteCurrency: 'USD', pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, pricePrecision: 4, volumePrecision: 2 },
  { symbol: 'GBPUSD', displayName: 'GBP/USD', assetClass: AssetClass.FOREX, baseCurrency: 'GBP', quoteCurrency: 'USD', pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, pricePrecision: 4, volumePrecision: 2 },
  { symbol: 'USDJPY', displayName: 'USD/JPY', assetClass: AssetClass.FOREX, baseCurrency: 'USD', quoteCurrency: 'JPY', pipSize: 0.01, tickSize: 0.001, contractSize: 100000, pricePrecision: 2, volumePrecision: 2 },
  { symbol: 'USDCHF', displayName: 'USD/CHF', assetClass: AssetClass.FOREX, baseCurrency: 'USD', quoteCurrency: 'CHF', pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, pricePrecision: 4, volumePrecision: 2 },
  { symbol: 'USDCAD', displayName: 'USD/CAD', assetClass: AssetClass.FOREX, baseCurrency: 'USD', quoteCurrency: 'CAD', pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, pricePrecision: 4, volumePrecision: 2 },
  { symbol: 'AUDUSD', displayName: 'AUD/USD', assetClass: AssetClass.FOREX, baseCurrency: 'AUD', quoteCurrency: 'USD', pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, pricePrecision: 4, volumePrecision: 2 },
  { symbol: 'NZDUSD', displayName: 'NZD/USD', assetClass: AssetClass.FOREX, baseCurrency: 'NZD', quoteCurrency: 'USD', pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, pricePrecision: 4, volumePrecision: 2 },
  { symbol: 'EURJPY', displayName: 'EUR/JPY', assetClass: AssetClass.FOREX, baseCurrency: 'EUR', quoteCurrency: 'JPY', pipSize: 0.01, tickSize: 0.001, contractSize: 100000, pricePrecision: 2, volumePrecision: 2 },
  { symbol: 'GBPJPY', displayName: 'GBP/JPY', assetClass: AssetClass.FOREX, baseCurrency: 'GBP', quoteCurrency: 'JPY', pipSize: 0.01, tickSize: 0.001, contractSize: 100000, pricePrecision: 2, volumePrecision: 2 },
  { symbol: 'XAUUSD', displayName: 'Gold (XAU/USD)', assetClass: AssetClass.METAL, baseCurrency: 'XAU', quoteCurrency: 'USD', pipSize: 0.01, tickSize: 0.01, contractSize: 100, pricePrecision: 2, volumePrecision: 2 },
  { symbol: 'BTCUSD', displayName: 'Bitcoin (BTC/USD)', assetClass: AssetClass.CRYPTO, baseCurrency: 'BTC', quoteCurrency: 'USD', pipSize: 1.0, tickSize: 0.5, contractSize: 1, pricePrecision: 2, volumePrecision: 4 },
];

export async function main() {
  console.log('[Prisma Seed] Starting baseline seeding on Neon PostgreSQL...');

  // 1. Seed Master Instruments
  console.log('[Prisma Seed] Upserting 11 master instruments...');
  for (const inst of INSTRUMENTS_MASTER) {
    await prisma.instrument.upsert({
      where: { symbol: inst.symbol },
      update: {
        displayName: inst.displayName,
        assetClass: inst.assetClass,
        baseCurrency: inst.baseCurrency,
        quoteCurrency: inst.quoteCurrency,
        pipSize: inst.pipSize,
        tickSize: inst.tickSize,
        contractSize: inst.contractSize,
        pricePrecision: inst.pricePrecision,
        volumePrecision: inst.volumePrecision,
        isActive: true,
      },
      create: {
        symbol: inst.symbol,
        displayName: inst.displayName,
        assetClass: inst.assetClass,
        baseCurrency: inst.baseCurrency,
        quoteCurrency: inst.quoteCurrency,
        pipSize: inst.pipSize,
        tickSize: inst.tickSize,
        contractSize: inst.contractSize,
        pricePrecision: inst.pricePrecision,
        volumePrecision: inst.volumePrecision,
        isActive: true,
      },
    });
  }

  // 2. Seed Baseline Demo User
  console.log('[Prisma Seed] Ensuring development demo user...');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('PilotDemo2026!', salt);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@tradepilot.io' },
    update: {
      name: 'Demo Pilot',
      role: Role.USER,
    },
    create: {
      id: 'usr_demo_01',
      email: 'demo@tradepilot.io',
      name: 'Demo Pilot',
      passwordHash,
      role: Role.USER,
    },
  });

  // 3. Seed Primary Trading Account & Risk Setting
  const demoAccount = await prisma.tradingAccount.upsert({
    where: { id: 'acc_demo_main' },
    update: {
      name: 'Primary Swing Account',
      broker: 'Raw Spread Demo',
      balance: 10000.0,
      equity: 10000.0,
      isDefault: true,
    },
    create: {
      id: 'acc_demo_main',
      userId: demoUser.id,
      name: 'Primary Swing Account',
      broker: 'Raw Spread Demo',
      accountNumber: 'TP-8849201',
      currency: 'USD',
      balance: 10000.0,
      equity: 10000.0,
      isDefault: true,
    },
  });

  await prisma.riskSetting.upsert({
    where: { accountId: demoAccount.id },
    update: {
      riskPerTradePercent: 1.0,
      maxDailyRiskPercent: 3.0,
      maxPortfolioRiskPercent: 5.0,
      minRiskRewardRatio: 1.5,
      maxOpenPositions: 5,
    },
    create: {
      accountId: demoAccount.id,
      riskPerTradePercent: 1.0,
      maxDailyRiskPercent: 3.0,
      maxPortfolioRiskPercent: 5.0,
      minRiskRewardRatio: 1.5,
      maxOpenPositions: 5,
    },
  });

  // 4. Seed Standard Trade Setups
  const setups = [
    { id: 'setup_01', name: 'London Breakout', description: 'Early London session volatility expansion', winRate: 58.5 },
    { id: 'setup_02', name: 'H4 Trend Pullback', description: 'Moving average pullback in prevailing HTF direction', winRate: 64.0 },
    { id: 'setup_03', name: 'Range Reversal', description: 'Failed breakout rejection at key support or resistance', winRate: 52.0 },
  ];

  for (const s of setups) {
    await prisma.tradeSetup.upsert({
      where: { id: s.id },
      update: { name: s.name, description: s.description, winRate: s.winRate },
      create: { id: s.id, userId: demoUser.id, name: s.name, description: s.description, winRate: s.winRate },
    });
  }

  // 5. Migrate any existing records from legacy data/database.json if present
  const legacyPath = path.resolve(process.cwd(), 'data', 'database.json');
  if (fs.existsSync(legacyPath)) {
    try {
      console.log('[Prisma Seed] Importing existing legacy records from data/database.json...');
      const raw = fs.readFileSync(legacyPath, 'utf-8');
      const legacyData = JSON.parse(raw);

      // Import Trades
      if (Array.isArray(legacyData.trades)) {
        for (const t of legacyData.trades) {
          try {
            await prisma.trade.upsert({
              where: { id: t.id },
              update: {},
              create: {
                id: t.id,
                userId: demoUser.id,
                accountId: demoAccount.id,
                setupId: t.setupId && setups.some((s) => s.id === t.setupId) ? t.setupId : null,
                pair: t.pair,
                direction: t.direction === 'SHORT' ? TradeDirection.SHORT : TradeDirection.LONG,
                status: t.status === 'CLOSED' ? TradeStatus.CLOSED : t.status === 'CANCELLED' ? TradeStatus.CANCELLED : TradeStatus.OPEN,
                timeframe: t.timeframe || 'H1',
                tradingSession: t.tradingSession || 'London',
                entryPrice: t.entryPrice,
                exitPrice: t.exitPrice ?? null,
                stopLoss: t.stopLoss,
                takeProfit: t.takeProfit ?? null,
                lotSize: t.lotSize,
                riskPercent: t.riskPercent || 1.0,
                riskAmount: t.riskAmount || 0,
                grossPnL: t.grossPnL ?? null,
                fees: t.fees || 0,
                netPnL: t.netPnL ?? null,
                pnlPercent: t.pnlPercent ?? null,
                rMultiple: t.rMultiple ?? null,
                entryTime: new Date(t.entryTime || Date.now()),
                exitTime: t.exitTime ? new Date(t.exitTime) : null,
                setup: t.setup || null,
                entryReason: t.entryReason || null,
                exitReason: t.exitReason || null,
                psychology: Array.isArray(t.psychology) ? t.psychology : [],
                mistakeTags: Array.isArray(t.mistakeTags) ? t.mistakeTags : [],
                notes: t.notes || null,
              },
            });
          } catch (tradeErr: any) {
            console.warn(`[Prisma Seed] Skipped trade ${t.id}:`, tradeErr.message);
          }
        }
      }

      // Import Watchlists
      if (Array.isArray(legacyData.watchlists)) {
        for (const w of legacyData.watchlists) {
          try {
            await prisma.watchlist.upsert({
              where: {
                userId_pair: {
                  userId: demoUser.id,
                  pair: w.pair,
                },
              },
              update: { notes: w.notes },
              create: {
                id: w.id || crypto.randomUUID(),
                userId: demoUser.id,
                pair: w.pair,
                notes: w.notes,
              },
            });
          } catch (wErr: any) {
            console.warn(`[Prisma Seed] Skipped watchlist item ${w.pair}:`, wErr.message);
          }
        }
      }

      console.log('[Prisma Seed] Legacy data migration completed.');
    } catch (importErr: any) {
      console.warn('[Prisma Seed] Note on legacy import:', importErr.message);
    }
  }

  console.log('[Prisma Seed] Neon PostgreSQL seeding complete!');
}

main()
  .catch((e) => {
    console.error('[Prisma Seed] Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
