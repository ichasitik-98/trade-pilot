import { db } from '../db/storage.ts';
import {
  AssetClass,
  Candle,
  MarketCandle,
  MarketAnalysis,
  MarketDataGap,
  MarketDataStatus,
  MarketDataStatusCode,
  MarketPrice,
  Timeframe,
  TIMEFRAMES,
} from '../types/index.ts';
import { defaultMarketDataProvider, normalizeSymbol, CandleValidator } from '../providers/market-data/index.ts';
import { IndicatorEngine } from '../engines/indicators/index.ts';
import { MultiTimeframeAnalysisService } from './multi-timeframe.ts';
import { parseToUtcTimestamp, toUtcIsoString } from '../utils/timezone.ts';

export interface FreshnessCheckResult {
  status: MarketDataStatusCode;
  isStale: boolean;
  isCurrent: boolean;
  freshnessMs: number;
  ageSeconds: number;
  thresholdMs: number;
  lastCandleTimestamp?: string | null;
}

export interface SyncMarketDataParams {
  instrument?: string;
  symbol?: string;
  timeframe: Timeframe;
  from?: string | number | Date;
  to?: string | number | Date;
  count?: number;
}

export interface SyncMarketDataSummary {
  provider: string;
  symbol: string;
  timeframe: Timeframe;
  requestedRange: {
    from?: string;
    to?: string;
    targetCount: number;
  };
  receivedCandles: number;
  insertedCandles: number;
  updatedCandles: number;
  rejectedCandles: number;
  gaps: { expectedTimestamp: string }[];
  latestTimestamp: string | null;
  freshness: FreshnessCheckResult;
  status: 'FRESH' | 'STALE' | 'UNAVAILABLE' | 'ERROR';
  dataQuality: number;
  durationMs: number;
}

export class MarketDataSyncService {
  private static inFlightSyncs = new Map<string, Promise<any>>();
  private static lastAttemptedSyncMs = new Map<string, number>();
  private static rateLimitUntilMs = 0;

  /**
   * Configurable freshness thresholds per timeframe (measured from candle UTC OPEN time)
   */
  public static getFreshnessThresholdMs(timeframe: Timeframe): number {
    switch (timeframe) {
      case 'M1': return 5 * 60 * 1000; // 5 minutes
      case 'M5': return 15 * 60 * 1000; // 15 minutes
      case 'M15': return 45 * 60 * 1000; // 45 minutes
      case 'M30': return 90 * 60 * 1000; // 90 minutes
      case 'H1': return 3 * 3600 * 1000; // 3 hours
      case 'H4': return 12 * 3600 * 1000; // 12 hours
      case 'D1': return 72 * 3600 * 1000; // 72 hours
      case 'W1': return 14 * 86400 * 1000; // 14 days
      default: return 3 * 3600 * 1000;
    }
  }

  /**
   * Recommended minimum historical candle count for reliable indicator calculation
   */
  public static getRecommendedCandleCount(timeframe: Timeframe): number {
    switch (timeframe) {
      case 'M15': return 500;
      case 'H1': return 500;
      case 'H4': return 300;
      case 'D1': return 300;
      default: return 300;
    }
  }

  /**
   * Check data freshness
   */
  public static checkFreshness(
    lastCandleTimestamp: number | null | undefined,
    timeframe: Timeframe,
    assetClass: AssetClass = 'FOREX'
  ): FreshnessCheckResult {
    const baseThresholdMs = this.getFreshnessThresholdMs(timeframe);
    const nowMs = Date.now();
    const isWeekendNow = assetClass !== 'CRYPTO' && this.isForexWeekendClosure(nowMs);
    const utcDay = new Date(nowMs).getUTCDay();
    const isPostWeekendMonday = assetClass !== 'CRYPTO' && utcDay === 1 && (timeframe === 'D1' || timeframe === 'H4');

    const thresholdMs = isWeekendNow
      ? Math.max(baseThresholdMs, 84 * 3600 * 1000)
      : isPostWeekendMonday
      ? Math.max(baseThresholdMs, 96 * 3600 * 1000)
      : baseThresholdMs;

    if (!lastCandleTimestamp || lastCandleTimestamp <= 0) {
      return {
        status: 'NO_DATA',
        isStale: true,
        isCurrent: false,
        freshnessMs: Infinity,
        ageSeconds: Infinity,
        thresholdMs,
        lastCandleTimestamp: null,
      };
    }

    const freshnessMs = Math.max(0, nowMs - lastCandleTimestamp);
    const ageSeconds = Math.floor(freshnessMs / 1000);
    const isStale = freshnessMs > thresholdMs;

    let status: MarketDataStatusCode = 'FRESH';
    if (defaultMarketDataProvider.isDemo) {
      status = 'DEMO';
    } else if (isStale) {
      status = 'STALE';
    } else if (!isWeekendNow && freshnessMs > thresholdMs * 0.75) {
      status = 'DELAYED';
    }

    return {
      status,
      isStale,
      isCurrent: !isStale,
      freshnessMs,
      ageSeconds,
      thresholdMs,
      lastCandleTimestamp: new Date(lastCandleTimestamp).toISOString(),
    };
  }

  /**
   * Calculates comprehensive data quality score (0-100)
   */
  public static calculateDataQualityScore(params: {
    candleCount: number;
    targetCount: number;
    invalidCount: number;
    gapsCount: number;
    isStale: boolean;
    hasProviderError: boolean;
  }): number {
    let score = 100;

    // 1. Completeness penalty (up to 30 pts)
    const completenessRatio = Math.min(1, params.candleCount / Math.max(1, params.targetCount));
    score -= Math.round((1 - completenessRatio) * 30);

    // 2. Freshness penalty (up to 25 pts)
    if (params.isStale) {
      score -= 25;
    }

    // 3. Provider error penalty (up to 25 pts)
    if (params.hasProviderError) {
      score -= 25;
    }

    // 4. Invalid candles penalty (up to 10 pts)
    if (params.invalidCount > 0) {
      score -= Math.min(10, params.invalidCount * 2);
    }

    // 5. Gaps penalty (up to 10 pts)
    if (params.gapsCount > 0) {
      score -= Math.min(10, params.gapsCount * 3);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Checks whether a UTC timestamp falls within typical market weekend closure.
   * Standard Forex & Metals market hours: Friday 21:00 UTC through Sunday 21:00 UTC.
   */
  public static isForexWeekendClosure(timestampMs: number): boolean {
    const d = new Date(timestampMs);
    const day = d.getUTCDay(); // 0 is Sunday, 5 is Friday, 6 is Saturday
    const hour = d.getUTCHours();

    if (day === 5 && hour >= 21) return true; // Friday after 21:00 UTC
    if (day === 6) return true;               // Saturday
    if (day === 0 && hour < 21) return true;  // Sunday before 21:00 UTC
    return false;
  }

  /**
   * Detects missing candle timestamps in a sequence.
   * Respects trading schedule: Forex/Metals skip weekend closure, Crypto trades 24/7/365.
   */
  public static detectGaps(
    candles: Candle[],
    timeframe: Timeframe,
    assetClass: AssetClass = 'FOREX'
  ): { expectedTimestamp: number }[] {
    if (!candles || candles.length < 2) return [];

    const durationSec = TIMEFRAMES[timeframe]?.durationSeconds ?? 3600;
    const durationMs = durationSec * 1000;
    const missing: { expectedTimestamp: number }[] = [];

    // Sort ascending chronologically
    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].timestamp;
      const curr = sorted[i].timestamp;
      const step = curr - prev;

      // Allow 20% jitter tolerance; if step > 1.8x duration, evaluate gap
      if (step > durationMs * 1.8) {
        let missed = prev + durationMs;
        while (missed < curr) {
          // Crypto trades continuously: all gaps are real
          // Forex and Metals close on weekends: weekend gaps are expected closures
          const isIgnoredClosure = assetClass !== 'CRYPTO' && this.isForexWeekendClosure(missed);
          if (!isIgnoredClosure) {
            missing.push({ expectedTimestamp: missed });
          }
          missed += durationMs;
        }
      }
    }

    return missing;
  }

  /**
   * Reusable canonical market data synchronization service
   * Flow:
   * 1. resolve Instrument
   * 2. resolve ProviderSymbolMapping
   * 3. resolve Twelve Data symbol
   * 4. resolve interval
   * 5. request Twelve Data
   * 6. validate response
   * 7. normalize candles
   * 8. deduplicate
   * 9. persist into Neon
   * 10. update MarketDataStatus
   * 11. detect gaps
   * 12. return sync summary
   */
  public static async syncMarketData(params: SyncMarketDataParams): Promise<SyncMarketDataSummary> {
    const startedAt = Date.now();
    const sym = normalizeSymbol(params.symbol || params.instrument || 'EURUSD');
    const tf = params.timeframe || 'H1';
    const targetCount = params.count || this.getRecommendedCandleCount(tf);

    // 1. Resolve Instrument
    const instrument = await db.getInstrumentBySymbol(sym);
    const assetClass: AssetClass = instrument?.assetClass || (sym.startsWith('BTC') ? 'CRYPTO' : sym === 'XAUUSD' ? 'METAL' : 'FOREX');

    // Query options
    const queryOpts: any = { limit: targetCount };
    if (params.from) {
      queryOpts.startTime = new Date(parseToUtcTimestamp(params.from));
    }
    if (params.to) {
      queryOpts.endTime = new Date(parseToUtcTimestamp(params.to));
    }

    let rawCandles: Candle[] = [];
    let hasProviderError = false;
    let providerErrorMsg: string | undefined;

    try {
      rawCandles = await defaultMarketDataProvider.getCandles(sym, tf, queryOpts);
    } catch (err: any) {
      hasProviderError = true;
      providerErrorMsg = err.message;
      console.warn(`[MarketDataSyncService] Error fetching ${sym} [${tf}]:`, err.message);

      // In REAL mode, do NOT fall back to DEMO; record status and rethrow
      if (defaultMarketDataProvider.mode === 'REAL') {
        const errorStatus: MarketDataStatus = {
          symbol: sym,
          timeframe: tf,
          lastCandleTimestamp: null,
          lastSuccessfulSync: null,
          provider: defaultMarketDataProvider.name,
          status: 'ERROR',
          dataQualityScore: 0,
          errorMessage: providerErrorMsg,
        };
        await db.upsertMarketDataStatus(errorStatus);
        throw err;
      }
    }

    // 6. Validate response & 7. Normalize candles
    const { validCandles, invalidCount } = CandleValidator.validateBatch(rawCandles);

    // 8. Deduplicate by timestamp ascending
    const timestampMap = new Map<number, Candle>();
    for (const c of validCandles) {
      timestampMap.set(c.timestamp, c);
    }
    const deduplicated = Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    // 9. Persist into Neon PostgreSQL
    let insertedCount = 0;
    if (deduplicated.length > 0) {
      const res = await db.upsertCandles(deduplicated);
      insertedCount = res.upsertedCount;
    }

    // Retrieve stored candles (ensure at least 250 lookback for 200-period indicator calculation)
    const dbLookback = Math.max(targetCount, 250);
    const storedCandles = await db.getCandles({
      symbol: sym,
      timeframe: tf,
      limit: dbLookback,
    });

    // 11. Detect gaps on the recent window
    const recentWindow = storedCandles.slice(-Math.min(storedCandles.length, 100));
    const detectedGaps = this.detectGaps(recentWindow, tf, assetClass);
    for (const g of detectedGaps) {
      await db.addMarketDataGap({
        symbol: sym,
        timeframe: tf,
        expectedTimestamp: new Date(g.expectedTimestamp).toISOString(),
        detectedAt: new Date().toISOString(),
        status: 'OPEN',
      });
    }

    // Freshness & Data Quality
    const latestCandle = storedCandles[storedCandles.length - 1];
    const freshness = this.checkFreshness(latestCandle?.timestamp, tf, assetClass);

    const dataQuality = this.calculateDataQualityScore({
      candleCount: storedCandles.length,
      targetCount: Math.min(targetCount, 250),
      invalidCount,
      gapsCount: detectedGaps.length,
      isStale: freshness.isStale,
      hasProviderError,
    });

    // 10. Update MarketDataStatus
    let finalStatus: 'FRESH' | 'STALE' | 'UNAVAILABLE' | 'ERROR';
    if (hasProviderError) {
      finalStatus = 'ERROR';
    } else if (storedCandles.length === 0) {
      finalStatus = 'UNAVAILABLE';
    } else if (freshness.isStale) {
      finalStatus = 'STALE';
    } else {
      finalStatus = 'FRESH';
    }

    const statusRecord: MarketDataStatus = {
      symbol: sym,
      timeframe: tf,
      lastCandleTimestamp: latestCandle ? new Date(latestCandle.timestamp).toISOString() : null,
      lastSuccessfulSync: new Date().toISOString(),
      provider: defaultMarketDataProvider.name,
      status: finalStatus,
      dataQualityScore: dataQuality,
      errorMessage: providerErrorMsg,
    };
    await db.upsertMarketDataStatus(statusRecord);

    // Calculate indicators on persisted canonical candles
    if (storedCandles.length >= 20) {
      const latestIndicators = IndicatorEngine.computeLatestSnapshot(storedCandles, sym, tf);
      await db.upsertTechnicalIndicators([latestIndicators]);
    }

    return {
      provider: defaultMarketDataProvider.name,
      symbol: sym,
      timeframe: tf,
      requestedRange: {
        from: params.from ? toUtcIsoString(params.from) : undefined,
        to: params.to ? toUtcIsoString(params.to) : undefined,
        targetCount,
      },
      receivedCandles: rawCandles.length,
      insertedCandles: insertedCount,
      updatedCandles: Math.max(0, rawCandles.length - insertedCount),
      rejectedCandles: invalidCount,
      gaps: detectedGaps.map((g) => ({ expectedTimestamp: new Date(g.expectedTimestamp).toISOString() })),
      latestTimestamp: latestCandle ? new Date(latestCandle.timestamp).toISOString() : null,
      freshness,
      status: finalStatus,
      dataQuality,
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Derives latest MarketPrice directly from canonical persisted real candles
   * Avoids redundant external Twelve Data HTTP calls and 429 rate-limit exceptions.
   */
  public static getLatestPriceFromCandles(
    symbol: string,
    candles: (Candle | MarketCandle)[]
  ): MarketPrice {
    const sym = normalizeSymbol(symbol);
    const isJPY = sym.includes('JPY') || sym === 'XAUUSD' || sym.startsWith('BTC');
    const decimals = isJPY ? 2 : 4;

    if (!candles || candles.length === 0) {
      return {
        symbol: sym,
        pair: sym,
        price: 0,
        bid: 0,
        ask: 0,
        change24h: 0,
        high24h: 0,
        low24h: 0,
        timestamp: Date.now(),
        source: 'TWELVEDATA',
        status: 'NO_DATA',
      };
    }

    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    const latest = sorted[sorted.length - 1];
    const price = latest.close;

    const cutoff = latest.timestamp - 24 * 3600 * 1000;
    const recent24h = sorted.filter((c) => c.timestamp >= cutoff);
    const windowCandles = recent24h.length > 0 ? recent24h : sorted.slice(-24);

    const open24h = windowCandles[0].open;
    let high24h = -Infinity;
    let low24h = Infinity;
    for (const c of windowCandles) {
      if (c.high > high24h) high24h = c.high;
      if (c.low < low24h) low24h = c.low;
    }

    const change24h = open24h > 0 ? Number((((price - open24h) / open24h) * 100).toFixed(2)) : 0;
    const spread = isJPY ? 0.02 : 0.00015;

    return {
      symbol: sym,
      pair: sym,
      price: Number(price.toFixed(decimals)),
      bid: Number((price - spread / 2).toFixed(decimals)),
      ask: Number((price + spread / 2).toFixed(decimals)),
      change24h,
      high24h: Number(high24h.toFixed(decimals)),
      low24h: Number(low24h.toFixed(decimals)),
      timestamp: latest.timestamp,
      source: 'TWELVEDATA',
      status: 'CURRENT',
    };
  }

  /**
   * Synchronize historical candles for a specific symbol & timeframe.
   * Automatically refreshes from Twelve Data when stored candles are stale, missing, or when
   * a new timeframe bar has opened, while coalescing concurrent requests and respecting rate limits.
   */
  public static async syncHistoricalCandles(
    symbol: string,
    timeframe: Timeframe = 'H1',
    count?: number,
    forceSync: boolean = false
  ): Promise<{
    candles: MarketCandle[];
    indicators: any;
    dataStatus: MarketDataStatus;
    dataQuality: number;
    freshness: FreshnessCheckResult;
  }> {
    const sym = normalizeSymbol(symbol);
    const targetCount = count || this.getRecommendedCandleCount(timeframe);
    const dbFetchLimit = Math.max(targetCount, 250);
    const syncKey = `${sym}:${timeframe}`;

    const inst = await db.getInstrumentBySymbol(sym);
    const assetClass: AssetClass =
      inst?.assetClass || (sym.startsWith('BTC') ? 'CRYPTO' : sym === 'XAUUSD' ? 'METAL' : 'FOREX');

    let storedCandles = await db.getCandles({
      symbol: sym,
      timeframe,
      limit: dbFetchLimit,
    });

    const latestBeforeSync = storedCandles[storedCandles.length - 1];
    const initialFreshness = this.checkFreshness(latestBeforeSync?.timestamp, timeframe, assetClass);
    const durationMs = (TIMEFRAMES[timeframe]?.durationSeconds ?? 3600) * 1000;
    const isWeekendClosed = assetClass !== 'CRYPTO' && this.isForexWeekendClosure(Date.now());
    const barHasRolledOver =
      !isWeekendClosed &&
      (!latestBeforeSync || Date.now() - latestBeforeSync.timestamp >= durationMs);

    const lastAttempt = this.lastAttemptedSyncMs.get(syncKey) || 0;
    const cooldownMs = forceSync ? 0 : initialFreshness.isStale ? 30_000 : 60_000;
    const isRateLimited = !forceSync && Date.now() < this.rateLimitUntilMs;

    const shouldSyncFromProvider =
      !isRateLimited &&
      (forceSync ||
        ((storedCandles.length < Math.min(targetCount, 200) || initialFreshness.isStale || barHasRolledOver) &&
          Date.now() - lastAttempt > cooldownMs));

    if (shouldSyncFromProvider) {
      let activePromise = this.inFlightSyncs.get(syncKey);
      if (!activePromise) {
        this.lastAttemptedSyncMs.set(syncKey, Date.now());
        // Use fast incremental window (60 bars) when >= 200 historical candles already exist in Neon
        const gapBars = latestBeforeSync
          ? Math.ceil((Date.now() - latestBeforeSync.timestamp) / durationMs)
          : 500;
        const fetchCount =
          storedCandles.length >= Math.min(targetCount, 200) && gapBars <= 45 ? Math.min(targetCount, 60) : targetCount;

        activePromise = this.syncMarketData({
          symbol: sym,
          timeframe,
          count: fetchCount,
        }).finally(() => {
          this.inFlightSyncs.delete(syncKey);
        });
        this.inFlightSyncs.set(syncKey, activePromise);
      }

      try {
        await activePromise;
        storedCandles = await db.getCandles({
          symbol: sym,
          timeframe,
          limit: dbFetchLimit,
        });
      } catch (err: any) {
        if (err?.statusCode === 429 || err?.code === 'TWELVEDATA_RATE_LIMIT') {
          this.rateLimitUntilMs = Date.now() + 55_000;
        }
        console.warn(`[MarketDataSyncService] Provider sync warning for ${sym} [${timeframe}]: ${err.message}`);
      }
    }

    const latestCandle = storedCandles[storedCandles.length - 1];
    const freshness = this.checkFreshness(latestCandle?.timestamp, timeframe, assetClass);

    const indicatorsList = await db.getTechnicalIndicators(sym, timeframe, 1);
    let indicators = indicatorsList[0] || null;
    const needsIndicatorRecompute =
      storedCandles.length >= 20 &&
      (!indicators ||
        indicators.timestamp !== latestCandle?.timestamp ||
        (storedCandles.length >= 200 && indicators.ema200 === null));

    if (needsIndicatorRecompute) {
      indicators = IndicatorEngine.computeLatestSnapshot(storedCandles, sym, timeframe);
      await db.upsertTechnicalIndicators([indicators]);
    }

    const currentStatus = await db.getMarketDataStatus(sym, timeframe);
    const computedStatus: MarketDataStatusCode =
      storedCandles.length === 0 ? 'NO_DATA' : freshness.isStale ? 'STALE' : 'FRESH';
    const computedQuality =
      storedCandles.length === 0
        ? 0
        : this.calculateDataQualityScore({
            candleCount: storedCandles.length,
            targetCount: Math.min(targetCount, 250),
            invalidCount: 0,
            gapsCount: 0,
            isStale: freshness.isStale,
            hasProviderError: false,
          });

    const dataStatus: MarketDataStatus = {
      symbol: sym,
      timeframe,
      lastCandleTimestamp: latestCandle
        ? new Date(latestCandle.timestamp).toISOString()
        : currentStatus?.lastCandleTimestamp || null,
      lastSuccessfulSync: currentStatus?.lastSuccessfulSync || (latestCandle ? new Date().toISOString() : null),
      provider: defaultMarketDataProvider.name,
      status: computedStatus,
      dataQualityScore: computedQuality,
      errorMessage: computedStatus === 'FRESH' ? undefined : currentStatus?.errorMessage,
    };

    if (
      storedCandles.length > 0 &&
      (!currentStatus ||
        currentStatus.status !== computedStatus ||
        currentStatus.lastCandleTimestamp !== dataStatus.lastCandleTimestamp)
    ) {
      await db.upsertMarketDataStatus(dataStatus);
    }

    const returnedCandles =
      storedCandles.length > targetCount
        ? storedCandles.slice(storedCandles.length - targetCount)
        : storedCandles;

    return {
      candles: returnedCandles,
      indicators,
      dataStatus,
      dataQuality: computedQuality,
      freshness,
    };
  }

  /**
   * Incremental Sync: Request only newer candles since last stored timestamp
   */
  public static async syncLatestCandles(
    symbol: string,
    timeframe: Timeframe = 'H1'
  ): Promise<MarketCandle[]> {
    const sym = normalizeSymbol(symbol);
    const res = await this.syncHistoricalCandles(sym, timeframe, 250, true);
    return res.candles;
  }

  /**
   * Refreshes multi-timeframe analysis for a symbol and updates MarketAnalysis cache.
   * Uses persisted real Twelve Data candles in Neon PostgreSQL and automatically refreshes
   * primary H1 timeframe if stale or when forceSync=true.
   */
  public static async refreshSymbol(
    symbol: string,
    forceSync: boolean = false,
    activeTimeframe: Timeframe = 'H1'
  ): Promise<MarketAnalysis> {
    const sym = normalizeSymbol(symbol);

    if (!forceSync) {
      const cached = await db.getMarketAnalysis(sym, 'H1');
      if (
        cached &&
        cached.dataStatus !== 'DEMO' &&
        cached.dataStatus !== 'STALE' &&
        cached.dataStatus !== 'NO_DATA' &&
        cached.currentPrice > 0 &&
        cached.lastUpdated &&
        Date.now() - new Date(cached.lastUpdated).getTime() < 90_000
      ) {
        return cached;
      }
    }

    const inst = await db.getInstrumentBySymbol(sym);
    const assetClass: AssetClass =
      inst?.assetClass || (sym.startsWith('BTC') ? 'CRYPTO' : sym === 'XAUUSD' ? 'METAL' : 'FOREX');

    if (forceSync) {
      await this.syncHistoricalCandles(sym, activeTimeframe, 250, true);
      if (activeTimeframe !== 'H1') {
        await this.syncHistoricalCandles(sym, 'H1', 250, true);
      }
    }

    const tfs: Timeframe[] = ['D1', 'H4', 'H1', 'M15', 'M5'];
    const timeframeCandles: Partial<Record<Timeframe, Candle[]>> = {};

    const tfResults = await Promise.all(
      tfs.map(async (tf) => ({
        tf,
        candles: await db.getCandles({ symbol: sym, timeframe: tf, limit: 250 }),
      }))
    );

    let hasAnyRealCandles = false;
    for (const { tf, candles } of tfResults) {
      timeframeCandles[tf] = candles;
      if (candles.length > 0) {
        hasAnyRealCandles = true;
      }
    }

    let primaryStatus: MarketDataStatusCode = 'NO_DATA';
    let overallDataQuality = 0;

    if (hasAnyRealCandles) {
      const primaryCandles =
        (timeframeCandles[activeTimeframe]?.length ? timeframeCandles[activeTimeframe] : undefined) ||
        (timeframeCandles['H1']?.length ? timeframeCandles['H1'] : undefined) ||
        (timeframeCandles['D1']?.length ? timeframeCandles['D1'] : undefined) ||
        [];
      const primaryTf: Timeframe = timeframeCandles[activeTimeframe]?.length
        ? activeTimeframe
        : timeframeCandles['H1']?.length
        ? 'H1'
        : 'D1';

      if (primaryCandles.length > 0) {
        const latest = primaryCandles[primaryCandles.length - 1];
        const freshness = this.checkFreshness(latest.timestamp, primaryTf, assetClass);
        primaryStatus = freshness.isStale ? 'STALE' : 'FRESH';
        overallDataQuality = this.calculateDataQualityScore({
          candleCount: primaryCandles.length,
          targetCount: 200,
          invalidCount: 0,
          gapsCount: 0,
          isStale: freshness.isStale,
          hasProviderError: false,
        });
      }
    }

    const analysis = MultiTimeframeAnalysisService.synthesizeMarketAnalysis({
      symbol: sym,
      primaryTimeframe: 'H1',
      timeframeCandles,
      assetClass,
      dataStatus: primaryStatus,
      dataQuality: overallDataQuality,
    });

    await db.upsertMarketAnalysis(analysis);
    return analysis;
  }
}
