/**
 * ChartToolbar: Professional Trading Terminal Toolbar
 * Provides chart type selection, timeframe selection, indicator overlays, sub-panels, and zoom controls.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  CandlestickChart,
  BarChart2,
  TrendingUp,
  Sliders,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  ChevronDown,
  Layers,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { SupportedChartType, IndicatorVisibility, IndicatorPanelsVisibility } from './types.ts';

interface ChartToolbarProps {
  chartType: SupportedChartType;
  onChartTypeChange: (type: SupportedChartType) => void;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  visibleIndicators: IndicatorVisibility;
  onToggleIndicator: (key: keyof IndicatorVisibility) => void;
  visiblePanels: IndicatorPanelsVisibility;
  onTogglePanel: (key: keyof IndicatorPanelsVisibility) => void;
  showCrosshair: boolean;
  onToggleCrosshair: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

const CHART_TYPES: Array<{
  id: SupportedChartType;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
  description: string;
}> = [
  { id: 'CANDLESTICK', label: 'Candlestick', shortLabel: 'Candles', icon: CandlestickChart, description: 'Standard high-precision Japanese candlesticks' },
  { id: 'OHLC', label: 'OHLC Bar', shortLabel: 'OHLC', icon: BarChart2, description: 'Open-High-Low-Close Western price bars' },
  { id: 'LINE', label: 'Line', shortLabel: 'Line', icon: TrendingUp, description: 'Continuous close price trajectory' },
  { id: 'AREA', label: 'Area', shortLabel: 'Area', icon: TrendingUp, description: 'Gradient area filled close price trajectory' },
  { id: 'HEIKIN_ASHI', label: 'Heikin Ashi', shortLabel: 'Heikin Ashi', icon: Sparkles, description: 'Filtered average trend calculation (Visualization only)' },
];

export const ChartToolbar: React.FC<ChartToolbarProps> = ({
  chartType,
  onChartTypeChange,
  timeframe,
  onTimeframeChange,
  visibleIndicators,
  onToggleIndicator,
  visiblePanels,
  onTogglePanel,
  showCrosshair,
  onToggleCrosshair,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isRefreshing,
  onRefresh,
}) => {
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [mobileChartMenuOpen, setMobileChartMenuOpen] = useState(false);

  const indicatorsRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const chartMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (indicatorsRef.current && !indicatorsRef.current.contains(event.target as Node)) {
        setIndicatorsOpen(false);
      }
      if (panelsRef.current && !panelsRef.current.contains(event.target as Node)) {
        setPanelsOpen(false);
      }
      if (chartMenuRef.current && !chartMenuRef.current.contains(event.target as Node)) {
        setMobileChartMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 sm:p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs font-mono">
      {/* Left section: Chart Type Selectors */}
      <div className="flex items-center gap-1.5">
        {/* Desktop Segmented Control */}
        <div className="hidden lg:flex items-center p-0.5 bg-zinc-950 rounded-lg border border-zinc-800/80">
          {CHART_TYPES.map((ct) => {
            const Icon = ct.icon;
            const isActive = chartType === ct.id;
            return (
              <button
                key={ct.id}
                onClick={() => onChartTypeChange(ct.id)}
                title={ct.description}
                aria-label={`${ct.label} chart`}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  isActive
                    ? 'bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700/60'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{ct.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile / Tablet Compact Dropdown */}
        <div className="relative lg:hidden" ref={chartMenuRef}>
          <button
            onClick={() => setMobileChartMenuOpen(!mobileChartMenuOpen)}
            aria-label="Select chart type"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-emerald-400 font-bold text-xs cursor-pointer"
          >
            <span>{CHART_TYPES.find((c) => c.id === chartType)?.shortLabel || 'Chart'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {mobileChartMenuOpen && (
            <div className="absolute left-0 mt-1.5 w-44 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-1.5 z-50 space-y-1">
              {CHART_TYPES.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => {
                    onChartTypeChange(ct.id);
                    setMobileChartMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition ${
                    chartType === ct.id
                      ? 'bg-zinc-800 text-emerald-400 font-bold'
                      : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <span>{ct.label}</span>
                  {chartType === ct.id && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />

        {/* Timeframe Selector (Horizontally scrollable on small screens) */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar p-0.5 bg-zinc-950 rounded-lg border border-zinc-800/80">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              aria-label={`Timeframe ${tf}`}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                timeframe === tf
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Right section: Indicators, Panels, Crosshair, and Zoom */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Indicators Overlay Dropdown */}
        <div className="relative" ref={indicatorsRef}>
          <button
            onClick={() => setIndicatorsOpen(!indicatorsOpen)}
            aria-label="Toggle technical indicator overlays"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-950 border text-xs cursor-pointer transition ${
              indicatorsOpen || Object.values(visibleIndicators).some(Boolean)
                ? 'border-emerald-500/40 text-emerald-400'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Indicators</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>

          {indicatorsOpen && (
            <div className="absolute right-0 sm:left-0 mt-1.5 w-60 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-3 z-50 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                <span>Overlay Indicators</span>
                <span className="text-[10px] text-zinc-500 font-normal">Raw OHLC basis</span>
              </div>

              <div className="space-y-1.5">
                {[
                  { key: 'ema20', label: 'EMA (20)', color: 'text-cyan-400' },
                  { key: 'ema50', label: 'EMA (50)', color: 'text-amber-400' },
                  { key: 'ema200', label: 'EMA (200)', color: 'text-purple-400' },
                  { key: 'sma20', label: 'SMA (20)', color: 'text-blue-400' },
                  { key: 'sma50', label: 'SMA (50)', color: 'text-indigo-400' },
                  { key: 'sma200', label: 'SMA (200)', color: 'text-violet-400' },
                  { key: 'bollingerBands', label: 'Bollinger Bands (20, 2)', color: 'text-sky-300' },
                  { key: 'support', label: 'Technical Support Level', color: 'text-emerald-400' },
                  { key: 'resistance', label: 'Technical Resistance Level', color: 'text-rose-400' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between p-1 rounded-md hover:bg-zinc-800/60 cursor-pointer"
                  >
                    <span className={item.color}>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={visibleIndicators[item.key as keyof IndicatorVisibility]}
                      onChange={() => onToggleIndicator(item.key as keyof IndicatorVisibility)}
                      className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sub-Panels Toggle Dropdown */}
        <div className="relative" ref={panelsRef}>
          <button
            onClick={() => setPanelsOpen(!panelsOpen)}
            aria-label="Toggle oscillator and volume panels"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-950 border text-xs cursor-pointer transition ${
              panelsOpen || Object.values(visiblePanels).some(Boolean)
                ? 'border-purple-500/40 text-purple-400'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Panels</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>

          {panelsOpen && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-3 z-50 space-y-2 text-xs">
              <div className="pb-1.5 border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Oscillator Panels
              </div>

              <div className="space-y-1.5">
                {[
                  { key: 'rsi', label: 'RSI Oscillator (14)' },
                  { key: 'macd', label: 'MACD (12, 26, 9)' },
                  { key: 'adx', label: 'ADX Trend Strength' },
                  { key: 'volume', label: 'Volume Histogram' },
                ].map((panel) => (
                  <label
                    key={panel.key}
                    className="flex items-center justify-between p-1 rounded-md hover:bg-zinc-800/60 cursor-pointer"
                  >
                    <span className="text-zinc-300">{panel.label}</span>
                    <input
                      type="checkbox"
                      checked={visiblePanels[panel.key as keyof IndicatorPanelsVisibility]}
                      onChange={() => onTogglePanel(panel.key as keyof IndicatorPanelsVisibility)}
                      className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Crosshair Button */}
        <button
          onClick={onToggleCrosshair}
          title="Toggle Crosshair"
          aria-label="Toggle crosshair cursor"
          className={`p-1.5 rounded-lg bg-zinc-950 border transition cursor-pointer ${
            showCrosshair
              ? 'border-emerald-500/40 text-emerald-400'
              : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800/80">
          <button
            onClick={onZoomIn}
            title="Zoom In"
            aria-label="Zoom in on chart"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onZoomOut}
            title="Zoom Out"
            aria-label="Zoom out on chart"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetZoom}
            title="Reset Zoom / Fit Content"
            aria-label="Reset zoom and fit content"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Direct Chart Refresh Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh latest real market candles"
            aria-label="Refresh chart market data"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 transition cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline text-[11px]">{isRefreshing ? 'Syncing' : 'Refresh'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
