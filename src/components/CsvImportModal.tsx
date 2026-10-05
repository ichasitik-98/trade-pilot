import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../services/api.ts';
import { TradingAccount, TradeDirection, TradeStatus } from '../types.ts';

interface CsvImportModalProps {
  activeAccount: TradingAccount | null;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParsedTradeRow {
  pair: string;
  direction: TradeDirection;
  status: TradeStatus;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit?: number;
  lotSize: number;
  fees: number;
  setup?: string;
  isValid: boolean;
  error?: string;
}

export function CsvImportModal({ activeAccount, onClose, onImportComplete }: CsvImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedTradeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const sampleCsv = `pair,direction,status,entryPrice,exitPrice,stopLoss,takeProfit,lotSize,fees,setup
EURUSD,LONG,CLOSED,1.0820,1.0890,1.0780,1.0900,0.5,5.0,H4 Trend Pullback
GBPUSD,SHORT,CLOSED,1.2850,1.2800,1.2890,1.2750,0.4,4.0,London Breakout
USDJPY,LONG,OPEN,154.20,,153.60,155.50,0.3,3.0,Range Reversal`;

  const parseCsvData = (raw: string) => {
    const lines = raw.trim().split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      setParsedRows([]);
      return;
    }

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
    const rows: ParsedTradeRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      const rowObj: any = {};
      header.forEach((h, idx) => {
        rowObj[h] = parts[idx];
      });

      const pair = (rowObj.pair || '').toUpperCase();
      const direction: TradeDirection = (rowObj.direction || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
      const status: TradeStatus = (rowObj.status || 'CLOSED').toUpperCase() === 'OPEN' ? 'OPEN' : 'CLOSED';
      const entryPrice = parseFloat(rowObj.entryprice || rowObj.entry);
      const exitPrice = rowObj.exitprice || rowObj.exit ? parseFloat(rowObj.exitprice || rowObj.exit) : undefined;
      const stopLoss = parseFloat(rowObj.stoploss || rowObj.sl);
      const takeProfit = rowObj.takeprofit || rowObj.tp ? parseFloat(rowObj.takeprofit || rowObj.tp) : undefined;
      const lotSize = parseFloat(rowObj.lotsize || rowObj.lot || '0.1');
      const fees = parseFloat(rowObj.fees || '0') || 0;
      const setup = rowObj.setup || 'CSV Import';

      let isValid = true;
      let errorReason: string | undefined = undefined;

      if (!pair || pair.length < 3) {
        isValid = false;
        errorReason = 'Invalid pair symbol';
      } else if (!entryPrice || isNaN(entryPrice)) {
        isValid = false;
        errorReason = 'Invalid entry price';
      } else if (!stopLoss || isNaN(stopLoss)) {
        isValid = false;
        errorReason = 'Invalid stop loss';
      } else if (direction === 'LONG' && stopLoss >= entryPrice) {
        isValid = false;
        errorReason = 'LONG SL must be below entry';
      } else if (direction === 'SHORT' && stopLoss <= entryPrice) {
        isValid = false;
        errorReason = 'SHORT SL must be above entry';
      }

      rows.push({
        pair,
        direction,
        status,
        entryPrice,
        exitPrice,
        stopLoss,
        takeProfit,
        lotSize: isNaN(lotSize) ? 0.1 : lotSize,
        fees,
        setup,
        isValid,
        error: errorReason,
      });
    }

    setParsedRows(rows);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCsvText(e.target.value);
    parseCsvData(e.target.value);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      parseCsvData(text);
    };
    reader.readAsText(file);
  };

  const handleCommitImport = async () => {
    if (!activeAccount) {
      setError('Please select an active trading account first.');
      return;
    }

    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setError('No valid trade rows to import.');
      return;
    }

    setLoading(true);
    setError(null);
    let imported = 0;

    try {
      for (const row of validRows) {
        await api.createTrade({
          accountId: activeAccount.id,
          pair: row.pair,
          direction: row.direction,
          status: row.status,
          entryPrice: row.entryPrice,
          exitPrice: row.exitPrice,
          stopLoss: row.stopLoss,
          takeProfit: row.takeProfit,
          lotSize: row.lotSize,
          fees: row.fees,
          setup: row.setup,
          entryReason: 'Imported via CSV batch',
          timeframe: 'H1',
          tradingSession: 'London',
        });
        imported++;
      }

      setSuccessCount(imported);
      setTimeout(() => {
        onImportComplete();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving imported rows.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-lg font-bold text-zinc-100">Batch CSV Trade Import</h3>
              <p className="text-xs text-zinc-400">Import trade histories directly into your active account.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successCount !== null && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Successfully imported {successCount} trades into {activeAccount?.name}!</span>
            </div>
          )}

          {/* Upload input or paste */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">Paste CSV or Upload File</label>
              <button
                type="button"
                onClick={() => {
                  setCsvText(sampleCsv);
                  parseCsvData(sampleCsv);
                }}
                className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3 h-3" />
                Load Sample CSV
              </button>
            </div>

            <textarea
              rows={5}
              value={csvText}
              onChange={handleTextChange}
              placeholder="pair,direction,status,entryPrice,exitPrice,stopLoss,takeProfit,lotSize,fees,setup..."
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-xs font-mono text-zinc-100 outline-none resize-none"
            />

            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="block w-full text-xs text-zinc-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
            />
          </div>

          {/* Live Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">Parsed Preview ({parsedRows.length} rows)</span>
                <span className="text-zinc-400 font-mono">
                  Valid: <strong className="text-emerald-400">{parsedRows.filter((r) => r.isValid).length}</strong> | Invalid:{' '}
                  <strong className="text-rose-400">{parsedRows.filter((r) => !r.isValid).length}</strong>
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-900 border-b border-zinc-800 text-[10px] text-zinc-400 uppercase">
                    <tr>
                      <th className="p-2">Status</th>
                      <th className="p-2">Pair</th>
                      <th className="p-2">Dir</th>
                      <th className="p-2">Entry</th>
                      <th className="p-2">SL</th>
                      <th className="p-2">TP</th>
                      <th className="p-2">Lots</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className={r.isValid ? 'hover:bg-zinc-900/50' : 'bg-rose-500/5 text-rose-300'}>
                        <td className="p-2">
                          {r.isValid ? (
                            <span className="text-emerald-400 font-bold">READY</span>
                          ) : (
                            <span className="text-rose-400 font-bold" title={r.error}>
                              ERR: {r.error}
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-bold text-zinc-100">{r.pair}</td>
                        <td className={`p-2 font-bold ${r.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {r.direction}
                        </td>
                        <td className="p-2 text-zinc-300">{r.entryPrice}</td>
                        <td className="p-2 text-rose-400">{r.stopLoss}</td>
                        <td className="p-2 text-emerald-400">{r.takeProfit ?? '-'}</td>
                        <td className="p-2 text-zinc-400">{r.lotSize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading || parsedRows.filter((r) => r.isValid).length === 0}
              onClick={handleCommitImport}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-bold transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Importing...' : `Import ${parsedRows.filter((r) => r.isValid).length} Trades`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
