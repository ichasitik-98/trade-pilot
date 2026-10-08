/**
 * Advanced Market Chart Type Engine - Type Definitions
 * TradePilot Decision-Support Platform
 */

export type SupportedChartType = 'CANDLESTICK' | 'OHLC' | 'LINE' | 'AREA' | 'HEIKIN_ASHI';

// Prepared for future extension types as specified in architecture requirements
export type ExtendedChartType = 'HOLLOW_CANDLE' | 'BASELINE' | 'RENKO' | 'POINT_AND_FIGURE';

export type ChartType = SupportedChartType | ExtendedChartType;

export interface ChartVisualCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isBullish: boolean;
  color: string;
  // Raw canonical market data preserved immutably
  rawOpen: number;
  rawHigh: number;
  rawLow: number;
  rawClose: number;
  rawVolume: number;
  // Dynamic technical indicator series calculated from raw OHLC data
  ema20?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  bbUpper?: number | null;
  bbMiddle?: number | null;
  bbLower?: number | null;
  rsi14?: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  macdHistogram?: number | null;
  atr14?: number | null;
  adx14?: number | null;
  plusDI?: number | null;
  minusDI?: number | null;
}

export interface ChartSignalOverlay {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  riskReward?: number;
  riskReward2?: number;
  score?: number;
  status?: string;
}

export interface IndicatorVisibility {
  ema20: boolean;
  ema50: boolean;
  ema200: boolean;
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
  bollingerBands: boolean;
  support: boolean;
  resistance: boolean;
  signalOverlay?: boolean;
}

export interface IndicatorPanelsVisibility {
  rsi: boolean;
  macd: boolean;
  adx: boolean;
  volume: boolean;
}

export interface ChartPreferences {
  chartType: SupportedChartType;
  timeframe: string;
  visibleIndicators: IndicatorVisibility;
  visiblePanels: IndicatorPanelsVisibility;
  showCrosshair: boolean;
  zoomCount: number;
}
