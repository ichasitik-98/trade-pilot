import { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Database,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Info,
  Calendar,
  Layers,
  Activity,
  Zap,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { User } from '../types.ts';

interface AdminWarmUpPageProps {
  user: User | null;
  onNavigateToAlerts?: () => void;
}

type SyncStatus = 'NOT_STARTED' | 'RUNNING' | 'SUCCESS' | 'FAILED';

interface TimeframeSyncState {
  timeframe: 'H4' | 'H1' | 'M15' | 'M5';
  label: string;
  role: string;
  status: SyncStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  provider: string | null;
  receivedCandles: number | null;
  insertedCandles: number | null;
  updatedCandles: number | null;
  latestCandleTimestamp: string | null;
  marketStatus: string | null;
  dataQuality: number | null;
  errorMessage: string | null;
}

const INITIAL_TIMEFRAMES: TimeframeSyncState[] = [
  {
    timeframe: 'H4',
    label: 'Macro Market Direction',
    role: 'Macro bias filter (BULLISH / BEARISH / NEUTRAL)',
    status: 'NOT_STARTED',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    provider: null,
    receivedCandles: null,
    insertedCandles: null,
    updatedCandles: null,
    latestCandleTimestamp: null,
    marketStatus: null,
    dataQuality: null,
    errorMessage: null,
  },
  {
    timeframe: 'H1',
    label: 'Trend Confirmation',
    role: 'Trend alignment check (must confirm H4 bias)',
    status: 'NOT_STARTED',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    provider: null,
    receivedCandles: null,
    insertedCandles: null,
    updatedCandles: null,
    latestCandleTimestamp: null,
    marketStatus: null,
    dataQuality: null,
    errorMessage: null,
  },
  {
    timeframe: 'M15',
    label: 'Pullback Setup (Stage 1)',
    role: 'Structure pullback detection & setup generation',
    status: 'NOT_STARTED',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    provider: null,
    receivedCandles: null,
    insertedCandles: null,
    updatedCandles: null,
    latestCandleTimestamp: null,
    marketStatus: null,
    dataQuality: null,
    errorMessage: null,
  },
  {
    timeframe: 'M5',
    label: 'BOS Confirmation (Stage 2)',
    role: 'Break of structure & closed candle entry confirmation',
    status: 'NOT_STARTED',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    provider: null,
    receivedCandles: null,
    insertedCandles: null,
    updatedCandles: null,
    latestCandleTimestamp: null,
    marketStatus: null,
    dataQuality: null,
    errorMessage: null,
  },
];

export function AdminWarmUpPage({ user, onNavigateToAlerts }: AdminWarmUpPageProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<'BTCUSD' | 'XAUUSD'>('BTCUSD');
  const [timeframes, setTimeframes] = useState<TimeframeSyncState[]>(INITIAL_TIMEFRAMES);
  const [activeSyncTf, setActiveSyncTf] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // 5-second countdown timer effect
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Access Control: Must be authenticated ADMIN
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-4">
          <ShieldAlert className="w-8 h-8 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-rose-200">Access Denied (HTTP 403)</h2>
            <p className="text-sm text-rose-300/90 leading-relaxed">
              The Market Data Warm-Up Panel is strictly restricted to administrator accounts with role <span className="font-mono font-semibold">ADMIN</span>.
              Your account ({user?.email || 'Unauthenticated'}) has role <span className="font-mono font-semibold">{user?.role || 'NONE'}</span>.
            </p>
            <p className="text-xs text-rose-400/80">
              Security policy enforces server-side role validation on <span className="font-mono">POST /api/market-data/sync</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSyncTimeframe = async (tf: 'H4' | 'H1' | 'M15' | 'M5') => {
    if (activeSyncTf || cooldownRemaining > 0) return;

    const startIso = new Date().toISOString();
    const startMs = Date.now();

    setActiveSyncTf(tf);
    setTimeframes((prev) =>
      prev.map((item) =>
        item.timeframe === tf
          ? {
              ...item,
              status: 'RUNNING',
              startedAt: startIso,
              completedAt: null,
              errorMessage: null,
            }
          : item
      )
    );

    try {
      const res = await api.syncMarketData({
        symbol: selectedSymbol,
        timeframe: tf,
        count: 250,
      });

      const endIso = new Date().toISOString();
      const elapsedMs = Date.now() - startMs;
      const summary = res.summary;

      setTimeframes((prev) =>
        prev.map((item) =>
          item.timeframe === tf
            ? {
                ...item,
                status: summary.status === 'ERROR' ? 'FAILED' : 'SUCCESS',
                completedAt: endIso,
                durationMs: elapsedMs,
                provider: summary.provider || 'Twelve Data',
                receivedCandles: summary.receivedCandles ?? 0,
                insertedCandles: summary.insertedCandles ?? 0,
                updatedCandles: summary.updatedCandles ?? 0,
                latestCandleTimestamp: summary.latestTimestamp,
                marketStatus: summary.status,
                dataQuality: summary.dataQuality,
                errorMessage: summary.status === 'ERROR' ? 'Provider reported data status ERROR' : null,
              }
            : item
        )
      );

      // Start 5-second mandatory cooldown before allowing the next sync
      setCooldownRemaining(5);
    } catch (err: any) {
      const endIso = new Date().toISOString();
      const elapsedMs = Date.now() - startMs;
      const safeError = err.message || 'Synchronization request failed';

      setTimeframes((prev) =>
        prev.map((item) =>
          item.timeframe === tf
            ? {
                ...item,
                status: 'FAILED',
                completedAt: endIso,
                durationMs: elapsedMs,
                errorMessage: safeError,
              }
            : item
        )
      );

      // Even on failure, impose 5s cooldown to protect Twelve Data quota
      setCooldownRemaining(5);
    } finally {
      setActiveSyncTf(null);
    }
  };

  const getStatusBadge = (status: SyncStatus) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>RUNNING</span>
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>SUCCESS</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>FAILED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>NOT STARTED</span>
          </span>
        );
    }
  };

  const completedCount = timeframes.filter((t) => t.status === 'SUCCESS').length;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-100">
              Market Data Warm-Up
            </h1>
            <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Admin Only
            </span>
          </div>
          <p className="text-xs md:text-sm text-zinc-400">
            Pre-populate Neon PostgreSQL cache with real closed Twelve Data candles for BTCUSD before activating automated QStash scheduling.
          </p>
        </div>

        {onNavigateToAlerts && (
          <button
            onClick={onNavigateToAlerts}
            className="self-start md:self-auto inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition"
          >
            <span>Signal Alerts Panel</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        )}
      </div>

      {/* Safety & Isolation Guarantee Banner */}
      <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 space-y-2">
        <div className="flex items-center gap-2 font-medium text-zinc-200">
          <Info className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Warm-Up Safety & Isolation Contract</span>
        </div>
        <p className="text-zinc-400 leading-relaxed">
          Warm-up sync calls write strictly to <span className="text-zinc-200 font-mono">MarketCandle</span> and <span className="text-zinc-200 font-mono">TechnicalIndicator</span>.
          This operation <strong className="text-zinc-200">never</strong> runs signal evaluations, <strong className="text-zinc-200">never</strong> creates lifecycle alert events, <strong className="text-zinc-200">never</strong> sends WhatsApp messages, and operates strictly with Twelve Data <strong className="text-emerald-400">REAL</strong> market candles.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 pt-1 font-mono">
          <span>Target: {selectedSymbol} ({selectedSymbol === 'BTCUSD' ? 'Bitcoin / USD' : 'Gold / USD'})</span>
          <span aria-hidden="true">·</span>
          <span>Strategy: H4 → H1 → M15 → M5</span>
          <span aria-hidden="true">·</span>
          <span>Lookback: 250 bars</span>
          <span aria-hidden="true">·</span>
          <span>Quota Cost: 1 credit / call</span>
        </div>
      </div>

      {/* Cooldown & In-Progress Alert */}
      {cooldownRemaining > 0 && (
        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Rate-Limit Safety Guard: Mandatory 5-second interval between Twelve Data requests.</span>
          </div>
          <span className="font-mono font-bold text-amber-400">{cooldownRemaining}s remaining</span>
        </div>
      )}

      {/* Progress Overview Bar */}
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300">
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200">Warm-Up Progress</div>
            <div className="text-[11px] text-zinc-400">
              {completedCount} of 4 timeframes populated in Neon PostgreSQL cache
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="font-mono text-sm font-bold text-zinc-200">{completedCount} / 4</span>
          <div className="w-24 h-1.5 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(completedCount / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Timeframe Sync Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {timeframes.map((tfItem) => {
          const isCurrentRunning = activeSyncTf === tfItem.timeframe;
          const isButtonDisabled = Boolean(activeSyncTf) || cooldownRemaining > 0;

          return (
            <div
              key={tfItem.timeframe}
              className={`p-5 rounded-xl border transition-all ${
                tfItem.status === 'SUCCESS'
                  ? 'bg-zinc-900/70 border-emerald-500/30 shadow-sm'
                  : tfItem.status === 'FAILED'
                  ? 'bg-zinc-900/70 border-rose-500/30'
                  : isCurrentRunning
                  ? 'bg-zinc-900/90 border-amber-500/40 ring-1 ring-amber-500/20'
                  : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700/80'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-zinc-100 font-mono">
                      XAUUSD — {tfItem.timeframe}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono font-medium">
                      (250 bars)
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">{tfItem.label}</div>
                </div>
                <div>{getStatusBadge(tfItem.status)}</div>
              </div>

              {/* Strategy Role description */}
              <div className="text-[11px] text-zinc-400 mb-4 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60">
                <span className="text-zinc-400 font-medium">Strategy Role: </span>
                <span>{tfItem.role}</span>
              </div>

              {/* Execution Details / Last Result */}
              {tfItem.status !== 'NOT_STARTED' && (
                <div className="mb-4 pt-3 border-t border-zinc-800/80 space-y-1.5 text-xs">
                  {tfItem.provider && (
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Source Provider:</span>
                      <span className="font-mono text-zinc-200">{tfItem.provider}</span>
                    </div>
                  )}

                  {tfItem.receivedCandles !== null && (
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Candles Synced:</span>
                      <span className="font-mono text-zinc-200 font-medium">
                        {tfItem.receivedCandles} received ({tfItem.insertedCandles} new, {tfItem.updatedCandles} updated)
                      </span>
                    </div>
                  )}

                  {tfItem.latestCandleTimestamp && (
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Latest Candle:</span>
                      <span className="font-mono text-zinc-300">
                        {new Date(tfItem.latestCandleTimestamp).toISOString().replace('.000Z', 'Z')}
                      </span>
                    </div>
                  )}

                  {tfItem.durationMs !== null && (
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Duration:</span>
                      <span className="font-mono text-zinc-300">{tfItem.durationMs}ms</span>
                    </div>
                  )}

                  {tfItem.dataQuality !== null && (
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Data Quality:</span>
                      <span className="font-mono text-emerald-400 font-medium">{tfItem.dataQuality}%</span>
                    </div>
                  )}

                  {tfItem.errorMessage && (
                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] mt-2">
                      <span className="font-semibold">Error: </span>
                      <span>{tfItem.errorMessage}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isButtonDisabled}
                  onClick={() => handleSyncTimeframe(tfItem.timeframe)}
                  className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed ${
                    isCurrentRunning
                      ? 'bg-amber-500 text-zinc-950 font-bold'
                      : tfItem.status === 'SUCCESS'
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 disabled:opacity-50'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20 disabled:opacity-50'
                  }`}
                >
                  {isCurrentRunning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Syncing {tfItem.timeframe} Candles...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{tfItem.status === 'SUCCESS' ? `Re-Sync ${tfItem.timeframe}` : `Sync ${tfItem.timeframe} Cache`}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deployment Note */}
      <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/60 text-xs text-zinc-400 space-y-1">
        <div className="text-zinc-300 font-medium">Post-Warm-Up Recommendation</div>
        <p className="leading-relaxed">
          After completing warm-up for all four timeframes (H4, H1, M15, M5), the Neon PostgreSQL database will hold warm candles.
          When the automated QStash scheduler is activated in the next phase (<span className="font-mono">QSTASH_SCHEDULER_ENABLED=true</span>), 
          each 5-minute cron execution will resolve from cache in <span className="font-mono text-zinc-200">150–400ms</span> without hitting Vercel Hobby serverless timeouts.
        </p>
      </div>
    </div>
  );
}
