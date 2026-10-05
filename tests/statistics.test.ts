import { describe, it, expect } from 'vitest';
import {
  calculateRMultiple,
  calculateTradeStatistics,
  calculateEquityAndDrawdown,
} from '../server/engines/statistics.ts';
import { Trade } from '../server/types/index.ts';

describe('Statistics Engine Tests', () => {
  it('correctly calculates statistics with prompt known dataset (Trades: +100, +200, -100, -50, +150)', () => {
    const knownTrades: Trade[] = [
      {
        id: 't1',
        userId: 'u1',
        accountId: 'a1',
        pair: 'EURUSD',
        direction: 'LONG',
        status: 'CLOSED',
        timeframe: 'H1',
        tradingSession: 'London',
        entryPrice: 1.0800,
        exitPrice: 1.0850,
        stopLoss: 1.0775,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 100,
        grossPnL: 100,
        fees: 0,
        netPnL: 100,
        rMultiple: 2.0,
        entryTime: '2026-03-01T10:00:00Z',
        exitTime: '2026-03-01T12:00:00Z',
        psychology: [],
        mistakeTags: [],
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T12:00:00Z',
      },
      {
        id: 't2',
        userId: 'u1',
        accountId: 'a1',
        pair: 'GBPUSD',
        direction: 'LONG',
        status: 'CLOSED',
        timeframe: 'H1',
        tradingSession: 'London',
        entryPrice: 1.2800,
        exitPrice: 1.2850,
        stopLoss: 1.2775,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 100,
        grossPnL: 200,
        fees: 0,
        netPnL: 200,
        rMultiple: 2.0,
        entryTime: '2026-03-02T10:00:00Z',
        exitTime: '2026-03-02T12:00:00Z',
        psychology: [],
        mistakeTags: [],
        createdAt: '2026-03-02T10:00:00Z',
        updatedAt: '2026-03-02T12:00:00Z',
      },
      {
        id: 't3',
        userId: 'u1',
        accountId: 'a1',
        pair: 'USDJPY',
        direction: 'SHORT',
        status: 'CLOSED',
        timeframe: 'H1',
        tradingSession: 'New York',
        entryPrice: 154.00,
        exitPrice: 154.50,
        stopLoss: 154.50,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 100,
        grossPnL: -100,
        fees: 0,
        netPnL: -100,
        rMultiple: -1.0,
        entryTime: '2026-03-03T10:00:00Z',
        exitTime: '2026-03-03T12:00:00Z',
        psychology: [],
        mistakeTags: [],
        createdAt: '2026-03-03T10:00:00Z',
        updatedAt: '2026-03-03T12:00:00Z',
      },
      {
        id: 't4',
        userId: 'u1',
        accountId: 'a1',
        pair: 'AUDUSD',
        direction: 'LONG',
        status: 'CLOSED',
        timeframe: 'H1',
        tradingSession: 'Asian',
        entryPrice: 0.6500,
        exitPrice: 0.6480,
        stopLoss: 0.6460,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 100,
        grossPnL: -50,
        fees: 0,
        netPnL: -50,
        rMultiple: -0.5,
        entryTime: '2026-03-04T10:00:00Z',
        exitTime: '2026-03-04T12:00:00Z',
        psychology: [],
        mistakeTags: [],
        createdAt: '2026-03-04T10:00:00Z',
        updatedAt: '2026-03-04T12:00:00Z',
      },
      {
        id: 't5',
        userId: 'u1',
        accountId: 'a1',
        pair: 'XAUUSD',
        direction: 'LONG',
        status: 'CLOSED',
        timeframe: 'H1',
        tradingSession: 'New York',
        entryPrice: 2350.0,
        exitPrice: 2365.0,
        stopLoss: 2340.0,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 100,
        grossPnL: 150,
        fees: 0,
        netPnL: 150,
        rMultiple: 1.5,
        entryTime: '2026-03-05T10:00:00Z',
        exitTime: '2026-03-05T12:00:00Z',
        psychology: [],
        mistakeTags: [],
        createdAt: '2026-03-05T10:00:00Z',
        updatedAt: '2026-03-05T12:00:00Z',
      },
    ];

    const stats = calculateTradeStatistics(knownTrades, 10000);

    expect(stats.closedTrades).toBe(5);
    expect(stats.winningTrades).toBe(3);
    expect(stats.losingTrades).toBe(2);
    expect(stats.winRate).toBe(60);
    expect(stats.lossRate).toBe(40);
    expect(stats.grossProfit).toBe(450);
    expect(stats.grossLoss).toBe(150);
    expect(stats.profitFactor).toBe(3.0);
    expect(stats.netPnL).toBe(300);
    expect(stats.averageWin).toBe(150); // 450 / 3
    expect(stats.averageLoss).toBe(75); // 150 / 2
    expect(stats.expectancy).toBe(60); // (0.6 * 150) - (0.4 * 75) = 90 - 30 = 60
  });

  it('calculates LONG and SHORT R-multiples independently', () => {
    // LONG: entry 100, exit 110, stop 95 -> risk 5, reward 10 -> 2.0R
    const longR = calculateRMultiple('LONG', 100, 110, 95);
    expect(longR).toBe(2.0);

    // SHORT: entry 100, exit 90, stop 105 -> risk 5, reward 10 -> 2.0R
    const shortR = calculateRMultiple('SHORT', 100, 90, 105);
    expect(shortR).toBe(2.0);

    // Invalid SL for LONG (stop above entry)
    expect(calculateRMultiple('LONG', 100, 110, 105)).toBe(0);

    // Invalid SL for SHORT (stop below entry)
    expect(calculateRMultiple('SHORT', 100, 90, 95)).toBe(0);
  });

  it('excludes open trades from closed trade statistics', () => {
    const trades: Trade[] = [
      {
        id: 't1',
        userId: 'u1',
        accountId: 'a1',
        pair: 'EURUSD',
        direction: 'LONG',
        status: 'CLOSED',
        timeframe: 'H1',
        tradingSession: 'London',
        entryPrice: 1.0800,
        exitPrice: 1.0850,
        stopLoss: 1.0750,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 100,
        grossPnL: 200,
        fees: 10,
        netPnL: 190,
        rMultiple: 1.0,
        entryTime: '2026-03-01T10:00:00Z',
        exitTime: '2026-03-01T12:00:00Z',
        psychology: [],
        mistakeTags: [],
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T12:00:00Z',
      },
      {
        id: 't2',
        userId: 'u1',
        accountId: 'a1',
        pair: 'GBPUSD',
        direction: 'LONG',
        status: 'OPEN',
        timeframe: 'H1',
        tradingSession: 'London',
        entryPrice: 1.2800,
        stopLoss: 1.2750,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 100,
        fees: 0,
        entryTime: '2026-03-02T10:00:00Z',
        psychology: [],
        mistakeTags: [],
        createdAt: '2026-03-02T10:00:00Z',
        updatedAt: '2026-03-02T10:00:00Z',
      },
    ];

    const stats = calculateTradeStatistics(trades, 10000);
    expect(stats.totalTrades).toBe(2);
    expect(stats.closedTrades).toBe(1);
    expect(stats.openTrades).toBe(1);
    expect(stats.netPnL).toBe(190);
  });
});
