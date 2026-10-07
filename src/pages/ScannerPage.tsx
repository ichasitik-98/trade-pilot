import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { ScannerItem } from '../types.ts';
import {
  ExternalLink,
  Info,
  SlidersHorizontal,
  RotateCcw,
  Gauge,
  TrendingUp,
  TrendingDown,
  Clock,
  Layers,
} from 'lucide-react';

interface ScannerPageProps {
  onSelectPairForAnalysis: (pair: string) => void;
}

export function ScannerPage({ onSelectPairForAnalysis }: ScannerPageProps) {
  const [items, setItems] = useState<ScannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBias, setFilterBias] = useState<string>('ALL');
  const [dataSourceLabel, setDataSourceLabel] = useState('REAL DATA (Twelve Data)');
  const [mode, setMode] = useState('REAL');

  const fetchScanner = async () => {
    try {
      setLoading(true);
      const res = await api.getScanner();
      setItems(res.pairs);
      if (res.dataSourceLabel) setDataSourceLabel(res.dataSourceLabel);
      if (res.mode) setMode(res.mode);
    } catch (err) {
      console.error('Failed fetching scanner items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScanner();
  }, []);

  const filteredItems = items
    .filter((item) => (filterBias === 'ALL' ? true : item.bias === filterBias))
    .sort((a, b) => (b.dataQuality ?? 100) - (a.dataQuality ?? 100));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title & Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight">Market Intelligence Scanner</h2>
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              REAL DATA &bull; CURRENT
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Validated multi-timeframe market analysis, trend structure, momentum, and data quality metrics.
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 px-3 text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500">Bias:</span>
            <select
              value={filterBias}
              onChange={(e) => setFilterBias(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-300 outline-none font-mono"
            >
              <option value="ALL">All Biases</option>
              <option value="BULLISH">Bullish Only</option>
              <option value="BEARISH">Bearish Only</option>
              <option value="NEUTRAL">Neutral Only</option>
            </select>
          </div>

          <button
            onClick={fetchScanner}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs font-mono transition cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Scan</span>
          </button>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 flex items-start gap-3">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-zinc-200">Analytical Research Mode:</strong> The scanner summarizes current technical bias and data quality. Final trade candidate activations are governed by personal journal planning and multi-timeframe confluence.
        </div>
      </div>

      {/* Scanner Cards Grid */}
      {loading ? (
        <div className="p-20 text-center text-xs font-mono text-zinc-500 flex flex-col items-center gap-3">
          <RotateCcw className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Scanning instruments across normalized market data feeds...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-16 text-center text-xs font-mono text-zinc-500">
          No instruments currently meet the selected filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item) => {
            const sym = item.symbol || item.pair;
            const isBullish = item.bias === 'BULLISH';
            const isBearish = item.bias === 'BEARISH';
            const quality = item.dataQuality ?? 100;

            return (
              <div
                key={sym}
                className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 transition space-y-4 flex flex-col justify-between shadow-xl"
              >
                <div>
                  {/* Symbol Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-black text-zinc-100 font-mono tracking-tight">{sym}</div>
                      <div className="text-xs font-mono text-zinc-400">
                        ${item.currentPrice.toFixed(sym.includes('JPY') || sym === 'XAUUSD' ? 2 : 4)}{' '}
                        <span
                          className={`font-bold ${
                            item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          ({item.change24h > 0 ? '+' : ''}{item.change24h}%)
                        </span>
                      </div>
                    </div>

                    {/* Status Badge: REAL DATA CURRENT */}
                    <div
                      className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-extrabold border ${
                        item.dataStatus === 'STALE'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}
                    >
                      {item.dataStatus === 'STALE' ? 'REAL DATA • STALE' : 'REAL DATA • CURRENT'}
                    </div>
                  </div>

                  {/* Market Parameters List */}
                  <div className="mt-4 pt-3 border-t border-zinc-800/60 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Bias:</span>
                      <span
                        className={`font-black flex items-center gap-1 ${
                          isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-zinc-300'
                        }`}
                      >
                        {isBullish ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : isBearish ? (
                          <TrendingDown className="w-3.5 h-3.5" />
                        ) : null}
                        {item.bias}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Trend:</span>
                      <span className="text-zinc-200 font-semibold">{item.trend || 'NEUTRAL'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Momentum:</span>
                      <span className="text-zinc-200 font-semibold">{item.momentum || 'BALANCED'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Volatility:</span>
                      <span className="text-cyan-400 font-semibold">{item.volatility || 'NORMAL'}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-zinc-900">
                      <span className="text-zinc-500">Data Quality:</span>
                      <span className={`font-bold ${quality >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {quality}/100
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Last Updated:</span>
                      <span>{item.lastUpdated ? new Date(item.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onSelectPairForAnalysis(sym)}
                  className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-emerald-500 hover:text-zinc-950 text-zinc-200 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>Inspect in Terminal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
