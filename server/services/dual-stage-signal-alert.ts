/**
 * Dual-Stage Trading Signal Alert & Multi-Timeframe Confirmation Orchestration Engine
 *
 * Canonical 4-Timeframe Strategy (Connected to DualStageSignalAlertService & SignalLifecycleEvent):
 *   1. H4 (Market Direction): Determines macro directional bias (BULLISH for BUY, BEARISH for SELL, NEUTRAL -> NO_SIGNAL).
 *   2. H1 (Trend Confirmation): Confirms trend aligned with H4 direction (opposing/neutral H1 -> NO_SIGNAL).
 *   3. M15 (Pullback Setup - Stage 1): Identifies a valid pullback into structure/value zone on a confirmed closed candle.
 *      -> Emits Stage 1 INITIAL_SIGNAL alert (explicitly stating ENTRY IS NOT YET CONFIRMED).
 *   4. M5 (BOS + Closed Candle Confirmation - Stage 2): Waits for Break of Structure (BOS) in the setup direction
 *      AND a valid closed confirmation candle on M5.
 *      -> Emits Stage 2 CONFIRMED_SIGNAL entry alert only when M5 BOS + closed confirmation candle + strategy rules pass.
 */

import crypto from 'crypto';
import {
  AssetClass,
  Candle,
  MarketBias,
  MarketStructure,
  SignalAlertConfig,
  SignalLifecycleEvent,
  TechnicalIndicator,
  Timeframe,
  TIMEFRAMES,
  TradeDirection,
} from '../types/index.ts';
import { db } from '../db/storage.ts';
import { MarketDataSyncService } from './market-data-sync.ts';
import { twelveDataBudget } from './twelve-data-budget.ts';
import { IndicatorEngine } from '../engines/indicators/index.ts';
import { analyzeMarketStructure } from '../engines/market-structure.ts';
import { classifyTrend, classifyMomentum } from './multi-timeframe.ts';
import {
  generateOptimalSignalLevels,
  evaluateSignal,
} from '../engines/signal-scoring.ts';
import { whatsappCloudProvider } from '../providers/whatsapp-cloud.ts';
import { TwelveDataProvider } from '../lib/market-data/twelve-data-provider.ts';

export interface TimeframeAvailabilityStatus {
  timeframe: Timeframe;
  available: boolean;
  candleCount: number;
  isStale: boolean;
  lastCandleTimestamp: string | null;
  status: string;
  reason: string;
}

export interface SymbolAvailabilityAuditReport {
  symbol: string;
  externalSymbol: string;
  overallAccessible: boolean;
  overallStatus:
    | 'AVAILABLE'
    | 'PARTIAL_OR_STALE'
    | 'QUOTA_EXCEEDED'
    | 'ENTITLEMENT_OR_PROVIDER_ERROR'
    | 'NO_DATA';
  summaryReason: string;
  timeframes: Record<string, TimeframeAvailabilityStatus>;
  creditBudget: ReturnType<typeof twelveDataBudget.getSnapshot>;
  auditedAt: string;
}

export interface Stage1EvaluationOutcome {
  configId: string;
  symbol: string;
  htfDirectionTimeframe: string;
  htfConfirmationTimeframe: string;
  primaryTimeframe: string;
  confirmationTimeframe: string;
  h4Direction: MarketBias | null;
  h1Trend: MarketBias | null;
  m15PullbackValid: boolean;
  state: 'BUY' | 'SELL' | 'NO_SIGNAL' | 'SKIPPED_DATA_UNAVAILABLE';
  score: number;
  status: string;
  candleTimestamp: string | null;
  isClosedCandle: boolean;
  reason: string;
  createdNewEvent: boolean;
  signalEvent?: SignalLifecycleEvent;
  notificationQueued?: boolean;
  notificationSkippedReason?: string;
  h4DurationMs?: number;
  h1DurationMs?: number;
  m15DurationMs?: number;
  eventPersistenceMs?: number;
}

export interface Stage2EvaluationOutcome {
  signalEventId: string;
  maskedEventId?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  confirmationTimeframe: string;
  previousStatus: string;
  newStatus: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'EXPIRED' | 'INVALIDATED';
  m5BosDetected: boolean;
  m5CandleConfirmed: boolean;
  score: number | null;
  candleTimestamp: string | null;
  satisfiedRules: string[];
  failedRules: string[];
  reason: string;
  notificationQueued?: boolean;
  notificationSkippedReason?: string;
  statusCheckMs?: number | null;
  dbCandleMs?: number | null;
  providerCallMs?: number | null;
  syncMarketDataMs?: number | null;
  m5DurationMs?: number | null;
  eventPersistenceMs?: number | null;
  fetchDurationMs?: number | null;
  totalEventMs?: number;
  outcome?: 'CONFIRMED' | 'INVALIDATED' | 'EXPIRED' | 'DEFERRED' | 'SKIPPED' | 'PENDING_AWAITING_BOS';
}

export interface DualStageCycleReport {
  startedAt: string;
  completedAt: string;
  triggerSource: 'MANUAL' | 'CRON' | 'SCHEDULER';
  stage1Evaluations: Stage1EvaluationOutcome[];
  stage2Evaluations: Stage2EvaluationOutcome[];
  queueSummary: {
    processedCount: number;
    sentCount: number;
    failedCount: number;
  };
  creditBudget: ReturnType<typeof twelveDataBudget.getSnapshot>;
  skippedReason?: string;
  executionDurations?: {
    totalMs: number;
    neonInitMs?: number | null;
    connCheckMs?: number | null;
    atomicLockAcquireMs?: number | null;
    lockWaitMs?: number | null;
    lockAcquireMs?: number | null;
    configQueryMs?: number | null;
    configCacheHit?: boolean | null;
    pendingEventsQueryMs?: number | null;
    pendingEventsCount?: number;
    pendingEventsProcessedCount?: number;
    pendingEventsConfirmedCount?: number;
    pendingEventsInvalidatedCount?: number;
    pendingEventsExpiredCount?: number;
    pendingEventsDeferredCount?: number;
    pendingEventsSkippedCount?: number;
    pendingFetchMs?: number | null;
    pendingDbCandleMs?: number | null;
    pendingProviderSyncMs?: number | null;
    pendingEventsTotalMs?: number | null;
    h4Ms?: number | null;
    h1Ms?: number | null;
    m15Ms?: number | null;
    m5Ms?: number | null;
    eventPersistenceMs?: number | null;
    notificationQueueMs?: number | null;
    lastStage?: string;
    haltReason?: string | null;
    strategyCompleted?: boolean;
  };
}

export class DualStageSignalAlertService {
  private static isCycleRunning = false;

  public static resetCycleRunningForTesting(): void {
    this.isCycleRunning = false;
  }

  private static resolveAssetClass(symbol: string): AssetClass {
    const sym = symbol.toUpperCase();
    if (sym.startsWith('BTC') || sym.startsWith('ETH')) return 'CRYPTO';
    if (sym === 'XAUUSD' || sym === 'XAGUSD') return 'METAL';
    return 'FOREX';
  }

  /**
   * Checks whether a single candle is confirmed closed at nowMs with zero lookahead bias.
   */
  public static isCandleClosedAt(candle: Candle, timeframe: Timeframe, nowMs: number = Date.now()): boolean {
    if (!candle) return false;
    const durationMs = (TIMEFRAMES[timeframe]?.durationSeconds ?? 3600) * 1000;
    if (candle.timestamp > nowMs) {
      return false; // Future open timestamp -> lookahead bias
    }
    if (candle.isClosed === false) {
      return false; // Explicitly marked forming/unclosed
    }
    if (candle.isClosed === true) {
      return candle.timestamp + durationMs <= nowMs;
    }
    return candle.timestamp + durationMs <= nowMs;
  }

  /**
   * Resolves the evaluation candle slice, stripping future candles (anti-lookahead)
   * and preferring confirmed closed candles when requireClosedCandle is true.
   */
  public static selectEvaluationCandles(
    candles: Candle[],
    timeframe: Timeframe,
    requireClosedCandle: boolean,
    nowMs: number = Date.now()
  ): {
    evalCandles: Candle[];
    targetCandle: Candle | null;
    isClosedCandle: boolean;
    droppedFutureCount: number;
    droppedUnclosedCount: number;
  } {
    if (!candles || candles.length === 0) {
      return {
        evalCandles: [],
        targetCandle: null,
        isClosedCandle: true,
        droppedFutureCount: 0,
        droppedUnclosedCount: 0,
      };
    }

    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    // 1. Strip any candle whose open time is in the future (strict anti-lookahead guard)
    const nonFuture = sorted.filter((c) => c.timestamp <= nowMs);
    const droppedFutureCount = sorted.length - nonFuture.length;

    if (nonFuture.length === 0) {
      return {
        evalCandles: [],
        targetCandle: null,
        isClosedCandle: false,
        droppedFutureCount,
        droppedUnclosedCount: 0,
      };
    }

    const durationMs = (TIMEFRAMES[timeframe]?.durationSeconds ?? 3600) * 1000;
    const isClosedFn = (c: Candle) => {
      if (c.isClosed === false) return false;
      if (c.isClosed === true) return c.timestamp <= nowMs;
      return c.timestamp + durationMs <= nowMs;
    };

    const lastCandle = nonFuture[nonFuture.length - 1];
    const lastIsClosed = isClosedFn(lastCandle);

    if (requireClosedCandle && !lastIsClosed) {
      let endIdx = nonFuture.length - 1;
      while (endIdx >= 0 && !isClosedFn(nonFuture[endIdx])) {
        endIdx--;
      }
      const closedSlice = nonFuture.slice(0, endIdx + 1);
      const droppedUnclosedCount = nonFuture.length - closedSlice.length;
      const closedTarget = closedSlice.length > 0 ? closedSlice[closedSlice.length - 1] : null;
      return {
        evalCandles: closedSlice,
        targetCandle: closedTarget,
        isClosedCandle: closedTarget !== null,
        droppedFutureCount,
        droppedUnclosedCount,
      };
    }

    return {
      evalCandles: nonFuture,
      targetCandle: lastCandle,
      isClosedCandle: lastIsClosed,
      droppedFutureCount,
      droppedUnclosedCount: 0,
    };
  }

  /**
   * Evaluates candle freshness at a specific reference timestamp (nowMs) to support both live and deterministic test clocks.
   */
  public static checkCandleSliceFreshness(
    candles: Candle[],
    timeframe: Timeframe,
    symbol: string,
    nowMs: number = Date.now()
  ): {
    isStale: boolean;
    ageSeconds: number;
    thresholdMs: number;
    reason?: string;
  } {
    const assetClass = this.resolveAssetClass(symbol);
    const baseThresholdMs = MarketDataSyncService.getFreshnessThresholdMs(timeframe);
    const isWeekendNow = assetClass !== 'CRYPTO' && MarketDataSyncService.isForexWeekendClosure(nowMs);
    const utcDay = new Date(nowMs).getUTCDay();
    const isPostWeekendMonday =
      assetClass !== 'CRYPTO' && utcDay === 1 && (timeframe === 'D1' || timeframe === 'H4');

    const thresholdMs = isWeekendNow
      ? Math.max(baseThresholdMs, 84 * 3600 * 1000)
      : isPostWeekendMonday
      ? Math.max(baseThresholdMs, 96 * 3600 * 1000)
      : baseThresholdMs;

    if (!candles || candles.length === 0) {
      return {
        isStale: true,
        ageSeconds: Infinity,
        thresholdMs,
        reason: `No candles available for ${symbol} [${timeframe}].`,
      };
    }

    const latestTs = candles[candles.length - 1].timestamp;
    const ageMs = Math.max(0, nowMs - latestTs);
    const ageSeconds = Math.floor(ageMs / 1000);
    const isStale = ageMs > thresholdMs;

    return {
      isStale,
      ageSeconds,
      thresholdMs,
      reason: isStale
        ? `Market data for ${symbol} [${timeframe}] is STALE (last candle age: ${ageSeconds}s exceeds threshold ${Math.round(
            thresholdMs / 1000
          )}s).`
        : undefined,
    };
  }

  /**
   * Loads validated real Twelve Data candles for a symbol & timeframe while respecting Twelve Data Basic 8 credit limits.
   * Never falls back to DEMO or synthetic candles.
   */
  public static async loadValidatedMarketData(
    symbol: string,
    timeframe: Timeframe,
    allowProviderNetworkCall: boolean = true,
    nowMs: number = Date.now(),
    options?: {
      deadlineMs?: number;
    }
  ): Promise<{
    ok: boolean;
    candles: Candle[];
    isStale: boolean;
    dataQuality: number;
    errorCode?: string;
    errorReason?: string;
    dbCandleMs: number;
    providerCallMs: number;
    syncMarketDataMs: number;
  }> {
    const sym = symbol.toUpperCase();
    let dbCandleMs = 0;
    let providerCallMs = 0;
    let syncMarketDataMs = 0;

    try {
      const dbStart = Date.now();
      const stored = await db.getCandles({ symbol: sym, timeframe, limit: 250 });
      dbCandleMs = Date.now() - dbStart;
      const realStored = stored.filter((c) => c.source === 'TWELVEDATA');
      const freshness = this.checkCandleSliceFreshness(realStored, timeframe, sym, nowMs);

      if (realStored.length >= 50 && !freshness.isStale) {
        return {
          ok: true,
          candles: realStored,
          isStale: false,
          dataQuality: realStored.length >= 100 ? 100 : Math.round((realStored.length / 100) * 100),
          dbCandleMs,
          providerCallMs: 0,
          syncMarketDataMs: 0,
        };
      }

      if (!allowProviderNetworkCall) {
        const dbStatus = await db.getMarketDataStatus(sym, timeframe);
        return {
          ok: false,
          candles: realStored,
          isStale: freshness.isStale,
          dataQuality: 0,
          errorCode: realStored.length === 0 ? 'NO_DATA' : 'STALE_DATA',
          errorReason:
            dbStatus?.errorMessage ||
            freshness.reason ||
            `Cached real market data for ${sym} [${timeframe}] is insufficient (${realStored.length} bars) and network fetch is disabled.`,
          dbCandleMs,
          providerCallMs: 0,
          syncMarketDataMs: 0,
        };
      }

      // Check remaining cycle deadline budget before triggering network call
      if (options?.deadlineMs) {
        const remainingBudget = options.deadlineMs - Date.now();
        if (remainingBudget < 2500) {
          return {
            ok: false,
            candles: realStored,
            isStale: freshness.isStale,
            dataQuality: 0,
            errorCode: 'DEADLINE_INSUFFICIENT',
            errorReason: `Remaining cycle duration budget (${remainingBudget}ms) is insufficient for Twelve Data network fetch. Deferring fetch to preserve cycle deadline.`,
            dbCandleMs,
            providerCallMs: 0,
            syncMarketDataMs: 0,
          };
        }
      }

      const budgetCheck = twelveDataBudget.canSpendBackgroundCredit(1, nowMs);
      if (!budgetCheck.allowed) {
        return {
          ok: false,
          candles: realStored,
          isStale: freshness.isStale,
          dataQuality: 0,
          errorCode: 'QUOTA_EXCEEDED',
          errorReason:
            budgetCheck.reason ||
            `Twelve Data credit quota guard deferred provider fetch for ${sym} [${timeframe}] (limit: ${twelveDataBudget.getMaxPerMinute()}/min, ${twelveDataBudget.getMaxPerDay()}/day).`,
          dbCandleMs,
          providerCallMs: 0,
          syncMarketDataMs: 0,
        };
      }

      // Perform direct syncMarketData so any Twelve Data entitlement / quota / auth errors surface explicitly
      const syncStart = Date.now();
      const syncRes = await MarketDataSyncService.syncMarketData({
        symbol: sym,
        timeframe,
        count: 250,
        deadlineMs: options?.deadlineMs,
      });
      syncMarketDataMs = Date.now() - syncStart;
      providerCallMs = syncMarketDataMs;

      let refreshed =
        syncRes.candles && syncRes.candles.length > 0
          ? syncRes.candles.filter((c) => c.source === 'TWELVEDATA')
          : [];

      if (refreshed.length === 0) {
        if (options?.deadlineMs && options.deadlineMs - Date.now() < 500) {
          return {
            ok: false,
            candles: realStored,
            isStale: freshness.isStale,
            dataQuality: 0,
            errorCode: 'DEADLINE_INSUFFICIENT',
            errorReason: `Cycle deadline reached after syncMarketData. Deferring refreshed candle query.`,
            dbCandleMs,
            providerCallMs,
            syncMarketDataMs,
          };
        }

        const postDbStart = Date.now();
        refreshed = (await db.getCandles({ symbol: sym, timeframe, limit: 250 })).filter(
          (c) => c.source === 'TWELVEDATA'
        );
        dbCandleMs += Date.now() - postDbStart;
      }
      const postFreshness = this.checkCandleSliceFreshness(refreshed, timeframe, sym, nowMs);

      if (refreshed.length < 30) {
        const statusRec = await db.getMarketDataStatus(sym, timeframe);
        return {
          ok: false,
          candles: refreshed,
          isStale: true,
          dataQuality: 0,
          errorCode: 'INSUFFICIENT_DATA',
          errorReason:
            statusRec?.errorMessage ||
            `Insufficient real candle history from Twelve Data for ${sym} [${timeframe}] (${refreshed.length} bars).`,
          dbCandleMs,
          providerCallMs,
          syncMarketDataMs,
        };
      }

      if (postFreshness.isStale) {
        return {
          ok: false,
          candles: refreshed,
          isStale: true,
          dataQuality: 50,
          errorCode: 'STALE_DATA',
          errorReason:
            postFreshness.reason ||
            `Market data for ${sym} [${timeframe}] is STALE (last bar age: ${postFreshness.ageSeconds}s). Signal evaluation suppressed.`,
          dbCandleMs,
          providerCallMs,
          syncMarketDataMs,
        };
      }

      return {
        ok: true,
        candles: refreshed,
        isStale: false,
        dataQuality: 100,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
      };
    } catch (err: any) {
      const errMsg = err?.message || `Failed to load Twelve Data candles for ${sym} [${timeframe}].`;
      const isQuota =
        err?.code === 'TWELVEDATA_RATE_LIMIT' ||
        err?.code === 'TWELVEDATA_QUOTA_EXCEEDED' ||
        /rate limit|quota|credits/i.test(errMsg);
      const isEntitlement =
        /plan|grow|pro|entitlement|not available|exclusively|unauthorized|api key|401|403/i.test(errMsg);

      return {
        ok: false,
        candles: [],
        isStale: true,
        dataQuality: 0,
        errorCode: isQuota
          ? 'QUOTA_EXCEEDED'
          : isEntitlement
          ? 'ENTITLEMENT_ERROR'
          : err?.code || 'PROVIDER_ERROR',
        errorReason: `Twelve Data [${sym} ${timeframe}] unavailable: ${errMsg}`,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
      };
    }
  }

  /**
   * Audits actual availability and entitlement of a symbol (such as XAUUSD) across all 4 strategy timeframes (H4, H1, M15, M5).
   * Never assumes access succeeds merely because a SignalAlertConfig row exists.
   */
  public static async auditSymbolAvailability(
    symbol: string = 'XAUUSD',
    probeNetwork: boolean = false,
    nowMs: number = Date.now()
  ): Promise<SymbolAvailabilityAuditReport> {
    const sym = symbol.toUpperCase();
    const externalSymbol = TwelveDataProvider.CANONICAL_SYMBOL_MAP[sym] || sym;
    const requiredTimeframes: Timeframe[] = ['H4', 'H1', 'M15', 'M5'];
    const tfStatuses: Record<string, TimeframeAvailabilityStatus> = {};

    let allAccessible = true;
    let hasQuotaError = false;
    let hasEntitlementOrProviderError = false;
    let hasSomeData = false;
    const failureReasons: string[] = [];

    const evaluateTf = async (tf: Timeframe) => {
      const res = await this.loadValidatedMarketData(sym, tf, probeNetwork, nowMs);
      const lastCandle = res.candles.length > 0 ? res.candles[res.candles.length - 1] : null;
      return { tf, res, lastCandle };
    };

    const tfResults = probeNetwork
      ? await (async () => {
          const out = [];
          for (const tf of requiredTimeframes) {
            out.push(await evaluateTf(tf));
          }
          return out;
        })()
      : await Promise.all(requiredTimeframes.map((tf) => evaluateTf(tf)));

    for (const { tf, res, lastCandle } of tfResults) {
      if (res.candles.length > 0) {
        hasSomeData = true;
      }

      if (!res.ok) {
        allAccessible = false;
        if (res.errorCode === 'QUOTA_EXCEEDED') hasQuotaError = true;
        if (
          res.errorCode === 'ENTITLEMENT_ERROR' ||
          res.errorCode === 'PROVIDER_ERROR' ||
          res.errorCode === 'TWELVEDATA_AUTH_ERROR'
        ) {
          hasEntitlementOrProviderError = true;
        }
        const reason = res.errorReason || `${sym} [${tf}] real market data is unavailable.`;
        failureReasons.push(`${tf}: ${reason}`);
        tfStatuses[tf] = {
          timeframe: tf,
          available: false,
          candleCount: res.candles.length,
          isStale: res.isStale,
          lastCandleTimestamp: lastCandle ? new Date(lastCandle.timestamp).toISOString() : null,
          status: res.errorCode || (res.isStale ? 'STALE' : 'UNAVAILABLE'),
          reason,
        };
      } else {
        tfStatuses[tf] = {
          timeframe: tf,
          available: true,
          candleCount: res.candles.length,
          isStale: false,
          lastCandleTimestamp: lastCandle ? new Date(lastCandle.timestamp).toISOString() : null,
          status: 'FRESH',
          reason: `${sym} [${tf}] has ${res.candles.length} validated real Twelve Data candles.`,
        };
      }
    }

    let overallStatus: SymbolAvailabilityAuditReport['overallStatus'] = 'AVAILABLE';
    if (!allAccessible) {
      if (hasQuotaError) {
        overallStatus = 'QUOTA_EXCEEDED';
      } else if (hasEntitlementOrProviderError) {
        overallStatus = 'ENTITLEMENT_OR_PROVIDER_ERROR';
      } else if (hasSomeData) {
        overallStatus = 'PARTIAL_OR_STALE';
      } else {
        overallStatus = 'NO_DATA';
      }
    }

    const summaryReason = allAccessible
      ? `All 4 strategy timeframes (H4, H1, M15, M5) for ${sym} (${externalSymbol}) have fresh, validated real Twelve Data candles.`
      : `Signal evaluation for ${sym} (${externalSymbol}) is blocked until real Twelve Data candles are available and fresh across H4, H1, M15, and M5. Issues: ${failureReasons.join(
          ' | '
        )}`;

    return {
      symbol: sym,
      externalSymbol,
      overallAccessible: allAccessible,
      overallStatus,
      summaryReason,
      timeframes: tfStatuses,
      creditBudget: twelveDataBudget.getSnapshot(nowMs),
      auditedAt: new Date(nowMs).toISOString(),
    };
  }

  /**
   * STEP 1 OF 4-TF STRATEGY: H4 Market Direction
   * Evaluates confirmed closed H4 candles to determine macro market direction (BULLISH, BEARISH, or NEUTRAL).
   */
  public static evaluateH4MarketDirection(
    h4Candles: Candle[],
    symbol: string,
    timeframe: Timeframe = 'H4'
  ): {
    direction: MarketBias;
    indicator: TechnicalIndicator;
    structure: MarketStructure;
    reason: string;
  } {
    const lastCandle = h4Candles[h4Candles.length - 1];
    const indicator = IndicatorEngine.computeLatestSnapshot(h4Candles, symbol, timeframe);
    const structure = analyzeMarketStructure(h4Candles as any, 3);
    let { trend: indTrend } = classifyTrend(lastCandle.close, indicator);

    if (indTrend === 'NEUTRAL' && indicator.ema20 !== null && indicator.ema50 !== null) {
      if (lastCandle.close > indicator.ema20 && indicator.ema20 > indicator.ema50) {
        indTrend = 'BULLISH';
      } else if (lastCandle.close < indicator.ema20 && indicator.ema20 < indicator.ema50) {
        indTrend = 'BEARISH';
      }
    }

    let direction: MarketBias = 'NEUTRAL';
    if (indTrend === 'BULLISH' && structure.trend !== 'BEARISH') {
      direction = 'BULLISH';
    } else if (indTrend === 'BEARISH' && structure.trend !== 'BULLISH') {
      direction = 'BEARISH';
    } else if (indTrend === 'NEUTRAL' && structure.trend === 'BULLISH') {
      direction = 'BULLISH';
    } else if (indTrend === 'NEUTRAL' && structure.trend === 'BEARISH') {
      direction = 'BEARISH';
    }

    const reason =
      direction === 'NEUTRAL'
        ? `${timeframe} market direction is NEUTRAL (EMA trend: ${indTrend}, Structure: ${structure.trend}). No clear directional bias.`
        : `${timeframe} market direction is ${direction} (EMA trend: ${indTrend}, Structure: ${
            structure.lastStructureEvent || structure.trend
          }).`;

    return { direction, indicator, structure, reason };
  }

  /**
   * STEP 2 OF 4-TF STRATEGY: H1 Trend Confirmation
   * Verifies that confirmed closed H1 candles align with the H4 market direction.
   */
  public static evaluateH1TrendConfirmation(
    h1Candles: Candle[],
    symbol: string,
    h4Direction: MarketBias,
    timeframe: Timeframe = 'H1'
  ): {
    h1Trend: MarketBias;
    aligned: boolean;
    indicator: TechnicalIndicator;
    structure: MarketStructure;
    reason: string;
  } {
    const lastCandle = h1Candles[h1Candles.length - 1];
    const indicator = IndicatorEngine.computeLatestSnapshot(h1Candles, symbol, timeframe);
    const structure = analyzeMarketStructure(h1Candles as any, 3);
    let { trend: indTrend } = classifyTrend(lastCandle.close, indicator);

    if (indTrend === 'NEUTRAL' && indicator.ema20 !== null && indicator.ema50 !== null) {
      if (lastCandle.close > indicator.ema20 && indicator.ema20 > indicator.ema50) {
        indTrend = 'BULLISH';
      } else if (lastCandle.close < indicator.ema20 && indicator.ema20 < indicator.ema50) {
        indTrend = 'BEARISH';
      }
    }

    let h1Trend: MarketBias = 'NEUTRAL';
    if (indTrend === 'BULLISH' && structure.trend !== 'BEARISH') {
      h1Trend = 'BULLISH';
    } else if (indTrend === 'BEARISH' && structure.trend !== 'BULLISH') {
      h1Trend = 'BEARISH';
    } else if (indTrend === 'NEUTRAL' && structure.trend === 'BULLISH') {
      h1Trend = 'BULLISH';
    } else if (indTrend === 'NEUTRAL' && structure.trend === 'BEARISH') {
      h1Trend = 'BEARISH';
    }

    const aligned = h4Direction !== 'NEUTRAL' && h1Trend === h4Direction;
    const reason = aligned
      ? `${timeframe} trend (${h1Trend}) confirms H4 market direction (${h4Direction}).`
      : `${timeframe} trend (${h1Trend}) opposes or fails to confirm H4 direction (${h4Direction}).`;

    return { h1Trend, aligned, indicator, structure, reason };
  }

  /**
   * STEP 3 OF 4-TF STRATEGY: M15 Valid Pullback Identification
   * Verifies that M15 has pulled back into a valid structure/EMA value zone aligned with H4 + H1
   * without breaking structure against the trend or chasing an overextended spike.
   */
  public static evaluateM15Pullback(
    m15Candles: Candle[],
    expectedBias: 'BULLISH' | 'BEARISH',
    indicator: TechnicalIndicator,
    structure: MarketStructure
  ): {
    valid: boolean;
    reason: string;
  } {
    const lastCandle = m15Candles[m15Candles.length - 1];
    const atr = indicator.atr14 || Math.max(1e-5, Math.abs(lastCandle.high - lastCandle.low));
    const rsi = indicator.rsi14 ?? 50;
    const recentWindow = m15Candles.slice(-8);

    if (expectedBias === 'BULLISH') {
      // 1. Disqualify if M15 broke structure bearishly against H4/H1 bullish bias
      if (
        structure.isBearishBOS ||
        (structure.isLowerHigh &&
          structure.isLowerLow &&
          indicator.ema50 !== null &&
          lastCandle.close < indicator.ema50)
      ) {
        return {
          valid: false,
          reason: `M15 pullback invalid: Bearish structure breakdown (${
            structure.lastStructureEvent || structure.trend
          }) invalidates bullish setup.`,
        };
      }

      // 2. Disqualify if overbought/chasing at extreme high without pullback
      if (rsi > 72) {
        return {
          valid: false,
          reason: `M15 pullback invalid: RSI (${rsi.toFixed(1)}) is overbought (> 72), indicating an overextended impulse rather than a pullback.`,
        };
      }

      const recentPeakHigh = Math.max(...recentWindow.map((c) => c.high));
      const recentDipLow = Math.min(...recentWindow.slice(-4).map((c) => c.low));
      const pullbackDepth = recentPeakHigh - recentDipLow;
      const nearEmaValue =
        indicator.ema20 !== null && lastCandle.low <= indicator.ema20 + 1.25 * atr;
      const hasPullbackRetracement =
        structure.isPullback ||
        structure.isHigherLow ||
        pullbackDepth >= 0.35 * atr ||
        nearEmaValue;

      const isRunawaySpikeAboveEma =
        indicator.ema20 !== null &&
        lastCandle.low > indicator.ema20 + 1.8 * atr &&
        !structure.isPullback;

      if (!hasPullbackRetracement || isRunawaySpikeAboveEma) {
        return {
          valid: false,
          reason: `M15 pullback invalid: Price has not retraced into M15 support/EMA value zone (pullback depth ${pullbackDepth.toFixed(
            2
          )} vs ATR ${atr.toFixed(2)}).`,
        };
      }

      return {
        valid: true,
        reason: `Valid M15 bullish pullback identified (RSI ${rsi.toFixed(
          1
        )}, retracement ${pullbackDepth.toFixed(2)} into EMA/HL value zone).`,
      };
    } else {
      // BEARISH setup
      if (
        structure.isBullishBOS ||
        (structure.isHigherHigh &&
          structure.isHigherLow &&
          indicator.ema50 !== null &&
          lastCandle.close > indicator.ema50)
      ) {
        return {
          valid: false,
          reason: `M15 pullback invalid: Bullish structure breakout (${
            structure.lastStructureEvent || structure.trend
          }) invalidates bearish setup.`,
        };
      }

      if (rsi < 28) {
        return {
          valid: false,
          reason: `M15 pullback invalid: RSI (${rsi.toFixed(1)}) is oversold (< 28), indicating an overextended drop rather than a pullback.`,
        };
      }

      const recentTroughLow = Math.min(...recentWindow.map((c) => c.low));
      const recentBounceHigh = Math.max(...recentWindow.slice(-4).map((c) => c.high));
      const pullbackHeight = recentBounceHigh - recentTroughLow;
      const nearEmaResistance =
        indicator.ema20 !== null && lastCandle.high >= indicator.ema20 - 1.25 * atr;
      const hasPullbackRetracement =
        structure.isPullback ||
        structure.isLowerHigh ||
        pullbackHeight >= 0.35 * atr ||
        nearEmaResistance;

      const isRunawayCollapseBelowEma =
        indicator.ema20 !== null &&
        lastCandle.high < indicator.ema20 - 1.8 * atr &&
        !structure.isPullback;

      if (!hasPullbackRetracement || isRunawayCollapseBelowEma) {
        return {
          valid: false,
          reason: `M15 pullback invalid: Price has not retraced into M15 resistance/EMA value zone (pullback height ${pullbackHeight.toFixed(
            2
          )} vs ATR ${atr.toFixed(2)}).`,
        };
      }

      return {
        valid: true,
        reason: `Valid M15 bearish pullback identified (RSI ${rsi.toFixed(
          1
        )}, retracement ${pullbackHeight.toFixed(2)} into EMA/LH resistance zone).`,
      };
    }
  }

  /**
   * STEP 4 OF 4-TF STRATEGY: M5 Break of Structure (BOS) & Closed Confirmation Candle
   * Requires BOTH:
   *   1. Break of Structure (BOS) on M5 in the direction of the Stage 1 setup.
   *   2. A valid closed confirmation candle (decisive body closing in direction of BOS without heavy wick rejection).
   */
  public static evaluateM5BosAndCandleConfirmation(
    m5Candles: Candle[],
    direction: 'BUY' | 'SELL',
    structure: MarketStructure
  ): {
    bosDetected: boolean;
    candleConfirmed: boolean;
    bosReason: string;
    candleReason: string;
  } {
    const targetCandle = m5Candles[m5Candles.length - 1];
    const prevSlice = m5Candles.length > 15 ? m5Candles.slice(0, -1) : [];
    const prevStructure = prevSlice.length >= 10 ? analyzeMarketStructure(prevSlice as any, 3) : null;

    const range = Math.max(1e-8, targetCandle.high - targetCandle.low);
    const body = Math.abs(targetCandle.close - targetCandle.open);
    const bodyRatio = body / range;

    if (direction === 'BUY') {
      const latestSwingHigh =
        structure.swingHighs.length > 0
          ? structure.swingHighs[structure.swingHighs.length - 1].price
          : null;
      const prevSwingHigh =
        prevStructure && prevStructure.swingHighs.length > 0
          ? prevStructure.swingHighs[prevStructure.swingHighs.length - 1].price
          : null;

      const bosOnCurrent = structure.isBullishBOS;
      const bosOnPrevHeld =
        Boolean(prevStructure?.isBullishBOS) &&
        prevSwingHigh !== null &&
        targetCandle.close > prevSwingHigh;

      const bosDetected = Boolean(bosOnCurrent || bosOnPrevHeld);
      const isBullishBody = targetCandle.close > targetCandle.open;
      const closePositionInRange = (targetCandle.close - targetCandle.low) / range;
      const candleConfirmed =
        bosDetected &&
        targetCandle.isClosed !== false &&
        isBullishBody &&
        bodyRatio >= 0.45 &&
        closePositionInRange >= 0.55;

      const bosReason = bosDetected
        ? `M5 Bullish Break of Structure (BULLISH_BOS) confirmed above swing high ${
            (latestSwingHigh ?? prevSwingHigh)?.toFixed(2) || ''
          }`
        : `M5 Bullish BOS not yet formed (close ${targetCandle.close.toFixed(2)} has not broken M5 swing high ${
            latestSwingHigh?.toFixed(2) ?? 'N/A'
          })`;

      const candleReason = candleConfirmed
        ? `M5 closed bullish confirmation candle validated (body ${(bodyRatio * 100).toFixed(
            0
          )}% of range, close at ${(closePositionInRange * 100).toFixed(0)}% of bar)`
        : !isBullishBody
        ? `M5 confirmation candle failed: closed bearish/doji (open ${targetCandle.open.toFixed(
            2
          )}, close ${targetCandle.close.toFixed(2)})`
        : `M5 confirmation candle failed: weak body or upper-wick rejection (body ${(
            bodyRatio * 100
          ).toFixed(0)}% < 45% or close position ${(closePositionInRange * 100).toFixed(0)}% < 55%)`;

      return { bosDetected, candleConfirmed, bosReason, candleReason };
    } else {
      const latestSwingLow =
        structure.swingLows.length > 0
          ? structure.swingLows[structure.swingLows.length - 1].price
          : null;
      const prevSwingLow =
        prevStructure && prevStructure.swingLows.length > 0
          ? prevStructure.swingLows[prevStructure.swingLows.length - 1].price
          : null;

      const bosOnCurrent = structure.isBearishBOS;
      const bosOnPrevHeld =
        Boolean(prevStructure?.isBearishBOS) &&
        prevSwingLow !== null &&
        targetCandle.close < prevSwingLow;

      const bosDetected = Boolean(bosOnCurrent || bosOnPrevHeld);
      const isBearishBody = targetCandle.close < targetCandle.open;
      const closePositionInRange = (targetCandle.high - targetCandle.close) / range;
      const candleConfirmed =
        bosDetected &&
        targetCandle.isClosed !== false &&
        isBearishBody &&
        bodyRatio >= 0.45 &&
        closePositionInRange >= 0.55;

      const bosReason = bosDetected
        ? `M5 Bearish Break of Structure (BEARISH_BOS) confirmed below swing low ${
            (latestSwingLow ?? prevSwingLow)?.toFixed(2) || ''
          }`
        : `M5 Bearish BOS not yet formed (close ${targetCandle.close.toFixed(2)} has not broken M5 swing low ${
            latestSwingLow?.toFixed(2) ?? 'N/A'
          })`;

      const candleReason = candleConfirmed
        ? `M5 closed bearish confirmation candle validated (body ${(bodyRatio * 100).toFixed(
            0
          )}% of range, close at lower ${(closePositionInRange * 100).toFixed(0)}% of bar)`
        : !isBearishBody
        ? `M5 confirmation candle failed: closed bullish/doji (open ${targetCandle.open.toFixed(
            2
          )}, close ${targetCandle.close.toFixed(2)})`
        : `M5 confirmation candle failed: weak body or lower-wick rejection (body ${(
            bodyRatio * 100
          ).toFixed(0)}% < 45% or close position ${(closePositionInRange * 100).toFixed(0)}% < 55%)`;

      return { bosDetected, candleConfirmed, bosReason, candleReason };
    }
  }

  /**
   * Helper to resolve and validate a single timeframe's closed candles for Stage 1 or Stage 2.
   */
  private static async resolveValidatedTimeframeCandles(params: {
    symbol: string;
    timeframe: Timeframe;
    requireClosedCandle: boolean;
    nowMs: number;
    suppliedCandles?: Candle[];
    deadlineMs?: number;
  }): Promise<{
    ok: boolean;
    evalCandles: Candle[];
    targetCandle: Candle | null;
    isClosedCandle: boolean;
    dataQuality: number;
    errorReason?: string;
    dbCandleMs?: number;
    providerCallMs?: number;
    syncMarketDataMs?: number;
  }> {
    const { symbol, timeframe, requireClosedCandle, nowMs, suppliedCandles, deadlineMs } = params;
    let rawCandles: Candle[] = [];
    let dataQuality = 100;
    let dbCandleMs = 0;
    let providerCallMs = 0;
    let syncMarketDataMs = 0;

    if (suppliedCandles) {
      rawCandles = suppliedCandles;
      // Check for future timestamps (lookahead bias)
      const hasFutureBar = rawCandles.some((c) => c.timestamp > nowMs);
      if (hasFutureBar) {
        return {
          ok: false,
          evalCandles: [],
          targetCandle: null,
          isClosedCandle: false,
          dataQuality: 0,
          errorReason: `Lookahead bias rejected: ${symbol} [${timeframe}] contains future candle timestamps beyond evaluation clock.`,
          dbCandleMs: 0,
          providerCallMs: 0,
          syncMarketDataMs: 0,
        };
      }

      // If caller supplied candles where the latest candle is unclosed when closed candles are required
      const lastBar = rawCandles[rawCandles.length - 1];
      if (requireClosedCandle && lastBar && !this.isCandleClosedAt(lastBar, timeframe, nowMs)) {
        return {
          ok: false,
          evalCandles: [],
          targetCandle: null,
          isClosedCandle: false,
          dataQuality: 0,
          errorReason: `Candle belum tertutup (unclosed forming candle) pada ${symbol} [${timeframe}] (${new Date(
            lastBar.timestamp
          ).toISOString()}). Evaluasi sinyal mewajibkan candle tertutup.`,
          dbCandleMs: 0,
          providerCallMs: 0,
          syncMarketDataMs: 0,
        };
      }

      const freshness = this.checkCandleSliceFreshness(rawCandles, timeframe, symbol, nowMs);
      if (rawCandles.length < 30 || freshness.isStale) {
        return {
          ok: false,
          evalCandles: [],
          targetCandle: null,
          isClosedCandle: true,
          dataQuality: 0,
          errorReason:
            rawCandles.length < 30
              ? `Insufficient candles (${rawCandles.length}) for ${symbol} [${timeframe}] (minimum 30 required).`
              : freshness.reason || `Market data for ${symbol} [${timeframe}] is stale.`,
          dbCandleMs: 0,
          providerCallMs: 0,
          syncMarketDataMs: 0,
        };
      }
    } else {
      const loaded = await this.loadValidatedMarketData(symbol, timeframe, true, nowMs, { deadlineMs });
      dbCandleMs = loaded.dbCandleMs;
      providerCallMs = loaded.providerCallMs;
      syncMarketDataMs = loaded.syncMarketDataMs;
      if (!loaded.ok) {
        return {
          ok: false,
          evalCandles: [],
          targetCandle: null,
          isClosedCandle: true,
          dataQuality: 0,
          errorReason: loaded.errorReason || `Market data unavailable for ${symbol} [${timeframe}].`,
          dbCandleMs,
          providerCallMs,
          syncMarketDataMs,
        };
      }
      rawCandles = loaded.candles;
      dataQuality = loaded.dataQuality;
    }

    const { evalCandles, targetCandle, isClosedCandle } = this.selectEvaluationCandles(
      rawCandles,
      timeframe,
      requireClosedCandle,
      nowMs
    );

    if (!targetCandle || evalCandles.length < 30) {
      return {
        ok: false,
        evalCandles: [],
        targetCandle: null,
        isClosedCandle,
        dataQuality: 0,
        errorReason: `Insufficient confirmed closed candles (${evalCandles.length}) for ${symbol} [${timeframe}].`,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
      };
    }

    if (requireClosedCandle && !isClosedCandle) {
      return {
        ok: false,
        evalCandles: [],
        targetCandle: null,
        isClosedCandle: false,
        dataQuality: 0,
        errorReason: `Candle belum tertutup pada ${symbol} [${timeframe}].`,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
      };
    }

    return {
      ok: true,
      evalCandles,
      targetCandle,
      isClosedCandle,
      dataQuality,
      dbCandleMs,
      providerCallMs,
      syncMarketDataMs,
    };
  }

  /**
   * STAGE 1: Evaluates the 4-Timeframe Strategy Setup (H4 Direction -> H1 Trend Alignment -> M15 Valid Pullback).
   * Only creates a PENDING_CONFIRMATION SignalLifecycleEvent and queues Stage 1 WhatsApp notification
   * when H4, H1, and M15 all satisfy their criteria on confirmed closed candles.
   */
  public static async evaluateStage1ForConfig(
    config: SignalAlertConfig,
    options?: {
      timeframeCandles?: Partial<Record<Timeframe, Candle[]>>;
      suppliedCandles?: Candle[];
      nowMs?: number;
      deadlineMs?: number;
    }
  ): Promise<Stage1EvaluationOutcome> {
    const sym = config.symbol.toUpperCase();
    const htfDirTf = (config.htfDirectionTimeframe || 'H4') as Timeframe;
    const htfConfTf = (config.htfConfirmationTimeframe || 'H1') as Timeframe;
    const pTf = (config.primaryTimeframe || 'M15') as Timeframe;
    const cTf = (config.confirmationTimeframe || 'M5') as Timeframe;
    const nowMs = options?.nowMs ?? Date.now();
    // Enforce closed-candle evaluation to prevent intrabar false triggers and lookahead bias
    const requireClosed = true;

    const suppliedH4 = options?.timeframeCandles?.[htfDirTf] ?? options?.timeframeCandles?.H4;
    const suppliedH1 = options?.timeframeCandles?.[htfConfTf] ?? options?.timeframeCandles?.H1;
    const suppliedM15 =
      options?.timeframeCandles?.[pTf] ??
      options?.timeframeCandles?.M15 ??
      options?.suppliedCandles;

    // If options.suppliedCandles was passed without H4/H1 in timeframeCandles, require all 3 Stage 1 timeframes
    if (options?.suppliedCandles && !suppliedH4 && !suppliedH1) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: null,
        h1Trend: null,
        m15PullbackValid: false,
        state: 'SKIPPED_DATA_UNAVAILABLE',
        score: 0,
        status: 'BLOCKED',
        candleTimestamp: null,
        isClosedCandle: true,
        reason: `Multi-timeframe Stage 1 requires ${htfDirTf} (direction), ${htfConfTf} (trend confirmation), and ${pTf} (pullback) candles; only single-timeframe candles were provided.`,
        createdNewEvent: false,
      };
    }

    // Check absolute deadline before H4
    if (options?.deadlineMs && Date.now() >= options.deadlineMs) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: null,
        h1Trend: null,
        m15PullbackValid: false,
        state: 'SKIPPED_DATA_UNAVAILABLE',
        score: 0,
        status: 'BLOCKED',
        candleTimestamp: null,
        isClosedCandle: true,
        reason: 'Cycle deadline exceeded before H4 market data resolution.',
        createdNewEvent: false,
      };
    }

    // 1. Load & Validate H4 (Market Direction)
    const h4Start = Date.now();
    const h4Loaded = await this.resolveValidatedTimeframeCandles({
      symbol: sym,
      timeframe: htfDirTf,
      requireClosedCandle: requireClosed,
      nowMs,
      suppliedCandles: suppliedH4,
    });
    const h4DurationMs = Date.now() - h4Start;
    if (options?.timeframeCandles && h4Loaded.ok && h4Loaded.evalCandles.length > 0) {
      options.timeframeCandles[htfDirTf] = h4Loaded.evalCandles;
      options.timeframeCandles.H4 = h4Loaded.evalCandles;
    }
    if (!h4Loaded.ok) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: null,
        h1Trend: null,
        m15PullbackValid: false,
        state: 'SKIPPED_DATA_UNAVAILABLE',
        score: 0,
        status: 'BLOCKED',
        candleTimestamp: null,
        isClosedCandle: h4Loaded.isClosedCandle,
        reason: h4Loaded.errorReason || `${htfDirTf} market data unavailable for ${sym}.`,
        createdNewEvent: false,
        h4DurationMs,
      };
    }

    // Check absolute deadline before H1
    if (options?.deadlineMs && options.deadlineMs - Date.now() < 500) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: null,
        h1Trend: null,
        m15PullbackValid: false,
        state: 'SKIPPED_DATA_UNAVAILABLE',
        score: 0,
        status: 'BLOCKED',
        candleTimestamp: null,
        isClosedCandle: true,
        reason: 'Cycle deadline exceeded before H1 market data resolution.',
        createdNewEvent: false,
        h4DurationMs,
      };
    }

    // 2. Load & Validate H1 (Trend Confirmation)
    const h1Start = Date.now();
    const h1Loaded = await this.resolveValidatedTimeframeCandles({
      symbol: sym,
      timeframe: htfConfTf,
      requireClosedCandle: requireClosed,
      nowMs,
      suppliedCandles: suppliedH1,
    });
    const h1DurationMs = Date.now() - h1Start;
    if (options?.timeframeCandles && h1Loaded.ok && h1Loaded.evalCandles.length > 0) {
      options.timeframeCandles[htfConfTf] = h1Loaded.evalCandles;
      options.timeframeCandles.H1 = h1Loaded.evalCandles;
    }
    if (!h1Loaded.ok) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: null,
        h1Trend: null,
        m15PullbackValid: false,
        state: 'SKIPPED_DATA_UNAVAILABLE',
        score: 0,
        status: 'BLOCKED',
        candleTimestamp: null,
        isClosedCandle: h1Loaded.isClosedCandle,
        reason: h1Loaded.errorReason || `${htfConfTf} market data unavailable for ${sym}.`,
        createdNewEvent: false,
        h4DurationMs,
        h1DurationMs,
      };
    }

    // Check absolute deadline before M15
    if (options?.deadlineMs && options.deadlineMs - Date.now() < 500) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: null,
        h1Trend: null,
        m15PullbackValid: false,
        state: 'SKIPPED_DATA_UNAVAILABLE',
        score: 0,
        status: 'BLOCKED',
        candleTimestamp: null,
        isClosedCandle: true,
        reason: 'Cycle deadline exceeded before M15 market data resolution.',
        createdNewEvent: false,
        h4DurationMs,
        h1DurationMs,
      };
    }

    // 3. Load & Validate M15 (Pullback Setup)
    const m15Start = Date.now();
    const m15Loaded = await this.resolveValidatedTimeframeCandles({
      symbol: sym,
      timeframe: pTf,
      requireClosedCandle: requireClosed,
      nowMs,
      suppliedCandles: suppliedM15,
    });
    const m15DurationMs = Date.now() - m15Start;
    if (options?.timeframeCandles && m15Loaded.ok && m15Loaded.evalCandles.length > 0) {
      options.timeframeCandles[pTf] = m15Loaded.evalCandles;
      options.timeframeCandles.M15 = m15Loaded.evalCandles;
    }
    if (!m15Loaded.ok || !m15Loaded.targetCandle) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: null,
        h1Trend: null,
        m15PullbackValid: false,
        state: 'SKIPPED_DATA_UNAVAILABLE',
        score: 0,
        status: 'BLOCKED',
        candleTimestamp: null,
        isClosedCandle: m15Loaded.isClosedCandle,
        reason: m15Loaded.errorReason || `${pTf} market data unavailable for ${sym}.`,
        createdNewEvent: false,
        h4DurationMs,
        h1DurationMs,
        m15DurationMs,
      };
    }

    const { evalCandles: m15EvalCandles, targetCandle: m15TargetCandle, isClosedCandle } = m15Loaded;
    const candleTimestampIso = new Date(m15TargetCandle.timestamp).toISOString();
    const currentPrice = m15TargetCandle.close;

    // Step A: Evaluate H4 Market Direction
    const h4Eval = this.evaluateH4MarketDirection(h4Loaded.evalCandles, sym, htfDirTf);
    if (h4Eval.direction === 'NEUTRAL') {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: 'NEUTRAL',
        h1Trend: null,
        m15PullbackValid: false,
        state: 'NO_SIGNAL',
        score: 0,
        status: 'NO_SETUP',
        candleTimestamp: candleTimestampIso,
        isClosedCandle,
        reason: h4Eval.reason,
        createdNewEvent: false,
        h4DurationMs,
      };
    }

    // Step B: Evaluate H1 Trend Alignment with H4
    const h1Eval = this.evaluateH1TrendConfirmation(
      h1Loaded.evalCandles,
      sym,
      h4Eval.direction,
      htfConfTf
    );
    if (!h1Eval.aligned) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: h4Eval.direction,
        h1Trend: h1Eval.h1Trend,
        m15PullbackValid: false,
        state: 'NO_SIGNAL',
        score: 0,
        status: 'BLOCKED',
        candleTimestamp: candleTimestampIso,
        isClosedCandle,
        reason: h1Eval.reason,
        createdNewEvent: false,
        h4DurationMs,
        h1DurationMs,
      };
    }

    // Step C: Evaluate M15 Valid Pullback in the H4 + H1 Direction
    const m15Indicator = IndicatorEngine.computeLatestSnapshot(m15EvalCandles, sym, pTf);
    const m15Structure = analyzeMarketStructure(m15EvalCandles as any, 3);
    const { momentum: m15Momentum } = classifyMomentum(m15Indicator);

    const pullbackEval = this.evaluateM15Pullback(
      m15EvalCandles,
      h4Eval.direction,
      m15Indicator,
      m15Structure
    );

    if (!pullbackEval.valid) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: h4Eval.direction,
        h1Trend: h1Eval.h1Trend,
        m15PullbackValid: false,
        state: 'NO_SIGNAL',
        score: 0,
        status: 'NO_SETUP',
        candleTimestamp: candleTimestampIso,
        isClosedCandle,
        reason: pullbackEval.reason,
        createdNewEvent: false,
        h4DurationMs,
        h1DurationMs,
        m15DurationMs,
      };
    }

    // Step D: Evaluate Canonical Signal Engine on M15 in the aligned H4 + H1 direction
    const internalDirection: TradeDirection = h4Eval.direction === 'BULLISH' ? 'LONG' : 'SHORT';
    const signalDirection: 'BUY' | 'SELL' = internalDirection === 'LONG' ? 'BUY' : 'SELL';

    const levels = generateOptimalSignalLevels({
      pair: sym,
      direction: internalDirection,
      currentPrice,
      atr: m15Indicator.atr14,
      indicator: m15Indicator,
      structure: m15Structure,
      candles: m15EvalCandles as any,
    });

    const dataQuality = Math.min(h4Loaded.dataQuality, h1Loaded.dataQuality, m15Loaded.dataQuality);

    const signalRun = evaluateSignal({
      userId: config.userId,
      pair: sym,
      timeframe: pTf,
      direction: internalDirection,
      candles: m15EvalCandles as any,
      indicator: m15Indicator,
      structure: m15Structure,
      htfTrend: h4Eval.direction,
      entryPrice: levels.entryPrice,
      stopLoss: levels.stopLoss,
      takeProfit1: levels.takeProfit1,
      takeProfit2: levels.takeProfit2,
      dataStatus: 'CURRENT',
      dataQuality,
    });

    const adxValue = m15Indicator.adx14 ?? 0;
    const minAdxRequired = Number(config.minAdx || 0);
    const adxPassed = minAdxRequired <= 0 || adxValue >= minAdxRequired;

    // Never interpret NO_SIGNAL as BUY or SELL
    if (
      signalRun.status === 'BLOCKED' ||
      signalRun.status === 'NO_SETUP' ||
      signalRun.score < config.initialScoreThreshold ||
      !adxPassed
    ) {
      const noSignalReasons: string[] = [];
      if (signalRun.score < config.initialScoreThreshold) {
        noSignalReasons.push(
          `Technical score ${signalRun.score}/100 is below initial threshold (${config.initialScoreThreshold}/100)`
        );
      }
      if (!adxPassed) {
        noSignalReasons.push(`ADX ${adxValue.toFixed(1)} is below minimum ADX (${minAdxRequired})`);
      }
      if (signalRun.status === 'BLOCKED' || signalRun.status === 'NO_SETUP') {
        noSignalReasons.push(signalRun.explanation);
      }

      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: h4Eval.direction,
        h1Trend: h1Eval.h1Trend,
        m15PullbackValid: true,
        state: 'NO_SIGNAL',
        score: signalRun.score,
        status: signalRun.status,
        candleTimestamp: candleTimestampIso,
        isClosedCandle,
        reason: noSignalReasons.join('; ') || 'Initial signal criteria not met (NO_SIGNAL).',
        createdNewEvent: false,
        h4DurationMs,
        h1DurationMs,
        m15DurationMs,
      };
    }

    const idempotencyKey = `sig:init:${config.userId}:${sym}:${htfDirTf}:${htfConfTf}:${pTf}:${cTf}:${signalDirection}:${m15TargetCandle.timestamp}`;

    const existingEvent = await db.getSignalLifecycleEventByIdempotencyKey(idempotencyKey);
    if (existingEvent) {
      return {
        configId: config.id,
        symbol: sym,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: h4Eval.direction,
        h1Trend: h1Eval.h1Trend,
        m15PullbackValid: true,
        state: signalDirection,
        score: existingEvent.initialScore,
        status: existingEvent.initialStatus,
        candleTimestamp: candleTimestampIso,
        isClosedCandle,
        reason: `Idempotent match: Initial ${signalDirection} setup already recorded for ${pTf} candle ${candleTimestampIso}.`,
        createdNewEvent: false,
        signalEvent: existingEvent,
        notificationQueued: false,
        notificationSkippedReason: 'Duplicate candle evaluation suppressed by idempotency key.',
        h4DurationMs,
        h1DurationMs,
        m15DurationMs,
      };
    }

    await db.createSignalRun(signalRun);

    const expiresAtIso = new Date(nowMs + config.expirationMinutes * 60_000).toISOString();
    const satisfiedRules = [
      `${htfDirTf} Market Direction: ${h4Eval.direction}`,
      `${htfConfTf} Trend Confirmation: ${h1Eval.h1Trend} (aligned with ${htfDirTf})`,
      `${pTf} Pullback: ${pullbackEval.reason}`,
      `${pTf} Confluence Score: ${signalRun.score}/100 >= ${config.initialScoreThreshold} (${signalDirection})`,
      `Momentum: ${m15Momentum}`,
      ...(minAdxRequired > 0 ? [`ADX ${adxValue.toFixed(1)} >= ${minAdxRequired}`] : []),
      `Evaluated on confirmed closed candles (${htfDirTf}, ${htfConfTf}, ${pTf})`,
    ];

    const stage1Explanation = `[ENTRY BELUM DIKONFIRMASI / UNCONFIRMED SETUP] ${htfDirTf} Direction: ${h4Eval.direction} | ${htfConfTf} Trend: ${h1Eval.h1Trend} | ${pTf} Pullback: Valid. Awaiting ${cTf} Break of Structure (BOS) & closed confirmation candle. (${signalRun.explanation})`;

    const persistStart = Date.now();
    const createdEvent = await db.createSignalLifecycleEvent(
      {
        id: crypto.randomUUID(),
        userId: config.userId,
        configId: config.id,
        signalRunId: signalRun.id,
        idempotencyKey,
        confirmationIdempotencyKey: null,
        symbol: sym,
        direction: signalDirection,
        htfDirectionTimeframe: htfDirTf,
        htfConfirmationTimeframe: htfConfTf,
        primaryTimeframe: pTf,
        confirmationTimeframe: cTf,
        h4Direction: h4Eval.direction,
        h1Trend: h1Eval.h1Trend,
        m15PullbackValid: true,
        m15PullbackReason: pullbackEval.reason,
        m5BosDetected: false,
        m5CandleConfirmed: false,
        primaryCandleTimestamp: candleTimestampIso,
        isClosedCandle,
        referencePrice: currentPrice,
        entryPrice: levels.entryPrice,
        stopLoss: levels.stopLoss,
        takeProfit1: levels.takeProfit1,
        takeProfit2: levels.takeProfit2,
        riskReward: signalRun.riskReward,
        initialScore: signalRun.score,
        initialStatus: signalRun.status,
        lifecycleStatus: 'PENDING_CONFIRMATION',
        initialNotificationStatus: 'NOT_QUEUED',
        confirmationNotificationStatus: 'NOT_QUEUED',
        dataFreshnessStatus: 'CURRENT',
        initialExplanation: stage1Explanation,
        expiresAt: expiresAtIso,
        lastEvaluatedAt: new Date(nowMs).toISOString(),
        evaluationCount: 1,
      },
      {
        stage: 'INITIAL',
        timeframe: pTf,
        candleTimestamp: candleTimestampIso,
        evaluatedPrice: currentPrice,
        score: signalRun.score,
        resultStatus: 'PENDING_CONFIRMATION',
        satisfiedRules,
        failedRules: [`Awaiting ${cTf} Break of Structure (BOS) and closed confirmation candle`],
        reason: `Stage 1 setup ${signalDirection} detected on ${sym} (${htfDirTf} ${h4Eval.direction} -> ${htfConfTf} ${h1Eval.h1Trend} -> ${pTf} Pullback, score ${signalRun.score}/100). Entry NOT yet confirmed; waiting for ${cTf} BOS + closed confirmation candle.`,
        dataFreshness: 'CURRENT',
      }
    );

    const refreshedEvent = (await db.getSignalLifecycleEventById(createdEvent.id)) || createdEvent;
    const eventPersistenceMs = Date.now() - persistStart;

    let notificationQueued = false;
    let notificationSkippedReason: string | undefined;

    if (config.enableInitialAlert) {
      const notifyRes = await whatsappCloudProvider.enqueueSignalNotification({
        userId: config.userId,
        config,
        event: createdEvent,
        notificationType: 'INITIAL_SIGNAL',
        dispatchImmediately: true,
      });
      notificationQueued = notifyRes.queued;
      notificationSkippedReason = notifyRes.skippedReason;
    } else {
      notificationSkippedReason = 'Initial stage alert is disabled in configuration.';
    }

    return {
      configId: config.id,
      symbol: sym,
      htfDirectionTimeframe: htfDirTf,
      htfConfirmationTimeframe: htfConfTf,
      primaryTimeframe: pTf,
      confirmationTimeframe: cTf,
      h4Direction: h4Eval.direction,
      h1Trend: h1Eval.h1Trend,
      m15PullbackValid: true,
      state: signalDirection,
      score: signalRun.score,
      status: signalRun.status,
      candleTimestamp: candleTimestampIso,
      isClosedCandle,
      reason: stage1Explanation,
      createdNewEvent: true,
      signalEvent: refreshedEvent,
      notificationQueued,
      notificationSkippedReason,
      h4DurationMs,
      h1DurationMs,
      m15DurationMs,
      eventPersistenceMs,
    };
  }

  /**
   * STAGE 2: Evaluates a PENDING_CONFIRMATION signal event on M5 (confirmationTimeframe).
   * Requires M5 Break of Structure (BOS) + Closed Confirmation Candle + strategy confirmation rules.
   */
  public static async evaluateStage2Confirmation(
    event: SignalLifecycleEvent,
    config?: SignalAlertConfig,
    options?: {
      suppliedCandles?: Candle[];
      timeframeCandles?: Partial<Record<Timeframe, Candle[]>>;
      nowMs?: number;
      deadlineMs?: number;
    }
  ): Promise<Stage2EvaluationOutcome> {
    const eventStart = Date.now();
    const nowMs = options?.nowMs ?? Date.now();
    const sym = event.symbol.toUpperCase();
    const cTf = (event.confirmationTimeframe || 'M5') as Timeframe;
    const pTf = (event.primaryTimeframe || 'M15') as Timeframe;
    const maskedEventId = event.id ? (event.id.length > 12 ? `${event.id.slice(0, 8)}...` : event.id) : 'unknown';
    const statusCheckStart = Date.now();

    // 0. Terminal / Confirmed Idempotency Guard: never re-confirm or send duplicate Stage 2 alerts
    if (
      event.lifecycleStatus === 'CONFIRMED' ||
      event.lifecycleStatus === 'EXPIRED' ||
      event.lifecycleStatus === 'INVALIDATED'
    ) {
      const statusCheckMs = Date.now() - statusCheckStart;
      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: event.lifecycleStatus,
        m5BosDetected: Boolean(event.m5BosDetected),
        m5CandleConfirmed: Boolean(event.m5CandleConfirmed),
        score: event.confirmationScore ?? null,
        candleTimestamp: event.confirmationCandleTimestamp ?? null,
        satisfiedRules: [],
        failedRules: [],
        reason: `Idempotent guard: Signal event ${maskedEventId} is already ${event.lifecycleStatus}. Duplicate confirmation suppressed.`,
        notificationQueued: false,
        notificationSkippedReason: `Signal already in ${event.lifecycleStatus} state.`,
        statusCheckMs,
        dbCandleMs: null,
        providerCallMs: null,
        syncMarketDataMs: null,
        m5DurationMs: null,
        eventPersistenceMs: null,
        fetchDurationMs: null,
        totalEventMs: Date.now() - eventStart,
        outcome: 'SKIPPED',
      };
    }

    // Check absolute deadline before config and candle resolution
    if (options?.deadlineMs && (options.deadlineMs - Date.now() < 800)) {
      const statusCheckMs = Date.now() - statusCheckStart;
      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'PENDING_CONFIRMATION',
        m5BosDetected: false,
        m5CandleConfirmed: false,
        score: null,
        candleTimestamp: null,
        satisfiedRules: [],
        failedRules: ['Cycle deadline budget reached before config resolution'],
        reason: 'Cycle deadline budget reached before config resolution. Deferring to next cycle.',
        statusCheckMs,
        dbCandleMs: null,
        providerCallMs: null,
        syncMarketDataMs: null,
        m5DurationMs: null,
        eventPersistenceMs: null,
        fetchDurationMs: null,
        totalEventMs: Date.now() - eventStart,
        outcome: 'DEFERRED',
      };
    }

    const resolvedConfig =
      config ||
      (event.configId ? await db.getSignalAlertConfigById(event.configId) : undefined) ||
      (await db.getSignalAlertConfigsByUserId(event.userId)).find(
        (c) =>
          c.symbol === sym &&
          c.primaryTimeframe === pTf &&
          c.confirmationTimeframe === cTf
      );

    // 1. Check Expiration First
    const expiresAtMs = new Date(event.expiresAt).getTime();
    if (nowMs >= expiresAtMs) {
      const expReason = `Signal setup expired at ${event.expiresAt} before ${cTf} BOS and closed candle confirmation were satisfied.`;
      const persistStart = Date.now();
      await db.updateSignalLifecycleEvent(
        event.id,
        {
          lifecycleStatus: 'EXPIRED',
          expiredAt: new Date(nowMs).toISOString(),
          expirationReason: expReason,
        },
        {
          stage: 'CONFIRMATION',
          timeframe: cTf,
          candleTimestamp: null,
          evaluatedPrice: null,
          score: null,
          resultStatus: 'EXPIRED',
          satisfiedRules: [],
          failedRules: ['Signal within expiration window'],
          reason: expReason,
          dataFreshness: 'CURRENT',
        }
      );
      const persistElapsed = Date.now() - persistStart;
      const statusCheckMs = Date.now() - statusCheckStart;

      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'EXPIRED',
        m5BosDetected: false,
        m5CandleConfirmed: false,
        score: null,
        candleTimestamp: null,
        satisfiedRules: [],
        failedRules: ['Signal within expiration window'],
        reason: expReason,
        statusCheckMs,
        dbCandleMs: null,
        providerCallMs: null,
        syncMarketDataMs: null,
        m5DurationMs: null,
        eventPersistenceMs: persistElapsed,
        fetchDurationMs: null,
        totalEventMs: Date.now() - eventStart,
        outcome: 'EXPIRED',
      };
    }
    const statusCheckMs = Date.now() - statusCheckStart;

    // Check absolute deadline before candle resolution
    if (options?.deadlineMs && (options.deadlineMs - Date.now() < 800)) {
      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'PENDING_CONFIRMATION',
        m5BosDetected: false,
        m5CandleConfirmed: false,
        score: null,
        candleTimestamp: null,
        satisfiedRules: [],
        failedRules: ['Cycle deadline budget reached before M5 candle resolution'],
        reason: 'Cycle deadline budget reached before M5 candle resolution. Deferring to next cycle.',
        statusCheckMs,
        dbCandleMs: null,
        providerCallMs: null,
        syncMarketDataMs: null,
        m5DurationMs: null,
        eventPersistenceMs: null,
        fetchDurationMs: null,
        totalEventMs: Date.now() - eventStart,
        outcome: 'DEFERRED',
      };
    }

    // 2. Load & Validate Confirmation Timeframe (M5) Closed Candles
    const suppliedM5 =
      options?.timeframeCandles?.[cTf] ??
      options?.timeframeCandles?.M5 ??
      options?.suppliedCandles;

    const fetchStart = Date.now();
    const m5Loaded = await this.resolveValidatedTimeframeCandles({
      symbol: sym,
      timeframe: cTf,
      requireClosedCandle: true,
      nowMs,
      suppliedCandles: suppliedM5,
      deadlineMs: options?.deadlineMs,
    });
    const fetchDurationMs = Date.now() - fetchStart;
    const dbCandleMs = m5Loaded.dbCandleMs ?? 0;
    const providerCallMs = m5Loaded.providerCallMs ?? 0;
    const syncMarketDataMs = m5Loaded.syncMarketDataMs ?? 0;

    if (!m5Loaded.ok || !m5Loaded.targetCandle) {
      const reason =
        m5Loaded.errorReason ||
        `Confirmation deferred: ${sym} [${cTf}] market data unavailable or unclosed. Signal remains PENDING_CONFIRMATION.`;
      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'PENDING_CONFIRMATION',
        m5BosDetected: false,
        m5CandleConfirmed: false,
        score: null,
        candleTimestamp: null,
        satisfiedRules: [],
        failedRules: ['Validated closed & fresh M5 confirmation candles'],
        reason,
        statusCheckMs,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
        m5DurationMs: null,
        eventPersistenceMs: null,
        fetchDurationMs,
        totalEventMs: Date.now() - eventStart,
        outcome: 'DEFERRED',
      };
    }

    if (options?.timeframeCandles && m5Loaded.evalCandles.length > 0) {
      options.timeframeCandles[cTf] = m5Loaded.evalCandles;
    }

    const { evalCandles, targetCandle, dataQuality } = m5Loaded;
    const confirmCandleIso = new Date(targetCandle.timestamp).toISOString();
    const primaryCandleMs = new Date(event.primaryCandleTimestamp).getTime();
    const confirmDurationMs = (TIMEFRAMES[cTf]?.durationSeconds ?? 300) * 1000;
    const confirmCandleCloseMs = targetCandle.timestamp + confirmDurationMs;

    // 3. Anti-Self-Confirmation & Chronological Causality Guard:
    // Prevent a signal from confirming itself using the exact same candle or an older candle that closed before the initial setup!
    const isSameCandleEvent =
      pTf === cTf && targetCandle.timestamp <= primaryCandleMs;
    const isOlderHistoricalCandle = confirmCandleCloseMs <= primaryCandleMs;

    if (isSameCandleEvent || isOlderHistoricalCandle) {
      const waitReason = isSameCandleEvent
        ? `Anti-self-confirmation guard: Waiting for a new closed ${cTf} candle after initial candle ${event.primaryCandleTimestamp}.`
        : `Anti-self-confirmation guard: Latest closed ${cTf} candle (${confirmCandleIso}) closed prior to initial ${pTf} setup (${event.primaryCandleTimestamp}). Waiting for next ${cTf} bar.`;

      if (options?.deadlineMs && (options.deadlineMs - Date.now() < 500)) {
        return {
          signalEventId: event.id,
          maskedEventId,
          symbol: sym,
          direction: event.direction,
          confirmationTimeframe: cTf,
          previousStatus: event.lifecycleStatus,
          newStatus: 'PENDING_CONFIRMATION',
          m5BosDetected: false,
          m5CandleConfirmed: false,
          score: null,
          candleTimestamp: confirmCandleIso,
          satisfiedRules: [],
          failedRules: ['Cycle deadline reached before anti-self-confirmation update'],
          reason: 'Cycle deadline reached before anti-self-confirmation update. Preserving PENDING_CONFIRMATION.',
          statusCheckMs,
          dbCandleMs,
          providerCallMs,
          syncMarketDataMs,
          m5DurationMs: null,
          eventPersistenceMs: null,
          fetchDurationMs,
          totalEventMs: Date.now() - eventStart,
          outcome: 'DEFERRED',
        };
      }

      const persistStart = Date.now();
      await db.updateSignalLifecycleEvent(
        event.id,
        {},
        {
          stage: 'CONFIRMATION',
          timeframe: cTf,
          candleTimestamp: confirmCandleIso,
          evaluatedPrice: targetCandle.close,
          score: null,
          resultStatus: 'PENDING_CONFIRMATION',
          satisfiedRules: [],
          failedRules: ['Distinct post-setup confirmation candle event'],
          reason: waitReason,
          dataFreshness: 'CURRENT',
        }
      );
      const persistElapsed = Date.now() - persistStart;

      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'PENDING_CONFIRMATION',
        m5BosDetected: false,
        m5CandleConfirmed: false,
        score: null,
        candleTimestamp: confirmCandleIso,
        satisfiedRules: [],
        failedRules: ['Distinct post-setup confirmation candle event'],
        reason: waitReason,
        statusCheckMs,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
        m5DurationMs: null,
        eventPersistenceMs: persistElapsed,
        fetchDurationMs,
        totalEventMs: Date.now() - eventStart,
        outcome: 'DEFERRED',
      };
    }

    // 4. Evaluate Technical Indicators, Structure, and Signal Engine on Confirmation Timeframe (M5)
    if (options?.deadlineMs && (options.deadlineMs - Date.now() < 400)) {
      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'PENDING_CONFIRMATION',
        m5BosDetected: false,
        m5CandleConfirmed: false,
        score: null,
        candleTimestamp: confirmCandleIso,
        satisfiedRules: [],
        failedRules: ['Cycle deadline reached before M5 technical evaluation'],
        reason: 'Cycle deadline reached before M5 technical evaluation. Preserving PENDING_CONFIRMATION.',
        statusCheckMs,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
        m5DurationMs: null,
        eventPersistenceMs: null,
        fetchDurationMs,
        totalEventMs: Date.now() - eventStart,
        outcome: 'DEFERRED',
      };
    }

    const m5EvalStart = Date.now();
    const currentPrice = targetCandle.close;
    const indicator = IndicatorEngine.computeLatestSnapshot(evalCandles, sym, cTf);
    const structure = analyzeMarketStructure(evalCandles as any, 3);
    const { trend } = classifyTrend(currentPrice, indicator);
    const { momentum } = classifyMomentum(indicator);

    const internalTargetDir: TradeDirection = event.direction === 'BUY' ? 'LONG' : 'SHORT';
    const internalOppositeDir: TradeDirection = event.direction === 'BUY' ? 'SHORT' : 'LONG';

    const targetSignal = evaluateSignal({
      userId: event.userId,
      pair: sym,
      timeframe: cTf,
      direction: internalTargetDir,
      candles: evalCandles as any,
      indicator,
      structure,
      htfTrend: (event.h4Direction as MarketBias) || trend,
      entryPrice: event.entryPrice,
      stopLoss: event.stopLoss,
      takeProfit1: event.takeProfit1,
      takeProfit2:
        event.takeProfit2 ||
        (internalTargetDir === 'LONG'
          ? event.entryPrice + Math.abs(event.entryPrice - event.stopLoss) * 3
          : event.entryPrice - Math.abs(event.stopLoss - event.entryPrice) * 3),
      dataStatus: 'CURRENT',
      dataQuality,
    });

    const oppLevels = generateOptimalSignalLevels({
      pair: sym,
      direction: internalOppositeDir,
      currentPrice,
      atr: indicator.atr14,
      indicator,
      structure,
      candles: evalCandles as any,
    });

    const oppositeSignal = evaluateSignal({
      userId: event.userId,
      pair: sym,
      timeframe: cTf,
      direction: internalOppositeDir,
      candles: evalCandles as any,
      indicator,
      structure,
      htfTrend: trend,
      entryPrice: oppLevels.entryPrice,
      stopLoss: oppLevels.stopLoss,
      takeProfit1: oppLevels.takeProfit1,
      takeProfit2: oppLevels.takeProfit2,
      dataStatus: 'CURRENT',
      dataQuality,
    });

    const policy = resolvedConfig?.invalidationPolicy || 'OPPOSITE_OR_STOP';
    const confirmThreshold = resolvedConfig?.confirmationScoreThreshold ?? 65;

    // 5. Check Invalidation Policy (Price Stop Breach & Opposite Confirmation Signal)
    const stopBreached =
      event.direction === 'BUY'
        ? targetCandle.close <= event.stopLoss || targetCandle.low <= event.stopLoss
        : targetCandle.close >= event.stopLoss || targetCandle.high >= event.stopLoss;

    const oppositeBias = event.direction === 'BUY' ? 'BEARISH' : 'BULLISH';
    const oppositeStructure =
      event.direction === 'BUY'
        ? structure.isBearishBOS || (structure.isLowerHigh && structure.isLowerLow)
        : structure.isBullishBOS || (structure.isHigherHigh && structure.isHigherLow);

    const hasOppositeSignal =
      oppositeSignal.status !== 'BLOCKED' &&
      oppositeSignal.status !== 'NO_SETUP' &&
      oppositeSignal.score >= confirmThreshold &&
      oppositeSignal.score > targetSignal.score &&
      (trend === oppositeBias || oppositeStructure);

    const shouldInvalidateByStop =
      (policy === 'PRICE_STOP_BREACH' || policy === 'OPPOSITE_OR_STOP') && stopBreached;
    const shouldInvalidateByOpposite =
      (policy === 'OPPOSITE_SIGNAL' || policy === 'OPPOSITE_OR_STOP') && hasOppositeSignal;

    // 6. Evaluate M5 Break of Structure (BOS) + Closed Confirmation Candle + Configurable Rules
    const m5BosCheck = this.evaluateM5BosAndCandleConfirmation(
      evalCandles,
      event.direction,
      structure
    );
    const m5DurationMs = Date.now() - m5EvalStart;

    // Check deadline before database persistence
    if (options?.deadlineMs && (options.deadlineMs - Date.now() < 500)) {
      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'PENDING_CONFIRMATION',
        m5BosDetected: m5BosCheck.bosDetected,
        m5CandleConfirmed: m5BosCheck.candleConfirmed,
        score: targetSignal.score,
        candleTimestamp: confirmCandleIso,
        satisfiedRules: [],
        failedRules: ['Cycle deadline reached before event persistence'],
        reason: 'Cycle deadline reached before event persistence. Preserving PENDING_CONFIRMATION.',
        statusCheckMs,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
        m5DurationMs,
        eventPersistenceMs: null,
        fetchDurationMs,
        totalEventMs: Date.now() - eventStart,
        outcome: 'DEFERRED',
      };
    }

    if (shouldInvalidateByStop || shouldInvalidateByOpposite) {
      const oppDirLabel = event.direction === 'BUY' ? 'SELL' : 'BUY';
      const invReason = shouldInvalidateByStop
        ? `Invalidated by Stop Loss breach on ${cTf}: Price (${
            event.direction === 'BUY' ? targetCandle.low : targetCandle.high
          }) breached Stop Loss (${event.stopLoss}).`
        : `Invalidated by conflicting ${oppDirLabel} signal on ${cTf} (Opposite Score: ${oppositeSignal.score}/100, Trend: ${trend}).`;

      if (options?.deadlineMs && (options.deadlineMs - Date.now() < 500)) {
        return {
          signalEventId: event.id,
          maskedEventId,
          symbol: sym,
          direction: event.direction,
          confirmationTimeframe: cTf,
          previousStatus: event.lifecycleStatus,
          newStatus: 'PENDING_CONFIRMATION',
          m5BosDetected: false,
          m5CandleConfirmed: false,
          score: targetSignal.score,
          candleTimestamp: confirmCandleIso,
          satisfiedRules: [],
          failedRules: ['Cycle deadline reached before invalidation persistence'],
          reason: 'Cycle deadline reached before invalidation persistence. Preserving PENDING_CONFIRMATION.',
          statusCheckMs,
          dbCandleMs,
          providerCallMs,
          syncMarketDataMs,
          m5DurationMs,
          eventPersistenceMs: null,
          fetchDurationMs,
          totalEventMs: Date.now() - eventStart,
          outcome: 'DEFERRED',
        };
      }

      const persistStart = Date.now();
      await db.updateSignalLifecycleEvent(
        event.id,
        {
          lifecycleStatus: 'INVALIDATED',
          invalidatedAt: new Date(nowMs).toISOString(),
          invalidationReason: invReason,
          conflictingDirection: shouldInvalidateByOpposite ? oppDirLabel : null,
          confirmationScore: targetSignal.score,
          confirmationCandleTimestamp: confirmCandleIso,
          m5BosDetected: false,
          m5CandleConfirmed: false,
        },
        {
          stage: 'CONFIRMATION',
          timeframe: cTf,
          candleTimestamp: confirmCandleIso,
          evaluatedPrice: currentPrice,
          score: targetSignal.score,
          resultStatus: 'INVALIDATED',
          satisfiedRules: [],
          failedRules: [
            shouldInvalidateByStop
              ? `Price must hold Stop Loss (${event.stopLoss})`
              : `No opposite ${oppDirLabel} signal on ${cTf}`,
          ],
          reason: invReason,
          dataFreshness: 'CURRENT',
        }
      );
      const persistElapsed = Date.now() - persistStart;

      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'INVALIDATED',
        m5BosDetected: false,
        m5CandleConfirmed: false,
        score: targetSignal.score,
        candleTimestamp: confirmCandleIso,
        satisfiedRules: [],
        failedRules: [invReason],
        reason: invReason,
        statusCheckMs,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
        m5DurationMs,
        eventPersistenceMs: persistElapsed,
        fetchDurationMs,
        totalEventMs: Date.now() - eventStart,
        outcome: 'INVALIDATED',
      };
    }

    const expectedBias = event.direction === 'BUY' ? 'BULLISH' : 'BEARISH';
    const satisfiedRules: string[] = [];
    const failedRules: string[] = [];

    // Rule 1 (Mandatory for Stage 2): Break of Structure (BOS) on M5
    if (m5BosCheck.bosDetected) {
      satisfiedRules.push(m5BosCheck.bosReason);
    } else {
      failedRules.push(m5BosCheck.bosReason);
    }

    // Rule 2 (Mandatory for Stage 2): Closed Confirmation Candle on M5
    if (m5BosCheck.candleConfirmed) {
      satisfiedRules.push(m5BosCheck.candleReason);
    } else {
      failedRules.push(m5BosCheck.candleReason);
    }

    // Rule 3: Confirmation Score Threshold
    if (targetSignal.status !== 'BLOCKED' && targetSignal.score >= confirmThreshold) {
      satisfiedRules.push(`Confirmation Score ${targetSignal.score}/100 >= ${confirmThreshold}`);
    } else {
      failedRules.push(
        `Confirmation Score ${targetSignal.score}/100 < required ${confirmThreshold} (${targetSignal.status})`
      );
    }

    // Rule 4: Trend Alignment
    if (resolvedConfig?.requireTrendAlignment ?? true) {
      const trendAligned =
        trend === expectedBias ||
        (trend === 'NEUTRAL' && targetSignal.structureScore >= 16);
      if (trendAligned) {
        satisfiedRules.push(`${cTf} Trend alignment (${trend})`);
      } else {
        failedRules.push(`${cTf} Trend is ${trend} (requires ${expectedBias})`);
      }
    }

    // Rule 5: Market Structure Alignment
    if (resolvedConfig?.requireStructureAlignment ?? true) {
      const structAligned =
        event.direction === 'BUY'
          ? structure.trend === 'BULLISH' ||
            structure.isBullishBOS ||
            structure.isHigherLow ||
            structure.isHigherHigh
          : structure.trend === 'BEARISH' ||
            structure.isBearishBOS ||
            structure.isLowerHigh ||
            structure.isLowerLow;
      if (structAligned) {
        satisfiedRules.push(
          `${cTf} Market Structure aligned (${structure.lastStructureEvent || structure.trend})`
        );
      } else {
        failedRules.push(
          `${cTf} Market Structure (${structure.lastStructureEvent || structure.trend}) not yet aligned with ${event.direction}`
        );
      }
    }

    // Rule 6: Momentum Alignment
    if (resolvedConfig?.requireMomentumAlignment ?? false) {
      if (momentum === expectedBias) {
        satisfiedRules.push(`${cTf} Momentum aligned (${momentum})`);
      } else {
        failedRules.push(`${cTf} Momentum is ${momentum} (requires ${expectedBias})`);
      }
    }

    // Rule 7: Minimum ADX
    const minAdx = Number(resolvedConfig?.minAdx ?? 18);
    const adxVal = indicator.adx14 ?? 20;
    if (minAdx > 0) {
      if (adxVal >= minAdx) {
        satisfiedRules.push(`${cTf} ADX ${adxVal.toFixed(1)} >= ${minAdx}`);
      } else {
        failedRules.push(`${cTf} ADX ${adxVal.toFixed(1)} < minimum ${minAdx}`);
      }
    }

    // 7. Transition to CONFIRMED ONLY if M5 BOS + Closed Confirmation Candle + all rules are satisfied
    if (m5BosCheck.bosDetected && m5BosCheck.candleConfirmed && failedRules.length === 0) {
      const confirmReason = `Confirmed on ${cTf} (BOS + Closed Candle): ${satisfiedRules.join(' • ')}`;
      const confirmIdempotencyKey = `sig:conf:${event.id}`;

      if (options?.deadlineMs && (options.deadlineMs - Date.now() < 500)) {
        return {
          signalEventId: event.id,
          maskedEventId,
          symbol: sym,
          direction: event.direction,
          confirmationTimeframe: cTf,
          previousStatus: event.lifecycleStatus,
          newStatus: 'PENDING_CONFIRMATION',
          m5BosDetected: true,
          m5CandleConfirmed: true,
          score: targetSignal.score,
          candleTimestamp: confirmCandleIso,
          satisfiedRules,
          failedRules: [],
          reason: 'Cycle deadline reached before confirmation persistence. Preserving PENDING_CONFIRMATION.',
          statusCheckMs,
          dbCandleMs,
          providerCallMs,
          syncMarketDataMs,
          m5DurationMs,
          eventPersistenceMs: null,
          fetchDurationMs,
          totalEventMs: Date.now() - eventStart,
          outcome: 'DEFERRED',
        };
      }

      const persistStart = Date.now();
      const confirmedEvent = await db.updateSignalLifecycleEvent(
        event.id,
        {
          lifecycleStatus: 'CONFIRMED',
          confirmationIdempotencyKey: confirmIdempotencyKey,
          confirmationScore: targetSignal.score,
          confirmationCandleTimestamp: confirmCandleIso,
          confirmedAt: new Date(nowMs).toISOString(),
          confirmationReason: confirmReason,
          m5BosDetected: true,
          m5CandleConfirmed: true,
        },
        {
          stage: 'CONFIRMATION',
          timeframe: cTf,
          candleTimestamp: confirmCandleIso,
          evaluatedPrice: currentPrice,
          score: targetSignal.score,
          resultStatus: 'CONFIRMED',
          satisfiedRules,
          failedRules: [],
          reason: confirmReason,
          dataFreshness: 'CURRENT',
        }
      );
      const persistElapsed = Date.now() - persistStart;

      let notificationQueued = false;
      let notificationSkippedReason: string | undefined;

      if (resolvedConfig && resolvedConfig.enableConfirmationAlert) {
        const notifyRes = await whatsappCloudProvider.enqueueSignalNotification({
          userId: event.userId,
          config: resolvedConfig,
          event: confirmedEvent,
          notificationType: 'CONFIRMED_SIGNAL',
          dispatchImmediately: true,
        });
        notificationQueued = notifyRes.queued;
        notificationSkippedReason = notifyRes.skippedReason;
      } else {
        notificationSkippedReason = 'Confirmation alert is disabled in configuration.';
      }

      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'CONFIRMED',
        m5BosDetected: true,
        m5CandleConfirmed: true,
        score: targetSignal.score,
        candleTimestamp: confirmCandleIso,
        satisfiedRules,
        failedRules: [],
        reason: confirmReason,
        notificationQueued,
        notificationSkippedReason,
        statusCheckMs,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
        m5DurationMs,
        eventPersistenceMs: persistElapsed,
        fetchDurationMs,
        totalEventMs: Date.now() - eventStart,
        outcome: 'CONFIRMED',
      };
    }

    // 8. Otherwise remain PENDING_CONFIRMATION (never send false confirmation!)
    const pendingReason = `Awaiting ${cTf} confirmation: ${failedRules.join('; ')}`;

    if (options?.deadlineMs && (options.deadlineMs - Date.now() < 400)) {
      return {
        signalEventId: event.id,
        maskedEventId,
        symbol: sym,
        direction: event.direction,
        confirmationTimeframe: cTf,
        previousStatus: event.lifecycleStatus,
        newStatus: 'PENDING_CONFIRMATION',
        m5BosDetected: m5BosCheck.bosDetected,
        m5CandleConfirmed: m5BosCheck.candleConfirmed,
        score: targetSignal.score,
        candleTimestamp: confirmCandleIso,
        satisfiedRules,
        failedRules,
        reason: pendingReason,
        statusCheckMs,
        dbCandleMs,
        providerCallMs,
        syncMarketDataMs,
        m5DurationMs,
        eventPersistenceMs: null,
        fetchDurationMs,
        totalEventMs: Date.now() - eventStart,
        outcome: 'DEFERRED',
      };
    }

    const persistStart = Date.now();
    await db.updateSignalLifecycleEvent(
      event.id,
      {
        confirmationScore: targetSignal.score,
        confirmationCandleTimestamp: confirmCandleIso,
        m5BosDetected: m5BosCheck.bosDetected,
        m5CandleConfirmed: m5BosCheck.candleConfirmed,
      },
      {
        stage: 'CONFIRMATION',
        timeframe: cTf,
        candleTimestamp: confirmCandleIso,
        evaluatedPrice: currentPrice,
        score: targetSignal.score,
        resultStatus: 'PENDING_CONFIRMATION',
        satisfiedRules,
        failedRules,
        reason: pendingReason,
        dataFreshness: 'CURRENT',
      }
    );
    const persistElapsed = Date.now() - persistStart;

    return {
      signalEventId: event.id,
      maskedEventId,
      symbol: sym,
      direction: event.direction,
      confirmationTimeframe: cTf,
      previousStatus: event.lifecycleStatus,
      newStatus: 'PENDING_CONFIRMATION',
      m5BosDetected: m5BosCheck.bosDetected,
      m5CandleConfirmed: m5BosCheck.candleConfirmed,
      score: targetSignal.score,
      candleTimestamp: confirmCandleIso,
      satisfiedRules,
      failedRules,
      reason: pendingReason,
      statusCheckMs,
      dbCandleMs,
      providerCallMs,
      syncMarketDataMs,
      m5DurationMs,
      eventPersistenceMs: persistElapsed,
      fetchDurationMs,
      totalEventMs: Date.now() - eventStart,
      outcome: 'PENDING_AWAITING_BOS',
    };
  }

  /**
   * Executes a complete Dual-Stage evaluation cycle (Stage 2 pending confirmations + Stage 1 initial detections + WhatsApp retry queue).
   * Designed for stateless Vercel serverless / Cron execution backed by Neon PostgreSQL state.
   */
  public static async runEvaluationCycle(params?: {
    userId?: string;
    symbol?: string;
    triggerSource?: 'MANUAL' | 'CRON' | 'SCHEDULER';
    deadlineMs?: number;
    maxDurationMs?: number;
  }): Promise<DualStageCycleReport> {
    const cycleStartMs = Date.now();
    const startedAt = new Date().toISOString();
    const triggerSource = params?.triggerSource || 'MANUAL';
    const targetSymbol = params?.symbol ? params.symbol.toUpperCase() : 'XAUUSD';
    const lockKey = `EVAL_${targetSymbol}`;
    const lockId = `${process.pid}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    // Single absolute deadline per cycle: strictly bounded to guarantee completion within serverless limits
    const maxDurationMs = params?.maxDurationMs || 6500;
    const cycleDeadlineMs = params?.deadlineMs || (cycleStartMs + maxDurationMs);
    const isDeadlineExceeded = (minRequiredMs = 0): boolean => Date.now() + minRequiredMs > cycleDeadlineMs;

    const executionDurations: {
      totalMs: number;
      neonInitMs: number | null;
      connCheckMs: number | null;
      atomicLockAcquireMs: number | null;
      lockWaitMs: number | null;
      lockAcquireMs: number | null;
      configQueryMs: number | null;
      configCacheHit: boolean | null;
      pendingEventsQueryMs: number | null;
      pendingEventsCount: number;
      pendingEventsProcessedCount: number;
      pendingEventsConfirmedCount: number;
      pendingEventsInvalidatedCount: number;
      pendingEventsExpiredCount: number;
      pendingEventsDeferredCount: number;
      pendingEventsSkippedCount: number;
      pendingFetchMs: number | null;
      pendingDbCandleMs: number | null;
      pendingProviderSyncMs: number | null;
      pendingEventsTotalMs: number | null;
      h4Ms: number | null;
      h1Ms: number | null;
      m15Ms: number | null;
      m5Ms: number | null;
      eventPersistenceMs: number | null;
      notificationQueueMs: number | null;
      lastStage: string;
      haltReason: string | null;
      strategyCompleted: boolean;
    } = {
      totalMs: 0,
      neonInitMs: null,
      connCheckMs: null,
      atomicLockAcquireMs: null,
      lockWaitMs: null,
      lockAcquireMs: null,
      configQueryMs: null,
      configCacheHit: null,
      pendingEventsQueryMs: null,
      pendingEventsCount: 0,
      pendingEventsProcessedCount: 0,
      pendingEventsConfirmedCount: 0,
      pendingEventsInvalidatedCount: 0,
      pendingEventsExpiredCount: 0,
      pendingEventsDeferredCount: 0,
      pendingEventsSkippedCount: 0,
      pendingFetchMs: null,
      pendingDbCandleMs: null,
      pendingProviderSyncMs: null,
      pendingEventsTotalMs: null,
      h4Ms: null,
      h1Ms: null,
      m15Ms: null,
      m5Ms: null,
      eventPersistenceMs: null,
      notificationQueueMs: null,
      lastStage: 'START',
      haltReason: null,
      strategyCompleted: false,
    };

    const fmt = (v: number | null | undefined): string =>
      v === null || v === undefined ? 'not_run' : `${v}`;

    // 1. In-memory local process mutex
    if (this.isCycleRunning) {
      console.log(
        `[DualStageSignalAlertService] In-memory concurrency guard: cycle already running in current instance for ${targetSymbol}`
      );
      executionDurations.lastStage = 'IN_MEMORY_LOCKED';
      executionDurations.haltReason = 'IN_MEMORY_CONCURRENCY_LOCKED';
      executionDurations.totalMs = Date.now() - cycleStartMs;
      return {
        startedAt,
        completedAt: new Date().toISOString(),
        triggerSource,
        stage1Evaluations: [],
        stage2Evaluations: [],
        queueSummary: { processedCount: 0, sentCount: 0, failedCount: 0 },
        creditBudget: twelveDataBudget.getSnapshot(),
        skippedReason: 'IN_MEMORY_CONCURRENCY_LOCKED',
        executionDurations,
      };
    }

    // Pre-flight check: ensure sufficient budget before attempting lock
    if (isDeadlineExceeded(1200)) {
      console.warn(
        `[DualStageSignalAlertService] Cycle deadline (${maxDurationMs}ms) exceeded before distributed lock acquisition. Halting gracefully.`
      );
      executionDurations.lastStage = 'PRE_LOCK_DEADLINE_EXCEEDED';
      executionDurations.haltReason = 'CYCLE_DEADLINE_EXCEEDED_BEFORE_LOCK';
      executionDurations.totalMs = Date.now() - cycleStartMs;
      return {
        startedAt,
        completedAt: new Date().toISOString(),
        triggerSource,
        stage1Evaluations: [],
        stage2Evaluations: [],
        queueSummary: { processedCount: 0, sentCount: 0, failedCount: 0 },
        creditBudget: twelveDataBudget.getSnapshot(),
        skippedReason: 'DEADLINE_EXCEEDED_BEFORE_LOCK',
        executionDurations,
      };
    }

    // 2. Database-backed atomic distributed lock (cross-Vercel instance)
    const lockStart = Date.now();
    const lockResult = await db.acquireDistributedLock({
      lockKey,
      lockId,
      leaseSeconds: 30, // 30-second lease with automatic recovery/expiry to prevent permanent deadlocks
    });
    executionDurations.lockAcquireMs = Date.now() - lockStart;
    executionDurations.neonInitMs = lockResult.neonInitMs ?? null;
    executionDurations.connCheckMs = lockResult.connCheckMs ?? null;
    executionDurations.atomicLockAcquireMs = lockResult.atomicLockAcquireMs ?? null;
    executionDurations.lockWaitMs = lockResult.lockWaitMs ?? null;
    executionDurations.lastStage = 'LOCK_ACQUIRED';

    if (!lockResult.acquired) {
      console.log(
        `[DualStageSignalAlertService] Distributed concurrency guard: active lock '${lockKey}' held by another serverless instance. Skipping cycle cleanly.`
      );
      executionDurations.haltReason = 'DISTRIBUTED_LOCK_ACTIVE';
      executionDurations.totalMs = Date.now() - cycleStartMs;
      return {
        startedAt,
        completedAt: new Date().toISOString(),
        triggerSource,
        stage1Evaluations: [],
        stage2Evaluations: [],
        queueSummary: { processedCount: 0, sentCount: 0, failedCount: 0 },
        creditBudget: twelveDataBudget.getSnapshot(),
        skippedReason: 'DISTRIBUTED_LOCK_ACTIVE',
        executionDurations,
      };
    }

    this.isCycleRunning = true;
    try {
      if (params?.userId) {
        await db.ensureDefaultXauusdAlertConfig(params.userId);
      }

      // Shared timeframe candles cache across pending events and Stage 1
      const sharedTimeframeCandles: Partial<Record<Timeframe, Candle[]>> = {};

      // 1. Evaluate existing PENDING_CONFIRMATION events first (Stage 2 on M5)
      const stage2Evaluations: Stage2EvaluationOutcome[] = [];

      if (isDeadlineExceeded(1200)) {
        console.warn(
          `[DualStageSignalAlertService] Cycle deadline reached before pending events query. Halting gracefully.`
        );
        executionDurations.lastStage = 'PRE_PENDING_DEADLINE_EXCEEDED';
        executionDurations.haltReason = 'CYCLE_DEADLINE_EXCEEDED_BEFORE_PENDING_QUERY';
      } else {
        const pendingStart = Date.now();
        const pendingEvents = await db.getPendingConfirmationEvents({
          userId: params?.userId,
          symbol: targetSymbol,
        });
        executionDurations.pendingEventsQueryMs = Date.now() - pendingStart;
        executionDurations.pendingEventsCount = pendingEvents.length;
        executionDurations.lastStage = 'PENDING_QUERIED';

        const pendingLoopStart = Date.now();
        const MAX_PENDING_PER_CYCLE = 5;
        const eventsToProcess = pendingEvents.slice(0, MAX_PENDING_PER_CYCLE);

        for (let i = 0; i < eventsToProcess.length; i++) {
          const ev = eventsToProcess[i];
          const eventItemStart = Date.now();
          if (isDeadlineExceeded(1200)) {
            console.warn(
              `[DualStageSignalAlertService] Cycle duration budget (${maxDurationMs}ms) reached during pending events. Halting gracefully.`
            );
            executionDurations.lastStage = `PENDING_EVENT_${ev.id}_HALTED`;
            executionDurations.haltReason = 'CYCLE_DEADLINE_EXCEEDED_DURING_PENDING_EVENTS';
            break;
          }

          executionDurations.lastStage = `PENDING_EVENT_${ev.id}_START`;
          const s2 = await this.evaluateStage2Confirmation(ev, undefined, {
            deadlineMs: cycleDeadlineMs,
            timeframeCandles: sharedTimeframeCandles,
          });
          executionDurations.pendingEventsProcessedCount++;

          switch (s2.outcome) {
            case 'CONFIRMED':
              executionDurations.pendingEventsConfirmedCount++;
              break;
            case 'INVALIDATED':
              executionDurations.pendingEventsInvalidatedCount++;
              break;
            case 'EXPIRED':
              executionDurations.pendingEventsExpiredCount++;
              break;
            case 'DEFERRED':
              executionDurations.pendingEventsDeferredCount++;
              break;
            case 'SKIPPED':
              executionDurations.pendingEventsSkippedCount++;
              break;
          }

          if (typeof s2.fetchDurationMs === 'number') {
            executionDurations.pendingFetchMs =
              (executionDurations.pendingFetchMs || 0) + s2.fetchDurationMs;
          }
          if (typeof s2.dbCandleMs === 'number') {
            executionDurations.pendingDbCandleMs =
              (executionDurations.pendingDbCandleMs || 0) + s2.dbCandleMs;
          }
          if (typeof s2.providerCallMs === 'number') {
            executionDurations.pendingProviderSyncMs =
              (executionDurations.pendingProviderSyncMs || 0) + s2.providerCallMs;
          }
          // Only record to m5Ms if M5 technical evaluation actually started and ran!
          if (typeof s2.m5DurationMs === 'number') {
            executionDurations.m5Ms = (executionDurations.m5Ms || 0) + s2.m5DurationMs;
          }
          if (typeof s2.eventPersistenceMs === 'number') {
            executionDurations.eventPersistenceMs =
              (executionDurations.eventPersistenceMs || 0) + s2.eventPersistenceMs;
          }
          stage2Evaluations.push(s2);
          executionDurations.lastStage = `PENDING_EVENT_${ev.id}_COMPLETED`;

          const maskedId = s2.maskedEventId || (ev.id.length > 8 ? `${ev.id.slice(0, 6)}...${ev.id.slice(-4)}` : ev.id);
          console.log(
            `[DualStageAlert] event=pending_confirmation_evaluated masked_id=${maskedId} symbol=${s2.symbol} direction=${s2.direction} prev_status=${s2.previousStatus} new_status=${s2.newStatus} outcome=${s2.outcome || 'UNKNOWN'} status_check_ms=${fmt(s2.statusCheckMs)} db_candle_ms=${fmt(s2.dbCandleMs)} provider_call_ms=${fmt(s2.providerCallMs)} sync_market_data_ms=${fmt(s2.syncMarketDataMs)} m5_eval_ms=${fmt(s2.m5DurationMs)} event_persistence_ms=${fmt(s2.eventPersistenceMs)} total_ms=${s2.totalEventMs ?? (Date.now() - eventItemStart)} m5_bos=${s2.m5BosDetected} m5_candle_confirmed=${s2.m5CandleConfirmed}`
          );

          if (isDeadlineExceeded(0)) {
            executionDurations.lastStage = `PENDING_EVENT_${ev.id}_HALTED`;
            executionDurations.haltReason = 'CYCLE_DEADLINE_EXCEEDED_DURING_PENDING_EVENTS';
            break;
          }
        }
        executionDurations.pendingEventsTotalMs = Date.now() - pendingLoopStart;
      }

      // 2. Evaluate enabled SignalAlertConfigs for new initial setups (Stage 1 on H4 + H1 + M15)
      const stage1Evaluations: Stage1EvaluationOutcome[] = [];

      if (executionDurations.haltReason) {
        // Already halted during pending events phase; preserve exact lastStage and haltReason without querying configs
      } else if (isDeadlineExceeded(1500)) {
        console.warn(
          `[DualStageSignalAlertService] Cycle deadline reached before config query. Halting gracefully.`
        );
        executionDurations.lastStage = 'PRE_CONFIG_DEADLINE_EXCEEDED';
        executionDurations.haltReason = 'CYCLE_DEADLINE_EXCEEDED_BEFORE_CONFIG_QUERY';
      } else {
        const isConfigCached = db.hasEnabledSignalAlertConfigsCached({
          userId: params?.userId,
          symbol: targetSymbol,
        });
        const configStart = Date.now();
        const enabledConfigs = await db.getEnabledSignalAlertConfigs({
          userId: params?.userId,
          symbol: targetSymbol,
        });
        executionDurations.configQueryMs = Date.now() - configStart;
        executionDurations.configCacheHit = isConfigCached;
        executionDurations.lastStage = 'CONFIGS_QUERIED';

        if (enabledConfigs.length === 0) {
          executionDurations.strategyCompleted = true;
          if (!executionDurations.haltReason) {
            executionDurations.haltReason = 'NO_ENABLED_CONFIGS';
          }
        }

        for (const cfg of enabledConfigs) {
          if (isDeadlineExceeded(1000)) {
            console.warn(
              `[DualStageSignalAlertService] Cycle duration budget (${maxDurationMs}ms) reached before config ${cfg.id}. Halting gracefully.`
            );
            executionDurations.lastStage = `CONFIG_${cfg.id}_HALTED`;
            executionDurations.haltReason = `CYCLE_DEADLINE_EXCEEDED_BEFORE_CONFIG_${cfg.id}`;
            break;
          }

          const s1 = await this.evaluateStage1ForConfig(cfg, {
            deadlineMs: cycleDeadlineMs,
            timeframeCandles: sharedTimeframeCandles,
          });

          if (typeof s1.h4DurationMs === 'number') {
            executionDurations.h4Ms = (executionDurations.h4Ms || 0) + s1.h4DurationMs;
          }
          if (typeof s1.h1DurationMs === 'number') {
            executionDurations.h1Ms = (executionDurations.h1Ms || 0) + s1.h1DurationMs;
          }
          if (typeof s1.m15DurationMs === 'number') {
            executionDurations.m15Ms = (executionDurations.m15Ms || 0) + s1.m15DurationMs;
          }
          if (typeof s1.eventPersistenceMs === 'number') {
            executionDurations.eventPersistenceMs =
              (executionDurations.eventPersistenceMs || 0) + s1.eventPersistenceMs;
          }
          stage1Evaluations.push(s1);
          executionDurations.lastStage = `CONFIG_${cfg.id}`;

          // Immediate Stage 2 evaluation when a new initial setup is detected and created
          if (s1.createdNewEvent && s1.signalEvent) {
            if (!isDeadlineExceeded(800)) {
              const s2 = await this.evaluateStage2Confirmation(s1.signalEvent, cfg, {
                deadlineMs: cycleDeadlineMs,
                timeframeCandles: sharedTimeframeCandles,
              });
              if (typeof s2.m5DurationMs === 'number') {
                executionDurations.m5Ms = (executionDurations.m5Ms || 0) + s2.m5DurationMs;
              }
              if (typeof s2.eventPersistenceMs === 'number') {
                executionDurations.eventPersistenceMs =
                  (executionDurations.eventPersistenceMs || 0) + s2.eventPersistenceMs;
              }
              stage2Evaluations.push(s2);
            }
          }
        }

        // If loop finished all configs without halting early, strategy is fully completed ONLY if all configs resolved cleanly
        if (enabledConfigs.length > 0 && !executionDurations.haltReason) {
          const hasIncomplete = stage1Evaluations.some(
            (s) => s.state === 'SKIPPED_DATA_UNAVAILABLE' || s.reason?.includes('deadline exceeded')
          );
          if (!hasIncomplete) {
            executionDurations.strategyCompleted = true;
            executionDurations.haltReason = 'ALL_CONFIGS_EVALUATED';
          } else {
            executionDurations.strategyCompleted = false;
            const deadlineEval = stage1Evaluations.find((s) => s.reason?.includes('deadline exceeded'));
            if (deadlineEval) {
              executionDurations.haltReason = 'CYCLE_DEADLINE_EXCEEDED_DURING_STAGE1';
            } else {
              executionDurations.haltReason = 'TIMEFRAME_DATA_INCOMPLETE';
            }
          }
        }
      }

      // 3. Process due pending/retry-scheduled WhatsApp notification jobs (scoped by userId when provided)
      let queueRes = { processedCount: 0, sentCount: 0, failedCount: 0 };
      if (!executionDurations.haltReason && !isDeadlineExceeded(1200)) {
        const queueStart = Date.now();
        queueRes = await whatsappCloudProvider.processPendingQueue(10, params?.userId);
        executionDurations.notificationQueueMs = Date.now() - queueStart;
        executionDurations.lastStage = 'QUEUE_PROCESSED';
      }

      executionDurations.totalMs = Date.now() - cycleStartMs;

      console.log(
        `[DualStageAlert] event=evaluation_durations total_ms=${executionDurations.totalMs} lock_acquire_ms=${fmt(
          executionDurations.lockAcquireMs
        )} neon_init_ms=${fmt(executionDurations.neonInitMs)} conn_check_ms=${fmt(
          executionDurations.connCheckMs
        )} atomic_lock_ms=${fmt(executionDurations.atomicLockAcquireMs)} lock_wait_ms=${fmt(
          executionDurations.lockWaitMs
        )} config_query_ms=${fmt(executionDurations.configQueryMs)} config_cache_hit=${
          executionDurations.configCacheHit === null ? 'not_run' : executionDurations.configCacheHit
        } pending_query_ms=${fmt(
          executionDurations.pendingEventsQueryMs
        )} pending_count=${
          executionDurations.pendingEventsCount
        } pending_processed=${executionDurations.pendingEventsProcessedCount} pending_confirmed=${
          executionDurations.pendingEventsConfirmedCount
        } pending_invalidated=${
          executionDurations.pendingEventsInvalidatedCount
        } pending_expired=${
          executionDurations.pendingEventsExpiredCount
        } pending_deferred=${
          executionDurations.pendingEventsDeferredCount
        } pending_skipped=${
          executionDurations.pendingEventsSkippedCount
        } pending_fetch_ms=${fmt(
          executionDurations.pendingFetchMs
        )} pending_db_candle_ms=${fmt(
          executionDurations.pendingDbCandleMs
        )} pending_provider_sync_ms=${fmt(
          executionDurations.pendingProviderSyncMs
        )} pending_total_ms=${fmt(executionDurations.pendingEventsTotalMs)} h4_ms=${fmt(
          executionDurations.h4Ms
        )} h1_ms=${fmt(executionDurations.h1Ms)} m15_ms=${fmt(
          executionDurations.m15Ms
        )} m5_ms=${fmt(executionDurations.m5Ms)} event_persistence_ms=${fmt(
          executionDurations.eventPersistenceMs
        )} notification_queue_ms=${fmt(
          executionDurations.notificationQueueMs
        )} last_stage=${executionDurations.lastStage} halt_reason=${
          executionDurations.haltReason || 'none'
        } strategy_completed=${executionDurations.strategyCompleted} symbol=${targetSymbol}`
      );

      return {
        startedAt,
        completedAt: new Date().toISOString(),
        triggerSource,
        stage1Evaluations,
        stage2Evaluations,
        queueSummary: {
          processedCount: queueRes.processedCount,
          sentCount: queueRes.sentCount,
          failedCount: queueRes.failedCount,
        },
        creditBudget: twelveDataBudget.getSnapshot(),
        executionDurations,
      };
    } finally {
      this.isCycleRunning = false;
      try {
        await db.releaseDistributedLock({ lockKey, lockId });
      } catch (err: any) {
        console.warn(`[DualStageSignalAlertService] Warning releasing distributed lock '${lockKey}':`, err?.message);
      }
    }
  }
}
