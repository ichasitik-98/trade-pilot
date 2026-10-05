import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { TradingAccount, TradeStatistics } from '../types.ts';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

interface AnalyticsPageProps {
  activeAccount: TradingAccount | null;
}

export function AnalyticsPage({ activeAccount }: AnalyticsPageProps) {
  const [stats, setStats] = useState<TradeStatistics | null>(null);
  const [equityCurve, setEquityCurve] = useState<any[]>([]);
  const [pairBreakdown, setPairBreakdown] = useState<any[]>([]);
  const [setupBreakdown, setSetupBreakdown] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setLoading(true);
        const res = await api.getAnalytics(activeAccount?.id);
        setStats(res.stats);
        setEquityCurve(res.equityCurve);
        setPairBreakdown(res.pairBreakdown);
        setSetupBreakdown(res.setupBreakdown);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, [activeAccount?.id]);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs font-mono text-zinc-500">
        Compiling Trade & Performance Telemetry...
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">Performance Analytics</h2>
        <p className="text-xs text-zinc-400">Equity curve trajectory, drawdown dynamics, and setup statistical edges.</p>
      </div>

      {/* Equity Curve Chart Card */}
      <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-100">Cumulative Equity Growth</h3>
            <p className="text-xs text-zinc-400">Time-series account equity trajectory.</p>
          </div>
          <div className="text-right font-mono">
            <span className="text-xs text-zinc-500">Current Balance</span>
            <div className="text-lg font-bold text-emerald-400">
              ${activeAccount?.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="h-64 sm:h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="time"
                stroke="#71717a"
                fontSize={10}
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                stroke="#71717a"
                fontSize={10}
                domain={['auto', 'auto']}
                tickFormatter={(v) => (v !== undefined ? `$${Number(v).toLocaleString()}` : '')}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.75rem' }}
                labelFormatter={(v: any) => (v ? new Date(v).toLocaleString() : '')}
                formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Balance']}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: '#10b981' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid: Pair Breakdown & Setup Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pair Breakdown */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-4">
          <h3 className="text-base font-bold text-zinc-100">PnL by Instrument / Pair</h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pairBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="pair" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.75rem' }}
                  formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Net PnL']}
                />
                <Bar dataKey="netPnL" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Setup Breakdown */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-4">
          <h3 className="text-base font-bold text-zinc-100">PnL by Strategy / Setup</h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={setupBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="setup" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.75rem' }}
                  formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Net PnL']}
                />
                <Bar dataKey="netPnL" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
