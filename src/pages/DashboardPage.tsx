import { useEffect, useState } from 'react';
import {
  TrendingUp,
  Percent,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Target,
  Clock,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { TradingAccount, TradeStatistics, Trade } from '../types.ts';

interface DashboardPageProps {
  activeAccount: TradingAccount | null;
  onOpenTradeModal: () => void;
  onNavigateTab: (tab: string) => void;
}

export function DashboardPage({ activeAccount, onOpenTradeModal, onNavigateTab }: DashboardPageProps) {
  const [stats, setStats] = useState<TradeStatistics | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getDashboard(activeAccount?.id);
      setStats(res.stats);
      setRecentTrades(res.recentTrades);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [activeAccount?.id]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-zinc-400">Loading Market & Account Metrics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
          <button onClick={fetchDashboard} className="ml-auto px-3 py-1 bg-rose-500/20 rounded-lg text-xs font-bold hover:bg-rose-500/30">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Net PnL Card */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Net Realized PnL</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-xl sm:text-2xl font-bold font-mono ${
                (stats?.netPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {(stats?.netPnL ?? 0) >= 0 ? '+' : ''}${(stats?.netPnL ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
            <span>Gross: ${(stats?.grossProfit ?? 0).toFixed(0)}</span>
            <span>Fees: ${(stats?.totalFees ?? 0).toFixed(0)}</span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Win Rate</span>
            <Percent className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
              {stats?.winRate ?? 0}%
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              ({stats?.winningTrades ?? 0}W / {stats?.losingTrades ?? 0}L)
            </span>
          </div>
          <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
            <span>Loss Rate: {stats?.lossRate ?? 0}%</span>
            <span>Closed: {stats?.closedTrades ?? 0}</span>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Profit Factor</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-zinc-100">
              {stats?.profitFactor ? stats.profitFactor.toFixed(2) : '0.00'}
            </span>
          </div>
          <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
            <span>Expectancy: ${(stats?.expectancy ?? 0).toFixed(2)}</span>
            <span>Avg R: {stats?.averageR ?? 0}R</span>
          </div>
        </div>

        {/* Risk / Drawdown */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Max Drawdown</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-rose-400">
              -${(stats?.maxDrawdown ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-zinc-400 font-mono">({stats?.maxDrawdownPercent ?? 0}%)</span>
          </div>
          <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
            <span>Sharpe: {stats?.sharpeRatio ?? 0}</span>
            <span>Recovery: {stats?.recoveryFactor ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Quick Launch & Discipline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Scanner radar callout */}
        <div
          onClick={() => onNavigateTab('scanner')}
          className="p-5 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-emerald-500/50 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Market Scanner</span>
            <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition text-emerald-400" />
          </div>
          <h4 className="text-base font-bold text-zinc-100 mb-1">Algorithmic Confluence Radar</h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Multi-timeframe trend, structure BOS, momentum, and risk/reward scores across major FX, Metals, and Crypto.
          </p>
        </div>

        {/* AI trade coach callout */}
        <div
          onClick={() => onNavigateTab('ai-analyst')}
          className="p-5 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-emerald-500/50 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">AI Performance Mentor</span>
            <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition text-emerald-400" />
          </div>
          <h4 className="text-base font-bold text-zinc-100 mb-1">Diagnose Biases & Habits</h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Get personalized reviews of mistake tags, revenge trades, and risk execution driven by Gemini 2.5 Flash.
          </p>
        </div>

        {/* Terminal pair analysis callout */}
        <div
          onClick={() => onNavigateTab('pair-analysis')}
          className="p-5 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 hover:border-emerald-500/50 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Pair Terminal</span>
            <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition text-emerald-400" />
          </div>
          <h4 className="text-base font-bold text-zinc-100 mb-1">Deep Candlestick & Indicator Breakdown</h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Interactive charts, moving averages, RSI, ATR buffers, and explainable signal components.
          </p>
        </div>
      </div>

      {/* Recent Trades Table */}
      <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-100">Recent Journal Logs</h3>
            <p className="text-xs text-zinc-400">Latest executed and documented trades.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab('journal')}
              className="text-xs text-emerald-400 hover:underline font-medium cursor-pointer"
            >
              View Full Journal →
            </button>
          </div>
        </div>

        {recentTrades.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl space-y-3">
            <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
            <div className="text-sm font-medium text-zinc-300">No trading records logged yet</div>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Start documenting your executions to unlock equity curve telemetry, win rates, and AI coaching.
            </p>
            <button
              onClick={onOpenTradeModal}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-lg transition"
            >
              Log First Trade
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-950/70 border-b border-zinc-800 text-[10px] text-zinc-400 uppercase">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Pair</th>
                  <th className="p-3">Dir</th>
                  <th className="p-3">Entry</th>
                  <th className="p-3">Exit</th>
                  <th className="p-3">R-Mult</th>
                  <th className="p-3">Net PnL</th>
                  <th className="p-3">Setup</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recentTrades.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-800/30 transition">
                    <td className="p-3 text-zinc-400">
                      {new Date(t.entryTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="p-3 font-bold text-zinc-100">{t.pair}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          t.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {t.direction === 'LONG' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {t.direction}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-300">{t.entryPrice.toFixed(4)}</td>
                    <td className="p-3 text-zinc-300">{t.exitPrice ? t.exitPrice.toFixed(4) : '-'}</td>
                    <td className="p-3 text-zinc-200">
                      {t.rMultiple !== undefined ? `${t.rMultiple > 0 ? '+' : ''}${t.rMultiple}R` : '-'}
                    </td>
                    <td className="p-3 font-semibold">
                      {t.netPnL !== undefined ? (
                        <span className={t.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {t.netPnL >= 0 ? '+' : ''}${t.netPnL.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-zinc-500">Open</span>
                      )}
                    </td>
                    <td className="p-3 text-zinc-300 truncate max-w-[120px]">{t.setup || 'Standard'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.status === 'CLOSED'
                            ? 'bg-zinc-800 text-zinc-300'
                            : t.status === 'OPEN'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
