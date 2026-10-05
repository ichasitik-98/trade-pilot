import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { Trade, TradingAccount } from '../types.ts';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface CalendarPageProps {
  activeAccount: TradingAccount | null;
}

export function CalendarPage({ activeAccount }: CalendarPageProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDayTrades, setSelectedDayTrades] = useState<{ date: string; trades: Trade[] } | null>(null);

  useEffect(() => {
    async function loadTrades() {
      try {
        setLoading(true);
        const res = await api.getTrades({ accountId: activeAccount?.id, limit: 1000 });
        setTrades(res.trades.filter((t) => t.status === 'CLOSED'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadTrades();
  }, [activeAccount?.id]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map trades by YYYY-MM-DD
  const dayTradesMap = new Map<string, { count: number; netPnL: number; trades: Trade[] }>();
  for (const t of trades) {
    const d = new Date(t.exitTime || t.entryTime).toISOString().split('T')[0];
    const existing = dayTradesMap.get(d) || { count: 0, netPnL: 0, trades: [] };
    existing.count++;
    existing.netPnL += t.netPnL ?? 0;
    existing.trades.push(t);
    dayTradesMap.set(d, existing);
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">Trading Calendar</h2>
          <p className="text-xs text-zinc-400">Day-by-day PnL heatmaps and activity distributions.</p>
        </div>

        {/* Month Picker Controls */}
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 px-3">
          <button onClick={prevMonth} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-sm font-bold text-zinc-200 min-w-[140px] text-center">
            {monthName} {year}
          </span>
          <button onClick={nextMonth} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-800">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs font-mono text-zinc-500">Loading Calendar Records...</div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {/* Empty offset padding */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[85px] sm:min-h-[110px] rounded-xl bg-zinc-950/20" />
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayData = dayTradesMap.get(dateStr);
              const pnl = dayData?.netPnL ?? 0;
              const hasTrades = !!dayData && dayData.count > 0;

              return (
                <div
                  key={dayNum}
                  onClick={() => dayData && setSelectedDayTrades({ date: dateStr, trades: dayData.trades })}
                  className={`min-h-[85px] sm:min-h-[110px] p-2.5 rounded-xl border transition flex flex-col justify-between cursor-pointer ${
                    hasTrades
                      ? pnl >= 0
                        ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60'
                        : 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/60'
                      : 'bg-zinc-950/50 border-zinc-850 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-zinc-400">{dayNum}</span>
                    {hasTrades && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                        {dayData.count}t
                      </span>
                    )}
                  </div>

                  {hasTrades && (
                    <div className="font-mono text-right">
                      <div className={`text-xs sm:text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Day Details Drawer/Modal */}
      {selectedDayTrades && (
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-100 font-mono">
                Trades Logged for {selectedDayTrades.date} ({selectedDayTrades.trades.length} trades)
              </h3>
            </div>
            <button
              onClick={() => setSelectedDayTrades(null)}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Close
            </button>
          </div>

          <div className="space-y-2">
            {selectedDayTrades.trades.map((t) => (
              <div
                key={t.id}
                className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${t.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {t.direction} {t.pair}
                  </span>
                  <span className="text-zinc-400">Entry: {t.entryPrice.toFixed(4)}</span>
                  <span className="text-zinc-400">Exit: {t.exitPrice?.toFixed(4) ?? '-'}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-zinc-400">{t.rMultiple !== undefined ? `${t.rMultiple}R` : ''}</span>
                  <span className={`font-bold ${(t.netPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(t.netPnL ?? 0) >= 0 ? '+' : ''}${t.netPnL?.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
