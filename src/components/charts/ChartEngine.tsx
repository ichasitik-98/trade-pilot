/**
 * ChartEngine: Master Chart Visualization Orchestrator
 * Integrates Toolbar, Interactive Multi-Type Renderer, and Sub-Indicator Panels.
 * 
 * CORE PRINCIPLE:
 * RAW MARKET DATA = SOURCE OF TRUTH
 * CHART TYPE = VISUALIZATION ONLY
 */

import React, { useState, useEffect, useMemo } from 'react';
import { SupportedChartType, IndicatorVisibility, IndicatorPanelsVisibility } from './types.ts';
import { adaptCandlesForChart } from './adapter.ts';
import { loadChartPreferences, saveChartPreferences } from './preferences.ts';
import { ChartToolbar } from './ChartToolbar.tsx';
import { ChartRenderer } from './ChartRenderer.tsx';
import { RsiPanel, MacdPanel, AdxPanel, VolumePanel } from './IndicatorPanels.tsx';

interface ChartEngineProps {
  candles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  symbol: string;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  dataStatus?: string;
  dataQuality?: number;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export const ChartEngine: React.FC<ChartEngineProps> = ({
  candles,
  symbol,
  timeframe,
  onTimeframeChange,
  supportLevel,
  resistanceLevel,
  dataStatus,
  isRefreshing,
  onRefresh,
}) => {
  // Load persisted preferences from localStorage
  const [preferences, setPreferences] = useState(() => loadChartPreferences());

  const [chartType, setChartType] = useState<SupportedChartType>(preferences.chartType);
  const [visibleIndicators, setVisibleIndicators] = useState<IndicatorVisibility>(
    preferences.visibleIndicators
  );
  const [visiblePanels, setVisiblePanels] = useState<IndicatorPanelsVisibility>(
    preferences.visiblePanels
  );
  const [showCrosshair, setShowCrosshair] = useState<boolean>(preferences.showCrosshair);
  const [zoomCount, setZoomCount] = useState<number>(preferences.zoomCount || 50);

  // Synchronize preferences to localStorage when user makes changes
  useEffect(() => {
    saveChartPreferences({
      chartType,
      timeframe,
      visibleIndicators,
      visiblePanels,
      showCrosshair,
      zoomCount,
    });
  }, [chartType, timeframe, visibleIndicators, visiblePanels, showCrosshair, zoomCount]);

  // Adapt raw candles according to chosen chart type
  // Note: All technical indicator math is executed strictly against the RAW OHLC data
  const adaptedCandles = useMemo(() => {
    return adaptCandlesForChart(candles, chartType);
  }, [candles, chartType]);

  // Zoom slicing: View the most recent N candles
  const visibleCandles = useMemo(() => {
    if (adaptedCandles.length <= zoomCount) {
      return adaptedCandles;
    }
    return adaptedCandles.slice(adaptedCandles.length - zoomCount);
  }, [adaptedCandles, zoomCount]);

  const handleToggleIndicator = (key: keyof IndicatorVisibility) => {
    setVisibleIndicators((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleTogglePanel = (key: keyof IndicatorPanelsVisibility) => {
    setVisiblePanels((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleZoomIn = () => {
    setZoomCount((prev) => Math.max(15, prev - 15));
  };

  const handleZoomOut = () => {
    setZoomCount((prev) => Math.min(200, prev + 20));
  };

  const handleResetZoom = () => {
    setZoomCount(Math.min(60, adaptedCandles.length || 60));
  };

  return (
    <div className="space-y-3">
      {/* Chart Toolbar */}
      <ChartToolbar
        chartType={chartType}
        onChartTypeChange={setChartType}
        timeframe={timeframe}
        onTimeframeChange={onTimeframeChange}
        visibleIndicators={visibleIndicators}
        onToggleIndicator={handleToggleIndicator}
        visiblePanels={visiblePanels}
        onTogglePanel={handleTogglePanel}
        showCrosshair={showCrosshair}
        onToggleCrosshair={() => setShowCrosshair((prev) => !prev)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
      />

      {/* Main Interactive Chart Box */}
      <div className="p-3 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 pb-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-200">
              {symbol} &bull; {timeframe} &bull; {chartType}
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              ({visibleCandles.length} of {adaptedCandles.length} candles)
            </span>
            {visibleCandles.length > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  dataStatus === 'STALE'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}
              >
                {isRefreshing
                  ? 'UPDATING FEED...'
                  : dataStatus === 'STALE'
                  ? 'REAL DATA • STALE'
                  : 'REAL DATA • CURRENT'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono">
            {visibleIndicators.support && supportLevel && (
              <span className="text-emerald-400 font-bold">
                Support: ${supportLevel.toFixed(symbol.includes('JPY') || symbol === 'XAUUSD' ? 2 : 4)}
              </span>
            )}
            {visibleIndicators.resistance && resistanceLevel && (
              <span className="text-rose-400 font-bold">
                Resistance: ${resistanceLevel.toFixed(symbol.includes('JPY') || symbol === 'XAUUSD' ? 2 : 4)}
              </span>
            )}
          </div>
        </div>

        {/* Primary Chart Renderer */}
        <ChartRenderer
          candles={visibleCandles}
          chartType={chartType}
          visibleIndicators={visibleIndicators}
          supportLevel={visibleIndicators.support ? supportLevel : null}
          resistanceLevel={visibleIndicators.resistance ? resistanceLevel : null}
          showCrosshair={showCrosshair}
          symbol={symbol}
          timeframe={timeframe}
          isRefreshing={isRefreshing}
        />
      </div>

      {/* Optional Sub-Indicator Panels */}
      {visiblePanels.rsi && <RsiPanel candles={visibleCandles} />}
      {visiblePanels.macd && <MacdPanel candles={visibleCandles} />}
      {visiblePanels.adx && <AdxPanel candles={visibleCandles} />}
      {visiblePanels.volume && <VolumePanel candles={visibleCandles} />}
    </div>
  );
};
