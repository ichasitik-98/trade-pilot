-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TradeDirection" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('BLOCKED', 'NO_SETUP', 'WEAK', 'WATCH', 'VALID_SETUP', 'STRONG_SETUP', 'VERY_STRONG_SETUP');

-- CreateEnum
CREATE TYPE "MarketBias" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('FOREX', 'METAL', 'CRYPTO', 'INDEX', 'STOCK', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "broker" TEXT NOT NULL DEFAULT 'Demo Broker',
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 10000.00,
    "equity" DECIMAL(12,2) NOT NULL DEFAULT 10000.00,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSetting" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "riskPerTradePercent" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "maxDailyRiskPercent" DECIMAL(5,2) NOT NULL DEFAULT 3.00,
    "maxPortfolioRiskPercent" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "minRiskRewardRatio" DECIMAL(5,2) NOT NULL DEFAULT 1.50,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "RiskSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeSetup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "winRate" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "setupId" TEXT,
    "pair" TEXT NOT NULL,
    "direction" "TradeDirection" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "timeframe" TEXT NOT NULL DEFAULT 'H1',
    "tradingSession" TEXT NOT NULL DEFAULT 'London',
    "entryPrice" DECIMAL(14,5) NOT NULL,
    "exitPrice" DECIMAL(14,5),
    "stopLoss" DECIMAL(14,5) NOT NULL,
    "takeProfit" DECIMAL(14,5),
    "lotSize" DECIMAL(10,2) NOT NULL,
    "riskPercent" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "riskAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "grossPnL" DECIMAL(12,2),
    "fees" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "netPnL" DECIMAL(12,2),
    "pnlPercent" DECIMAL(8,2),
    "rMultiple" DECIMAL(8,2),
    "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitTime" TIMESTAMP(3),
    "setup" TEXT,
    "entryReason" TEXT,
    "exitReason" TEXT,
    "psychology" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mistakeTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeScreenshot" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mood" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'FOREX',
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "pipSize" DECIMAL(10,5) NOT NULL DEFAULT 0.0001,
    "tickSize" DECIMAL(10,5) NOT NULL DEFAULT 0.00001,
    "contractSize" DECIMAL(14,2) NOT NULL DEFAULT 100000.0,
    "pricePrecision" INTEGER NOT NULL DEFAULT 4,
    "volumePrecision" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSymbolMapping" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "internalSymbol" TEXT NOT NULL,
    "externalSymbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSymbolMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketCandle" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT,
    "symbol" TEXT NOT NULL DEFAULT 'EURUSD',
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(14,5) NOT NULL,
    "high" DECIMAL(14,5) NOT NULL,
    "low" DECIMAL(14,5) NOT NULL,
    "close" DECIMAL(14,5) NOT NULL,
    "volume" DECIMAL(18,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DEMO',
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCandle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalIndicator" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT 'EURUSD',
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "sma20" DECIMAL(14,5),
    "sma50" DECIMAL(14,5),
    "sma200" DECIMAL(14,5),
    "ema20" DECIMAL(14,5),
    "ema50" DECIMAL(14,5),
    "ema200" DECIMAL(14,5),
    "rsi14" DECIMAL(8,2),
    "macd" DECIMAL(10,5),
    "macdSignal" DECIMAL(10,5),
    "macdHistogram" DECIMAL(10,5),
    "atr14" DECIMAL(14,5),
    "atrPercent" DECIMAL(8,4),
    "bbUpper" DECIMAL(14,5),
    "bbMiddle" DECIMAL(14,5),
    "bbLower" DECIMAL(14,5),
    "bbWidth" DECIMAL(8,4),
    "adx14" DECIMAL(8,2),
    "plusDI" DECIMAL(8,2),
    "minusDI" DECIMAL(8,2),
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculationVersion" TEXT NOT NULL DEFAULT '1.0.0',

    CONSTRAINT "TechnicalIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketDataStatus" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "lastCandleTimestamp" TIMESTAMP(3),
    "lastSuccessfulSync" TIMESTAMP(3),
    "provider" TEXT NOT NULL DEFAULT 'DEMO',
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "dataQualityScore" INTEGER NOT NULL DEFAULT 100,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketDataStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketDataGap" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "expectedTimestamp" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "MarketDataGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketAnalysis" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT 'EURUSD',
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL DEFAULT 'H1',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallBias" "MarketBias" NOT NULL DEFAULT 'NEUTRAL',
    "bias" "MarketBias" NOT NULL DEFAULT 'NEUTRAL',
    "trend" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "trendStrength" DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    "structure" TEXT NOT NULL DEFAULT 'SIDEWAYS',
    "structureState" TEXT NOT NULL DEFAULT 'SIDEWAYS',
    "momentum" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "volatility" TEXT NOT NULL DEFAULT 'NORMAL',
    "currentPrice" DECIMAL(14,5) NOT NULL DEFAULT 1.00000,
    "nearestSupport" DECIMAL(14,5),
    "nearestResistance" DECIMAL(14,5),
    "keySupport" DECIMAL(14,5),
    "keyResistance" DECIMAL(14,5),
    "supportDetails" JSONB,
    "resistanceDetails" JSONB,
    "multiTimeframe" JSONB,
    "dataQuality" INTEGER NOT NULL DEFAULT 100,
    "dataStatus" TEXT NOT NULL DEFAULT 'LIVE',
    "explanation" TEXT NOT NULL DEFAULT 'Market analysis complete',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" "TradeDirection" NOT NULL,
    "score" INTEGER NOT NULL,
    "trendScore" INTEGER NOT NULL,
    "structureScore" INTEGER NOT NULL,
    "momentumScore" INTEGER NOT NULL,
    "srScore" INTEGER NOT NULL,
    "volatilityScore" INTEGER NOT NULL,
    "rrScore" INTEGER NOT NULL,
    "confirmationScore" INTEGER NOT NULL,
    "entryPrice" DECIMAL(14,5) NOT NULL,
    "stopLoss" DECIMAL(14,5) NOT NULL,
    "takeProfit1" DECIMAL(14,5) NOT NULL,
    "takeProfit2" DECIMAL(14,5) NOT NULL,
    "riskReward" DECIMAL(6,2) NOT NULL,
    "status" "SignalStatus" NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "SignalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalComponent" (
    "id" TEXT NOT NULL,
    "signalRunId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "SignalComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balance" DECIMAL(12,2) NOT NULL,
    "equity" DECIMAL(12,2) NOT NULL,
    "openPnL" DECIMAL(12,2) NOT NULL,
    "closedPnL" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "context" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "TradingAccount_userId_idx" ON "TradingAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSetting_accountId_key" ON "RiskSetting"("accountId");

-- CreateIndex
CREATE INDEX "TradeSetup_userId_idx" ON "TradeSetup"("userId");

-- CreateIndex
CREATE INDEX "Trade_userId_idx" ON "Trade"("userId");

-- CreateIndex
CREATE INDEX "Trade_accountId_idx" ON "Trade"("accountId");

-- CreateIndex
CREATE INDEX "Trade_pair_idx" ON "Trade"("pair");

-- CreateIndex
CREATE INDEX "Trade_timeframe_idx" ON "Trade"("timeframe");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_entryTime_idx" ON "Trade"("entryTime");

-- CreateIndex
CREATE INDEX "Trade_exitTime_idx" ON "Trade"("exitTime");

-- CreateIndex
CREATE INDEX "TradeScreenshot_tradeId_idx" ON "TradeScreenshot"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_tradeId_key" ON "JournalEntry"("tradeId");

-- CreateIndex
CREATE INDEX "JournalEntry_userId_idx" ON "JournalEntry"("userId");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");

-- CreateIndex
CREATE INDEX "Watchlist_userId_idx" ON "Watchlist"("userId");

-- CreateIndex
CREATE INDEX "Watchlist_pair_idx" ON "Watchlist"("pair");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_pair_key" ON "Watchlist"("userId", "pair");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "Instrument_symbol_idx" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "Instrument_assetClass_idx" ON "Instrument"("assetClass");

-- CreateIndex
CREATE INDEX "ProviderSymbolMapping_provider_externalSymbol_idx" ON "ProviderSymbolMapping"("provider", "externalSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSymbolMapping_provider_internalSymbol_key" ON "ProviderSymbolMapping"("provider", "internalSymbol");

-- CreateIndex
CREATE INDEX "MarketCandle_symbol_idx" ON "MarketCandle"("symbol");

-- CreateIndex
CREATE INDEX "MarketCandle_pair_idx" ON "MarketCandle"("pair");

-- CreateIndex
CREATE INDEX "MarketCandle_timeframe_idx" ON "MarketCandle"("timeframe");

-- CreateIndex
CREATE INDEX "MarketCandle_timestamp_idx" ON "MarketCandle"("timestamp");

-- CreateIndex
CREATE INDEX "MarketCandle_instrumentId_timeframe_timestamp_idx" ON "MarketCandle"("instrumentId", "timeframe", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "MarketCandle_symbol_timeframe_timestamp_key" ON "MarketCandle"("symbol", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "TechnicalIndicator_symbol_idx" ON "TechnicalIndicator"("symbol");

-- CreateIndex
CREATE INDEX "TechnicalIndicator_pair_idx" ON "TechnicalIndicator"("pair");

-- CreateIndex
CREATE INDEX "TechnicalIndicator_timeframe_idx" ON "TechnicalIndicator"("timeframe");

-- CreateIndex
CREATE INDEX "TechnicalIndicator_timestamp_idx" ON "TechnicalIndicator"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalIndicator_symbol_timeframe_timestamp_key" ON "TechnicalIndicator"("symbol", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "MarketDataStatus_symbol_idx" ON "MarketDataStatus"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "MarketDataStatus_symbol_timeframe_key" ON "MarketDataStatus"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "MarketDataGap_symbol_timeframe_idx" ON "MarketDataGap"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "MarketDataGap_status_idx" ON "MarketDataGap"("status");

-- CreateIndex
CREATE INDEX "MarketAnalysis_symbol_idx" ON "MarketAnalysis"("symbol");

-- CreateIndex
CREATE INDEX "MarketAnalysis_pair_idx" ON "MarketAnalysis"("pair");

-- CreateIndex
CREATE INDEX "MarketAnalysis_timestamp_idx" ON "MarketAnalysis"("timestamp");

-- CreateIndex
CREATE INDEX "SignalRun_userId_idx" ON "SignalRun"("userId");

-- CreateIndex
CREATE INDEX "SignalRun_pair_idx" ON "SignalRun"("pair");

-- CreateIndex
CREATE INDEX "SignalRun_timeframe_idx" ON "SignalRun"("timeframe");

-- CreateIndex
CREATE INDEX "SignalRun_timestamp_idx" ON "SignalRun"("timestamp");

-- CreateIndex
CREATE INDEX "SignalRun_status_idx" ON "SignalRun"("status");

-- CreateIndex
CREATE INDEX "SignalComponent_signalRunId_idx" ON "SignalComponent"("signalRunId");

-- CreateIndex
CREATE INDEX "AccountSnapshot_accountId_idx" ON "AccountSnapshot"("accountId");

-- CreateIndex
CREATE INDEX "AccountSnapshot_date_idx" ON "AccountSnapshot"("date");

-- CreateIndex
CREATE INDEX "AiAnalysis_userId_idx" ON "AiAnalysis"("userId");

-- CreateIndex
CREATE INDEX "AiAnalysis_timestamp_idx" ON "AiAnalysis"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSetting" ADD CONSTRAINT "RiskSetting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeSetup" ADD CONSTRAINT "TradeSetup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "TradeSetup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeScreenshot" ADD CONSTRAINT "TradeScreenshot_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketCandle" ADD CONSTRAINT "MarketCandle_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRun" ADD CONSTRAINT "SignalRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalComponent" ADD CONSTRAINT "SignalComponent_signalRunId_fkey" FOREIGN KEY ("signalRunId") REFERENCES "SignalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSnapshot" ADD CONSTRAINT "AccountSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
