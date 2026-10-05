import { describe, it, expect } from 'vitest';
import {
  calculateRMultiple,
  calculateTradeStatistics,
  calculateEquityAndDrawdown,
} from '../server/engines/statistics.ts';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  calculateADX,
} from '../server/engines/indicators.ts';
import {
  analyzeMarketStructure,
  detectSwingPoints,
} from '../server/engines/market-structure.ts';
import {
  evaluateSignal,
  classifyScore,
} from '../server/engines/signal-scoring.ts';
import {
  calculatePositionSize,
  checkPortfolioRisk,
  getInstrumentSpec,
} from '../server/engines/risk.ts';
import {
  hashPassword,
  comparePassword,
  assertOwnership,
} from '../server/auth/session.ts';
import { Trade, MarketCandle, RiskSetting } from '../server/types/index.ts';

describe('Trading Statistics Engine', () => {
  it('correctly calculates R-Multiple for LONG and SHORT trades', () => {
    // LONG: entry 1.1000, exit 1.1040, SL 1.0980 -> risk 0.0020, profit 0.0040 -> 2.0R
    const longR = calculateRMultiple('LONG', 1.1000, 1.1040, 1.0980);
    expect(longR).toBe(2.0);

    // SHORT: entry 1.1000, exit 1.0970, SL 1.1020 -> risk 0.0020, profit 0.0030 -> 1.5R
    const shortR = calculateRMultiple('SHORT', 1.1000, 1.0970, 1.1020);
    expect(shortR).toBe(1.5);

    // Invalid SL for LONG (SL above entry) returns 0
    expect(calculateRMultiple('LONG', 1.1000, 1.1040, 1.1050)).toBe(0);

    // Missing exitPrice returns 0
    expect(calculateRMultiple('LONG', 1.1000, null, 1.0980)).toBe(0);
  });

  it('handles zero trades gracefully without NaN or Infinity', () => {
    const stats = calculateTradeStatistics([], 10000);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.profitFactor).toBe(0);
    expect(stats.expectancy).toBe(0);
    expect(stats.maxDrawdown).toBe(0);
    expect(Number.isNaN(stats.winRate)).toBe(false);
    expect(Number.isFinite(stats.profitFactor)).toBe(true);
  });

  it('handles zero losses (100% win rate) cleanly without Infinity', () => {
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
        psychology: ['Followed Plan'],
        mistakeTags: [],
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T14:00:00Z',
      },
    ];

    const stats = calculateTradeStatistics(trades, 10000);
    expect(stats.winRate).toBe(100);
    expect(stats.lossRate).toBe(0);
    expect(stats.profitFactor).toBe(500); // gross profit / gross loss (finite clean number)
    expect(Number.isFinite(stats.profitFactor)).toBe(true);
    expect(stats.expectancy).toBe(500);
    expect(stats.consecutiveWins).toBe(1);
    expect(stats.consecutiveLosses).toBe(0);
  });

  it('calculates drawdown peak-to-trough correctly', () => {
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
        stopLoss: 1.0775,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 250,
        netPnL: 1000, // Balance goes to 11,000 (Peak)
        rMultiple: 4.0,
        entryTime: '2026-03-01T10:00:00Z',
        exitTime: '2026-03-01T14:00:00Z',
        fees: 0,
        psychology: [],
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
        entryPrice: 1.2800,
        exitPrice: 1.2850,
        stopLoss: 1.2825,
        lotSize: 1.0,
        riskPercent: 1.0,
        riskAmount: 250,
        netPnL: -500, // Balance drops to 10,500 (Drawdown = 500)
        rMultiple: -1.0,
        entryTime: '2026-03-02T10:00:00Z',
        exitTime: '2026-03-02T14:00:00Z',
        fees: 0,
        psychology: [],
        mistakeTags: [],
        createdAt: '2026-03-02T10:00:00Z',
        updatedAt: '2026-03-02T14:00:00Z',
      },
    ];

    const { maxDrawdown, maxDrawdownPercent } = calculateEquityAndDrawdown(trades, 10000);
    expect(maxDrawdown).toBe(500);
    expect(maxDrawdownPercent).toBeCloseTo(4.55, 1); // 500 / 11,000 = 4.545%
  });
});

describe('Technical Indicators Engine', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  it('calculates SMA accurately', () => {
    const sma5 = calculateSMA(prices, 5);
    expect(sma5[0]).toBeNull();
    expect(sma5[4]).toBe(12); // (10+11+12+13+14)/5 = 12
    expect(sma5[5]).toBe(13);
  });

  it('calculates EMA accurately', () => {
    const ema5 = calculateEMA(prices, 5);
    expect(ema5[0]).toBeNull();
    expect(ema5[4]).toBe(12); // seed SMA
    expect(ema5[5]).toBeGreaterThan(12);
  });

  it('calculates RSI without bounds violation [0, 100]', () => {
    const sampleSeries = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84,
      46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22,
    ];
    const rsi = calculateRSI(sampleSeries, 14);
    const validRsis = rsi.filter((r): r is number => r !== null);
    expect(validRsis.length).toBeGreaterThan(0);
    validRsis.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    });
  });

  it('calculates Bollinger Bands with upper >= middle >= lower', () => {
    const sampleCloses = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const bb = calculateBollingerBands(sampleCloses, 20, 2);

    for (let i = 19; i < sampleCloses.length; i++) {
      expect(bb.upper[i]).toBeGreaterThanOrEqual(bb.middle[i]!);
      expect(bb.middle[i]).toBeGreaterThanOrEqual(bb.lower[i]!);
    }
  });
});

describe('Market Structure Engine', () => {
  it('identifies swing highs and swing lows', () => {
    const candles: MarketCandle[] = [];
    const base = 1.1000;
    // Construct mountain peak at index 5
    for (let i = 0; i < 11; i++) {
      const offset = i <= 5 ? i * 0.0010 : (10 - i) * 0.0010;
      candles.push({
        pair: 'EURUSD',
        timeframe: 'H1',
        timestamp: Date.now() + i * 3600000,
        open: base + offset,
        high: base + offset + 0.0005,
        low: base + offset - 0.0005,
        close: base + offset,
        volume: 1000,
      });
    }

    const swings = detectSwingPoints(candles, 2);
    const peak = swings.swingHighs[0];
    expect(peak).toBeDefined();
    expect(peak?.index).toBe(5);
  });
});

describe('Signal Scoring & Hard Filters Engine', () => {
  it('blocks signal when geometry is invalid', () => {
    const dummyCandles: MarketCandle[] = Array.from({ length: 60 }, (_, i) => ({
      pair: 'EURUSD',
      timeframe: 'H1',
      timestamp: Date.now() - (60 - i) * 3600000,
      open: 1.0850,
      high: 1.0870,
      low: 1.0840,
      close: 1.0860,
      volume: 1000,
    }));

    const result = evaluateSignal({
      userId: 'u1',
      pair: 'EURUSD',
      timeframe: 'H1',
      direction: 'LONG',
      candles: dummyCandles,
      indicator: {
        pair: 'EURUSD',
        timeframe: 'H1',
        timestamp: Date.now(),
        sma20: 1.0850,
        sma50: 1.0840,
        sma200: 1.0800,
        ema20: 1.0855,
        ema50: 1.0845,
        ema200: 1.0810,
        rsi14: 55,
        macd: 0.0005,
        macdSignal: 0.0002,
        macdHistogram: 0.0003,
        atr14: 0.0020,
        bbUpper: 1.0890,
        bbMiddle: 1.0850,
        bbLower: 1.0810,
        adx14: 25,
      },
      structure: {
        trend: 'BULLISH',
        swingHighs: [{ timestamp: 1, price: 1.0870 }],
        swingLows: [{ timestamp: 1, price: 1.0830 }],
        isHigherHigh: true,
        isHigherLow: true,
        isLowerHigh: false,
        isLowerLow: false,
        isBullishBOS: true,
        isBearishBOS: false,
        isPullback: false,
      },
      htfTrend: 'BULLISH',
      entryPrice: 1.0850,
      stopLoss: 1.0900, // Invalid geometry for LONG: SL above Entry
      takeProfit1: 1.0950,
      takeProfit2: 1.1000,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.explanation).toContain('Invalid LONG geometry');
  });

  it('classifies scores deterministically into transparent categories', () => {
    expect(classifyScore(92)).toBe('VERY_STRONG_SETUP');
    expect(classifyScore(85)).toBe('STRONG_SETUP');
    expect(classifyScore(74)).toBe('VALID_SETUP');
    expect(classifyScore(65)).toBe('WATCH');
    expect(classifyScore(48)).toBe('WEAK');
    expect(classifyScore(25)).toBe('NO_SETUP');
  });
});

describe('Risk Management & Position Sizing Engine', () => {
  it('calculates position size for EURUSD Forex correctly', () => {
    const calc = calculatePositionSize({
      accountBalance: 10000,
      riskPercent: 1.0, // $100 risk
      pair: 'EURUSD',
      entryPrice: 1.0850,
      stopLoss: 1.0825, // 25 pips distance
      takeProfit: 1.0900, // 50 pips (1:2 R:R)
    });

    expect(calc.status).toBe('SUCCESS');
    if (calc.status === 'SUCCESS') {
      expect(calc.riskAmount).toBe(100);
      expect(calc.pipsAtRisk).toBe(25.0);
      // Cost per pip for 1 lot EURUSD = $10. 25 pips * $10 = $250. $100 / $250 = 0.40 lots
      expect(calc.lotSize).toBe(0.40);
      expect(calc.potentialLoss).toBe(100);
      expect(calc.riskRewardRatio).toBe(2.0);
    }
  });

  it('validates against max portfolio risk limits', () => {
    const settings: RiskSetting = {
      id: 'r1',
      accountId: 'a1',
      riskPerTradePercent: 1.0,
      maxDailyRiskPercent: 3.0,
      maxPortfolioRiskPercent: 5.0,
      minRiskRewardRatio: 1.5,
      maxOpenPositions: 3,
    };

    const dummyOpenTrades: Trade[] = [
      { id: '1', userId: 'u1', accountId: 'a1', pair: 'EURUSD', direction: 'LONG', status: 'OPEN', timeframe: 'H1', tradingSession: 'London', entryPrice: 1.08, stopLoss: 1.07, lotSize: 1, riskPercent: 1.0, riskAmount: 100, fees: 0, entryTime: '', psychology: [], mistakeTags: [], createdAt: '', updatedAt: '' },
      { id: '2', userId: 'u1', accountId: 'a1', pair: 'GBPUSD', direction: 'SHORT', status: 'OPEN', timeframe: 'H1', tradingSession: 'London', entryPrice: 1.28, stopLoss: 1.29, lotSize: 1, riskPercent: 1.0, riskAmount: 100, fees: 0, entryTime: '', psychology: [], mistakeTags: [], createdAt: '', updatedAt: '' },
      { id: '3', userId: 'u1', accountId: 'a1', pair: 'USDJPY', direction: 'LONG', status: 'OPEN', timeframe: 'H1', tradingSession: 'London', entryPrice: 154, stopLoss: 153, lotSize: 1, riskPercent: 1.0, riskAmount: 100, fees: 0, entryTime: '', psychology: [], mistakeTags: [], createdAt: '', updatedAt: '' },
    ];

    const check = checkPortfolioRisk(10000, dummyOpenTrades, 1.0, settings);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Maximum open position limit reached');
  });
});

describe('Authentication & IDOR Prevention', () => {
  it('hashes and validates passwords using bcrypt', async () => {
    const pass = 'SecureTraderPass2026!';
    const hash = await hashPassword(pass);
    expect(await comparePassword(pass, hash)).toBe(true);
    expect(await comparePassword('WrongPassword', hash)).toBe(false);
  });

  it('prevents IDOR: asserts resource ownership', () => {
    const normalUserId = 'usr_1';
    const otherUserId = 'usr_2';
    const adminUserId = 'usr_admin';

    // Normal user accessing own resource -> Allowed
    expect(() => assertOwnership(normalUserId, normalUserId, 'USER')).not.toThrow();

    // Normal user accessing another user's resource -> Blocked (IDOR prevented)
    expect(() => assertOwnership(normalUserId, otherUserId, 'USER')).toThrow();

    // Admin user accessing any resource -> Allowed
    expect(() => assertOwnership(normalUserId, adminUserId, 'ADMIN')).not.toThrow();
  });
});
