import { describe, it, expect } from 'vitest';
import {
  calculatePositionSize,
  checkPortfolioRisk,
  getInstrumentSpec,
} from '../server/engines/risk.ts';
import { RiskSetting, Trade } from '../server/types/index.ts';

describe('Risk & Position Sizing Engine Tests', () => {
  it('correctly calculates Risk Amount = Account Balance * Risk %', () => {
    // $10,000 balance with 1.0% risk -> $100 risk amount
    const res = calculatePositionSize({
      pair: 'EURUSD',
      accountBalance: 10000,
      riskPercent: 1.0,
      entryPrice: 1.0850,
      stopLoss: 1.0800, // 50 pips distance
      takeProfit: 1.0950, // 100 pips distance (2.0R)
    });

    expect(res.status).toBe('SUCCESS');
    if (res.status === 'SUCCESS') {
      expect(res.riskAmount).toBe(100);
      expect(res.pipsAtRisk).toBe(50);
      expect(res.riskRewardRatio).toBe(2.0);
      // Contract size 100,000: 50 pips * 100,000 = $500 per lot. $100 / $500 = 0.20 lots
      expect(res.lotSize).toBe(0.20);
    }
  });

  it('correctly adapts position sizing across Forex, Metals, Crypto, and Indices', () => {
    // XAUUSD (Gold): 100 oz contract
    const gold = calculatePositionSize({
      pair: 'XAUUSD',
      accountBalance: 25000,
      riskPercent: 1.0, // $250 risk
      entryPrice: 2350.0,
      stopLoss: 2340.0, // $10 stop distance
    });
    expect(gold.status).toBe('SUCCESS');
    if (gold.status === 'SUCCESS') {
      expect(gold.riskAmount).toBe(250);
      // 10 * 100 = $1000 per lot. 250 / 1000 = 0.25 lots
      expect(gold.lotSize).toBe(0.25);
    }

    // BTCUSD (Crypto): 1 BTC contract
    const btc = calculatePositionSize({
      pair: 'BTCUSD',
      accountBalance: 50000,
      riskPercent: 1.0, // $500 risk
      entryPrice: 65000,
      stopLoss: 64000, // $1000 stop distance
    });
    expect(btc.status).toBe('SUCCESS');
    if (btc.status === 'SUCCESS') {
      expect(btc.riskAmount).toBe(500);
      // 1000 * 1 = $1000 per coin. 500 / 1000 = 0.50 lots
      expect(btc.lotSize).toBe(0.50);
    }
  });

  it('returns POSITION_SIZE_UNAVAILABLE when instrument specification is unknown', () => {
    const unknown = calculatePositionSize({
      pair: 'UNKNOWN_CRYPTO_TOKEN',
      accountBalance: 10000,
      riskPercent: 1.0,
      entryPrice: 100,
      stopLoss: 90,
    });

    expect(unknown.status).toBe('POSITION_SIZE_UNAVAILABLE');
    if (unknown.status === 'POSITION_SIZE_UNAVAILABLE') {
      expect(unknown.reason).toContain('Instrument specification not configured');
    }
  });

  it('blocks new trades when maximum open positions or portfolio risk is exceeded', () => {
    const riskSettings: RiskSetting = {
      id: 'r1',
      accountId: 'a1',
      riskPerTradePercent: 1.0,
      maxDailyRiskPercent: 3.0,
      maxPortfolioRiskPercent: 5.0,
      minRiskRewardRatio: 1.5,
      maxOpenPositions: 3,
    };

    const mockOpenTrades: Trade[] = [
      { id: '1', userId: 'u1', accountId: 'a1', pair: 'EURUSD', direction: 'LONG', status: 'OPEN', timeframe: 'H1', tradingSession: 'London', entryPrice: 1.08, stopLoss: 1.07, lotSize: 1, riskPercent: 1.0, riskAmount: 100, fees: 0, entryTime: '', psychology: [], mistakeTags: [], createdAt: '', updatedAt: '' },
      { id: '2', userId: 'u1', accountId: 'a1', pair: 'GBPUSD', direction: 'LONG', status: 'OPEN', timeframe: 'H1', tradingSession: 'London', entryPrice: 1.28, stopLoss: 1.27, lotSize: 1, riskPercent: 1.0, riskAmount: 100, fees: 0, entryTime: '', psychology: [], mistakeTags: [], createdAt: '', updatedAt: '' },
      { id: '3', userId: 'u1', accountId: 'a1', pair: 'USDJPY', direction: 'SHORT', status: 'OPEN', timeframe: 'H1', tradingSession: 'London', entryPrice: 154, stopLoss: 155, lotSize: 1, riskPercent: 1.0, riskAmount: 100, fees: 0, entryTime: '', psychology: [], mistakeTags: [], createdAt: '', updatedAt: '' },
    ];

    // Already at 3 open positions (max = 3)
    const checkLimit = checkPortfolioRisk(10000, mockOpenTrades, 1.0, riskSettings);
    expect(checkLimit.allowed).toBe(false);
    expect(checkLimit.reason).toContain('Maximum open position limit reached');

    // Risk per trade exceeds configured setting
    const checkExcessTradeRisk = checkPortfolioRisk(10000, mockOpenTrades.slice(0, 1), 2.5, riskSettings);
    expect(checkExcessTradeRisk.allowed).toBe(false);
    expect(checkExcessTradeRisk.reason).toContain('exceeds configured max per-trade limit');
  });
});
