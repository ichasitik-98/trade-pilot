import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { User, TradingAccount, AuditLog } from '../types.ts';
import { Settings, User as UserIcon, Plus, ShieldCheck, History, Check, Bell, ArrowRight } from 'lucide-react';

interface SettingsPageProps {
  user: User;
  accounts: TradingAccount[];
  onRefreshAccounts: () => void;
  onNavigateToAlerts?: () => void;
}

export function SettingsPage({ user, accounts, onRefreshAccounts, onNavigateToAlerts }: SettingsPageProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBroker, setNewAccountBroker] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('10000');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountSuccess, setAccountSuccess] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await api.getAuditLogs();
        setAuditLogs(res.logs);
      } catch (err) {
        console.error(err);
      }
    }
    loadLogs();
  }, []);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim()) return;

    try {
      setCreatingAccount(true);
      setAccountError(null);
      await api.createAccount({
        name: newAccountName.trim(),
        broker: newAccountBroker.trim() || 'Demo Broker',
        initialBalance: parseFloat(newAccountBalance) || 10000,
      });
      setNewAccountName('');
      setNewAccountBroker('');
      setAccountSuccess(true);
      onRefreshAccounts();
      setTimeout(() => setAccountSuccess(false), 2000);
    } catch (err: any) {
      setAccountError(err.message || 'Failed to create trading account');
    } finally {
      setCreatingAccount(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">System & Account Settings</h2>
        <p className="text-xs text-zinc-400">Manage user profiles, multiple trading accounts, and inspect audit activity logs.</p>
      </div>

      {/* User Profile */}
      <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <UserIcon className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold text-zinc-100">User Profile</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div>
            <span className="text-zinc-500 block mb-1">Full Name</span>
            <span className="text-zinc-200 font-bold">{user.name}</span>
          </div>
          <div>
            <span className="text-zinc-500 block mb-1">Email Address</span>
            <span className="text-zinc-200">{user.email}</span>
          </div>
          <div>
            <span className="text-zinc-500 block mb-1">Role / Plan</span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 font-bold border border-zinc-700">
              {user.role} (Private Pro)
            </span>
          </div>
        </div>
      </div>

      {/* Multiple Trading Accounts */}
      <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-zinc-100">Trading Accounts ({accounts.length})</h3>
          </div>
        </div>

        <div className="space-y-3">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono"
            >
              <div>
                <div className="font-bold text-zinc-100 flex items-center gap-2">
                  <span>{acc.name}</span>
                  {acc.isDefault && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {acc.broker} · {acc.currency}
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-zinc-500 block">Balance</span>
                <span className="font-bold text-zinc-200 text-sm">
                  ${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Add Account Sub-form */}
        <form onSubmit={handleCreateAccount} className="pt-3 border-t border-zinc-800 space-y-3">
          <span className="text-xs font-semibold text-zinc-300 block">Add New Trading Account</span>

          {accountSuccess && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Trading account added successfully!</span>
            </div>
          )}

          {accountError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {accountError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder="Account Name (e.g. Scalping Prop)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 outline-none"
            />
            <input
              type="text"
              value={newAccountBroker}
              onChange={(e) => setNewAccountBroker(e.target.value)}
              placeholder="Broker / Firm (e.g. FTMO, IC Markets)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 outline-none"
            />
            <input
              type="number"
              step="100"
              value={newAccountBalance}
              onChange={(e) => setNewAccountBalance(e.target.value)}
              placeholder="Initial Balance ($)"
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 font-mono outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={creatingAccount}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-emerald-500 hover:text-zinc-950 text-zinc-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{creatingAccount ? 'Adding...' : 'Create Account'}</span>
          </button>
        </form>
      </div>

      {/* Dual-Stage Signal Alerts & WhatsApp Cloud API */}
      <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Dual-Stage Trading Signal Alerts & WhatsApp Cloud API
              </h3>
              <p className="text-xs text-zinc-400">
                Configure Stage 1 (Initial Signal) and Stage 2 (Higher-Timeframe Confirmation) rules and official Meta WhatsApp Business Cloud API delivery.
              </p>
            </div>
          </div>

          {onNavigateToAlerts && (
            <button
              onClick={onNavigateToAlerts}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <span>Open Signal Alerts Center</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div>
            <span className="text-zinc-500 block mb-1">Default Active Pair</span>
            <span className="text-zinc-200 font-bold">XAUUSD (M15 ➔ H1)</span>
          </div>
          <div>
            <span className="text-zinc-500 block mb-1">Market Data Provider</span>
            <span className="text-emerald-400 font-bold">Twelve Data (REAL Mode)</span>
          </div>
          <div>
            <span className="text-zinc-500 block mb-1">Notification Channel</span>
            <span className="text-zinc-200">Meta WhatsApp Cloud API</span>
          </div>
        </div>
      </div>

      {/* Security Audit Activity Logs */}
      <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <History className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-base font-bold text-zinc-100">Security Audit Logs</h3>
            <p className="text-xs text-zinc-400">Append-only audit trail of security and transaction events.</p>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-[10px] text-zinc-400 uppercase">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Action</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-900/40">
                  <td className="p-3 text-zinc-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-emerald-400 border border-zinc-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3 text-zinc-300">{log.entity}</td>
                  <td className="p-3 text-zinc-400">{log.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
