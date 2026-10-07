import React, { useEffect, useState } from 'react';
import { X, Calculator } from 'lucide-react';
import { Trade, TradingAccount } from '../types.ts';
import { api } from '../services/api.ts';

export interface TradePrefillData {
  accountId?: string;
  pair?: string;
  direction?: 'LONG' | 'SHORT';
  status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
  timeframe?: string;
  tradingSession?: string;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  lotSize?: number;
  riskPercent?: number;
  fees?: number;
  setup?: string;
  entryReason?: string;
  exitReason?: string;
  notes?: string;
  psychology?: string[];
  mistakeTags?: string[];
}

interface TradeModalProps {
  activeAccount: TradingAccount | null;
  tradeToEdit?: Trade | null;
  prefillData?: TradePrefillData | null;
  onClose: () => void;
  onSaved: () => void;
}

export function resolveCanonicalTradeId(trade?: Partial<Trade> | null): string {
  if (!trade || typeof trade.id !== 'string') return '';
  return trade.id.trim();
}

export function prefillTradeFormState(
  tradeToEdit?: Trade | null,
  prefillData?: TradePrefillData | null,
  activeAccountId?: string
) {
  const tradeId = resolveCanonicalTradeId(tradeToEdit);
  if (tradeToEdit) {
    return {
      tradeId,
      accountId: tradeToEdit.accountId || activeAccountId || '',
      pair: tradeToEdit.pair || prefillData?.pair || 'EURUSD',
      direction: (tradeToEdit.direction || prefillData?.direction || 'LONG') as 'LONG' | 'SHORT',
      status: (tradeToEdit.status || 'OPEN') as 'OPEN' | 'CLOSED' | 'CANCELLED',
      timeframe: tradeToEdit.timeframe || prefillData?.timeframe || 'H1',
      tradingSession: tradeToEdit.tradingSession || prefillData?.tradingSession || 'London',
      entryPrice:
        tradeToEdit.entryPrice !== undefined && tradeToEdit.entryPrice !== null
          ? String(tradeToEdit.entryPrice)
          : prefillData?.entryPrice !== undefined
          ? String(prefillData.entryPrice)
          : '',
      exitPrice:
        tradeToEdit.exitPrice !== undefined && tradeToEdit.exitPrice !== null
          ? String(tradeToEdit.exitPrice)
          : '',
      stopLoss:
        tradeToEdit.stopLoss !== undefined && tradeToEdit.stopLoss !== null
          ? String(tradeToEdit.stopLoss)
          : prefillData?.stopLoss !== undefined
          ? String(prefillData.stopLoss)
          : '',
      takeProfit:
        tradeToEdit.takeProfit !== undefined && tradeToEdit.takeProfit !== null
          ? String(tradeToEdit.takeProfit)
          : prefillData?.takeProfit !== undefined
          ? String(prefillData.takeProfit)
          : '',
      lotSize:
        tradeToEdit.lotSize !== undefined && tradeToEdit.lotSize !== null
          ? String(tradeToEdit.lotSize)
          : '0.5',
      riskPercent:
        tradeToEdit.riskPercent !== undefined && tradeToEdit.riskPercent !== null
          ? String(tradeToEdit.riskPercent)
          : '1.0',
      fees:
        tradeToEdit.fees !== undefined && tradeToEdit.fees !== null
          ? String(tradeToEdit.fees)
          : '0',
      setup: tradeToEdit.setup ?? prefillData?.setup ?? '',
      entryReason: tradeToEdit.entryReason ?? prefillData?.entryReason ?? '',
      exitReason: tradeToEdit.exitReason ?? '',
      notes: tradeToEdit.notes ?? prefillData?.notes ?? '',
      psychology: Array.isArray(tradeToEdit.psychology) ? [...tradeToEdit.psychology] : [],
      mistakeTags: Array.isArray(tradeToEdit.mistakeTags) ? [...tradeToEdit.mistakeTags] : [],
    };
  }

  return {
    tradeId: '',
    accountId: prefillData?.accountId || activeAccountId || '',
    pair: prefillData?.pair || 'EURUSD',
    direction: (prefillData?.direction || 'LONG') as 'LONG' | 'SHORT',
    status: (prefillData?.status || 'OPEN') as 'OPEN' | 'CLOSED' | 'CANCELLED',
    timeframe: prefillData?.timeframe || 'H1',
    tradingSession: prefillData?.tradingSession || 'London',
    entryPrice: prefillData?.entryPrice !== undefined ? String(prefillData.entryPrice) : '',
    exitPrice: prefillData?.exitPrice !== undefined ? String(prefillData.exitPrice) : '',
    stopLoss: prefillData?.stopLoss !== undefined ? String(prefillData.stopLoss) : '',
    takeProfit: prefillData?.takeProfit !== undefined ? String(prefillData.takeProfit) : '',
    lotSize: prefillData?.lotSize !== undefined ? String(prefillData.lotSize) : '0.5',
    riskPercent: prefillData?.riskPercent !== undefined ? String(prefillData.riskPercent) : '1.0',
    fees: prefillData?.fees !== undefined ? String(prefillData.fees) : '0',
    setup: prefillData?.setup || 'Trend Pullback',
    entryReason: prefillData?.entryReason || '',
    exitReason: prefillData?.exitReason || '',
    notes: prefillData?.notes || '',
    psychology: Array.isArray(prefillData?.psychology) ? [...prefillData!.psychology] : [],
    mistakeTags: Array.isArray(prefillData?.mistakeTags) ? [...prefillData!.mistakeTags] : [],
  };
}

export function buildTradeUpdatePayload(
  existingTrade: Trade,
  updates: Partial<Trade>
): Partial<Trade> {
  const payload: Partial<Trade> = {};

  if (typeof updates.pair === 'string' && updates.pair.trim().length >= 2) {
    const normalizedPair = updates.pair.trim().toUpperCase();
    if (normalizedPair !== existingTrade.pair) payload.pair = normalizedPair;
  }

  if (
    (updates.direction === 'LONG' || updates.direction === 'SHORT') &&
    updates.direction !== existingTrade.direction
  ) {
    payload.direction = updates.direction;
  }

  if (
    (updates.status === 'OPEN' || updates.status === 'CLOSED' || updates.status === 'CANCELLED') &&
    updates.status !== existingTrade.status
  ) {
    payload.status = updates.status;
  }

  if (typeof updates.timeframe === 'string' && updates.timeframe.trim().length > 0) {
    const tf = updates.timeframe.trim();
    if (tf !== existingTrade.timeframe) payload.timeframe = tf;
  }

  if (typeof updates.tradingSession === 'string' && updates.tradingSession.trim().length > 0) {
    const session = updates.tradingSession.trim();
    if (session !== existingTrade.tradingSession) payload.tradingSession = session;
  }

  if (
    typeof updates.entryPrice === 'number' &&
    Number.isFinite(updates.entryPrice) &&
    updates.entryPrice > 0 &&
    updates.entryPrice !== existingTrade.entryPrice
  ) {
    payload.entryPrice = updates.entryPrice;
  }

  if (
    typeof updates.exitPrice === 'number' &&
    Number.isFinite(updates.exitPrice) &&
    updates.exitPrice > 0 &&
    updates.exitPrice !== existingTrade.exitPrice
  ) {
    payload.exitPrice = updates.exitPrice;
  }

  if (
    typeof updates.stopLoss === 'number' &&
    Number.isFinite(updates.stopLoss) &&
    updates.stopLoss > 0 &&
    updates.stopLoss !== existingTrade.stopLoss
  ) {
    payload.stopLoss = updates.stopLoss;
  }

  if (
    typeof updates.takeProfit === 'number' &&
    Number.isFinite(updates.takeProfit) &&
    updates.takeProfit > 0 &&
    updates.takeProfit !== existingTrade.takeProfit
  ) {
    payload.takeProfit = updates.takeProfit;
  }

  if (
    typeof updates.lotSize === 'number' &&
    Number.isFinite(updates.lotSize) &&
    updates.lotSize > 0 &&
    updates.lotSize !== existingTrade.lotSize
  ) {
    payload.lotSize = updates.lotSize;
  }

  if (
    typeof updates.riskPercent === 'number' &&
    Number.isFinite(updates.riskPercent) &&
    updates.riskPercent > 0 &&
    updates.riskPercent !== existingTrade.riskPercent
  ) {
    payload.riskPercent = updates.riskPercent;
  }

  if (
    typeof updates.fees === 'number' &&
    Number.isFinite(updates.fees) &&
    updates.fees >= 0 &&
    updates.fees !== existingTrade.fees
  ) {
    payload.fees = updates.fees;
  }

  if (typeof updates.setup === 'string' && updates.setup.trim().length > 0) {
    const setupVal = updates.setup.trim();
    if (setupVal !== (existingTrade.setup ?? '')) {
      payload.setup = setupVal;
    }
  }

  if (typeof updates.entryReason === 'string' && updates.entryReason !== (existingTrade.entryReason ?? '')) {
    if (updates.entryReason.trim().length > 0 || existingTrade.entryReason) {
      payload.entryReason = updates.entryReason;
    }
  }

  if (typeof updates.exitReason === 'string' && updates.exitReason !== (existingTrade.exitReason ?? '')) {
    if (updates.exitReason.trim().length > 0 || existingTrade.exitReason) {
      payload.exitReason = updates.exitReason;
    }
  }

  if (typeof updates.notes === 'string' && updates.notes !== (existingTrade.notes ?? '')) {
    if (updates.notes.trim().length > 0 || existingTrade.notes) {
      payload.notes = updates.notes;
    }
  }

  if (Array.isArray(updates.psychology)) {
    const prevPsych = existingTrade.psychology || [];
    if (
      updates.psychology.length !== prevPsych.length ||
      updates.psychology.some((tag, idx) => tag !== prevPsych[idx])
    ) {
      payload.psychology = updates.psychology;
    }
  }

  if (Array.isArray(updates.mistakeTags)) {
    const prevMistakes = existingTrade.mistakeTags || [];
    if (
      updates.mistakeTags.length !== prevMistakes.length ||
      updates.mistakeTags.some((tag, idx) => tag !== prevMistakes[idx])
    ) {
      payload.mistakeTags = updates.mistakeTags;
    }
  }

  return payload;
}

const COMMON_PSYCHOLOGY = ['Disciplined', 'Patience', 'Followed Plan', 'Slight FOMO', 'Anxious', 'Revenge Trade', 'Hesitant', 'Confident'];
const COMMON_MISTAKES = ['Chased Price', 'Moved Stop Loss', 'Overleveraged', 'Exited Too Early', 'Ignored Higher Timeframe', 'High Impact News'];

export function TradeModal({ activeAccount, tradeToEdit, prefillData, onClose, onSaved }: TradeModalProps) {
  const initialForm = prefillTradeFormState(tradeToEdit, prefillData, activeAccount?.id);
  const isEditing = Boolean(tradeToEdit);

  const [tradeId, setTradeId] = useState<string>(initialForm.tradeId);
  const [accountId, setAccountId] = useState(initialForm.accountId);
  const [pair, setPair] = useState(initialForm.pair);
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>(initialForm.direction);
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'CANCELLED'>(initialForm.status);
  const [timeframe, setTimeframe] = useState(initialForm.timeframe);
  const [tradingSession, setTradingSession] = useState(initialForm.tradingSession);
  const [entryPrice, setEntryPrice] = useState(initialForm.entryPrice);
  const [exitPrice, setExitPrice] = useState(initialForm.exitPrice);
  const [stopLoss, setStopLoss] = useState(initialForm.stopLoss);
  const [takeProfit, setTakeProfit] = useState(initialForm.takeProfit);
  const [lotSize, setLotSize] = useState(initialForm.lotSize);
  const [riskPercent, setRiskPercent] = useState(initialForm.riskPercent);
  const [fees, setFees] = useState(initialForm.fees);
  const [setup, setSetup] = useState(initialForm.setup);
  const [entryReason, setEntryReason] = useState(initialForm.entryReason);
  const [exitReason, setExitReason] = useState(initialForm.exitReason);
  const [notes, setNotes] = useState(initialForm.notes);
  const [psychology, setPsychology] = useState<string[]>(initialForm.psychology);
  const [mistakeTags, setMistakeTags] = useState<string[]>(initialForm.mistakeTags);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const synced = prefillTradeFormState(tradeToEdit, prefillData, activeAccount?.id);
    setTradeId(synced.tradeId);
    setAccountId(synced.accountId);
    setPair(synced.pair);
    setDirection(synced.direction);
    setStatus(synced.status);
    setTimeframe(synced.timeframe);
    setTradingSession(synced.tradingSession);
    setEntryPrice(synced.entryPrice);
    setExitPrice(synced.exitPrice);
    setStopLoss(synced.stopLoss);
    setTakeProfit(synced.takeProfit);
    setLotSize(synced.lotSize);
    setRiskPercent(synced.riskPercent);
    setFees(synced.fees);
    setSetup(synced.setup);
    setEntryReason(synced.entryReason);
    setExitReason(synced.exitReason);
    setNotes(synced.notes);
    setPsychology(synced.psychology);
    setMistakeTags(synced.mistakeTags);
  }, [tradeToEdit, prefillData, activeAccount?.id]);

  // Position Sizing Calculator Assist
  const handleCalculateSize = async () => {
    if (!entryPrice || !stopLoss || !activeAccount) return;
    try {
      const res = await api.calculatePositionSize({
        pair,
        accountId: activeAccount.id,
        riskPercent: parseFloat(riskPercent) || 1.0,
        entryPrice: parseFloat(entryPrice),
        stopLoss: parseFloat(stopLoss),
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
      });

      if (res.sizing.status === 'SUCCESS') {
        setLotSize(res.sizing.lotSize.toString());
      } else {
        setError(res.sizing.reason);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleTag = (list: string[], setList: (v: string[]) => void, tag: string) => {
    if (list.includes(tag)) {
      setList(list.filter((t) => t !== tag));
    } else {
      setList([...list, tag]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isEditing) {
      const resolvedTradeId = (tradeId || resolveCanonicalTradeId(tradeToEdit)).trim();
      if (!resolvedTradeId) {
        console.warn('Trade update request:', {
          tradeIdPresent: false,
          userAuthenticated: true,
        });
        setError('Unable to update trade because the trade ID is missing.');
        return;
      }

      setLoading(true);
      try {
        const candidateUpdates: Partial<Trade> = {
          pair: pair.toUpperCase().trim(),
          direction,
          status,
          timeframe,
          tradingSession,
          entryPrice: parseFloat(entryPrice),
          exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
          stopLoss: parseFloat(stopLoss),
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
          lotSize: parseFloat(lotSize),
          riskPercent: parseFloat(riskPercent),
          fees: parseFloat(fees) || 0,
          setup,
          entryReason,
          exitReason,
          notes,
          psychology,
          mistakeTags,
        };

        const partialPayload = tradeToEdit
          ? buildTradeUpdatePayload(tradeToEdit, candidateUpdates)
          : candidateUpdates;

        await api.updateTrade(resolvedTradeId, partialPayload);
        onSaved();
      } catch (err: any) {
        setError(err.message || 'Failed to update trade record');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const payload: Partial<Trade> = {
        accountId: accountId || activeAccount?.id || '',
        pair: pair.toUpperCase().trim(),
        direction,
        status,
        timeframe,
        tradingSession,
        entryPrice: parseFloat(entryPrice),
        exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
        stopLoss: parseFloat(stopLoss),
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        lotSize: parseFloat(lotSize),
        riskPercent: parseFloat(riskPercent),
        fees: parseFloat(fees) || 0,
        setup,
        entryReason,
        exitReason,
        notes,
        psychology,
        mistakeTags,
      };

      await api.createTrade(payload);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save trade record');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-100">
              {isEditing
                ? tradeId
                  ? `Edit Trade #${tradeId.slice(0, 8)}`
                  : 'Edit Trade (Missing ID)'
                : prefillData
                ? 'Log Pre-filled Trade Entry'
                : 'Log New Trade Entry'}
            </h3>
            <p className="text-xs text-zinc-400">Keep records accurate and disciplined.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Pair, Direction, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Trading Pair</label>
              <input
                type="text"
                required
                value={pair}
                onChange={(e) => setPair(e.target.value.toUpperCase())}
                placeholder="EURUSD, XAUUSD"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-sm font-mono text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Direction</label>
              <div className="grid grid-cols-2 gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setDirection('LONG')}
                  className={`py-1 rounded text-xs font-bold transition ${
                    direction === 'LONG' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  LONG
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('SHORT')}
                  className={`py-1 rounded text-xs font-bold transition ${
                    direction === 'SHORT' ? 'bg-rose-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  SHORT
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Trade Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-sm text-zinc-100 outline-none"
              >
                <option value="OPEN">OPEN</option>
                <option value="CLOSED">CLOSED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>

          {/* Timeframe & Session */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 outline-none"
              >
                <option value="M1">M1 (1 Minute)</option>
                <option value="M5">M5 (5 Minutes)</option>
                <option value="M15">M15 (15 Minutes)</option>
                <option value="H1">H1 (1 Hour)</option>
                <option value="H4">H4 (4 Hours)</option>
                <option value="D1">D1 (Daily)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Trading Session</label>
              <select
                value={tradingSession}
                onChange={(e) => setTradingSession(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 outline-none"
              >
                <option value="Asian">Asian (Tokyo/Sydney)</option>
                <option value="London">London (European)</option>
                <option value="New York">New York (US)</option>
                <option value="London/NY Overlap">London / NY Overlap</option>
              </select>
            </div>
          </div>

          {/* Pricing Geometry */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Entry Price *</label>
              <input
                type="number"
                step="any"
                required
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="1.08500"
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Stop Loss *</label>
              <input
                type="number"
                step="any"
                required
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="1.08200"
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-rose-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Take Profit</label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="1.09200"
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-emerald-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Exit Price (if closed)</label>
              <input
                type="number"
                step="any"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="1.09100"
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
              />
            </div>
          </div>

          {/* Sizing & Risk Assist */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-400">Lot Size *</label>
                <button
                  type="button"
                  onClick={handleCalculateSize}
                  className="text-[10px] text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Calculator className="w-3 h-3" />
                  Auto-size
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                required
                value={lotSize}
                onChange={(e) => setLotSize(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Risk %</label>
              <input
                type="number"
                step="0.1"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Broker Fees / Comm ($)</label>
              <input
                type="number"
                step="0.5"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 outline-none"
              />
            </div>
          </div>

          {/* Setup & Psychology */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Strategy / Setup Tag</label>
            <input
              type="text"
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
              placeholder="e.g. Trend Pullback, London Breakout"
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 outline-none"
            />
          </div>

          {/* Psychology & Discipline Tags */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Mental & Psychology State</label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PSYCHOLOGY.map((tag) => {
                const selected = psychology.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(psychology, setPsychology, tag)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                      selected
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Execution Mistakes */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Mistake Tags (if any)</label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_MISTAKES.map((tag) => {
                const selected = mistakeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(mistakeTags, setMistakeTags, tag)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                      selected
                        ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                        : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reasoning & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Entry Reason</label>
              <textarea
                rows={2}
                value={entryReason}
                onChange={(e) => setEntryReason(e.target.value)}
                placeholder="What technical confluence triggered the entry?"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Journal Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Key lessons, thoughts, or review notes..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-none resize-none"
              />
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-bold transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Saving Trade...' : isEditing ? 'Update Trade' : 'Save Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
