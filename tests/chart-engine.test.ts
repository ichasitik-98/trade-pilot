import { describe, it, expect } from 'vitest';
import {
  validateChartType,
  transformToHeikinAshi,
  adaptCandlesForChart,
} from '../src/components/charts/adapter.ts';
import { SupportedChartType } from '../src/components/charts/types.ts';
import { IndicatorEngine } from '../server/engines/indicators/index.ts';
import { analyzeMarketStructure } from '../server/engines/market-structure.ts';
import { calculateSupportResistance } from '../server/engines/support-resistance.ts';
import { evaluateSignal } from '../server/engines/signal-scoring.ts';
import { Candle } from '../server/types/index.ts';

describe('Advanced Market Chart Type Engine Tests', () => {
  describe('ChartType validation & fallbacks', () => {
    it('validates supported chart types correctly', () => {
      const validTypes: SupportedChartType[] = [
        'CANDLESTICK',
        'OHLC',
        'LINE',
        'AREA',
        'HEIKIN_ASHI',
      ];

      validTypes.forEach((t) => {
        expect(validateChartType(t)).toBe(t);
      });
    });

    it('falls back to CANDLESTICK for invalid, null, or undefined chart types', () => {
      expect(validateChartType('UNKNOWN_TYPE')).toBe('CANDLESTICK');
      expect(validateChartType('')).toBe('CANDLESTICK');
      expect(validateChartType(null)).toBe('CANDLESTICK');
      expect(validateChartType(undefined)).toBe('CANDLESTICK');
    });
  });

  describe('Heikin Ashi Mathematical Transformation', () => {
    it('calculates deterministic Heikin Ashi values accurately according to standard formulas', () => {
      // Deterministic synthetic candle sequence
      const testCandles = [
        { timestamp: 1000, open: 10.0, high: 12.0, low: 9.0, close: 11.0, volume: 100 },
        { timestamp: 2000, open: 11.0, high: 13.0, low: 10.0, close: 12.0, volume: 150 },
        { timestamp: 3000, open: 12.0, high: 14.0, low: 11.0, close: 13.0, volume: 200 },
      ];

      const ha = transformToHeikinAshi(testCandles);
      expect(ha.length).toBe(3);

      // Candle 0:
      // HA Close = (10 + 12 + 9 + 11) / 4 = 10.5
      // HA Open = (10 + 11) / 2 = 10.5
      // HA High = max(12, 10.5, 10.5) = 12.0
      // HA Low = min(9, 10.5, 10.5) = 9.0
      expect(ha[0].close).toBe(10.5);
      expect(ha[0].open).toBe(10.5);
      expect(ha[0].high).toBe(12.0);
      expect(ha[0].low).toBe(9.0);
      expect(ha[0].isBullish).toBe(true);

      // Raw canonical values must be immutably preserved
      expect(ha[0].rawOpen).toBe(10.0);
      expect(ha[0].rawHigh).toBe(12.0);
      expect(ha[0].rawLow).toBe(9.0);
      expect(ha[0].rawClose).toBe(11.0);
      expect(ha[0].rawVolume).toBe(100);

      // Candle 1:
      // HA Close = (11 + 13 + 10 + 12) / 4 = 11.5
      // HA Open = (prev HA Open + prev HA Close) / 2 = (10.5 + 10.5) / 2 = 10.5
      // HA High = max(13, 10.5, 11.5) = 13.0
      // HA Low = min(10, 10.5, 11.5) = 10.0
      expect(ha[1].close).toBe(11.5);
      expect(ha[1].open).toBe(10.5);
      expect(ha[1].high).toBe(13.0);
      expect(ha[1].low).toBe(10.0);

      // Candle 2:
      // HA Close = (12 + 14 + 11 + 13) / 4 = 12.5
      // HA Open = (prev HA Open [10.5] + prev HA Close [11.5]) / 2 = 11.0
      // HA High = max(14, 11.0, 12.5) = 14.0
      // HA Low = min(11, 11.0, 12.5) = 11.0
      expect(ha[2].close).toBe(12.5);
      expect(ha[2].open).toBe(11.0);
      expect(ha[2].high).toBe(14.0);
      expect(ha[2].low).toBe(11.0);
    });

    it('handles empty and boundary candle datasets cleanly', () => {
      expect(transformToHeikinAshi([])).toEqual([]);
      expect(adaptCandlesForChart([], 'CANDLESTICK')).toEqual([]);
      expect(adaptCandlesForChart([], 'HEIKIN_ASHI')).toEqual([]);
    });

    it('preserves volume without fabrication when unavailable', () => {
      const zeroVolCandles = [
        { timestamp: 1000, open: 1.08, high: 1.09, low: 1.07, close: 1.085, volume: 0 },
      ];
      const adapted = adaptCandlesForChart(zeroVolCandles, 'CANDLESTICK');
      expect(adapted[0].volume).toBe(0);
      expect(adapted[0].rawVolume).toBe(0);
    });
  });

  describe('CRITICAL INVARIANCE: Raw Market Data as Source of Truth', () => {
    // Generate a sequence of 60 canonical raw market candles
    const generateRawCandles = (): Candle[] => {
      const candles: Candle[] = [];
      let price = 1.0800;
      const baseTime = 1700000000000;

      for (let i = 0; i < 60; i++) {
        const change = (Math.sin(i / 5) * 0.0015) + ((i % 2 === 0 ? 0.0005 : -0.0003));
        const open = price;
        const close = open + change;
        const high = Math.max(open, close) + 0.0008;
        const low = Math.min(open, close) - 0.0008;
        const volume = 1000 + Math.floor(Math.sin(i) * 300);

        candles.push({
          symbol: 'EURUSD',
          timeframe: 'H1',
          timestamp: baseTime + i * 3600000,
          open,
          high,
          low,
          close,
          volume,
          source: 'TEST_PROVIDER',
        });
        price = close;
      }
      return candles;
    };

    it('proves that switching between Candlestick, OHLC, Line, Area, and Heikin Ashi has ZERO effect on indicators, market structure, support/resistance, and signal scoring', () => {
      const rawCandles = generateRawCandles();

      const latestCandle = rawCandles[rawCandles.length - 1];
      const currentPrice = latestCandle.close;

      // 1. Compute canonical baseline analytics directly from raw OHLC data
      const baselineIndicator = IndicatorEngine.computeLatestSnapshot(rawCandles, 'EURUSD', 'H1');
      const baselineStructure = analyzeMarketStructure(rawCandles as any, 3);
      const baselineSR = calculateSupportResistance(rawCandles as any, currentPrice);

      const sl = currentPrice - (baselineIndicator.atr14 || 0.003) * 1.5;
      const tp = currentPrice + (baselineIndicator.atr14 || 0.003) * 3.0;

      const baselineSignal = evaluateSignal({
        userId: 'test-user',
        pair: 'EURUSD',
        timeframe: 'H1',
        direction: 'LONG',
        candles: rawCandles as any,
        indicator: baselineIndicator,
        structure: baselineStructure,
        entryPrice: currentPrice,
        stopLoss: sl,
        takeProfit1: tp,
        takeProfit2: tp + 0.002,
        dataStatus: 'LIVE',
        dataQuality: 100,
      });

      // 2. Iterate through all chart visualization types
      const chartTypes: SupportedChartType[] = [
        'CANDLESTICK',
        'OHLC',
        'LINE',
        'AREA',
        'HEIKIN_ASHI',
      ];

      for (const ct of chartTypes) {
        // Adapt candles for the current visual chart type
        const visualCandles = adaptCandlesForChart(rawCandles, ct);
        expect(visualCandles.length).toBe(rawCandles.length);

        // Verification A: Analytical inputs MUST be computed using the RAW OHLC data
        // Extract raw candles from the visual wrapper to simulate feed extraction
        const extractedRawCandles: Candle[] = visualCandles.map((vc) => ({
          symbol: 'EURUSD',
          timeframe: 'H1',
          timestamp: vc.timestamp,
          open: vc.rawOpen,
          high: vc.rawHigh,
          low: vc.rawLow,
          close: vc.rawClose,
          volume: vc.rawVolume,
          source: 'TEST_PROVIDER',
        }));

        // Recompute indicator snapshot from canonical raw data
        const currentIndicator = IndicatorEngine.computeLatestSnapshot(extractedRawCandles, 'EURUSD', 'H1');
        const currentStructure = analyzeMarketStructure(extractedRawCandles as any, 3);
        const currentSR = calculateSupportResistance(extractedRawCandles as any, currentPrice);

        // Indicator Invariance: Every technical indicator must match baseline exactly
        expect(currentIndicator.rsi14).toBe(baselineIndicator.rsi14);
        expect(currentIndicator.macd).toBe(baselineIndicator.macd);
        expect(currentIndicator.macdSignal).toBe(baselineIndicator.macdSignal);
        expect(currentIndicator.macdHistogram).toBe(baselineIndicator.macdHistogram);
        expect(currentIndicator.atr14).toBe(baselineIndicator.atr14);
        expect(currentIndicator.ema20).toBe(baselineIndicator.ema20);
        expect(currentIndicator.ema50).toBe(baselineIndicator.ema50);
        expect(currentIndicator.sma20).toBe(baselineIndicator.sma20);
        expect(currentIndicator.sma50).toBe(baselineIndicator.sma50);
        expect(currentIndicator.bbUpper).toBe(baselineIndicator.bbUpper);
        expect(currentIndicator.bbLower).toBe(baselineIndicator.bbLower);

        // Market Structure Invariance
        expect(currentStructure.trend).toBe(baselineStructure.trend);
        expect(currentStructure.isHigherHigh).toBe(baselineStructure.isHigherHigh);
        expect(currentStructure.isHigherLow).toBe(baselineStructure.isHigherLow);
        expect(currentStructure.swingHighs.length).toBe(baselineStructure.swingHighs.length);
        expect(currentStructure.swingLows.length).toBe(baselineStructure.swingLows.length);

        // Support & Resistance Invariance
        expect(currentSR.nearestSupport?.price).toBe(baselineSR.nearestSupport?.price);
        expect(currentSR.nearestResistance?.price).toBe(baselineSR.nearestResistance?.price);

        // Signal Engine Invariance
        const currentSignal = evaluateSignal({
          userId: 'test-user',
          pair: 'EURUSD',
          timeframe: 'H1',
          direction: 'LONG',
          candles: extractedRawCandles as any,
          indicator: currentIndicator,
          structure: currentStructure,
          entryPrice: currentPrice,
          stopLoss: sl,
          takeProfit1: tp,
          takeProfit2: tp + 0.002,
          dataStatus: 'LIVE',
          dataQuality: 100,
        });

        expect(currentSignal.score).toBe(baselineSignal.score);
        expect(currentSignal.status).toBe(baselineSignal.status);
        expect(currentSignal.trendScore).toBe(baselineSignal.trendScore);
        expect(currentSignal.structureScore).toBe(baselineSignal.structureScore);
        expect(currentSignal.momentumScore).toBe(baselineSignal.momentumScore);
        expect(currentSignal.riskReward).toBe(baselineSignal.riskReward);

        // Verification B: Only visual coordinates are allowed to differ for Heikin Ashi
        if (ct === 'HEIKIN_ASHI') {
          // Heikin Ashi visual coordinates should differ from raw open/close where smoothed
          expect(visualCandles[1].open).not.toBe(visualCandles[1].rawOpen);
        } else {
          // Candlestick, OHLC, Line, Area visual coordinates equal raw prices
          expect(visualCandles[1].open).toBe(visualCandles[1].rawOpen);
          expect(visualCandles[1].close).toBe(visualCandles[1].rawClose);
        }
      }
    });
  });
});
