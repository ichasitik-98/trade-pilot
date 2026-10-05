import { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  Upload,
  ArrowUpRight,
  ArrowDownRight,
  Edit2,
  Trash2,
  CheckCircle,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { Trade, TradingAccount } from '../types.ts';

interface JournalPageProps {
  activeAccount: TradingAccount | null;
  onOpenTradeModal: (tradeToEdit?: Trade) => void;
  onOpenCsvModal: () => void;
}

export function JournalPage({ activeAccount, onOpenTradeModal, onOpenCsvModal }: JournalPageProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [searchPair, setSearchPair] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [directionFilter, setDirectionFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const limit = 20;

  // Close Trade Sub-Modal State
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);
  const [exitPriceInput, setExitPriceInput] = useState('');
  const [exitReasonInput, setExitReasonInput] = useState('');
  const [closeFeesInput, setCloseFeesInput] = useState('0');
  const [closeLoading, setCloseLoading] = useState(false);

  const fetchTrades = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getTrades({
        accountId: activeAccount?.id,
        status: statusFilter || undefined,
        pair: searchPair || undefined,
        direction: directionFilter || undefined,
        offset: page * limit,
        limit,
      });
      setTrades(res.trades);
      setTotalCount(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch trade entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, [activeAccount?.id, statusFilter, directionFilter, page, searchPair]);

  const handleDeleteTrade = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this trade record?')) return;
    try {
      await api.deleteTrade(id);
      fetchTrades();
    } catch (err: any) {
      alert(err.message || 'Failed to delete trade');
    }
  };

  const handleCloseTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingTrade) return;

    try {
      setCloseLoading(true);
      await api.closeTrade(closingTrade.id, {
        exitPrice: parseFloat(exitPriceInput),
        exitReason: exitReasonInput,
        fees: parseFloat(closeFeesInput) || 0,
      });
      setClosingTrade(null);
      fetchTrades();
    } catch (err: any) {
      alert(err.message || 'Failed to close trade');
    } finally {
      setCloseLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">Trading Journal</h2>
          <p className="text-xs text-zinc-400">Log, review, and analyze execution discipline across market sessions.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCsvModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-200 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            <span>Batch CSV</span>
          </button>

          <button
            onClick={() => onOpenTradeModal()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition shadow-lg shadow-emerald-500/10 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Trade Log</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 flex flex-wrap items-center gap-3">
        {/* Search pair */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchPair}
            onChange={(e) => {
              setSearchPair(e.target.value.toUpperCase());
              setPage(0);
            }}
            placeholder="Search pair (EURUSD, XAUUSD)..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-xs text-zinc-200 outline-none font-mono"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 outline-none cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open Only</option>
            <option value="CLOSED">Closed Only</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Direction filter */}
        <div className="text-xs">
          <select
            value={directionFilter}
            onChange={(e) => {
              setDirectionFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 outline-none cursor-pointer"
          >
            <option value="">All Directions</option>
            <option value="LONG">Long Only</option>
            <option value="SHORT">Short Only</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Journal Data Table */}
      <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800/80 overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono text-zinc-500">Loading journal records...</span>
          </div>
        ) : trades.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-medium text-zinc-300">No trades matching current filters</p>
            <p className="text-xs text-zinc-500">Try adjusting your search criteria or log a new trade.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-950/80 border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Date & Session</th>
                  <th className="p-3.5">Pair</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Entry / SL / TP</th>
                  <th className="p-3.5">Exit</th>
                  <th className="p-3.5">R-Mult</th>
                  <th className="p-3.5">Net PnL</th>
                  <th className="p-3.5">Setup & Psychology</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {trades.map((trade) => {
                  const isLong = trade.direction === 'LONG';
                  const isOpen = trade.status === 'OPEN';
                  return (
                    <tr key={trade.id} className="hover:bg-zinc-800/25 transition">
                      <td className="p-3.5">
                        <div className="text-zinc-200 font-semibold">
                          {new Date(trade.entryTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-[10px] text-zinc-500">{trade.tradingSession} · {trade.timeframe}</div>
                      </td>

                      <td className="p-3.5">
                        <div className="text-zinc-100 font-bold text-sm">{trade.pair}</div>
                        <div className="text-[10px] text-zinc-500">{trade.lotSize} lots</div>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 font-bold text-xs ${
                            isLong ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isLong ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          {trade.direction}
                        </span>
                      </td>

                      <td className="p-3.5 text-zinc-300">
                        <div>Entry: <strong className="text-zinc-100">{trade.entryPrice.toFixed(4)}</strong></div>
                        <div className="text-[11px] text-rose-400">SL: {trade.stopLoss.toFixed(4)}</div>
                        {trade.takeProfit && (
                          <div className="text-[11px] text-emerald-400">TP: {trade.takeProfit.toFixed(4)}</div>
                        )}
                      </td>

                      <td className="p-3.5 text-zinc-300">
                        {trade.exitPrice ? (
                          <div>
                            <span className="font-semibold text-zinc-100">{trade.exitPrice.toFixed(4)}</span>
                            {trade.exitReason && (
                              <div className="text-[10px] text-zinc-500 truncate max-w-[120px]">{trade.exitReason}</div>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Active Open
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                        {trade.rMultiple !== undefined && trade.rMultiple !== null ? (
                          <span className={`font-bold ${trade.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {trade.rMultiple > 0 ? '+' : ''}{trade.rMultiple}R
                          </span>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>

                      <td className="p-3.5">
                        {trade.netPnL !== undefined && trade.netPnL !== null ? (
                          <div>
                            <div className={`font-bold text-sm ${trade.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {trade.netPnL >= 0 ? '+' : ''}${trade.netPnL.toFixed(2)}
                            </div>
                            {trade.pnlPercent !== undefined && (
                              <div className="text-[10px] text-zinc-500">{trade.pnlPercent > 0 ? '+' : ''}{trade.pnlPercent}%</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500 font-mono text-[11px]">Floating</span>
                        )}
                      </td>

                      <td className="p-3.5 max-w-[200px]">
                        <div className="text-xs text-zinc-200 font-medium truncate">{trade.setup || 'Standard'}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {trade.psychology?.slice(0, 2).map((p, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                              {p}
                            </span>
                          ))}
                          {trade.mistakeTags?.slice(0, 1).map((m, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isOpen && (
                            <button
                              onClick={() => {
                                setClosingTrade(trade);
                                setExitPriceInput(trade.entryPrice.toString());
                              }}
                              title="Close Trade"
                              className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" />
                              Close
                            </button>
                          )}

                          <button
                            onClick={() => onOpenTradeModal(trade)}
                            title="Edit Trade"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteTrade(trade.id)}
                            title="Delete Trade"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-3.5 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
          <span>
            Showing {trades.length} of {totalCount} records
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-30 hover:border-zinc-700 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(totalCount / limit))}
            </span>
            <button
              disabled={(page + 1) * limit >= totalCount}
              onClick={() => setPage(page + 1)}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-30 hover:border-zinc-700 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Close Position Modal */}
      {closingTrade && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h4 className="text-base font-bold text-zinc-100">
                Close {closingTrade.direction} {closingTrade.pair} Position
              </h4>
              <button onClick={() => setClosingTrade(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCloseTradeSubmit} className="space-y-3 font-mono">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Exit Price *</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={exitPriceInput}
                  onChange={(e) => setExitPriceInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Total Broker Commission/Fees ($)</label>
                <input
                  type="number"
                  step="0.5"
                  value={closeFeesInput}
                  onChange={(e) => setCloseFeesInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Exit Reason / Notes</label>
                <input
                  type="text"
                  value={exitReasonInput}
                  onChange={(e) => setExitReasonInput(e.target.value)}
                  placeholder="Target reached, Trailing stop hit..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClosingTrade(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closeLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold text-xs hover:bg-emerald-400 transition"
                >
                  {closeLoading ? 'Closing...' : 'Confirm & Close'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
