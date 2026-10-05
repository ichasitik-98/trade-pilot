import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { ChartEngine } from '../components/charts/index.ts';
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
} from 'lucide-react';
import { MarketDataStatusCode } from '../types.ts';

interface PairAnalysisPageProps {
  initialPair?: string;
  onOpenTradeModalWithPair?: (pair: string, direction: 'LONG' | 'SHORT', entry: number, sl: number, tp: number) => void;
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
      }) + ' (Asia/Jakarta)'
    );
  } catch {
    return 'N/A';
  }
}

export function PairAnalysisPage({ initialPair = 'EURUSD', onOpenTradeModalWithPair }: PairAnalysisPageProps) {
  const [selectedPair, setSelectedPair] = useState(initialPair);
  const [timeframe, setTimeframe] = useState('H1');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [signal, setSignal] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const hasRealData = Boolean(
    data?.candles &&
      data.candles.length > 0 &&
      data.dataStatus !== 'NO_DATA' &&
      data.dataStatus !== 'UNAVAILABLE'
  );

  const fetchPairData = async () => {
    try {
      setLoading(true);
      const res = await api.getPairAnalysis(selectedPair, timeframe);
      setData(res);

      const realCandlesCount = res.candles?.length || 0;
      if (realCandlesCount === 0) {
        setSignal({
          status: 'BLOCKED',
          score: 0,
          explanation: 'Signal evaluation suppressed: NO REAL DATA AVAILABLE from Twelve Data.',
          components: [],
        });
        return;
      }

      // Evaluate setup using validated real market data
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

      setSignal(sigRes.signal);
    } catch (err) {
      console.error('Failed fetching pair analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      await api.refreshMarketSymbol(selectedPair);
      await fetchPairData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPairData();
  }, [selectedPair, timeframe]);

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
      case 'LIVE':
      case 'FRESH':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            REAL DATA &bull; TWELVE DATA
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
            REAL DATA
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
            {['M15', 'H1', 'H4', 'D1'].map((tf) => (
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
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${hasRealData ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="font-bold text-zinc-100">{hasRealData ? 'REAL DATA' : 'NO REAL DATA'}</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">Source: Twelve Data</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              {hasRealData
                ? `Last update: ${formatJakartaTime(data?.lastUpdated || data?.latestPrice?.timestamp)}`
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
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            supportLevel={data?.support?.price}
            resistanceLevel={data?.resistance?.price}
            dataStatus={data?.dataStatus}
            dataQuality={data?.dataQuality}
            isRefreshing={isRefreshing}
            onRefresh={handleManualRefresh}
          />

          {/* Technical Indicators Deep-Dive Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5 font-mono text-xs">
              <span className="text-[10px] uppercase text-zinc-500">RSI (14) Momentum</span>
              <div className="text-base font-bold text-zinc-100">
                {hasRealData && data?.indicator?.rsi14 !== null && data?.indicator?.rsi14 !== undefined
                  ? data?.indicator?.rsi14?.toFixed(2)
                  : 'INSUFFICIENT_REAL_DATA'}
              </div>
              <div className="text-[11px] text-zinc-400">
                {hasRealData && data?.indicator?.rsi14 !== null && data?.indicator?.rsi14 !== undefined
                  ? data?.indicator?.rsi14 > 70
                    ? 'Overbought zone (>70)'
                    : data?.indicator?.rsi14 < 30
                    ? 'Oversold zone (<30)'
                    : 'Equilibrium momentum zone'
                  : 'Requires real candle history'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5 font-mono text-xs">
              <span className="text-[10px] uppercase text-zinc-500">MACD (12, 26, 9)</span>
              <div className="text-base font-bold text-zinc-100">
                {hasRealData && data?.indicator?.macdHistogram !== null && data?.indicator?.macdHistogram !== undefined
                  ? data?.indicator?.macdHistogram?.toFixed(5)
                  : 'INSUFFICIENT_REAL_DATA'}
              </div>
              <div className="text-[11px] text-zinc-400">
                {hasRealData && data?.indicator?.macd !== null
                  ? `Line: ${data?.indicator?.macd?.toFixed(5) ?? '0'} | Sig: ${data?.indicator?.macdSignal?.toFixed(5) ?? '0'}`
                  : 'Requires real candle history'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5 font-mono text-xs">
              <span className="text-[10px] uppercase text-zinc-500">ADX (14) Trend Strength</span>
              <div className="text-base font-bold text-zinc-100">
                {hasRealData && data?.indicator?.adx14 !== null && data?.indicator?.adx14 !== undefined
                  ? data?.indicator?.adx14?.toFixed(1)
                  : 'INSUFFICIENT_REAL_DATA'}
              </div>
              <div className="text-[11px] text-zinc-400">
                {hasRealData && data?.indicator?.plusDI !== null
                  ? `+DI: ${data?.indicator?.plusDI?.toFixed(1) ?? '-'} | -DI: ${data?.indicator?.minusDI?.toFixed(1) ?? '-'}`
                  : 'Requires real candle history'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5 font-mono text-xs">
              <span className="text-[10px] uppercase text-zinc-500">Bollinger Bands (20, 2)</span>
              <div className="text-base font-bold text-zinc-100">
                {hasRealData && data?.indicator?.bbWidth !== null && data?.indicator?.bbWidth !== undefined
                  ? `${((data?.indicator?.bbWidth ?? 0) * 100).toFixed(2)}% Width`
                  : 'INSUFFICIENT_REAL_DATA'}
              </div>
              <div className="text-[11px] text-zinc-400">
                {hasRealData && data?.indicator?.bbUpper !== null
                  ? `Upper: ${data?.indicator?.bbUpper?.toFixed(4) ?? '-'} | Lower: ${data?.indicator?.bbLower?.toFixed(4) ?? '-'}`
                  : 'Requires real candle history'}
              </div>
            </div>
          </div>

          {/* Multi-Timeframe Alignment Table */}
          {data?.multiTimeframe && (
            <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-3 shadow-xl">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-200">Multi-Timeframe Trend & Structure Alignment</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['D1', 'H4', 'H1', 'M15'].map((tf) => {
                  const tfData = data.multiTimeframe[tf];
                  return (
                    <div key={tf} className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/70 space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-zinc-300">{tf}</span>
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
                          signal.takeProfit1
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
