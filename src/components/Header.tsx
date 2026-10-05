import { User, TradingAccount } from '../types.ts';
import { Plus, ShieldAlert, LogOut, ChevronDown } from 'lucide-react';

interface HeaderProps {
  user: User;
  accounts: TradingAccount[];
  activeAccount: TradingAccount | null;
  onSelectAccount: (account: TradingAccount) => void;
  onNewTrade: () => void;
  onLogout: () => void;
}

export function Header({
  user,
  accounts,
  activeAccount,
  onSelectAccount,
  onNewTrade,
  onLogout,
}: HeaderProps) {
  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Account Info */}
      <div className="flex items-center gap-4">
        <div className="relative group">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition text-sm font-medium text-zinc-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="truncate max-w-[140px] sm:max-w-[200px]">{activeAccount?.name || 'Main Account'}</span>
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          </button>

          <div className="absolute left-0 mt-1 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 hidden group-hover:block z-50">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
              Trading Accounts
            </div>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => onSelectAccount(acc)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-zinc-800 transition ${
                  acc.id === activeAccount?.id ? 'text-emerald-400 font-medium bg-emerald-500/10' : 'text-zinc-300'
                }`}
              >
                <span className="truncate">{acc.name}</span>
                <span className="text-xs font-mono text-zinc-400">${acc.balance.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {activeAccount && (
          <div className="hidden md:flex items-center gap-4 text-xs font-mono">
            <div className="flex items-baseline gap-1.5">
              <span className="text-zinc-400">Balance:</span>
              <span className="text-zinc-100 font-semibold">${activeAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-zinc-400">Equity:</span>
              <span className="text-emerald-400 font-semibold">${activeAccount.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Decision Support Mode</span>
        </div>

        <button
          onClick={onNewTrade}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-semibold transition shadow-lg shadow-emerald-500/10 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">Log Trade</span>
        </button>

        <div className="h-6 w-px bg-zinc-800 hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-medium text-zinc-200">{user.name}</span>
            <span className="text-[10px] text-zinc-400">{user.email}</span>
          </div>

          <button
            onClick={onLogout}
            title="Log out"
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-rose-400 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
