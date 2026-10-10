import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../services/api.ts';
import { ChartEngine } from '../components/charts/index.ts';
import { OpenPositionSignalPanel } from '../components/OpenPositionSignalPanel.tsx';
import {
  Shield,
  Layers,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Activity,
  Gauge,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Clock,
  CheckCircle,
  Expand,
} from 'lucide-react';
import { MarketDataStatusCode, TradingAccount } from '../types.ts';

interface PairAnalysisPageProps {
  initialPair?: string;
  activeAccount?: TradingAccount | null;
  onOpenTradeModalWithPair?: (
    pair: string,
    direction: 'LONG' | 'SHORT',
    entry: number,
    sl: number,
    tp: number,
    timeframe?: string,
    lotSize?: number,
    riskPercent?: number,
    setup?: string
  ) => void;
  onTradeExecuted?: () => void;
}

const POPULAR_PAIRS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'USDCAD',
  'AUDUSD',
  'NZDUSD',
  'EURJPY',
  'GBPJPY',
  'XAUUSD',
  'BTCUSD',
];

// Client-side memory cache for instant pair/timeframe switching
const pairAnalysisCache = new Map<string, { data: any; signal: any; cachedAt: number }>();

function formatJakartaTime(timestamp: number | string | Date | undefined): string {
  if (!timestamp) return 'N/A';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return 'N/A';
    return (
      d.toLocaleString('en-US', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' WIB'
    );
  } catch {
    return 'N/A';
  }
}

export function PairAnalysisPage({
  initialPair = 'EURUSD',
  activeAccount = null,
  onOpenTradeModalWithPair,
  onTradeExecuted,
}: PairAnalysisPageProps) {
  const [selectedPair, setSelectedPair] = useState(initialPair);
  const [timeframe, setTimeframe] = useState('H1');
  const [isChartFullscreen, setIsChartFullscreen] = useState(false);
  const [data, setData] = useState<any | null>(() => {
    return pairAnalysisCache.get(`${initialPair}:H1`)?.data ?? null;
  });
  const [loading, setLoading] = useState(() => !pairAnalysisCache.has(`${initialPair}:H1`));
  const [signal, setSignal] = useState<any | null>(() => {
    return pairAnalysisCache.get(`${initialPair}:H1`)?.signal ?? null;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialPair && initialPair !== selectedPair) {
      setSelectedPair(initialPair);
    }
  }, [initialPair]);

  const hasRealData = Boolean(
    data?.candles &&
      data.candles.length > 0 &&
      data.dataStatus !== 'NO_DATA' &&
      data.dataStatus !== 'UNAVAILABLE'
  );

  const applyPairResponse = useCallback((pairKey: string, res: any) => {
    setData(res);
    const resolvedSignal =
      res.signal ||
      (res.candles?.length
        ? null
        : {
            status: 'BLOCKED',
            score: 0,
            explanation: 'Signal evaluation suppressed: NO REAL DATA AVAILABLE from Twelve Data.',
            components: [],
          });
    if (resolvedSignal) {
      setSignal(resolvedSignal);
    }
    pairAnalysisCache.set(pairKey, {
      data: res,
      signal: resolvedSignal,
      cachedAt: Date.now(),
    });
  }, []);

  const fetchPairData = useCallback(
    async (options?: { forceRefresh?: boolean; background?: boolean }) => {
      const pairKey = `${selectedPair}:${timeframe}`;
      const cached = pairAnalysisCache.get(pairKey);

      if (cached && !options?.forceRefresh && !options?.background) {
        setData(cached.data);
        if (cached.signal) setSignal(cached.signal);
        setLoading(false);
        // If cache is < 25s old and CURRENT, skip network round-trip
        if (
          Date.now() - cached.cachedAt < 25_000 &&
          (cached.data?.dataStatus === 'CURRENT' || cached.data?.dataStatus === 'FRESH')
        ) {
          return;
        }
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (!cached && !data) {
          setLoading(true);
        } else {
          setIsRefreshing(true);
        }

        const res = await api.getPairAnalysis(
          selectedPair,
          timeframe,
          Boolean(options?.forceRefresh),
          controller.signal
        );

        if (controller.signal.aborted) return;
        applyPairResponse(pairKey, res);

        // Fallback signal request only if server did not embed pre-evaluated signal
        if (!res.signal && res.candles?.length > 0) {
          const currentPrice = res.latestPrice?.price ?? res.candles[res.candles.length - 1]?.close ?? 0;
          const isBearish = res.marketAnalysis?.trend === 'BEARISH' || res.structure?.trend === 'BEARISH';
          const dir: 'LONG' | 'SHORT' = isBearish ? 'SHORT' : 'LONG';
          const atr = res.indicator?.atr14 ?? currentPrice * 0.003;
          const sl = dir === 'LONG' ? currentPrice - atr * 1.5 : currentPrice + atr * 1.5;
          const tp = dir === 'LONG' ? currentPrice + atr * 3.0 : currentPrice - atr * 3.0;

          const sigRes = await api.evaluateSignal({
            pair: selectedPair,
            timeframe,
            direction: dir,
            entryPrice: currentPrice,
            stopLoss: sl,
            takeProfit1: tp,
          });
          if (!controller.signal.aborted) {
            setSignal(sigRes.signal);
            pairAnalysisCache.set(pairKey, {
              data: res,
              signal: sigRes.signal,
              cachedAt: Date.now(),
            });
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Failed fetching pair analysis:', err);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [selectedPair, timeframe, applyPairResponse, data]
  );

  const handleManualRefresh = async () => {
    const pairKey = `${selectedPair}:${timeframe}`;
    try {
      setIsRefreshing(true);
      const refreshed = await api.refreshMarketSymbol(selectedPair, timeframe);
      if (refreshed && refreshed.candles) {
        applyPairResponse(pairKey, refreshed);
      } else {
        await fetchPairData({ forceRefresh: true });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPairData();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [selectedPair, timeframe]);

  // Auto-refresh active chart every 60 seconds while tab is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchPairData({ background: true });
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchPairData]);

  const getStatusBadge = (status: MarketDataStatusCode, hasCandles: boolean) => {
    if (!hasCandles || status === 'NO_DATA' || status === 'UNAVAILABLE') {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700/60">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          NO REAL DATA
        </span>
      );
    }

    switch (status) {
      case 'CURRENT':
      case 'LIVE':
      case 'FRESH':
      case 'UP_TO_DATE':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            REAL DATA &bull; CURRENT
          </span>
        );
      case 'MARKET_CLOSED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            REAL DATA &bull; MARKET CLOSED
          </span>
        );
      case 'DELAYED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            REAL DATA &bull; DELAYED
          </span>
        );
      case 'STALE':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            REAL DATA &bull; STALE
          </span>
        );
      case 'ERROR':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            PROVIDER ERROR
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            REAL DATA &bull; CURRENT
          </span>
        );
    }
  };

  const getDataQualityBadge = (quality: number = 100) => {
    const isWarning = quality < 75;
    return (
      <span
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
          isWarning
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        }`}
      >
        <Gauge className="w-3 h-3" />
        Data Quality: {quality}/100
        {isWarning && ' (WARNING)'}
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Instrument Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {POPULAR_PAIRS.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPair(p)}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition cursor-pointer ${
                selectedPair === p
                  ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/10'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Timeframe selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-mono">
            {['M5', 'M15', 'H1', 'H4', 'D1'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  timeframe === tf ? 'bg-zinc-800 text-emerald-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh Feed & Analysis"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 text-xs font-mono transition cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Sync</span>
          </button>

          <button
            type="button"
            onClick={() => setIsChartFullscreen(true)}
            title="Buka Mode Full Chart Layar Penuh seperti MetaTrader 5 / TradingView (Anti-Geser UI)"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono text-xs font-extrabold shadow-md shadow-emerald-500/15 transition cursor-pointer"
          >
            <Expand className="w-3.5 h-3.5" />
            <span>Full Chart</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-20 text-center text-xs font-mono text-zinc-500 flex flex-col items-center gap-3">
          <RotateCcw className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Synchronizing market data feeds, indicators, and multi-timeframe structures for {selectedPair}...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Enhanced Pair Header Bar */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex flex-wrap items-baseline gap-4">
              <span className="text-2xl font-black font-mono text-zinc-100 tracking-tight">{selectedPair}</span>
              <span className="text-2xl font-bold font-mono text-zinc-100">
                {hasRealData && data?.latestPrice?.price
                  ? `$${data?.latestPrice?.price?.toFixed(selectedPair.includes('JPY') || selectedPair === 'XAUUSD' ? 2 : 4)}`
                  : 'N/A'}
              </span>
              {hasRealData && (
                <span
                  className={`text-xs font-mono font-bold flex items-center gap-0.5 ${
                    (data?.latestPrice?.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {(data?.latestPrice?.change24h ?? 0) > 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  {data?.latestPrice?.change24h > 0 ? '+' : ''}
                  {data?.latestPrice?.change24h}%
                </span>
              )}
              <span className="text-xs font-mono text-zinc-400">
                {hasRealData && data?.latestPrice?.high24h
                  ? `H: ${data?.latestPrice?.high24h?.toFixed(4)} | L: ${data?.latestPrice?.low24h?.toFixed(4)}`
                  : 'Feed status: Twelve Data Real Feed'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {getStatusBadge(data?.dataStatus, hasRealData)}
              {getDataQualityBadge(hasRealData ? data?.dataQuality ?? 100 : 0)}
              <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Asia/Jakarta (WIB)</span>
              </div>
            </div>
          </div>

          {/* Section 23: Explicit Real Market Data Source Labeling */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-md">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${hasRealData ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="font-bold text-zinc-100">
                {hasRealData
                  ? data?.dataStatus === 'STALE'
                    ? 'REAL DATA • STALE'
                    : 'REAL DATA • CURRENT'
                  : 'NO REAL DATA'}
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">Source: Twelve Data</span>
              {hasRealData && (
                <>
                  <span className="text-zinc-600">|</span>
                  <span className={data?.isLatestCandleClosed === false ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}>
                    {data?.isLatestCandleClosed === false ? 'Live Forming Bar' : 'Completed Bar'} ({data?.candles?.length || 0} bars)
                  </span>
                </>
              )}
              {isRefreshing && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                  <RotateCcw className="w-2.5 h-2.5 animate-spin" />
                  REFRESHING
                </span>
              )}
            </div>
            <div className="text-[11px] text-zinc-400">
              {hasRealData
                ? `Latest bar: ${formatJakartaTime(data?.latestCandleTimestamp || data?.lastUpdated || data?.latestPrice?.timestamp)}`
                : `Reason: ${data?.errorMessage || 'Twelve Data entitlement/access unavailable or not synced'}`}
            </div>
          </div>

          {/* Market Bias & Primary Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <div className="text-[11px] font-mono text-zinc-400 uppercase">Market Bias</div>
              <div
                className={`text-lg font-black font-mono ${
                  !hasRealData
                    ? 'text-zinc-500'
                    : data?.marketAnalysis?.overallBias === 'BULLISH'
                    ? 'text-emerald-400'
                    : data?.marketAnalysis?.overallBias === 'BEARISH'
                    ? 'text-rose-400'
                    : 'text-zinc-300'
                }`}
              >
                {hasRealData ? (data?.marketAnalysis?.overallBias ?? 'NEUTRAL') : 'NO REAL DATA'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                {hasRealData ? `Trend: ${data?.marketAnalysis?.trend ?? 'NEUTRAL'}` : 'Requires Twelve Data sync'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <div className="text-[11px] font-mono text-zinc-400 uppercase">Momentum</div>
              <div className="text-lg font-black font-mono text-zinc-200">
                {hasRealData ? (data?.marketAnalysis?.momentum ?? 'BALANCED') : 'N/A'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                RSI: {hasRealData && data?.indicator?.rsi14 !== null && data?.indicator?.rsi14 !== undefined ? data?.indicator?.rsi14?.toFixed(1) : 'INSUFFICIENT_REAL_DATA'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <div className="text-[11px] font-mono text-zinc-400 uppercase">Volatility (ATR)</div>
              <div className="text-lg font-black font-mono text-cyan-400">
                {hasRealData ? (data?.marketAnalysis?.volatility ?? 'NORMAL') : 'N/A'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                {hasRealData ? `${data?.indicator?.atrPercent?.toFixed(2) ?? '0.00'}% ATR` : 'INSUFFICIENT_REAL_DATA'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <div className="text-[11px] font-mono text-zinc-400 uppercase">Key Levels</div>
              <div className="text-xs font-mono text-emerald-400 truncate">
                S: {hasRealData && data?.support?.price ? `$${data?.support?.price?.toFixed(4)}` : 'N/A'}
              </div>
              <div className="text-xs font-mono text-rose-400 truncate">
                R: {hasRealData && data?.resistance?.price ? `$${data?.resistance?.price?.toFixed(4)}` : 'N/A'}
              </div>
            </div>
          </div>

          {/* Advanced Market Chart Engine (Candlestick, OHLC, Line, Area, Heikin Ashi) */}
          <ChartEngine
            candles={data?.candles || []}
            symbol={selectedPair}
            onSymbolChange={setSelectedPair}
            availableSymbols={POPULAR_PAIRS}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            supportLevel={data?.support?.price}
            resistanceLevel={data?.resistance?.price}
            signalOverlay={
              signal && signal.status !== 'BLOCKED' && signal.entryPrice > 0
                ? {
                    direction: signal.direction,
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    takeProfit1: signal.takeProfit1,
                    takeProfit2: signal.takeProfit2,
                    takeProfit3: signal.takeProfit3,
                    riskReward: signal.riskReward,
                    riskReward2: signal.riskReward2,
                    score: signal.score,
                    status: signal.status,
                    isPotentialSignal: signal.isPotentialSignal,
                  }
                : null
            }
            dataStatus={data?.dataStatus}
            dataQuality={data?.dataQuality}
            isRefreshing={isRefreshing}
            onRefresh={handleManualRefresh}
            isFullscreen={isChartFullscreen}
            onFullscreenChange={setIsChartFullscreen}
          />

          {/* Open Position Trading Signal & Risk/Reward Execution Panel */}
          <OpenPositionSignalPanel
            symbol={selectedPair}
            timeframe={timeframe}
            currentPrice={
              data?.latestPrice?.price ??
              (data?.candles?.length ? data.candles[data.candles.length - 1].close : 0)
            }
            hasRealData={hasRealData}
            atr={data?.indicator?.atr14}
            supportLevel={data?.support?.price}
            resistanceLevel={data?.resistance?.price}
            indicator={data?.indicator}
            multiTimeframe={data?.multiTimeframe}
            signal={signal}
            activeAccount={activeAccount}
            onSignalUpdated={(updatedSig) => {
              setSignal(updatedSig);
              const pairKey = `${selectedPair}:${timeframe}`;
              const existingCache = pairAnalysisCache.get(pairKey);
              if (existingCache) {
                pairAnalysisCache.set(pairKey, {
                  ...existingCache,
                  signal: updatedSig,
                });
              }
            }}
            onOpenTradeModalWithSignal={(params) => {
              onOpenTradeModalWithPair?.(
                params.pair,
                params.direction,
                params.entryPrice,
                params.stopLoss,
                params.takeProfit,
                params.timeframe,
                params.lotSize,
                params.riskPercent,
                params.setup
              );
            }}
            onTradeExecuted={onTradeExecuted}
          />

          {/* Backtest #1 Winning Indicator Suite Deep-Dive Grid */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-3.5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  Indikator &amp; Analisis Win Rate Tertinggi (Model Backtest #1: Adaptive Bottom-Up Hybrid • 60%–64% WR)
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono font-bold text-emerald-400">
                AKTIF DI SISTEM &bull; LIMIT RETEST 0.12x–0.32x ATR &bull; SL 1.5x–2.0x ATR
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-zinc-400 font-bold">1. RSI (14) Anti-Exhaustion</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      (data?.indicator?.rsi14 ?? 50) >= 32 && (data?.indicator?.rsi14 ?? 50) <= 68
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    {(data?.indicator?.rsi14 ?? 50) >= 32 && (data?.indicator?.rsi14 ?? 50) <= 68
                      ? 'ZONA AMAN (32–68)'
                      : 'RAWAN JENUH'}
                  </span>
                </div>
                <div className="text-base font-bold text-zinc-100 tabular-nums">
                  {hasRealData && data?.indicator?.rsi14 !== null && data?.indicator?.rsi14 !== undefined
                    ? data?.indicator?.rsi14?.toFixed(2)
                    : 'INSUFFICIENT_REAL_DATA'}
                </div>
                <div className="text-[11px] text-zinc-400 font-sans">
                  {hasRealData && data?.indicator?.rsi14 !== null && data?.indicator?.rsi14 !== undefined
                    ? data?.indicator?.rsi14 > 70
                      ? 'Overbought (>70): Filter Backtest melarang Buy di pucuk'
                      : data?.indicator?.rsi14 < 30
                      ? 'Oversold (<30): Filter Backtest melarang Sell di dasar'
                      : data?.indicator?.rsi14 <= 39
                      ? 'Zona Diskon M15 (≤39): Potensi pantulan Buy Limit (64% WR)'
                      : data?.indicator?.rsi14 >= 61
                      ? 'Zona Premium M15 (≥61): Potensi pantulan Sell Limit (64% WR)'
                      : 'Zona ekspansi sehat (32–68) untuk kelanjutan tren'
                    : 'Requires real candle history'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-zinc-400 font-bold">2. MACD (12, 26, 9) Infleksi</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      (data?.indicator?.macdHistogram ?? 0) >= 0
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {(data?.indicator?.macdHistogram ?? 0) >= 0 ? 'HIST BULLISH' : 'HIST BEARISH'}
                  </span>
                </div>
                <div className="text-base font-bold text-zinc-100 tabular-nums">
                  {hasRealData && data?.indicator?.macdHistogram !== null && data?.indicator?.macdHistogram !== undefined
                    ? data?.indicator?.macdHistogram?.toFixed(5)
                    : 'INSUFFICIENT_REAL_DATA'}
                </div>
                <div className="text-[11px] text-zinc-400 font-sans">
                  {hasRealData && data?.indicator?.macd !== null
                    ? `Line: ${data?.indicator?.macd?.toFixed(4) ?? '0'} | Signal: ${data?.indicator?.macdSignal?.toFixed(4) ?? '0'} (Konfirmasi balik arah / momentum)`
                    : 'Requires real candle history'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-zinc-400 font-bold">3. ADX (14) &amp; DI+/DI- Rezim</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      (data?.indicator?.adx14 ?? 0) >= 25
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-sky-500/15 text-sky-400'
                    }`}
                  >
                    {(data?.indicator?.adx14 ?? 0) >= 25 ? 'TREND KUAT (≥25)' : 'ROTASI VALUE (<25)'}
                  </span>
                </div>
                <div className="text-base font-bold text-zinc-100 tabular-nums">
                  {hasRealData && data?.indicator?.adx14 !== null && data?.indicator?.adx14 !== undefined
                    ? `${data?.indicator?.adx14?.toFixed(1)} ADX`
                    : 'INSUFFICIENT_REAL_DATA'}
                </div>
                <div className="text-[11px] text-zinc-400 font-sans">
                  {hasRealData && data?.indicator?.plusDI !== null
                    ? `+DI: ${data?.indicator?.plusDI?.toFixed(1) ?? '-'} | -DI: ${data?.indicator?.minusDI?.toFixed(1) ?? '-'} (${(data?.indicator?.adx14 ?? 0) >= 25 ? 'Mode Pullback EMA20/50' : 'Mode Pantulan Bollinger/S&R'})`
                    : 'Requires real candle history'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-zinc-400 font-bold">4. Bollinger (20,2) &amp; EMA50</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400">
                    64% M15 WR
                  </span>
                </div>
                <div className="text-base font-bold text-zinc-100 tabular-nums">
                  {hasRealData && data?.indicator?.ema50 !== null && data?.indicator?.ema50 !== undefined
                    ? `EMA50: $${data?.indicator?.ema50?.toFixed(selectedPair.includes('JPY') || selectedPair === 'XAUUSD' ? 2 : 4)}`
                    : 'INSUFFICIENT_REAL_DATA'}
                </div>
                <div className="text-[11px] text-zinc-400 font-sans">
                  {hasRealData && data?.indicator?.bbUpper !== null
                    ? `BB Lower: $${data?.indicator?.bbLower?.toFixed(selectedPair.includes('JPY') || selectedPair === 'XAUUSD' ? 2 : 4) ?? '-'} | Upper: $${data?.indicator?.bbUpper?.toFixed(selectedPair.includes('JPY') || selectedPair === 'XAUUSD' ? 2 : 4) ?? '-'}`
                    : 'Requires real candle history'}
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Timeframe Alignment Table (Bottom-Up from Smallest Timeframe M5/M15 -> H1 -> H4 -> D1) */}
          {data?.multiTimeframe && (
            <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-3 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-zinc-200">
                    Multi-Timeframe Trend &amp; Structure Alignment (Mulai dari Timeframe Terkecil: {data.multiTimeframe.M5?.dataQuality ? 'M5 → M15 → H1 → H4 → D1' : 'M15 → H1 → H4 → D1'})
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-sky-400">Urutan Analisis: Adaptive Bottom-Up Hybrid</span>
              </div>

              <div className={`grid grid-cols-2 ${data.multiTimeframe.M5?.dataQuality ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3`}>
                {(data.multiTimeframe.M5?.dataQuality ? ['M5', 'M15', 'H1', 'H4', 'D1'] : ['M15', 'H1', 'H4', 'D1']).map((tf, idx) => {
                  const tfData = data.multiTimeframe[tf];
                  return (
                    <div key={tf} className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/70 space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-zinc-300">
                          {idx + 1}. {tf} {idx === 0 ? '(TF Terkecil)' : ''}
                        </span>
                        <span
                          className={`font-bold ${
                            tfData?.trend === 'BULLISH'
                              ? 'text-emerald-400'
                              : tfData?.trend === 'BEARISH'
                              ? 'text-rose-400'
                              : 'text-zinc-400'
                          }`}
                        >
                          {tfData?.trend ?? 'NEUTRAL'}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 flex justify-between">
                        <span>Momentum:</span>
                        <span className="text-zinc-200">{tfData?.momentum ?? '-'}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 flex justify-between">
                        <span>Volatility:</span>
                        <span className="text-zinc-200">{tfData?.volatility ?? '-'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confluence & Signal Explanation ("WHY THIS SETUP?") */}
          {signal && (
            <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-bold text-zinc-100">Algorithmic Confluence Breakdown</h3>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{signal.explanation}</p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right font-mono">
                    <span className="text-[10px] uppercase text-zinc-500">Confluence Score</span>
                    <div className="text-xl font-extrabold text-emerald-400">{signal.score} / 100</div>
                  </div>

                  {onOpenTradeModalWithPair && signal.status !== 'BLOCKED' && (
                    <button
                      onClick={() =>
                        onOpenTradeModalWithPair(
                          selectedPair,
                          signal.direction,
                          signal.entryPrice,
                          signal.stopLoss,
                          signal.takeProfit1,
                          timeframe
                        )
                      }
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl transition cursor-pointer"
                    >
                      Pre-fill in Journal
                    </button>
                  )}
                </div>
              </div>

              {/* Component Factor Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {signal.components.map((comp: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1.5 text-xs font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200">{comp.component}</span>
                      <span
                        className={`font-bold ${
                          comp.score >= comp.weight * 0.7
                            ? 'text-emerald-400'
                            : comp.score >= comp.weight * 0.4
                            ? 'text-amber-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {comp.score} / {comp.weight} pts
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 leading-relaxed font-sans">{comp.reason}</div>
                    <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-900 truncate">
                      Raw: {comp.rawValue}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
