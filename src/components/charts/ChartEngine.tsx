/**
 * ChartEngine: Master Chart Visualization Orchestrator (MetaTrader 5 / TradingView Style)
 * Integrates Toolbar, Interactive Multi-Type Pan/Zoom Renderer, Full Chart Terminal Mode,
 * Overview Range Scrubber, and Synchronized Sub-Indicator Panels.
 *
 * CORE PRINCIPLE:
 * RAW MARKET DATA = SOURCE OF TRUTH
 * CHART TYPE = VISUALIZATION ONLY
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Expand, Minimize2, ShieldCheck, AlertTriangle, Layers } from 'lucide-react';
import {
  SupportedChartType,
  IndicatorVisibility,
  IndicatorPanelsVisibility,
  ChartSignalOverlay,
} from './types.ts';
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
  onSymbolChange?: (symbol: string) => void;
  availableSymbols?: string[];
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  signalOverlay?: ChartSignalOverlay | null;
  dataStatus?: string;
  dataQuality?: number;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  isFullscreen?: boolean;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export const ChartEngine: React.FC<ChartEngineProps> = ({
  candles,
  symbol,
  onSymbolChange,
  availableSymbols,
  timeframe,
  onTimeframeChange,
  supportLevel,
  resistanceLevel,
  signalOverlay,
  dataStatus,
  isRefreshing,
  onRefresh,
  isFullscreen: controlledFullscreen,
  onFullscreenChange,
}) => {
  // Load persisted preferences from localStorage
  const [preferences] = useState(() => loadChartPreferences());

  const [chartType, setChartType] = useState<SupportedChartType>(preferences.chartType);
  const [visibleIndicators, setVisibleIndicators] = useState<IndicatorVisibility>(
    preferences.visibleIndicators
  );
  const [visiblePanels, setVisiblePanels] = useState<IndicatorPanelsVisibility>(
    preferences.visiblePanels
  );
  const [showCrosshair, setShowCrosshair] = useState<boolean>(preferences.showCrosshair);
  const [zoomCount, setZoomCount] = useState<number>(preferences.zoomCount || 55);

  // Full Chart Mode state (supports both controlled and internal state)
  const [internalFullscreen, setInternalFullscreen] = useState<boolean>(false);
  const isFullscreen = controlledFullscreen !== undefined ? controlledFullscreen : internalFullscreen;

  const setFullscreen = useCallback(
    (nextVal: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof nextVal === 'function' ? nextVal(isFullscreen) : nextVal;
      setInternalFullscreen(resolved);
      onFullscreenChange?.(resolved);
    },
    [isFullscreen, onFullscreenChange]
  );

  const handleToggleFullscreen = useCallback(() => {
    setFullscreen((prev) => !prev);
  }, [setFullscreen]);

  // In Full Chart mode, allow collapsing oscillator sub-panels so main chart gets 100% height
  const [showSubPanelsInFullscreen, setShowSubPanelsInFullscreen] = useState<boolean>(false);

  // Horizontal pan state (0 = latest candle at right edge; >0 = panned back in history; <0 = extra future space)
  const [panOffset, setPanOffset] = useState<number>(0);
  // MT5 Chart Shift (reserves future projection space on the right of the latest candle)
  const [chartShift, setChartShift] = useState<boolean>(true);

  const scrubberRef = useRef<HTMLDivElement>(null);
  const [scrubberDragging, setScrubberDragging] = useState(false);

  // Reset panOffset to latest candle when switching pair or timeframe
  useEffect(() => {
    setPanOffset(0);
  }, [symbol, timeframe]);

  // Lock website body scroll & overscroll when Full Chart Mode is active
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overscrollBehavior = prevOverscroll;
    };
  }, [isFullscreen]);

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
  const adaptedCandles = useMemo(() => {
    return adaptCandlesForChart(candles, chartType);
  }, [candles, chartType]);

  const maxHistoryPan = Math.max(25, adaptedCandles.length - 5 + Math.floor(zoomCount * 0.4));
  const minFuturePan = -Math.floor(zoomCount * 0.65);

  const clampPan = useCallback(
    (val: number) => {
      return Math.max(minFuturePan, Math.min(maxHistoryPan, Math.round(val)));
    },
    [minFuturePan, maxHistoryPan]
  );

  // Compute visible slice [startIdx, endIdx) and exact slot offsets (MT5 / TradingView 1:1 bar slot system)
  const { visibleCandles, startIdx, endIdx, leftSlotOffset, rightMarginBars, totalSlots } = useMemo(() => {
    const total = adaptedCandles.length;
    const slots = Math.max(12, zoomCount);
    if (total === 0) {
      return {
        visibleCandles: [],
        startIdx: 0,
        endIdx: 0,
        leftSlotOffset: 0,
        rightMarginBars: 0,
        totalSlots: slots,
      };
    }

    const baseShiftBars = chartShift ? Math.max(5, Math.min(16, Math.round(slots * 0.16))) : 0;
    // The candle index corresponding to the rightmost slot (slots - 1) of the viewport
    const viewportEndCandleIdx = total - 1 + baseShiftBars - Math.round(panOffset);
    // The candle index corresponding to the leftmost slot (0) of the viewport
    const viewportStartCandleIdx = viewportEndCandleIdx - slots + 1;

    const sliceStart = Math.max(0, Math.min(total, viewportStartCandleIdx));
    const sliceEnd = Math.max(0, Math.min(total, viewportEndCandleIdx + 1));

    // Where visibleCandles[0] sits on the [0 .. slots - 1] screen grid
    const computedLeftOffset = Math.max(0, sliceStart - viewportStartCandleIdx);
    // How many empty future slots exist to the right of the latest candle (total - 1)
    const computedRightMargin = Math.max(0, viewportEndCandleIdx - (total - 1));

    return {
      visibleCandles: adaptedCandles.slice(sliceStart, sliceEnd),
      startIdx: sliceStart,
      endIdx: sliceEnd,
      leftSlotOffset: computedLeftOffset,
      rightMarginBars: computedRightMargin,
      totalSlots: slots,
    };
  }, [adaptedCandles, zoomCount, panOffset, chartShift]);

  const handlePanByBars = useCallback(
    (deltaBars: number) => {
      setPanOffset((prev) => clampPan(prev + deltaBars));
    },
    [clampPan]
  );

  const handleZoomByDelta = useCallback(
    (deltaStep: number, anchorRatio: number = 0.75) => {
      setZoomCount((prevZoom) => {
        const stepSize = Math.max(4, Math.round(prevZoom * 0.14));
        const nextZoom = Math.max(
          16,
          Math.min(Math.max(220, adaptedCandles.length + 30), prevZoom + deltaStep * stepSize)
        );
        const zoomDiff = nextZoom - prevZoom;
        if (zoomDiff !== 0 && panOffset > 0) {
          // Keep the candle under the mouse cursor anchored while zooming
          const panAdjustment = Math.round(zoomDiff * (1 - anchorRatio));
          setPanOffset((p) => clampPan(p - panAdjustment));
        }
        return nextZoom;
      });
    },
    [adaptedCandles.length, panOffset, clampPan]
  );

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

  const handleZoomIn = useCallback(() => handleZoomByDelta(-1, 0.8), [handleZoomByDelta]);
  const handleZoomOut = useCallback(() => handleZoomByDelta(1, 0.8), [handleZoomByDelta]);

  const handleResetZoom = useCallback(() => {
    setZoomCount(Math.min(60, Math.max(35, adaptedCandles.length || 55)));
    setPanOffset(0);
  }, [adaptedCandles.length]);

  const handleJumpToLatest = useCallback(() => {
    setPanOffset(0);
  }, []);

  // Global keyboard shortcuts when in Full Chart Mode (ESC to exit, Arrows to pan, +/- to zoom)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        setFullscreen(false);
      } else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (isFullscreen) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePanByBars(6);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handlePanByBars(-6);
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === 'End') {
          e.preventDefault();
          handleJumpToLatest();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    isFullscreen,
    setFullscreen,
    handleToggleFullscreen,
    handlePanByBars,
    handleZoomIn,
    handleZoomOut,
    handleJumpToLatest,
  ]);

  // Interactive Overview Range Scrubber (Mini Timeline Navigator)
  const updatePanFromScrubberClientX = useCallback(
    (clientX: number) => {
      if (!scrubberRef.current || adaptedCandles.length === 0) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      // ratio = 1 means latest candle (panOffset = 0), ratio = 0 means oldest candle
      const targetEndIdx = Math.round(ratio * adaptedCandles.length);
      const newHistoryOffset = Math.max(0, adaptedCandles.length - targetEndIdx);
      setPanOffset(clampPan(newHistoryOffset));
    },
    [adaptedCandles.length, clampPan]
  );

  useEffect(() => {
    if (!scrubberDragging) return;
    const onMove = (e: MouseEvent) => updatePanFromScrubberClientX(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        if (e.cancelable) e.preventDefault();
        updatePanFromScrubberClientX(e.touches[0].clientX);
      }
    };
    const onUp = () => setScrubberDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [scrubberDragging, updatePanFromScrubberClientX]);

  // Mini sparkline path for the overview scrubber bar
  const scrubberSparklinePath = useMemo(() => {
    if (adaptedCandles.length < 2) return '';
    let min = Infinity;
    let max = -Infinity;
    for (const c of adaptedCandles) {
      if (c.close < min) min = c.close;
      if (c.close > max) max = c.close;
    }
    const range = max - min || 1;
    let d = '';
    adaptedCandles.forEach((c, idx) => {
      const x = (idx / (adaptedCandles.length - 1)) * 1000;
      const y = 26 - ((c.close - min) / range) * 22;
      d += idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [adaptedCandles]);

  const viewportLeftPct =
    adaptedCandles.length > 0 ? Math.max(0, Math.min(96, (startIdx / adaptedCandles.length) * 100)) : 0;
  const viewportWidthPct =
    adaptedCandles.length > 0
      ? Math.max(4, Math.min(100 - viewportLeftPct, ((endIdx - startIdx) / adaptedCandles.length) * 100))
      : 100;

  const latestCandle = adaptedCandles.length > 0 ? adaptedCandles[adaptedCandles.length - 1] : null;
  const priceDecimals = symbol.includes('JPY') || symbol === 'XAUUSD' || symbol.includes('BTC') ? 2 : 4;
  const anySubPanelEnabled =
    visiblePanels.rsi || visiblePanels.macd || visiblePanels.adx || visiblePanels.volume;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[100] w-screen h-screen bg-zinc-950 flex flex-col p-2 sm:p-3 gap-2 overflow-hidden select-none touch-none overscroll-none'
          : 'space-y-3 outline-none'
      }
      tabIndex={0}
      onKeyDown={(e) => {
        if (isFullscreen) return; // Handled by global listener in fullscreen
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePanByBars(6);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handlePanByBars(-6);
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === 'End') {
          e.preventDefault();
          handleJumpToLatest();
        }
      }}
    >
      {/* Top Fullscreen Terminal Bar (Only visible in Full Chart Mode) */}
      {isFullscreen && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 shadow-lg shrink-0 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-extrabold text-[11px]">
              FULL CHART TERMINAL (MT5 / TV MODE)
            </span>

            {/* Quick Pair Switcher inside Full Chart Mode */}
            {onSymbolChange && availableSymbols && availableSymbols.length > 0 ? (
              <select
                value={symbol}
                onChange={(e) => onSymbolChange(e.target.value)}
                aria-label="Pilih Pair di Mode Full Chart"
                className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-extrabold text-xs cursor-pointer focus:outline-none focus:border-emerald-500"
              >
                {availableSymbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-black text-zinc-100">{symbol}</span>
            )}

            {latestCandle && (
              <span
                className={`text-sm font-black tabular-nums ${
                  latestCandle.isBullish ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                ${latestCandle.rawClose.toFixed(priceDecimals)}
              </span>
            )}

            {/* Active Signal Open Position Badge in Full Chart Header */}
            {signalOverlay && signalOverlay.entryPrice > 0 && (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] tabular-nums">
                {signalOverlay.isPotentialSignal !== false ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    POTENSIAL
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    WAIT/FILTERED
                  </span>
                )}
                <span
                  className={`font-extrabold ${
                    signalOverlay.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {signalOverlay.direction === 'LONG' ? 'BUY LIMIT' : 'SELL LIMIT'} @ $
                  {signalOverlay.entryPrice.toFixed(priceDecimals)}
                </span>
                <span className="text-rose-400">
                  SL: ${signalOverlay.stopLoss.toFixed(priceDecimals)}
                </span>
                <span className="text-emerald-400">
                  TP1: ${signalOverlay.takeProfit1.toFixed(priceDecimals)}
                </span>
                {signalOverlay.takeProfit2 && (
                  <span className="text-emerald-300">
                    TP2: ${signalOverlay.takeProfit2.toFixed(priceDecimals)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {anySubPanelEnabled && (
              <button
                type="button"
                onClick={() => setShowSubPanelsInFullscreen((prev) => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition ${
                  showSubPanelsInFullscreen
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{showSubPanelsInFullscreen ? 'Sembunyikan Osilator' : 'Tampilkan Osilator'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 text-zinc-950 font-extrabold text-xs cursor-pointer shadow-sm transition"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Tutup Full Chart (ESC)</span>
            </button>
          </div>
        </div>
      )}

      {/* Chart Toolbar */}
      <div className="shrink-0">
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
          chartShift={chartShift}
          onToggleChartShift={() => setChartShift((prev) => !prev)}
          isPannedBack={panOffset !== 0}
          onPanLeft={() => handlePanByBars(10)}
          onPanRight={() => handlePanByBars(-10)}
          onJumpToLatest={handleJumpToLatest}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
        />
      </div>

      {/* Main Interactive Chart Box */}
      <div
        className={
          isFullscreen
            ? 'flex-1 min-h-0 flex flex-col p-2.5 sm:p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl gap-2 overflow-hidden'
            : 'p-3 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl space-y-2.5'
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 pb-0.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-zinc-200">
              {symbol} &bull; {timeframe} &bull; {chartType}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
              (Bar #{Math.min(adaptedCandles.length, startIdx + 1)}–#{endIdx} dari {adaptedCandles.length} candle)
            </span>
            {panOffset !== 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                {panOffset > 0
                  ? `HISTORIS (-${Math.round(panOffset)} BAR)`
                  : `PROYEKSI KANAN (+${Math.abs(Math.round(panOffset))} BAR)`}
              </span>
            )}
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

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
            {visibleIndicators.support && supportLevel && (
              <span className="text-emerald-400 font-bold tabular-nums">
                Support: ${supportLevel.toFixed(symbol.includes('JPY') || symbol === 'XAUUSD' ? 2 : 4)}
              </span>
            )}
            {visibleIndicators.resistance && resistanceLevel && (
              <span className="text-rose-400 font-bold tabular-nums">
                Resistance: ${resistanceLevel.toFixed(symbol.includes('JPY') || symbol === 'XAUUSD' ? 2 : 4)}
              </span>
            )}
            {!isFullscreen && (
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] cursor-pointer transition"
              >
                <Expand className="w-3 h-3" />
                <span>Layar Penuh (Full Chart)</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Interactive SVG Chart Renderer */}
        <ChartRenderer
          candles={visibleCandles}
          totalCandlesCount={adaptedCandles.length}
          totalSlots={totalSlots}
          leftSlotOffset={leftSlotOffset}
          panOffset={panOffset}
          rightMarginBars={rightMarginBars}
          chartShift={chartShift}
          onPanByBars={handlePanByBars}
          onZoomByDelta={handleZoomByDelta}
          onJumpToLatest={handleJumpToLatest}
          onResetView={handleResetZoom}
          onToggleChartShift={() => setChartShift((prev) => !prev)}
          chartType={chartType}
          visibleIndicators={visibleIndicators}
          supportLevel={visibleIndicators.support ? supportLevel : null}
          resistanceLevel={visibleIndicators.resistance ? resistanceLevel : null}
          signalOverlay={visibleIndicators.signalOverlay !== false ? signalOverlay : null}
          showCrosshair={showCrosshair}
          symbol={symbol}
          timeframe={timeframe}
          isRefreshing={isRefreshing}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
        />

        {/* TradingView / MT5 Mini Range Scrubber & History Timeline Navigator */}
        {adaptedCandles.length > 10 && (
          <div className="space-y-1 pt-0.5 shrink-0">
            <div
              ref={scrubberRef}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setScrubberDragging(true);
                updatePanFromScrubberClientX(e.clientX);
              }}
              onTouchStart={(e) => {
                if (e.touches.length > 0) {
                  setScrubberDragging(true);
                  updatePanFromScrubberClientX(e.touches[0].clientX);
                }
              }}
              title="Klik atau geser timeline ini untuk menjelajahi seluruh riwayat candle dengan cepat"
              className="relative h-7 w-full rounded-lg bg-zinc-950 border border-zinc-800/90 overflow-hidden cursor-ew-resize select-none touch-none overscroll-none"
            >
              {/* Full-History Mini Sparkline */}
              <svg
                viewBox="0 0 1000 28"
                preserveAspectRatio="none"
                className="w-full h-full opacity-45 pointer-events-none"
              >
                <path d={scrubberSparklinePath} fill="none" stroke="#10b981" strokeWidth={2} />
              </svg>

              {/* Active Viewport Highlight Window */}
              <div
                style={{
                  left: `${viewportLeftPct}%`,
                  width: `${viewportWidthPct}%`,
                }}
                className="absolute top-0 bottom-0 bg-emerald-500/15 border-x-2 border-emerald-400/80 flex items-center justify-between px-1 pointer-events-none"
              >
                <span className="w-0.5 h-3 rounded bg-emerald-400/80" />
                <span className="w-0.5 h-3 rounded bg-emerald-400/80" />
              </div>

              {/* Left & Right Date Bounds Labels */}
              <div className="absolute inset-x-2.5 inset-y-0 flex items-center justify-between text-[10px] font-mono text-zinc-500 pointer-events-none">
                <span>
                  {new Date(adaptedCandles[0].timestamp).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="text-zinc-400 font-semibold">
                  Timeline Navigator (Klik / Geser untuk Scroll Historis)
                </span>
                <span>
                  {new Date(adaptedCandles[adaptedCandles.length - 1].timestamp).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Synchronized Sub-Indicator Panels (Pan & Zoom in real-time lockstep with Main Chart) */}
      {(!isFullscreen || showSubPanelsInFullscreen) && (
        <div
          className={
            isFullscreen
              ? 'max-h-[34vh] overflow-y-auto space-y-2 pr-1 shrink-0'
              : 'space-y-3'
          }
        >
          {visiblePanels.rsi && <RsiPanel candles={visibleCandles} />}
          {visiblePanels.macd && <MacdPanel candles={visibleCandles} />}
          {visiblePanels.adx && <AdxPanel candles={visibleCandles} />}
          {visiblePanels.volume && <VolumePanel candles={visibleCandles} />}
        </div>
      )}
    </div>
  );
};
