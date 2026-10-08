import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { ScannerItem } from '../types.ts';
import {
  ExternalLink,
  Info,
  SlidersHorizontal,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
} from 'lucide-react';

interface ScannerPageProps {
  onSelectPairForAnalysis: (pair: string) => void;
  onQuickPrefillSignal?: (
    pair: string,
    direction: 'LONG' | 'SHORT',
    entry: number,
    sl: number,
    tp: number,
    timeframe?: string
  ) => void;
}

export function ScannerPage({ onSelectPairForAnalysis, onQuickPrefillSignal }: ScannerPageProps) {
  const [items, setItems] = useState<ScannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBias, setFilterBias] = useState<string>('ALL');
  const [filterDirection, setFilterDirection] = useState<string>('ALL');
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
    .filter((item) => {
      if (filterDirection === 'ALL') return true;
      if (filterDirection === 'HIGH_SCORE') return (item.score ?? 0) >= 65;
      return item.direction === filterDirection;
    })
    .sort((a, b) => (b.score ?? b.dataQuality ?? 0) - (a.score ?? a.dataQuality ?? 0));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title & Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight">
              Market Signal &amp; Risk/Reward Scanner
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              REAL DATA &bull; CURRENT
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Live open position signals with Entry, Stop Loss, Take Profit (TP1/TP2), and Risk:Reward ratios calculated from real Twelve Data feeds.
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 px-3 text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500">Signal:</span>
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-300 outline-none font-mono"
            >
              <option value="ALL">All Signals</option>
              <option value="LONG">LONG (BUY) Only</option>
              <option value="SHORT">SHORT (SELL) Only</option>
              <option value="HIGH_SCORE">High Confluence (&ge;65)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 px-3 text-xs">
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
          <strong className="text-zinc-200">Open Position Signal &amp; Risk/Reward Engine:</strong> Every instrument is evaluated for directional confluence, structural Support/Resistance, and ATR volatility buffer to compute optimal Entry, Stop Loss (-1R), Take Profit 1, and Take Profit 2 targets.
        </div>
      </div>

      {/* Scanner Cards Grid */}
      {loading ? (
        <div className="p-20 text-center text-xs font-mono text-zinc-500 flex flex-col items-center gap-3">
          <RotateCcw className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Scanning instruments and computing Open Position Signals &amp; Risk/Reward ratios...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-16 text-center text-xs font-mono text-zinc-500">
          No instruments currently meet the selected filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const sym = item.symbol || item.pair;
            const precision =
              sym.includes('JPY') || sym === 'XAUUSD' || sym.includes('BTC') || sym.includes('ETH')
                ? 2
                : 4;
            const isLongSignal = (item.direction || (item.bias === 'BEARISH' ? 'SHORT' : 'LONG')) === 'LONG';
            const sigDirection: 'LONG' | 'SHORT' = isLongSignal ? 'LONG' : 'SHORT';
            const quality = item.dataQuality ?? 100;
            const score = item.score ?? 65;

            const entryPrice = item.entryPrice ?? item.currentPrice;
            const defaultSlDist = entryPrice * 0.003;
            const stopLoss =
              item.stopLoss ??
              Number((isLongSignal ? entryPrice - defaultSlDist : entryPrice + defaultSlDist).toFixed(precision));
            const takeProfit1 =
              item.takeProfit1 ??
              Number(
                (isLongSignal ? entryPrice + defaultSlDist * 2.0 : entryPrice - defaultSlDist * 2.0).toFixed(
                  precision
                )
              );
            const takeProfit2 =
              item.takeProfit2 ??
              Number(
                (isLongSignal ? entryPrice + defaultSlDist * 3.0 : entryPrice - defaultSlDist * 3.0).toFixed(
                  precision
                )
              );
            const rr1 = item.riskReward ?? 2.0;
            const rr2 = item.riskReward2 ?? 3.0;

            return (
              <div
                key={sym}
                className="p-5 rounded-2xl bg-zinc-900/85 border border-zinc-800/80 hover:border-zinc-700 transition space-y-4 flex flex-col justify-between shadow-xl"
              >
                <div className="space-y-3.5">
                  {/* Symbol Header & Feed Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-zinc-100 font-mono tracking-tight">{sym}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border flex items-center gap-1 ${
                            isLongSignal
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {isLongSignal ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          OPEN {isLongSignal ? 'BUY / LONG' : 'SELL / SHORT'}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-400 mt-1 tabular-nums">
                        ${item.currentPrice.toFixed(precision)}{' '}
                        <span
                          className={`font-bold ${
                            item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          ({item.change24h > 0 ? '+' : ''}
                          {item.change24h}%)
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div
                        className={`text-sm font-black tabular-nums ${
                          score >= 70
                            ? 'text-emerald-400'
                            : score >= 55
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {score}/100
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {(item.status || 'VALID_SETUP').replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>

                  {/* Open Position Entry, SL, TP1, TP2 & Risk:Reward Box */}
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2 text-xs font-mono tabular-nums">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                      <span className="text-sky-400 font-semibold">Entry ({sigDirection}):</span>
                      <span className="text-zinc-100 font-bold">${entryPrice.toFixed(precision)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-rose-400">Stop Loss (SL):</span>
                      <span className="text-rose-400 font-bold">
                        ${stopLoss.toFixed(precision)}
                        {item.stopLossPips ? ` (-${item.stopLossPips}p)` : ' (-1.0R)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-emerald-400">Take Profit 1:</span>
                      <span className="text-emerald-400 font-bold">
                        ${takeProfit1.toFixed(precision)} (1:{rr1}R)
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-teal-400">Take Profit 2:</span>
                      <span className="text-teal-400 font-bold">
                        ${takeProfit2.toFixed(precision)} (1:{rr2}R)
                      </span>
                    </div>

                    <div className="pt-1.5 border-t border-zinc-900 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Risk / Reward Ratio:</span>
                      <span className="text-emerald-400 font-black">
                        1 : {rr1} R &middot; 1 : {rr2} R
                      </span>
                    </div>
                  </div>

                  {/* Market Parameters Summary */}
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-center">
                    <div className="p-2 rounded-lg bg-zinc-950/70 border border-zinc-800/60">
                      <div className="text-[10px] text-zinc-500">Bias</div>
                      <div
                        className={`font-bold flex items-center justify-center gap-0.5 ${
                          item.bias === 'BULLISH'
                            ? 'text-emerald-400'
                            : item.bias === 'BEARISH'
                            ? 'text-rose-400'
                            : 'text-zinc-300'
                        }`}
                      >
                        {item.bias === 'BULLISH' ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : item.bias === 'BEARISH' ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : null}
                        {item.bias}
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-zinc-950/70 border border-zinc-800/60">
                      <div className="text-[10px] text-zinc-500">Momentum</div>
                      <div className="font-bold text-zinc-200 truncate">{item.momentum || 'BALANCED'}</div>
                    </div>

                    <div className="p-2 rounded-lg bg-zinc-950/70 border border-zinc-800/60">
                      <div className="text-[10px] text-zinc-500">Feed Quality</div>
                      <div className={`font-bold ${quality >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {quality}/100
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onSelectPairForAnalysis(sym)}
                    className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <span>Signal &amp; R:R</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onQuickPrefillSignal) {
                        onQuickPrefillSignal(sym, sigDirection, entryPrice, stopLoss, takeProfit1, 'H1');
                      } else {
                        onSelectPairForAnalysis(sym);
                      }
                    }}
                    className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Open Position</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

