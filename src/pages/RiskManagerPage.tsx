import { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { TradingAccount, RiskSetting } from '../types.ts';
import { Shield, Calculator, CheckCircle2, AlertTriangle, Save } from 'lucide-react';

interface RiskManagerPageProps {
  activeAccount: TradingAccount | null;
}

export function RiskManagerPage({ activeAccount }: RiskManagerPageProps) {
  const [risk, setRisk] = useState<RiskSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form State
  const [riskPerTrade, setRiskPerTrade] = useState('1.0');
  const [maxDailyRisk, setMaxDailyRisk] = useState('3.0');
  const [maxPortfolioRisk, setMaxPortfolioRisk] = useState('5.0');
  const [minRR, setMinRR] = useState('1.5');
  const [maxOpenPositions, setMaxOpenPositions] = useState('5');

  // Calculator State
  const [calcPair, setCalcPair] = useState('EURUSD');
  const [calcRiskPct, setCalcRiskPct] = useState('1.0');
  const [calcEntry, setCalcEntry] = useState('');
  const [calcSL, setCalcSL] = useState('');
  const [calcTP, setCalcTP] = useState('');
  const [calcResult, setCalcResult] = useState<any | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRisk() {
      if (!activeAccount) return;
      try {
        setLoading(true);
        const res = await api.getRisk(activeAccount.id);
        if (res.risk) {
          setRisk(res.risk);
          setRiskPerTrade(res.risk.riskPerTradePercent.toString());
          setMaxDailyRisk(res.risk.maxDailyRiskPercent.toString());
          setMaxPortfolioRisk(res.risk.maxPortfolioRiskPercent.toString());
          setMinRR(res.risk.minRiskRewardRatio.toString());
          setMaxOpenPositions(res.risk.maxOpenPositions.toString());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadRisk();
  }, [activeAccount?.id]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    try {
      setSaving(true);
      await api.updateRisk(activeAccount.id, {
        riskPerTradePercent: parseFloat(riskPerTrade),
        maxDailyRiskPercent: parseFloat(maxDailyRisk),
        maxPortfolioRiskPercent: parseFloat(maxPortfolioRisk),
        minRiskRewardRatio: parseFloat(minRR),
        maxOpenPositions: parseInt(maxOpenPositions, 10),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to save risk settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCalculate = async () => {
    if (!activeAccount || !calcEntry || !calcSL) return;
    setCalcError(null);

    try {
      const res = await api.calculatePositionSize({
        pair: calcPair,
        accountId: activeAccount.id,
        riskPercent: parseFloat(calcRiskPct) || 1.0,
        entryPrice: parseFloat(calcEntry),
        stopLoss: parseFloat(calcSL),
        takeProfit: calcTP ? parseFloat(calcTP) : undefined,
      });

      if (res.sizing.status === 'SUCCESS') {
        setCalcResult(res.sizing);
      } else {
        setCalcError(res.sizing.reason);
      }
    } catch (err: any) {
      setCalcError(err.message || 'Calculation failed');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">Risk Management & Position Sizing</h2>
        <p className="text-xs text-zinc-400">Configure capital protection rules and execute mathematically exact position sizes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Governance Settings */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-5 shadow-xl">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-zinc-100">Capital Protection Thresholds</h3>
          </div>

          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Risk configuration saved successfully!</span>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Risk Per Trade (% of Account Equity)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={riskPerTrade}
                onChange={(e) => setRiskPerTrade(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
              />
              <p className="text-[11px] text-zinc-500 mt-1">Recommended industry standard: 1.0% to 2.0%.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Max Daily Risk Limit (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  value={maxDailyRisk}
                  onChange={(e) => setMaxDailyRisk(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Max Portfolio Risk Limit (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="30"
                  value={maxPortfolioRisk}
                  onChange={(e) => setMaxPortfolioRisk(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Minimum Risk/Reward Threshold</label>
                <input
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="10"
                  value={minRR}
                  onChange={(e) => setMinRR(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Max Open Positions</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={maxOpenPositions}
                  onChange={(e) => setMaxOpenPositions(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/10"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Update Risk Limits'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Position Sizing Calculator */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-5 shadow-xl">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Calculator className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-zinc-100">Exact Position Size Calculator</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-zinc-400 mb-1">Instrument Pair</label>
                <select
                  value={calcPair}
                  onChange={(e) => setCalcPair(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono outline-none"
                >
                  <option value="EURUSD">EURUSD (Forex)</option>
                  <option value="GBPUSD">GBPUSD (Forex)</option>
                  <option value="USDJPY">USDJPY (Forex)</option>
                  <option value="XAUUSD">XAUUSD (Gold Metal)</option>
                  <option value="BTCUSD">BTCUSD (Crypto)</option>
                  <option value="US30">US30 (Index)</option>
                  <option value="NAS100">NAS100 (Index)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-zinc-400 mb-1">Allocated Risk %</label>
                <input
                  type="number"
                  step="0.1"
                  value={calcRiskPct}
                  onChange={(e) => setCalcRiskPct(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-zinc-400 mb-1">Entry Price *</label>
                <input
                  type="number"
                  step="any"
                  value={calcEntry}
                  onChange={(e) => setCalcEntry(e.target.value)}
                  placeholder="1.08500"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-400 mb-1">Stop Loss *</label>
                <input
                  type="number"
                  step="any"
                  value={calcSL}
                  onChange={(e) => setCalcSL(e.target.value)}
                  placeholder="1.08200"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-rose-400 font-mono outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-400 mb-1">Take Profit</label>
                <input
                  type="number"
                  step="any"
                  value={calcTP}
                  onChange={(e) => setCalcTP(e.target.value)}
                  placeholder="1.09100"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400 font-mono outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleCalculate}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold transition cursor-pointer"
            >
              Calculate Lot Size
            </button>

            {calcError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{calcError}</span>
              </div>
            )}

            {calcResult && (
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5 font-mono">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Recommended Lot Size:</span>
                  <strong className="text-emerald-400 text-base">{calcResult.lotSize} lots</strong>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Risk Amount:</span>
                  <span className="text-zinc-200">${calcResult.riskAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Pips / Points at Risk:</span>
                  <span className="text-rose-400">{calcResult.pipsAtRisk} pips</span>
                </div>
                {calcResult.riskRewardRatio > 0 && (
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Expected R:R:</span>
                    <span className="text-emerald-400 font-bold">{calcResult.riskRewardRatio}R</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
