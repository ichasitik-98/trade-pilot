import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { Watchlist } from '../types.ts';
import { Plus, Trash2, ExternalLink, Eye, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface WatchlistPageProps {
  onSelectPairForAnalysis: (pair: string) => void;
}

export function WatchlistPage({ onSelectPairForAnalysis }: WatchlistPageProps) {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [newPair, setNewPair] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchWatchlists = async () => {
    try {
      setLoading(true);
      const res = await api.getWatchlists();
      setWatchlists(res.watchlists);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlists();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPair.trim()) return;

    try {
      await api.addWatchlist(newPair.toUpperCase().trim(), newNotes);
      setNewPair('');
      setNewNotes('');
      fetchWatchlists();
    } catch (err: any) {
      alert(err.message || 'Failed to add watchlist item');
    }
  };

  const handleRemove = async (pair: string) => {
    try {
      await api.removeWatchlist(pair);
      fetchWatchlists();
    } catch (err: any) {
      alert(err.message || 'Failed to remove watchlist item');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">Active Watchlist</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              REAL DATA &bull; TWELVE DATA
            </span>
          </div>
          <p className="text-xs text-zinc-400">Pin instruments for targeted structural analysis and quick execution.</p>
        </div>
      </div>

      {/* Add Pair Form */}
      <form onSubmit={handleAdd} className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 flex flex-wrap items-center gap-3">
        <input
          type="text"
          required
          value={newPair}
          onChange={(e) => setNewPair(e.target.value.toUpperCase())}
          placeholder="Pair symbol (e.g. GBPJPY, ETHUSD)"
          className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-xs font-mono text-zinc-100 outline-none min-w-[200px]"
        />

        <input
          type="text"
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          placeholder="Strategic notes / key price levels..."
          className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-xs text-zinc-200 outline-none flex-1 min-w-[240px]"
        />

        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/10"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add to Watchlist</span>
        </button>
      </form>

      {/* Watchlist Cards */}
      {loading ? (
        <div className="p-16 text-center text-xs font-mono text-zinc-500">Loading Watchlist Entries...</div>
      ) : watchlists.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-zinc-800 rounded-2xl space-y-2">
          <Eye className="w-8 h-8 text-zinc-600 mx-auto" />
          <div className="text-sm font-semibold text-zinc-300">Your Watchlist is empty</div>
          <p className="text-xs text-zinc-500">Add currency pairs, metals, or cryptos you are actively observing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlists.map((w) => (
            <div
              key={w.id}
              className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 transition flex flex-col justify-between space-y-4 shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold font-mono text-zinc-100">{w.pair}</span>
                  <button
                    onClick={() => handleRemove(w.pair)}
                    title="Remove from watchlist"
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {w.notes && (
                  <p className="text-xs text-zinc-400 mt-2 p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-850 font-sans leading-relaxed">
                    {w.notes}
                  </p>
                )}
              </div>

              <button
                onClick={() => onSelectPairForAnalysis(w.pair)}
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-emerald-500 hover:text-zinc-950 text-zinc-200 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Open in Pair Terminal</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
