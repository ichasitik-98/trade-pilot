/**
 * Chart Preferences Management
 * Persists visualization preferences (chart type, timeframe, indicators, panels) in localStorage.
 * 
 * IMPORTANT:
 * Only UI preferences are stored here. NEVER store market candles, trades, account details,
 * or trading signals in localStorage.
 */

import { ChartPreferences, SupportedChartType } from './types.ts';
import { validateChartType } from './adapter.ts';

const STORAGE_KEY = 'tradepilot_chart_preferences_v1';

export const DEFAULT_PREFERENCES: ChartPreferences = {
  chartType: 'CANDLESTICK',
  timeframe: 'H1',
  visibleIndicators: {
    ema20: true,
    ema50: true,
    ema200: false,
    sma20: false,
    sma50: false,
    sma200: false,
    bollingerBands: false,
    support: true,
    resistance: true,
    signalOverlay: true,
  },
  visiblePanels: {
    rsi: true,
    macd: true,
    adx: false,
    volume: true,
  },
  showCrosshair: true,
  zoomCount: 50,
};

export function loadChartPreferences(): ChartPreferences {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_PREFERENCES;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw);
    return {
      chartType: validateChartType(parsed.chartType),
      timeframe: typeof parsed.timeframe === 'string' ? parsed.timeframe : DEFAULT_PREFERENCES.timeframe,
      visibleIndicators: {
        ...DEFAULT_PREFERENCES.visibleIndicators,
        ...(parsed.visibleIndicators || {}),
      },
      visiblePanels: {
        ...DEFAULT_PREFERENCES.visiblePanels,
        ...(parsed.visiblePanels || {}),
      },
      showCrosshair:
        typeof parsed.showCrosshair === 'boolean'
          ? parsed.showCrosshair
          : DEFAULT_PREFERENCES.showCrosshair,
      zoomCount:
        typeof parsed.zoomCount === 'number' && parsed.zoomCount >= 10 && parsed.zoomCount <= 300
          ? parsed.zoomCount
          : DEFAULT_PREFERENCES.zoomCount,
    };
  } catch (err) {
    console.warn('[ChartPreferences] Failed loading preferences, falling back to defaults:', err);
    return DEFAULT_PREFERENCES;
  }
}

export function saveChartPreferences(prefs: Partial<ChartPreferences>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const current = loadChartPreferences();
    const updated: ChartPreferences = {
      ...current,
      ...prefs,
      chartType: prefs.chartType ? validateChartType(prefs.chartType) : current.chartType,
      visibleIndicators: {
        ...current.visibleIndicators,
        ...(prefs.visibleIndicators || {}),
      },
      visiblePanels: {
        ...current.visiblePanels,
        ...(prefs.visiblePanels || {}),
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[ChartPreferences] Failed saving preferences:', err);
  }
}
