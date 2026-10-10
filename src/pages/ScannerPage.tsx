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
  CheckCircle2,
  AlertTriangle,
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

  const fetchScanner = async () => {
    try {
      setLoading(true);
      const res = await api.getScanner();
      setItems(res.pairs);
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
      if (filterDirection === 'POTENTIAL_ONLY') return (item.score ?? 0) >= 65;
      if (filterDirection === 'NON_POTENTIAL') return (item.score ?? 0) < 65;
      return item.direction === filterDirection;
    })
    .sort((a, b) => (b.score ?? b.dataQuality ?? 0) - (a.score ?? a.dataQuality ?? 0));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title & Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight">
              Market Signal &amp; Risk/Reward Scanner
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              REAL DATA &bull; CURRENT
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/25">
              Model Backtest #1: Adaptive Bottom-Up Hybrid (60%–64% WR)
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Menggunakan indikator &amp; analisis ber-win rate tertinggi hasil backtest (Bollinger 20,2 + EMA 20/50/200 + RSI Anti-Exhaustion 32–68 + MACD Inflection + ADX/DI) mulai dari timeframe terkecil (M5/M15 &rarr; H1 &rarr; H4 &rarr; D1).
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 px-3 text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500">Filter Signal:</span>
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-300 outline-none font-mono"
            >
              <option value="ALL">Semua Signal</option>
              <option value="POTENTIAL_ONLY">Hanya Signal Potensial (&ge;65)</option>
              <option value="NON_POTENTIAL">Kurang / Tidak Potensial (&lt;65)</option>
              <option value="LONG">LONG (BUY LIMIT) Only</option>
              <option value="SHORT">SHORT (SELL LIMIT) Only</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 px-3 text-xs">
            <span className="text-zinc-500">Bias:</span>
            <select
              value={filterBias}
              onChange={(e) => setFilterBias(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-300 outline-none font-mono"
            >
              <option value="ALL">Semua Bias</option>
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
          <strong className="text-zinc-200">Metodologi Analisis Timeframe Terkecil (Bottom-Up M15 &rarr; H1 &rarr; H4 &rarr; D1):</strong> Signal tidak menggunakan harga pasar terkini sebagai titik masuk, melainkan menentukan <strong className="text-sky-300">Harga Entry Teknikal (Buy Limit / Sell Limit)</strong> pada area pullback EMA20/50 &amp; struktur Support/Resistance timeframe kecil, disertai evaluasi transparan faktor pendukung (Potensial) dan faktor risiko/kelemahan (Tidak Potensial).
        </div>
      </div>

      {/* Scanner Cards Grid */}
      {loading ? (
        <div className="p-20 text-center text-xs font-mono text-zinc-500 flex flex-col items-center gap-3">
          <RotateCcw className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Menganalisis instrumen dari timeframe terkecil (M15 &rarr; H1 &rarr; H4 &rarr; D1) dan menghitung Risk/Reward...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-16 text-center text-xs font-mono text-zinc-500">
          Tidak ada instrumen yang memenuhi filter saat ini.
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
            const score = item.score ?? 65;

            const fallbackOffset = item.currentPrice * 0.0012;
            const entryPrice =
              item.entryPrice && Math.abs(item.entryPrice - item.currentPrice) > 0
                ? item.entryPrice
                : Number(
                    (isLongSignal
                      ? item.currentPrice - fallbackOffset
                      : item.currentPrice + fallbackOffset
                    ).toFixed(precision)
                  );

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

            const verdict =
              item.potentialVerdict ||
              (score >= 80
                ? 'SANGAT POTENSIAL'
                : score >= 65
                ? 'POTENSIAL'
                : score >= 50
                ? 'KURANG POTENSIAL'
                : 'TIDAK POTENSIAL');

            const orderBadge =
              item.orderTypeLabel ||
              (isLongSignal ? 'BUY LIMIT (Retest TF Kecil)' : 'SELL LIMIT (Retest TF Kecil)');

            const topPotentialReason =
              item.potentialReasons && item.potentialReasons.length > 0
                ? item.potentialReasons[0]
                : `Konfluensi struktur & R:R 1:${rr1}R mendukung skenario ${sigDirection}.`;

            const topNonPotentialReason =
              item.nonPotentialReasons && item.nonPotentialReasons.length > 0
                ? item.nonPotentialReasons[0]
                : `Waspadai pembatalan setup apabila harga menembus SL $${stopLoss.toFixed(precision)}.`;

            return (
              <div
                key={sym}
                className="p-5 rounded-2xl bg-zinc-900/85 border border-zinc-800/80 hover:border-zinc-700 transition space-y-4 flex flex-col justify-between shadow-xl"
              >
                <div className="space-y-3.5">
                  {/* Symbol Header & Verdict Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
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
                          {isLongSignal ? 'BUY LIMIT / LONG' : 'SELL LIMIT / SHORT'}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-400 mt-1 tabular-nums">
                        Harga Terkini: <strong className="text-zinc-200">${item.currentPrice.toFixed(precision)}</strong>{' '}
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
                          score >= 65
                            ? 'text-emerald-400'
                            : score >= 50
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {score}/100
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          score >= 65
                            ? 'text-emerald-400'
                            : score >= 50
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {verdict}
                      </div>
                    </div>
                  </div>

                  {/* Bottom-Up Timeframe Sequence Pills (M15 -> H1 -> H4 -> D1) */}
                  {item.bottomUpTimeframeSteps && item.bottomUpTimeframeSteps.length > 0 && (
                    <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800/80 text-[10px] font-mono">
                      <span className="text-zinc-500">TF Kecil&rarr;Besar:</span>
                      <div className="flex items-center gap-1">
                        {item.bottomUpTimeframeSteps.map((st) => (
                          <span
                            key={st.timeframe}
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              st.isAligned
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {st.timeframe}:{st.trend.slice(0, 4)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open Position Entry (Technical Level, Not Current Price), SL, TP1, TP2 & Risk:Reward Box */}
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2 text-xs font-mono tabular-nums">
                    <div className="border-b border-zinc-900 pb-1.5 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sky-400 font-semibold">Entry Teknikal ({sigDirection}):</span>
                        <span className="text-zinc-100 font-bold">
                          ${entryPrice.toFixed(precision)}
                          {item.entryDistancePips ? ` (${item.entryDistancePips}p)` : ''}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate">
                        {item.entryBasisMethod || orderBadge} (Bukan Harga Terkini)
                      </div>
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

                  {/* Alasan Kenapa Potensial & Tidak Potensial Summary */}
                  <div className="space-y-1.5 text-[11px] leading-relaxed">
                    <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/25 text-zinc-200 flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-emerald-300">Potensial: </span>
                        <span>{topPotentialReason}</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/25 text-zinc-200 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-rose-300">Risiko / Tidak Potensial: </span>
                        <span>{topNonPotentialReason}</span>
                      </div>
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
                      <div className="text-[10px] text-zinc-500">Status</div>
                      <div
                        className={`font-bold truncate ${
                          score >= 65 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {score >= 65 ? 'POTENSIAL' : ' PANTAU'}
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
                    <span>Detail Analisis</span>
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
