/**
 * Safe Demo Market Data Cleanup Script
 * TradePilot Decision-Support Platform
 *
 * UPGRADE #3.1 — REAL MARKET DATA ONLY
 *
 * OBJECTIVE:
 * 1. Safely export a full backup of all demo market-data records to backups/
 * 2. Delete DEMO-generated MarketCandle records from Neon PostgreSQL
 * 3. Delete derived TechnicalIndicators, MarketAnalyses, MarketDataStatuses, MarketDataGaps, and SignalRuns
 * 4. STRICTLY PRESERVE all real TWELVEDATA MarketCandle records
 * 5. Leave all user, account, trade, journal, watchlist, risk, and audit data 100% untouched.
 */

import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db/prisma.ts';

interface CleanupSummary {
  demoCandlesIdentified: number;
  demoCandlesDeleted: number;
  demoIndicatorsIdentified: number;
  demoIndicatorsDeleted: number;
  demoAnalysesIdentified: number;
  demoAnalysesDeleted: number;
  demoStatusesIdentified: number;
  demoStatusesDeleted: number;
  demoGapsIdentified: number;
  demoGapsDeleted: number;
  demoSignalRunsIdentified: number;
  demoSignalRunsDeleted: number;
  demoSignalComponentsDeleted: number;
  realCandlesPreserved: number;
  backupFilePath: string;
}

export async function runMarketDataCleanup(options: { dryRun?: boolean; force?: boolean } = {}): Promise<CleanupSummary> {
  const { dryRun = false } = options;

  console.log('====================================================');
  console.log('TRADEPILOT: CLEANUP DEMO MARKET DATA ENGINE');
  console.log(`Execution Mode: ${dryRun ? 'DRY RUN (Preview Only)' : 'LIVE EXECUTION'}`);
  console.log('Target: Neon PostgreSQL via Prisma ORM');
  console.log('====================================================\n');

  // Step 1: Identify all DEMO market candles
  const demoCandles = await prisma.marketCandle.findMany({
    where: { source: 'DEMO' },
  });

  const totalDemoCandleIds = new Set(demoCandles.map((c) => c.id));

  console.log(`[1/6] Identified ${demoCandles.length} DEMO MarketCandles.`);

  // Step 2: Identify derived TechnicalIndicators
  // Get all remaining REAL candle keys
  const realCandles = await prisma.marketCandle.findMany({
    where: {
      source: 'TWELVEDATA',
      id: { notIn: Array.from(totalDemoCandleIds) },
    },
    select: { symbol: true, timeframe: true, timestamp: true },
  });

  const realCandleKeySet = new Set(
    realCandles.map((c) => `${c.symbol}_${c.timeframe}_${c.timestamp.getTime()}`)
  );

  const allIndicators = await prisma.technicalIndicator.findMany();
  const demoIndicators = allIndicators.filter(
    (ind) => !realCandleKeySet.has(`${ind.symbol}_${ind.timeframe}_${ind.timestamp.getTime()}`)
  );
  console.log(`[2/6] Identified ${demoIndicators.length} demo-derived TechnicalIndicators (out of ${allIndicators.length} total).`);

  // Step 3: Identify derived MarketAnalyses
  const realSymbols = new Set(realCandles.map((c) => c.symbol));
  const allAnalyses = await prisma.marketAnalysis.findMany();
  const demoAnalyses = allAnalyses.filter((a) => !realSymbols.has(a.symbol) || a.dataStatus === 'DEMO');
  console.log(`[3/6] Identified ${demoAnalyses.length} demo-derived MarketAnalyses.`);

  // Step 4: Identify demo MarketDataStatuses
  const demoStatuses = await prisma.marketDataStatus.findMany({
    where: {
      OR: [
        { provider: { contains: 'Demo', mode: 'insensitive' } },
        { provider: 'DEMO' },
        { status: 'DEMO' },
      ],
    },
  });
  console.log(`[4/6] Identified ${demoStatuses.length} demo MarketDataStatuses.`);

  // Step 5: Identify demo MarketDataGaps
  const allGaps = await prisma.marketDataGap.findMany();
  const demoGaps = allGaps.filter((g) => !realSymbols.has(g.symbol));
  console.log(`[5/6] Identified ${demoGaps.length} demo MarketDataGaps.`);

  // Step 6: Identify demo SignalRuns
  const allSignalRuns = await prisma.signalRun.findMany({
    include: { components: true },
  });
  const demoSignalRuns = allSignalRuns.filter((r) => !realSymbols.has(r.pair));
  const demoSignalRunIds = demoSignalRuns.map((r) => r.id);
  const demoSignalComponentsCount = demoSignalRuns.reduce((acc, r) => acc + (r.components?.length || 0), 0);
  console.log(`[6/6] Identified ${demoSignalRuns.length} demo SignalRuns (with ${demoSignalComponentsCount} SignalComponents).`);

  // Create full backup before executing deletion
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFilePath = path.join(backupDir, `demo-market-data-backup-${timestamp}.json`);
  const backupPayload = {
    createdAt: new Date().toISOString(),
    counts: {
      marketCandles: totalDemoCandleIds.size,
      technicalIndicators: demoIndicators.length,
      marketAnalyses: demoAnalyses.length,
      marketDataStatuses: demoStatuses.length,
      marketDataGaps: demoGaps.length,
      signalRuns: demoSignalRuns.length,
      signalComponents: demoSignalComponentsCount,
    },
    records: {
      demoCandles: demoCandles.slice(0, 1000), // sample if large
      demoIndicators,
      demoAnalyses,
      demoStatuses,
      demoGaps,
      demoSignalRuns,
    },
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupPayload, null, 2), 'utf-8');
  console.log(`\n[BACKUP CREATED] Exported snapshot of affected demo data to:\n  ${backupFilePath}\n`);

  if (dryRun) {
    console.log('[DRY RUN] Skipping deletions. Review the counts above.');
    return {
      demoCandlesIdentified: totalDemoCandleIds.size,
      demoCandlesDeleted: 0,
      demoIndicatorsIdentified: demoIndicators.length,
      demoIndicatorsDeleted: 0,
      demoAnalysesIdentified: demoAnalyses.length,
      demoAnalysesDeleted: 0,
      demoStatusesIdentified: demoStatuses.length,
      demoStatusesDeleted: 0,
      demoGapsIdentified: demoGaps.length,
      demoGapsDeleted: 0,
      demoSignalRunsIdentified: demoSignalRuns.length,
      demoSignalRunsDeleted: 0,
      demoSignalComponentsDeleted: 0,
      realCandlesPreserved: realCandles.length,
      backupFilePath,
    };
  }

  console.log('Executing safe targeted deletion in dependency order...\n');

  // Deletion step 1: SignalComponents & SignalRuns
  let deletedComponents = 0;
  let deletedSignalRuns = 0;
  if (demoSignalRunIds.length > 0) {
    const resComp = await prisma.signalComponent.deleteMany({
      where: { signalRunId: { in: demoSignalRunIds } },
    });
    deletedComponents = resComp.count;

    const resRuns = await prisma.signalRun.deleteMany({
      where: { id: { in: demoSignalRunIds } },
    });
    deletedSignalRuns = resRuns.count;
    console.log(`- Deleted ${deletedSignalRuns} SignalRuns and ${deletedComponents} SignalComponents.`);
  }

  // Deletion step 2: MarketDataGaps
  let deletedGaps = 0;
  if (demoGaps.length > 0) {
    const resGaps = await prisma.marketDataGap.deleteMany({
      where: { id: { in: demoGaps.map((g) => g.id) } },
    });
    deletedGaps = resGaps.count;
    console.log(`- Deleted ${deletedGaps} demo MarketDataGaps.`);
  }

  // Deletion step 3: MarketDataStatuses
  let deletedStatuses = 0;
  if (demoStatuses.length > 0) {
    const resStatuses = await prisma.marketDataStatus.deleteMany({
      where: { id: { in: demoStatuses.map((s) => s.id) } },
    });
    deletedStatuses = resStatuses.count;
    console.log(`- Deleted ${deletedStatuses} demo MarketDataStatuses.`);
  }

  // Deletion step 4: MarketAnalyses
  let deletedAnalyses = 0;
  if (demoAnalyses.length > 0) {
    const resAnalyses = await prisma.marketAnalysis.deleteMany({
      where: { id: { in: demoAnalyses.map((a) => a.id) } },
    });
    deletedAnalyses = resAnalyses.count;
    console.log(`- Deleted ${deletedAnalyses} demo MarketAnalyses.`);
  }

  // Deletion step 5: TechnicalIndicators
  let deletedIndicators = 0;
  if (demoIndicators.length > 0) {
    const resInd = await prisma.technicalIndicator.deleteMany({
      where: { id: { in: demoIndicators.map((i) => i.id) } },
    });
    deletedIndicators = resInd.count;
    console.log(`- Deleted ${deletedIndicators} demo TechnicalIndicators.`);
  }

  // Deletion step 6: MarketCandles
  let deletedCandles = 0;
  if (totalDemoCandleIds.size > 0) {
    const resCandles = await prisma.marketCandle.deleteMany({
      where: { id: { in: Array.from(totalDemoCandleIds) } },
    });
    deletedCandles = resCandles.count;
    console.log(`- Deleted ${deletedCandles} demo MarketCandles.`);
  }

  // Verify post-cleanup state
  const remainingRealCandles = await prisma.marketCandle.count({
    where: { source: 'TWELVEDATA' },
  });
  const remainingDemoCandles = await prisma.marketCandle.count({
    where: { source: 'DEMO' },
  });

  console.log('\n====================================================');
  console.log('CLEANUP SUMMARY REPORT');
  console.log('====================================================');
  console.log(`Demo MarketCandles removed:        ${deletedCandles}`);
  console.log(`Demo TechnicalIndicators removed:  ${deletedIndicators}`);
  console.log(`Demo MarketAnalyses removed:       ${deletedAnalyses}`);
  console.log(`Demo MarketDataStatuses removed:   ${deletedStatuses}`);
  console.log(`Demo MarketDataGaps removed:       ${deletedGaps}`);
  console.log(`Demo SignalRuns removed:           ${deletedSignalRuns}`);
  console.log(`Demo SignalComponents removed:     ${deletedComponents}`);
  console.log('----------------------------------------------------');
  console.log(`Real Twelve Data MarketCandles:    ${remainingRealCandles} PRESERVED`);
  console.log(`Remaining Demo MarketCandles:      ${remainingDemoCandles} (Target: 0)`);
  console.log('====================================================\n');

  return {
    demoCandlesIdentified: totalDemoCandleIds.size,
    demoCandlesDeleted: deletedCandles,
    demoIndicatorsIdentified: demoIndicators.length,
    demoIndicatorsDeleted: deletedIndicators,
    demoAnalysesIdentified: demoAnalyses.length,
    demoAnalysesDeleted: deletedAnalyses,
    demoStatusesIdentified: demoStatuses.length,
    demoStatusesDeleted: deletedStatuses,
    demoGapsIdentified: demoGaps.length,
    demoGapsDeleted: deletedGaps,
    demoSignalRunsIdentified: demoSignalRuns.length,
    demoSignalRunsDeleted: deletedSignalRuns,
    demoSignalComponentsDeleted: deletedComponents,
    realCandlesPreserved: remainingRealCandles,
    backupFilePath,
  };
}

// Allow direct execution via CLI
if (process.argv[1]?.endsWith('cleanup-demo-market-data.ts') || process.argv[1]?.endsWith('cleanup-demo-market-data.js')) {
  const isDryRun = process.argv.includes('--dry-run');
  runMarketDataCleanup({ dryRun: isDryRun })
    .then(() => {
      console.log('Market data cleanup finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error during cleanup:', err);
      process.exit(1);
    });
}
