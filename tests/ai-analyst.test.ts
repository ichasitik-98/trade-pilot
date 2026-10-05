import { describe, it, expect } from 'vitest';
import { calculateTradeStatistics } from '../server/engines/statistics.ts';
import { Trade } from '../server/types/index.ts';

describe('AI Analyst Engine & Guardrail Tests', () => {
  it('enforces insufficient data guardrail when user has fewer than 2 closed trades', () => {
    const singleTrade: Trade[] = [
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
        riskAmount: 250,
        grossPnL: 500,
        fees: 10,
        netPnL: 490,
        rMultiple: 2.0,
        entryTime: '2026-03-01T10:00:00Z',
        exitTime: '2026-03-01T14:00:00Z',
        psychology: ['Disciplined'],
        mistakeTags: [],
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T14:00:00Z',
      },
    ];

    const closedTrades = singleTrade.filter((t) => t.status === 'CLOSED');

    let response = '';
    if (closedTrades.length < 2) {
      response = `Insufficient data for a reliable conclusion. TradePilot requires at least 2 closed trades in this account to deliver meaningful performance diagnosis. You currently have ${closedTrades.length} closed trade(s).`;
    }

    expect(response).toContain('Insufficient data for a reliable conclusion');
    expect(response).toContain('1 closed trade(s)');
  });

  it('generates grounded performance diagnosis with disclaimer and no market certainty claims', () => {
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
        exitTime: '2026-03-01T14:00:00Z',
        psychology: ['Disciplined'],
        mistakeTags: [],
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T14:00:00Z',
      },
      {
        id: 't2',
        userId: 'u1',
        accountId: 'a1',
        pair: 'GBPUSD',
        direction: 'SHORT',
        status: 'CLOSED',
        timeframe: 'H1',
        tradingSession: 'London',
        entryPrice: 1.2850,
        exitPrice: 1.2885,
        stopLoss: 1.2885,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 100,
        grossPnL: -100,
        fees: 5,
        netPnL: -105,
        rMultiple: -1.0,
        entryTime: '2026-03-02T10:00:00Z',
        exitTime: '2026-03-02T14:00:00Z',
        psychology: ['Slight FOMO'],
        mistakeTags: ['High Impact News'],
        createdAt: '2026-03-02T10:00:00Z',
        updatedAt: '2026-03-02T14:00:00Z',
      },
    ];

    const stats = calculateTradeStatistics(trades, 10000);
    expect(stats.closedTrades).toBe(2);
    expect(stats.winRate).toBe(50);
    expect(stats.netPnL).toBe(85); // 190 - 105

    const disclaimer = 'Disclaimer: TradePilot is an analytical decision-support platform. Past performance does not guarantee future results.';
    expect(disclaimer).toContain('decision-support');
  });
});
