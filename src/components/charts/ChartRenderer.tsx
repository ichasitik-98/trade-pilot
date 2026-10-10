/**
 * ChartRenderer: Interactive MetaTrader 5 / TradingView-Style SVG Price Chart Engine
 * Features:
 * - 1:1 Slot-Based Horizontal Panning across historical candles & future projection space
 * - Free vertical price panning & Right Y-Axis drag-to-scale (compress/expand price axis)
 * - Bottom X-Axis drag-to-zoom & Mouse Wheel cursor-anchored zooming
 * - Native non-passive Touch 1-finger pan, axis scaling, & 2-finger pinch-to-zoom (locks page UI from scrolling)
 * - MT5 "Chart Shift" future projection margin with top shift triangle marker
 * - MT5 / TradingView Measure / Ruler tool (Shift + Drag or Ruler button) showing Pips, %, Bars
 * - Full Chart Terminal Mode responsive auto-sizing
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Ruler,
  Lock,
  Unlock,
  FastForward,
  Expand,
  Minimize2,
} from 'lucide-react';
import { ChartVisualCandle, SupportedChartType, IndicatorVisibility, ChartSignalOverlay } from './types.ts';

interface ChartRendererProps {
  candles: ChartVisualCandle[];
  totalCandlesCount?: number;
  totalSlots?: number;
  leftSlotOffset?: number;
  panOffset?: number;
  rightMarginBars?: number;
  chartShift?: boolean;
  onPanByBars?: (deltaBars: number) => void;
  onZoomByDelta?: (deltaZoom: number, anchorRatio?: number) => void;
  onJumpToLatest?: () => void;
  onResetView?: () => void;
  onToggleChartShift?: () => void;
  chartType: SupportedChartType;
  visibleIndicators: IndicatorVisibility;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  signalOverlay?: ChartSignalOverlay | null;
  showCrosshair: boolean;
  symbol: string;
  timeframe?: string;
  isRefreshing?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface MeasurePoint {
  slotIndex: number;
  price: number;
  timestamp?: number;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  candles,
  totalSlots: propTotalSlots,
  leftSlotOffset = 0,
  panOffset = 0,
  rightMarginBars = 0,
  onPanByBars,
  onZoomByDelta,
  onJumpToLatest,
  onResetView,
  chartType,
  visibleIndicators,
  supportLevel,
  resistanceLevel,
  signalOverlay,
  showCrosshair,
  symbol,
  timeframe = 'H1',
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 860, height: 440 });
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Vertical price axis scaling & panning (TradingView / MT5 style)
  const [priceScaleFactor, setPriceScaleFactor] = useState<number>(1.0);
  const [pricePanOffset, setPricePanOffset] = useState<number>(0);
  const [autoScaleY, setAutoScaleY] = useState<boolean>(true);

  // Interactive drag states
  const [dragMode, setDragMode] = useState<'NONE' | 'PAN_CHART' | 'SCALE_Y' | 'SCALE_X' | 'MEASURE'>('NONE');
  const [measureModeActive, setMeasureModeActive] = useState<boolean>(false);
  const [measureStart, setMeasureStart] = useState<MeasurePoint | null>(null);
  const [measureEnd, setMeasureEnd] = useState<MeasurePoint | null>(null);

  const dragRef = useRef<{
    mode: 'NONE' | 'PAN_CHART' | 'SCALE_Y' | 'SCALE_X' | 'MEASURE';
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    accumulatedBars: number;
    startPriceScale: number;
    startPricePan: number;
    priceRangeAtStart: number;
    pinchLastDist: number | null;
  }>({
    mode: 'NONE',
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    accumulatedBars: 0,
    startPriceScale: 1,
    startPricePan: 0,
    priceRangeAtStart: 1,
    pinchLastDist: null,
  });

  // Reset vertical scale when symbol or timeframe changes
  useEffect(() => {
    setPriceScaleFactor(1.0);
    setPricePanOffset(0);
    setAutoScaleY(true);
    setMeasureStart(null);
    setMeasureEnd(null);
  }, [symbol, timeframe]);

  const hasCandles = candles.length > 0;

  // ResizeObserver for responsive auto-sizing (re-attaches cleanly on fullscreen toggle or data load)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({
          width: Math.round(rect.width),
          height: Math.max(320, Math.round(rect.height)),
        });
      }
    };

    updateSize();
    const rafId = requestAnimationFrame(updateSize);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({
            width: Math.round(width),
            height: Math.max(320, Math.round(height)),
          });
        }
      }
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [hasCandles, isFullscreen]);

  const padding = { top: 24, right: 74, bottom: 32, left: 10 };
  const plotWidth = Math.max(60, dimensions.width - padding.left - padding.right);
  const plotHeight = Math.max(60, dimensions.height - padding.top - padding.bottom);

  const effectiveTotalSlots = Math.max(10, propTotalSlots ?? candles.length + rightMarginBars);
  const candleSpacing = plotWidth / effectiveTotalSlots;
  const candleWidth = Math.max(2, Math.min(22, candleSpacing * 0.72));

  // Compute baseline auto-fit price bounds across visible candles and active indicators
  const baseBounds = useMemo(() => {
    if (candles.length === 0) {
      return { minPrice: 0, maxPrice: 1, priceRange: 1 };
    }

    let min = Infinity;
    let max = -Infinity;

    for (const c of candles) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);

      if (visibleIndicators.ema20 && c.ema20) {
        min = Math.min(min, c.ema20);
        max = Math.max(max, c.ema20);
      }
      if (visibleIndicators.ema50 && c.ema50) {
        min = Math.min(min, c.ema50);
        max = Math.max(max, c.ema50);
      }
      if (visibleIndicators.ema200 && c.ema200) {
        min = Math.min(min, c.ema200);
        max = Math.max(max, c.ema200);
      }
      if (visibleIndicators.sma20 && c.sma20) {
        min = Math.min(min, c.sma20);
        max = Math.max(max, c.sma20);
      }
      if (visibleIndicators.bollingerBands) {
        if (c.bbLower) min = Math.min(min, c.bbLower);
        if (c.bbUpper) max = Math.max(max, c.bbUpper);
      }
    }

    if (visibleIndicators.support && supportLevel && supportLevel > 0) {
      min = Math.min(min, supportLevel);
    }
    if (visibleIndicators.resistance && resistanceLevel && resistanceLevel > 0) {
      max = Math.max(max, resistanceLevel);
    }

    if (
      signalOverlay &&
      signalOverlay.entryPrice > 0 &&
      signalOverlay.stopLoss > 0 &&
      signalOverlay.takeProfit1 > 0 &&
      panOffset <= 12
    ) {
      min = Math.min(min, signalOverlay.entryPrice, signalOverlay.stopLoss, signalOverlay.takeProfit1);
      max = Math.max(max, signalOverlay.entryPrice, signalOverlay.stopLoss, signalOverlay.takeProfit1);
      if (signalOverlay.takeProfit2 && signalOverlay.takeProfit2 > 0) {
        min = Math.min(min, signalOverlay.takeProfit2);
        max = Math.max(max, signalOverlay.takeProfit2);
      }
    }

    const span = max - min || 1;
    const buffer = span * 0.05;
    return {
      minPrice: min - buffer,
      maxPrice: max + buffer,
      priceRange: span + buffer * 2,
    };
  }, [candles, visibleIndicators, supportLevel, resistanceLevel, signalOverlay, panOffset]);

  // Apply user Y-axis scale factor and vertical pan offset
  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    const mid = (baseBounds.minPrice + baseBounds.maxPrice) / 2 + pricePanOffset;
    const scaledRange = Math.max(1e-6, baseBounds.priceRange * priceScaleFactor);
    return {
      minPrice: mid - scaledRange / 2,
      maxPrice: mid + scaledRange / 2,
      priceRange: scaledRange,
    };
  }, [baseBounds, priceScaleFactor, pricePanOffset]);

  // Coordinate conversion helpers
  const getY = useCallback(
    (price: number | null | undefined): number => {
      if (price === null || price === undefined || priceRange === 0) return 0;
      return padding.top + (1 - (price - minPrice) / priceRange) * plotHeight;
    },
    [minPrice, priceRange, plotHeight, padding.top]
  );

  const getPriceAtY = useCallback(
    (y: number): number => {
      const ratio = 1 - (y - padding.top) / plotHeight;
      return minPrice + ratio * priceRange;
    },
    [minPrice, priceRange, plotHeight, padding.top]
  );

  const getSlotX = useCallback(
    (slotIndex: number): number => {
      return padding.left + (slotIndex + 0.5) * candleSpacing;
    },
    [padding.left, candleSpacing]
  );

  const getCandleX = useCallback(
    (candleIdx: number): number => {
      return getSlotX(leftSlotOffset + candleIdx);
    },
    [getSlotX, leftSlotOffset]
  );

  // Format Price & Pip size based on symbol precision
  const isJpyOrGoldOrCrypto =
    symbol.includes('JPY') || symbol === 'XAUUSD' || symbol.includes('BTC') || symbol.includes('ETH');
  const pricePrecision = isJpyOrGoldOrCrypto ? 2 : 4;
  const pipSize = symbol.includes('JPY') || symbol === 'XAUUSD' ? 0.01 : symbol.includes('BTC') ? 1.0 : 0.0001;

  const formatPrice = useCallback(
    (p: number) => {
      return p.toFixed(pricePrecision);
    },
    [pricePrecision]
  );

  // Keep a mutable ref of latest interactive metrics so window/touch listeners never detach mid-drag
  const latestRef = useRef({
    candleSpacing,
    plotWidth,
    plotHeight,
    autoScaleY,
    onPanByBars,
    onZoomByDelta,
     onResetView,
    dimensions,
    padding,
    effectiveTotalSlots,
    candles,
    leftSlotOffset,
    getPriceAtY,
    priceScaleFactor,
    pricePanOffset,
    priceRange,
    measureModeActive,
  });

  useEffect(() => {
    latestRef.current = {
      candleSpacing,
      plotWidth,
      plotHeight,
      autoScaleY,
      onPanByBars,
      onZoomByDelta,
      onResetView,
      dimensions,
      padding,
      effectiveTotalSlots,
      candles,
      leftSlotOffset,
      getPriceAtY,
      priceScaleFactor,
      pricePanOffset,
      priceRange,
      measureModeActive,
    };
  });

  // Helper to start a drag gesture at clientX, clientY
  const beginPointerGesture = useCallback((clientX: number, clientY: number, isShiftOrMeasure: boolean) => {
    const el = containerRef.current;
    if (!el) return;
    const L = latestRef.current;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // 1. Right Price Axis -> Y-axis vertical scaling
    if (x >= L.dimensions.width - L.padding.right) {
      dragRef.current = {
        mode: 'SCALE_Y',
        startX: clientX,
        startY: clientY,
        lastX: clientX,
        lastY: clientY,
        accumulatedBars: 0,
        startPriceScale: L.priceScaleFactor,
        startPricePan: L.pricePanOffset,
        priceRangeAtStart: L.priceRange,
        pinchLastDist: null,
      };
      setDragMode('SCALE_Y');
      return;
    }

    // 2. Bottom Time Axis -> X-axis horizontal zoom
    if (y >= L.dimensions.height - L.padding.bottom) {
      dragRef.current = {
        mode: 'SCALE_X',
        startX: clientX,
        startY: clientY,
        lastX: clientX,
        lastY: clientY,
        accumulatedBars: 0,
        startPriceScale: L.priceScaleFactor,
        startPricePan: L.pricePanOffset,
        priceRangeAtStart: L.priceRange,
        pinchLastDist: null,
      };
      setDragMode('SCALE_X');
      return;
    }

    // 3. Measure / Ruler tool (Shift + Drag or Ruler button active)
    if (isShiftOrMeasure || L.measureModeActive) {
      const slotIdx = Math.max(
        0,
        Math.min(L.effectiveTotalSlots - 1, Math.floor((x - L.padding.left) / L.candleSpacing))
      );
      const candleIdx = slotIdx - L.leftSlotOffset;
      const candleAtSlot =
        candleIdx >= 0 && candleIdx < L.candles.length ? L.candles[candleIdx] : undefined;
      const pt: MeasurePoint = {
        slotIndex: slotIdx,
        price: L.getPriceAtY(y),
        timestamp: candleAtSlot?.timestamp,
      };
      setMeasureStart(pt);
      setMeasureEnd(pt);
      dragRef.current = {
        mode: 'MEASURE',
        startX: clientX,
        startY: clientY,
        lastX: clientX,
        lastY: clientY,
        accumulatedBars: 0,
        startPriceScale: L.priceScaleFactor,
        startPricePan: L.pricePanOffset,
        priceRangeAtStart: L.priceRange,
        pinchLastDist: null,
      };
      setDragMode('MEASURE');
      return;
    }

    // Clear previous ruler measurement if clicking normally
    setMeasureStart(null);
    setMeasureEnd(null);

    // 4. Default: Pan Chart horizontally & vertically
    dragRef.current = {
      mode: 'PAN_CHART',
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      accumulatedBars: 0,
      startPriceScale: L.priceScaleFactor,
      startPricePan: L.pricePanOffset,
      priceRangeAtStart: L.priceRange,
      pinchLastDist: null,
    };
    setDragMode('PAN_CHART');
  }, []);

  // Helper to process pointer/touch movement at clientX, clientY
  const movePointerGesture = useCallback(
    (clientX: number, clientY: number, forceVerticalPan: boolean = false) => {
      const state = dragRef.current;
      if (state.mode === 'NONE') return;
      const L = latestRef.current;

      const dx = clientX - state.lastX;
      const dy = clientY - state.lastY;
      state.lastX = clientX;
      state.lastY = clientY;

      if (state.mode === 'PAN_CHART') {
        // Horizontal drag -> pan bars (dragging right moves candles right to show older history on left)
        const stepPx = Math.max(2.5, L.candleSpacing);
        const exactBars = (clientX - state.startX) / stepPx;
        const barStep = Math.trunc(exactBars - state.accumulatedBars);
        if (barStep !== 0) {
          state.accumulatedBars += barStep;
          L.onPanByBars?.(barStep);
        }

        // Vertical drag -> pan price vertically if Y-axis is unlocked (Free Y) or modifier key held
        if (!L.autoScaleY || forceVerticalPan) {
          if (L.autoScaleY && Math.abs(clientY - state.startY) > 6) {
            setAutoScaleY(false);
          }
          const priceDelta = (dy / Math.max(50, L.plotHeight)) * state.priceRangeAtStart;
          setPricePanOffset((prev) => prev + priceDelta);
        }
      } else if (state.mode === 'SCALE_Y') {
        const totalDy = clientY - state.startY;
        const scaleMultiplier = Math.exp(totalDy * 0.0045);
        setAutoScaleY(false);
        setPriceScaleFactor(Math.max(0.25, Math.min(4.5, state.startPriceScale * scaleMultiplier)));
      } else if (state.mode === 'SCALE_X') {
        if (Math.abs(dx) >= 4) {
          L.onZoomByDelta?.(dx > 0 ? -1 : 1, 0.85);
        }
      } else if (state.mode === 'MEASURE' && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(
          L.padding.left,
          Math.min(L.dimensions.width - L.padding.right, clientX - rect.left)
        );
        const y = Math.max(
          L.padding.top,
          Math.min(L.dimensions.height - L.padding.bottom, clientY - rect.top)
        );
        const slotIdx = Math.max(
          0,
          Math.min(L.effectiveTotalSlots - 1, Math.floor((x - L.padding.left) / L.candleSpacing))
        );
        const candleIdx = slotIdx - L.leftSlotOffset;
        const candleAtSlot =
          candleIdx >= 0 && candleIdx < L.candles.length ? L.candles[candleIdx] : undefined;
        setMeasureEnd({
          slotIndex: slotIdx,
          price: L.getPriceAtY(y),
          timestamp: candleAtSlot?.timestamp,
        });
      }
    },
    []
  );

  // Non-passive mouse wheel listener for smooth TradingView / MT5 zooming & horizontal trackpad scrolling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const L = latestRef.current;
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      // If cursor is over the right Price Axis, wheel scales the vertical Y-axis
      if (mouseX >= L.dimensions.width - L.padding.right) {
        const factor = e.deltaY > 0 ? 1.08 : 0.92;
        setAutoScaleY(false);
        setPriceScaleFactor((prev) => Math.max(0.25, Math.min(4.0, prev * factor)));
        return;
      }

      // Horizontal trackpad two-finger swipe pans the chart left/right
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
        const deltaBars = e.deltaX / Math.max(4, L.candleSpacing);
        L.onPanByBars?.(-deltaBars);
        return;
      }

      // Vertical mouse wheel zooms in/out anchored at cursor position
      const relX = Math.max(0, Math.min(L.plotWidth, mouseX - L.padding.left));
      const anchorRatio = relX / Math.max(1, L.plotWidth);
      const zoomStep = e.deltaY > 0 ? 1 : -1;
      L.onZoomByDelta?.(zoomStep, anchorRatio);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [hasCandles, isFullscreen]);

  // Native non-passive Touch listeners on containerRef (prevents page scroll AND executes touch pan/pinch directly)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStartNative = (e: TouchEvent) => {
      // Allow clicks on floating toolbar buttons inside the chart container
      if ((e.target as HTMLElement)?.closest('button')) return;

      if (e.touches.length === 1) {
        const t = e.touches[0];
        beginPointerGesture(t.clientX, t.clientY, false);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        dragRef.current.pinchLastDist = Math.hypot(dx, dy);
        dragRef.current.mode = 'NONE';
        setDragMode('NONE');
      }
    };

    const handleTouchMoveNative = (e: TouchEvent) => {
      if ((e.target as HTMLElement)?.closest('button')) return;
      if (e.cancelable) {
        e.preventDefault();
      }

      const L = latestRef.current;
      if (e.touches.length === 2 && dragRef.current.pinchLastDist !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const diff = dist - dragRef.current.pinchLastDist;
        if (Math.abs(diff) > 10) {
          L.onZoomByDelta?.(diff > 0 ? -1 : 1, 0.5);
          dragRef.current.pinchLastDist = dist;
        }
        return;
      }

      if (e.touches.length === 1 && dragRef.current.mode !== 'NONE') {
        const t = e.touches[0];
        movePointerGesture(t.clientX, t.clientY, false);
      }
    };

    const handleTouchEndNative = () => {
      dragRef.current.mode = 'NONE';
      dragRef.current.pinchLastDist = null;
      setDragMode('NONE');
    };

    el.addEventListener('touchstart', handleTouchStartNative, { passive: false });
    el.addEventListener('touchmove', handleTouchMoveNative, { passive: false });
    el.addEventListener('touchend', handleTouchEndNative);
    el.addEventListener('touchcancel', handleTouchEndNative);

    return () => {
      el.removeEventListener('touchstart', handleTouchStartNative);
      el.removeEventListener('touchmove', handleTouchMoveNative);
      el.removeEventListener('touchend', handleTouchEndNative);
      el.removeEventListener('touchcancel', handleTouchEndNative);
    };
  }, [hasCandles, isFullscreen, beginPointerGesture, movePointerGesture]);

  // Global window mousemove / mouseup for uninterrupted mouse dragging even outside chart bounds
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (dragRef.current.mode === 'NONE') return;
      movePointerGesture(e.clientX, e.clientY, Boolean(e.altKey || e.ctrlKey));
    };

    const handleWindowMouseUp = () => {
      if (dragRef.current.mode !== 'NONE') {
        dragRef.current.mode = 'NONE';
        setDragMode('NONE');
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [movePointerGesture]);

  // Mouse Down on SVG
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    beginPointerGesture(e.clientX, e.clientY, Boolean(e.shiftKey));
  };

  // Double-click to reset Y-axis auto-fit or reset view
  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setPriceScaleFactor(1.0);
    setPricePanOffset(0);
    setAutoScaleY(true);
    if (x < dimensions.width - padding.right) {
      onResetView?.();
    }
  };

  // Handle Mouse Hover / Crosshair
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current || candles.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    const relX = x - padding.left;
    const slotIdx = Math.floor(relX / candleSpacing);
    if (slotIdx >= 0 && slotIdx < effectiveTotalSlots) {
      setHoveredSlot(slotIdx);
    } else {
      setHoveredSlot(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredSlot(null);
    setMousePos(null);
  };

  // SVG Path generator for line/overlay series using slot-aligned candle coordinates
  const buildLinePath = useCallback(
    (getValue: (c: ChartVisualCandle) => number | null | undefined): string => {
      let path = '';
      let isDrawing = false;

      candles.forEach((c, i) => {
        const val = getValue(c);
        if (val !== null && val !== undefined) {
          const x = getCandleX(i);
          const y = getY(val);
          if (!isDrawing) {
            path += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
            isDrawing = true;
          } else {
            path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
          }
        } else {
          isDrawing = false;
        }
      });

      return path;
    },
    [candles, getCandleX, getY]
  );

  // Bollinger Bands shaded area path
  const bbAreaPath = useMemo(() => {
    if (!visibleIndicators.bollingerBands || candles.length === 0) return '';
    const upperPoints: { x: number; y: number }[] = [];
    const lowerPoints: { x: number; y: number }[] = [];

    candles.forEach((c, i) => {
      if (c.bbUpper && c.bbLower) {
        upperPoints.push({ x: getCandleX(i), y: getY(c.bbUpper) });
        lowerPoints.push({ x: getCandleX(i), y: getY(c.bbLower) });
      }
    });

    if (upperPoints.length === 0) return '';

    let d = `M ${upperPoints[0].x.toFixed(2)} ${upperPoints[0].y.toFixed(2)}`;
    for (let i = 1; i < upperPoints.length; i++) {
      d += ` L ${upperPoints[i].x.toFixed(2)} ${upperPoints[i].y.toFixed(2)}`;
    }
    for (let i = lowerPoints.length - 1; i >= 0; i--) {
      d += ` L ${lowerPoints[i].x.toFixed(2)} ${lowerPoints[i].y.toFixed(2)}`;
    }
    d += ' Z';
    return d;
  }, [candles, visibleIndicators.bollingerBands, getCandleX, getY]);

  // Area chart path
  const areaChartPath = useMemo(() => {
    if (chartType !== 'AREA' || candles.length === 0) return '';
    const firstX = getCandleX(0);
    const lastX = getCandleX(candles.length - 1);
    const bottomY = padding.top + plotHeight;

    let d = `M ${firstX.toFixed(2)} ${bottomY.toFixed(2)}`;
    candles.forEach((c, i) => {
      d += ` L ${getCandleX(i).toFixed(2)} ${getY(c.close).toFixed(2)}`;
    });
    d += ` L ${lastX.toFixed(2)} ${bottomY.toFixed(2)} Z`;
    return d;
  }, [candles, chartType, getCandleX, getY, padding.top, plotHeight]);

  const formatAxisTime = (ts: number) => {
    const d = new Date(ts);
    if (timeframe === 'D1' || timeframe === 'W1') {
      return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short' });
    }
    if (timeframe === 'H4' || timeframe === 'H1') {
      return d.toLocaleString('en-GB', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
    return d.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatHudTime = (ts: number) => {
    const d = new Date(ts);
    return (
      d.toLocaleString('en-GB', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }) + ' WIB'
    );
  };

  // Memoize SVG paths
  const memoizedPaths = useMemo(() => {
    return {
      closeLine: chartType === 'LINE' || chartType === 'AREA' ? buildLinePath((c) => c.close) : '',
      bbUpper: visibleIndicators.bollingerBands ? buildLinePath((c) => c.bbUpper) : '',
      bbMiddle: visibleIndicators.bollingerBands ? buildLinePath((c) => c.bbMiddle) : '',
      bbLower: visibleIndicators.bollingerBands ? buildLinePath((c) => c.bbLower) : '',
      ema20: visibleIndicators.ema20 ? buildLinePath((c) => c.ema20) : '',
      ema50: visibleIndicators.ema50 ? buildLinePath((c) => c.ema50) : '',
      ema200: visibleIndicators.ema200 ? buildLinePath((c) => c.ema200) : '',
      sma20: visibleIndicators.sma20 ? buildLinePath((c) => c.sma20) : '',
      sma50: visibleIndicators.sma50 ? buildLinePath((c) => c.sma50) : '',
      sma200: visibleIndicators.sma200 ? buildLinePath((c) => c.sma200) : '',
    };
  }, [buildLinePath, chartType, visibleIndicators]);

  // Generate 7 horizontal price grid lines
  const priceGridTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = priceRange / 6;
    for (let i = 0; i <= 6; i++) {
      ticks.push(minPrice + i * step);
    }
    return ticks;
  }, [minPrice, priceRange]);

  // Generate vertical time grid lines across all horizontal slots (history + visible candles + future space)
  const timeGridTicks = useMemo(() => {
    if (candles.length === 0) return [];
    const ticks: { slotIndex: number; timestamp: number; isOutsideData?: boolean }[] = [];
    const step = Math.max(1, Math.floor(effectiveTotalSlots / 6));
    const tfMs =
      timeframe === 'M1'
        ? 60_000
        : timeframe === 'M5'
        ? 300_000
        : timeframe === 'M15'
        ? 900_000
        : timeframe === 'M30'
        ? 1_800_000
        : timeframe === 'H1'
        ? 3_600_000
        : timeframe === 'H4'
        ? 14_400_000
        : 86_400_000;

    const firstTs = candles[0].timestamp;
    const lastTs = candles[candles.length - 1].timestamp;

    for (let s = 0; s < effectiveTotalSlots; s += step) {
      const candleIdx = s - leftSlotOffset;
      if (candleIdx >= 0 && candleIdx < candles.length) {
        ticks.push({ slotIndex: s, timestamp: candles[candleIdx].timestamp });
      } else if (candleIdx < 0) {
        ticks.push({
          slotIndex: s,
          timestamp: firstTs + candleIdx * tfMs,
          isOutsideData: true,
        });
      } else {
        const futureOffsetBars = candleIdx - (candles.length - 1);
        ticks.push({
          slotIndex: s,
          timestamp: lastTs + futureOffsetBars * tfMs,
          isOutsideData: true,
        });
      }
    }
    return ticks;
  }, [candles, effectiveTotalSlots, leftSlotOffset, timeframe]);

  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const hoveredCandleIdx = hoveredSlot !== null ? hoveredSlot - leftSlotOffset : -1;
  const activeCandle =
    hoveredCandleIdx >= 0 && hoveredCandleIdx < candles.length
      ? candles[hoveredCandleIdx]
      : latestCandle;

  // Dynamic cursor style based on hover zone and drag mode
  const isOverPriceAxis = mousePos && mousePos.x >= dimensions.width - padding.right;
  const isOverTimeAxis = mousePos && mousePos.y >= dimensions.height - padding.bottom;
  const svgCursorClass =
    dragMode === 'PAN_CHART'
      ? 'cursor-grabbing'
      : dragMode === 'SCALE_Y' || isOverPriceAxis
      ? 'cursor-ns-resize'
      : dragMode === 'SCALE_X' || isOverTimeAxis
      ? 'cursor-ew-resize'
      : measureModeActive || dragMode === 'MEASURE'
      ? 'cursor-crosshair'
      : showCrosshair
      ? 'cursor-crosshair'
      : 'cursor-grab';

  if (candles.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-full flex flex-col items-center justify-center p-12 text-center rounded-xl bg-zinc-950 border border-zinc-800/80 min-h-[340px] select-none"
      >
        <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
        </div>
        <h4 className="text-sm font-mono font-bold text-zinc-200">No real market data available.</h4>
        <p className="text-xs font-mono text-zinc-500 max-w-sm mt-1.5">
          {symbol} has no real candles persisted from Twelve Data. Synthetic demo data is disabled in REAL mode.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ touchAction: 'none', overscrollBehavior: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      className={`relative w-full ${
        isFullscreen ? 'h-full min-h-[360px] flex-1' : 'h-96 sm:h-[460px]'
      } select-none touch-none overscroll-none bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800/80 group`}
    >
      {/* Top HUD: Floating OHLCV, Active Indicators & Interactive Mode Badges (TradingView / MT5 Style) */}
      {activeCandle && (
        <div className="absolute top-2 left-2.5 right-20 z-20 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono pointer-events-none bg-zinc-950/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800/80 shadow-lg">
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            <div className="flex items-center gap-2">
              <span className="font-black text-zinc-100">{symbol}</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-emerald-400 font-bold text-[10px] border border-zinc-800">
                {timeframe}
              </span>
              <span className="text-zinc-400">{formatHudTime(activeCandle.timestamp)}</span>
            </div>

            <div className="flex items-center gap-2.5 tabular-nums">
              <span>
                O:{' '}
                <strong className="text-zinc-200">
                  ${formatPrice(chartType === 'HEIKIN_ASHI' ? activeCandle.rawOpen : activeCandle.open)}
                </strong>
              </span>
              <span>
                H:{' '}
                <strong className="text-zinc-200">
                  ${formatPrice(chartType === 'HEIKIN_ASHI' ? activeCandle.rawHigh : activeCandle.high)}
                </strong>
              </span>
              <span>
                L:{' '}
                <strong className="text-zinc-200">
                  ${formatPrice(chartType === 'HEIKIN_ASHI' ? activeCandle.rawLow : activeCandle.low)}
                </strong>
              </span>
              <span>
                C:{' '}
                <strong className={activeCandle.isBullish ? 'text-emerald-400' : 'text-rose-400'}>
                  ${formatPrice(chartType === 'HEIKIN_ASHI' ? activeCandle.rawClose : activeCandle.close)}
                </strong>
              </span>
              {(() => {
                const openP = chartType === 'HEIKIN_ASHI' ? activeCandle.rawOpen : activeCandle.open;
                const closeP = chartType === 'HEIKIN_ASHI' ? activeCandle.rawClose : activeCandle.close;
                const diff = closeP - openP;
                const diffPips = pipSize > 0 ? (diff / pipSize).toFixed(1) : '0';
                return (
                  <span className={diff >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    ({diff >= 0 ? '+' : ''}
                    {diffPips}p)
                  </span>
                );
              })()}
            </div>

            {/* Active Overlay Indicator Readouts at Cursor */}
            <div className="hidden xl:flex items-center gap-2.5 text-[10px] text-zinc-400 tabular-nums">
              {visibleIndicators.ema20 && activeCandle.ema20 && (
                <span className="text-cyan-400">EMA20: ${formatPrice(activeCandle.ema20)}</span>
              )}
              {visibleIndicators.ema50 && activeCandle.ema50 && (
                <span className="text-amber-400">EMA50: ${formatPrice(activeCandle.ema50)}</span>
              )}
              {visibleIndicators.ema200 && activeCandle.ema200 && (
                <span className="text-purple-400">EMA200: ${formatPrice(activeCandle.ema200)}</span>
              )}
              {visibleIndicators.bollingerBands && activeCandle.bbUpper && (
                <span className="text-sky-300">
                  BB: [${formatPrice(activeCandle.bbLower ?? 0)}–${formatPrice(activeCandle.bbUpper)}]
                </span>
              )}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[10px] text-zinc-500">
            <span>Drag: Geser</span>
            <span>&middot;</span>
            <span>Scroll: Zoom</span>
            <span>&middot;</span>
            <span>Shift+Drag: Ukur Pips</span>
          </div>
        </div>
      )}

      {/* Floating TradingView / MT5 Bottom-Left Quick Navigation & Ruler Controls */}
      <div className="absolute bottom-9 left-3 z-20 flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 px-2 py-1 rounded-lg shadow-xl text-[11px] font-mono opacity-90 group-hover:opacity-100 transition">
        <button
          type="button"
          onClick={() => onPanByBars?.(8)}
          title="Geser ke Kiri (Candle Historis)"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 cursor-pointer transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onZoomByDelta?.(-1, 0.7)}
          title="Zoom In (+)"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 cursor-pointer transition"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onZoomByDelta?.(1, 0.7)}
          title="Zoom Out (-)"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 cursor-pointer transition"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPanByBars?.(-8)}
          title="Geser ke Kanan (Menuju Candle Terbaru)"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-emerald-400 cursor-pointer transition"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />

        {/* MT5 Crosshair Ruler / Measure Tool Toggle */}
        <button
          type="button"
          onClick={() => {
            setMeasureModeActive((prev) => !prev);
            if (measureModeActive) {
              setMeasureStart(null);
              setMeasureEnd(null);
            }
          }}
          title="Alat Ukur Pips & Candle (Atau tahan Shift + Drag di grafik seperti MT5/TradingView)"
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition ${
            measureModeActive
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
              : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Ruler className="w-3 h-3" />
          <span className="hidden md:inline">Ukur</span>
        </button>

        {/* Auto-Scale Y / Free Vertical Pan Toggle */}
        <button
          type="button"
          onClick={() => {
            if (!autoScaleY) {
              setAutoScaleY(true);
              setPriceScaleFactor(1.0);
              setPricePanOffset(0);
            } else {
              setAutoScaleY(false);
            }
          }}
          title={
            autoScaleY
              ? 'Skala Harga Otomatis (Auto-Fit Y). Klik untuk membuka kunci geser vertikal bebas'
              : 'Mode Geser Vertikal Bebas Aktif. Klik untuk kembali ke Auto-Fit Y'
          }
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition ${
            autoScaleY
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold'
              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold'
          }`}
        >
          {autoScaleY ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          <span>{autoScaleY ? 'Auto Y' : 'Free Y'}</span>
        </button>

        {/* Reset Full View */}
        <button
          type="button"
          onClick={() => {
            setPriceScaleFactor(1.0);
            setPricePanOffset(0);
            setAutoScaleY(true);
            setMeasureStart(null);
            setMeasureEnd(null);
            onResetView?.();
          }}
          title="Reset Grafik (Double-Click pada Grafik)"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer transition"
        >
          <RotateCcw className="w-3 h-3" />
        </button>

        {/* Quick Full Chart Toggle inside Floating Chart Bar */}
        {onToggleFullscreen && (
          <>
            <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />
            <button
              type="button"
              onClick={onToggleFullscreen}
              title={
                isFullscreen
                  ? 'Keluar Mode Full Chart (Tekan ESC)'
                  : 'Buka Full Chart Layar Penuh agar leluasa menggeser grafik (Tekan F)'
              }
              className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer font-bold transition ${
                isFullscreen
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
              }`}
            >
              {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Expand className="w-3 h-3" />}
              <span>{isFullscreen ? 'Exit Full' : 'Full Chart'}</span>
            </button>
          </>
        )}
      </div>

      {/* Floating "Jump to Latest Candle (>>)" Button when Panned */}
      {panOffset !== 0 && (
        <button
          type="button"
          onClick={() => {
            setPriceScaleFactor(1.0);
            setPricePanOffset(0);
            setAutoScaleY(true);
            onJumpToLatest?.();
          }}
          className="absolute bottom-9 right-20 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono text-xs font-extrabold shadow-lg shadow-emerald-950/50 cursor-pointer transition"
        >
          <span>
            {panOffset > 0
              ? `Historis (-${Math.round(panOffset)} bar)`
              : `Proyeksi (+${Math.abs(Math.round(panOffset))} bar)`}{' '}
            &bull; Ke Candle Terkini
          </span>
          <FastForward className="w-3.5 h-3.5 fill-current" />
        </button>
      )}

      {/* Primary SVG Chart Plot Area */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        className={`w-full h-full touch-none overscroll-none select-none block ${svgCursorClass}`}
      >
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
          </linearGradient>
          <linearGradient id="bbBandGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="plotAreaClip">
            <rect
              x={padding.left}
              y={padding.top}
              width={plotWidth}
              height={plotHeight}
            />
          </clipPath>
        </defs>

        {/* Right Price Axis Interactive Background Strip */}
        <rect
          x={dimensions.width - padding.right}
          y={0}
          width={padding.right}
          height={dimensions.height}
          fill={isOverPriceAxis || dragMode === 'SCALE_Y' ? '#18181b' : '#09090b'}
          opacity={0.9}
        />
        <line
          x1={dimensions.width - padding.right}
          y1={padding.top}
          x2={dimensions.width - padding.right}
          y2={dimensions.height - padding.bottom}
          stroke="#27272a"
          strokeWidth={1}
        />

        {/* Bottom Time Axis Interactive Background Strip */}
        <rect
          x={0}
          y={dimensions.height - padding.bottom}
          width={dimensions.width}
          height={padding.bottom}
          fill={isOverTimeAxis || dragMode === 'SCALE_X' ? '#18181b' : '#09090b'}
          opacity={0.9}
        />
        <line
          x1={padding.left}
          y1={dimensions.height - padding.bottom}
          x2={dimensions.width - padding.right}
          y2={dimensions.height - padding.bottom}
          stroke="#27272a"
          strokeWidth={1}
        />

        {/* Horizontal Price Grid Lines & Right-Axis Labels */}
        {priceGridTicks.map((price, idx) => {
          const y = getY(price);
          if (y < padding.top - 4 || y > dimensions.height - padding.bottom + 4) return null;
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={dimensions.width - padding.right}
                y2={y}
                stroke="#1f1f23"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={dimensions.width - padding.right + 7}
                y={y + 3}
                fill="#a1a1aa"
                fontSize={10}
                fontFamily="monospace"
              >
                ${formatPrice(price)}
              </text>
            </g>
          );
        })}

        {/* Vertical Time Grid Lines & Bottom-Axis Labels */}
        {timeGridTicks.map((tick, idx) => {
          const x = getSlotX(tick.slotIndex);
          return (
            <g key={idx}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={dimensions.height - padding.bottom}
                stroke={tick.isOutsideData ? '#18181b' : '#1f1f23'}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={x}
                y={dimensions.height - 11}
                fill={tick.isOutsideData ? '#52525b' : '#a1a1aa'}
                fontSize={9}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {formatAxisTime(tick.timestamp)}
              </text>
            </g>
          );
        })}

        {/* MT5 "Chart Shift" Vertical Boundary Line & Top Shift Triangle Marker */}
        {rightMarginBars > 0 && candles.length > 0 && (
          <g className="pointer-events-none">
            {(() => {
              const shiftX = getCandleX(candles.length - 1) + candleSpacing * 0.5;
              if (shiftX < padding.left || shiftX > dimensions.width - padding.right) return null;
              return (
                <>
                  <line
                    x1={shiftX}
                    y1={padding.top}
                    x2={shiftX}
                    y2={dimensions.height - padding.bottom}
                    stroke="#3f3f46"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  {/* Classic MT5 Top Chart-Shift Triangle Indicator */}
                  <polygon
                    points={`${shiftX - 5},${padding.top} ${shiftX + 5},${padding.top} ${shiftX},${padding.top + 8}`}
                    fill="#38bdf8"
                    opacity={0.75}
                  />
                </>
              );
            })()}
          </g>
        )}

        {/* Main Plot Content Clipped to Plot Area */}
        <g clipPath="url(#plotAreaClip)">
          {/* Bollinger Bands Shaded Area & Lines */}
          {visibleIndicators.bollingerBands && bbAreaPath && (
            <path d={bbAreaPath} fill="url(#bbBandGradient)" />
          )}
          {visibleIndicators.bollingerBands && (
            <>
              <path
                d={memoizedPaths.bbUpper}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1}
                strokeDasharray="2 2"
                opacity={0.75}
              />
              <path
                d={memoizedPaths.bbMiddle}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="1 2"
                opacity={0.5}
              />
              <path
                d={memoizedPaths.bbLower}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1}
                strokeDasharray="2 2"
                opacity={0.75}
              />
            </>
          )}

          {/* Technical Support Level (Dashed Horizontal Line) */}
          {visibleIndicators.support && supportLevel && supportLevel > 0 && (
            <line
              x1={padding.left}
              y1={getY(supportLevel)}
              x2={dimensions.width - padding.right}
              y2={getY(supportLevel)}
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}

          {/* Technical Resistance Level (Dashed Horizontal Line) */}
          {visibleIndicators.resistance && resistanceLevel && resistanceLevel > 0 && (
            <line
              x1={padding.left}
              y1={getY(resistanceLevel)}
              x2={dimensions.width - padding.right}
              y2={getY(resistanceLevel)}
              stroke="#f43f5e"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}

          {/* AREA CHART Rendering */}
          {chartType === 'AREA' && (
            <>
              {areaChartPath && <path d={areaChartPath} fill="url(#areaGradient)" />}
              <path d={memoizedPaths.closeLine} fill="none" stroke="#10b981" strokeWidth={2} />
            </>
          )}

          {/* LINE CHART Rendering */}
          {chartType === 'LINE' && (
            <path d={memoizedPaths.closeLine} fill="none" stroke="#10b981" strokeWidth={2} />
          )}

          {/* OHLC BAR CHART Rendering */}
          {chartType === 'OHLC' &&
            candles.map((c, i) => {
              const x = getCandleX(i);
              const yHigh = getY(c.high);
              const yLow = getY(c.low);
              const yOpen = getY(c.open);
              const yClose = getY(c.close);
              const color = c.isBullish ? '#10b981' : '#f43f5e';
              const tickWidth = Math.max(3, candleWidth * 0.45);

              return (
                <g key={i}>
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1.5} />
                  <line x1={x - tickWidth} y1={yOpen} x2={x} y2={yOpen} stroke={color} strokeWidth={1.5} />
                  <line x1={x} y1={yClose} x2={x + tickWidth} y2={yClose} stroke={color} strokeWidth={1.5} />
                </g>
              );
            })}

          {/* CANDLESTICK & HEIKIN ASHI Rendering */}
          {(chartType === 'CANDLESTICK' || chartType === 'HEIKIN_ASHI') &&
            candles.map((c, i) => {
              const x = getCandleX(i);
              const yHigh = getY(c.high);
              const yLow = getY(c.low);
              const yOpen = getY(c.open);
              const yClose = getY(c.close);
              const topY = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));
              const color = c.isBullish ? '#10b981' : '#f43f5e';
              const halfW = candleWidth / 2;

              return (
                <g key={i}>
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1.2} />
                  <rect
                    x={x - halfW}
                    y={topY}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    stroke={color}
                    strokeWidth={0.5}
                    rx={0.5}
                  />
                </g>
              );
            })}

          {/* Overlay Lines: EMA20, EMA50, EMA200, SMA20, SMA50, SMA200 */}
          {visibleIndicators.ema20 && memoizedPaths.ema20 && (
            <path d={memoizedPaths.ema20} fill="none" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="3 2" />
          )}
          {visibleIndicators.ema50 && memoizedPaths.ema50 && (
            <path d={memoizedPaths.ema50} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 2" />
          )}
          {visibleIndicators.ema200 && memoizedPaths.ema200 && (
            <path d={memoizedPaths.ema200} fill="none" stroke="#a855f7" strokeWidth={2} />
          )}
          {visibleIndicators.sma20 && memoizedPaths.sma20 && (
            <path d={memoizedPaths.sma20} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
          )}
          {visibleIndicators.sma50 && memoizedPaths.sma50 && (
            <path d={memoizedPaths.sma50} fill="none" stroke="#6366f1" strokeWidth={1.5} />
          )}
          {visibleIndicators.sma200 && memoizedPaths.sma200 && (
            <path d={memoizedPaths.sma200} fill="none" stroke="#8b5cf6" strokeWidth={2} />
          )}

          {/* Signal Open Position Risk & Reward Zone Overlay (Projected into Right Chart Shift Space) */}
          {signalOverlay &&
            signalOverlay.entryPrice > 0 &&
            signalOverlay.stopLoss > 0 &&
            signalOverlay.takeProfit1 > 0 &&
            (() => {
              const anchorCandleIdx = Math.max(0, candles.length - Math.min(10, Math.floor(candles.length * 0.2)));
              const boxX = Math.max(
                padding.left + 8,
                Math.min(dimensions.width - padding.right - 135, getCandleX(anchorCandleIdx))
              );
              const boxWidth = Math.max(70, dimensions.width - padding.right - boxX);

              const yEntry = getY(signalOverlay.entryPrice);
              const ySL = getY(signalOverlay.stopLoss);
              const yTP1 = getY(signalOverlay.takeProfit1);
              const yTP2 =
                signalOverlay.takeProfit2 && signalOverlay.takeProfit2 > 0
                  ? getY(signalOverlay.takeProfit2)
                  : null;

              const riskTop = Math.min(yEntry, ySL);
              const riskHeight = Math.max(2, Math.abs(ySL - yEntry));

              const rewardTargetY = yTP2 !== null ? yTP2 : yTP1;
              const rewardTop = Math.min(yEntry, rewardTargetY);
              const rewardHeight = Math.max(2, Math.abs(rewardTargetY - yEntry));

              return (
                <g className="pointer-events-none">
                  {/* Reward Shaded Zone (Entry to TP) */}
                  <rect
                    x={boxX}
                    y={rewardTop}
                    width={boxWidth}
                    height={rewardHeight}
                    fill="#10b981"
                    fillOpacity={0.11}
                    stroke="#10b981"
                    strokeOpacity={0.35}
                    strokeWidth={1}
                  />

                  {/* Risk Shaded Zone (Entry to SL) */}
                  <rect
                    x={boxX}
                    y={riskTop}
                    width={boxWidth}
                    height={riskHeight}
                    fill="#f43f5e"
                    fillOpacity={0.13}
                    stroke="#f43f5e"
                    strokeOpacity={0.4}
                    strokeWidth={1}
                  />

                  {/* TP2 Line & Label */}
                  {yTP2 !== null && signalOverlay.takeProfit2 && (
                    <g>
                      <line
                        x1={boxX}
                        y1={yTP2}
                        x2={dimensions.width - padding.right}
                        y2={yTP2}
                        stroke="#10b981"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                      />
                      <rect
                        x={boxX + 4}
                        y={yTP2 - 8}
                        width={122}
                        height={15}
                        rx={3}
                        fill="#064e3b"
                        fillOpacity={0.92}
                      />
                      <text
                        x={boxX + 8}
                        y={yTP2 + 2.5}
                        fill="#34d399"
                        fontSize={9}
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        TP2: ${formatPrice(signalOverlay.takeProfit2)} ({signalOverlay.riskReward2 ?? 2.5}R)
                      </text>
                    </g>
                  )}

                  {/* TP1 Line & Label */}
                  <g>
                    <line
                      x1={boxX}
                      y1={yTP1}
                      x2={dimensions.width - padding.right}
                      y2={yTP1}
                      stroke="#10b981"
                      strokeWidth={1.5}
                    />
                    <rect
                      x={boxX + 4}
                      y={yTP1 - 8}
                      width={122}
                      height={15}
                      rx={3}
                      fill="#065f46"
                      fillOpacity={0.95}
                    />
                    <text
                      x={boxX + 8}
                      y={yTP1 + 2.5}
                      fill="#6ee7b7"
                      fontSize={9}
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      TP1: ${formatPrice(signalOverlay.takeProfit1)} ({signalOverlay.riskReward ?? 1.5}R)
                    </text>
                  </g>

                  {/* Entry Line & Label */}
                  <g>
                    <line
                      x1={boxX}
                      y1={yEntry}
                      x2={dimensions.width - padding.right}
                      y2={yEntry}
                      stroke="#38bdf8"
                      strokeWidth={1.75}
                    />
                    <rect
                      x={boxX + 4}
                      y={yEntry - 8}
                      width={132}
                      height={15}
                      rx={3}
                      fill="#0c4a6e"
                      fillOpacity={0.95}
                    />
                    <text
                      x={boxX + 8}
                      y={yEntry + 2.5}
                      fill="#7dd3fc"
                      fontSize={9}
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {signalOverlay.direction === 'LONG' ? 'BUY LIMIT' : 'SELL LIMIT'}: ${formatPrice(signalOverlay.entryPrice)}
                    </text>
                  </g>

                  {/* Stop Loss Line & Label */}
                  <g>
                    <line
                      x1={boxX}
                      y1={ySL}
                      x2={dimensions.width - padding.right}
                      y2={ySL}
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                    />
                    <rect
                      x={boxX + 4}
                      y={ySL - 8}
                      width={114}
                      height={15}
                      rx={3}
                      fill="#881337"
                      fillOpacity={0.95}
                    />
                    <text
                      x={boxX + 8}
                      y={ySL + 2.5}
                      fill="#fda4af"
                      fontSize={9}
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      SL: ${formatPrice(signalOverlay.stopLoss)} (-1.0R)
                    </text>
                  </g>
                </g>
              );
            })()}

          {/* MT5 / TradingView Interactive Ruler / Measure Tool Overlay */}
          {measureStart &&
            measureEnd &&
            (() => {
              const x1 = getSlotX(measureStart.slotIndex);
              const y1 = getY(measureStart.price);
              const x2 = getSlotX(measureEnd.slotIndex);
              const y2 = getY(measureEnd.price);

              const boxLeft = Math.min(x1, x2);
              const boxTop = Math.min(y1, y2);
              const boxW = Math.max(4, Math.abs(x2 - x1));
              const boxH = Math.max(4, Math.abs(y2 - y1));

              const priceDiff = measureEnd.price - measureStart.price;
              const pipsDiff = pipSize > 0 ? priceDiff / pipSize : 0;
              const pctDiff = measureStart.price > 0 ? (priceDiff / measureStart.price) * 100 : 0;
              const barsDiff = Math.abs(measureEnd.slotIndex - measureStart.slotIndex);
              const isPos = priceDiff >= 0;

              const badgeX = Math.min(
                dimensions.width - padding.right - 175,
                Math.max(padding.left + 6, (x1 + x2) / 2 - 82)
              );
              const badgeY = Math.max(padding.top + 8, boxTop - 28);

              return (
                <g className="pointer-events-none">
                  <rect
                    x={boxLeft}
                    y={boxTop}
                    width={boxW}
                    height={boxH}
                    fill={isPos ? '#10b981' : '#f43f5e'}
                    fillOpacity={0.16}
                    stroke={isPos ? '#34d399' : '#fb7185'}
                    strokeWidth={1.25}
                    strokeDasharray="3 2"
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isPos ? '#34d399' : '#fb7185'}
                    strokeWidth={1.5}
                  />
                  <rect
                    x={badgeX}
                    y={badgeY}
                    width={168}
                    height={22}
                    rx={4}
                    fill="#18181b"
                    stroke={isPos ? '#10b981' : '#f43f5e'}
                    strokeWidth={1}
                  />
                  <text
                    x={badgeX + 84}
                    y={badgeY + 14}
                    fill={isPos ? '#34d399' : '#fda4af'}
                    fontSize={10}
                    fontFamily="monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {isPos ? '+' : ''}
                    {pipsDiff.toFixed(1)} pips ({isPos ? '+' : ''}
                    {pctDiff.toFixed(2)}%) • {barsDiff} bar
                  </text>
                </g>
              );
            })()}
        </g>

        {/* Right-Axis Badges for Support, Resistance, and Live Price */}
        {visibleIndicators.support &&
          supportLevel &&
          supportLevel > 0 &&
          getY(supportLevel) >= padding.top &&
          getY(supportLevel) <= dimensions.height - padding.bottom && (
            <g className="pointer-events-none">
              <rect
                x={dimensions.width - padding.right + 2}
                y={getY(supportLevel) - 8}
                width={68}
                height={16}
                rx={3}
                fill="#064e3b"
              />
              <text
                x={dimensions.width - padding.right + 6}
                y={getY(supportLevel) + 3}
                fill="#34d399"
                fontSize={9}
                fontFamily="monospace"
                fontWeight="bold"
              >
                S: {formatPrice(supportLevel)}
              </text>
            </g>
          )}

        {visibleIndicators.resistance &&
          resistanceLevel &&
          resistanceLevel > 0 &&
          getY(resistanceLevel) >= padding.top &&
          getY(resistanceLevel) <= dimensions.height - padding.bottom && (
            <g className="pointer-events-none">
              <rect
                x={dimensions.width - padding.right + 2}
                y={getY(resistanceLevel) - 8}
                width={68}
                height={16}
                rx={3}
                fill="#881337"
              />
              <text
                x={dimensions.width - padding.right + 6}
                y={getY(resistanceLevel) + 3}
                fill="#fb7185"
                fontSize={9}
                fontFamily="monospace"
                fontWeight="bold"
              >
                R: {formatPrice(resistanceLevel)}
              </text>
            </g>
          )}

        {/* Live Price Horizontal Line & Right-Axis Badge */}
        {latestCandle && (
          <g className="pointer-events-none">
            <line
              x1={padding.left}
              y1={getY(latestCandle.close)}
              x2={dimensions.width - padding.right}
              y2={getY(latestCandle.close)}
              stroke={latestCandle.isBullish ? '#10b981' : '#f43f5e'}
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.75}
            />
            {getY(latestCandle.close) >= padding.top &&
              getY(latestCandle.close) <= dimensions.height - padding.bottom && (
                <>
                  <rect
                    x={dimensions.width - padding.right + 2}
                    y={getY(latestCandle.close) - 8}
                    width={68}
                    height={16}
                    rx={3}
                    fill={latestCandle.isBullish ? '#059669' : '#e11d48'}
                  />
                  <text
                    x={dimensions.width - padding.right + 5}
                    y={getY(latestCandle.close) + 3}
                    fill="#ffffff"
                    fontSize={9}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    ${formatPrice(chartType === 'HEIKIN_ASHI' ? latestCandle.rawClose : latestCandle.close)}
                  </text>
                </>
              )}
          </g>
        )}

        {/* Interactive Crosshair (Cursor Tracker) */}
        {showCrosshair &&
          mousePos &&
          mousePos.x <= dimensions.width - padding.right &&
          mousePos.y <= dimensions.height - padding.bottom && (
            <g className="pointer-events-none">
              {/* Vertical crosshair line */}
              <line
                x1={mousePos.x}
                y1={padding.top}
                x2={mousePos.x}
                y2={dimensions.height - padding.bottom}
                stroke="#71717a"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {/* Horizontal crosshair line */}
              <line
                x1={padding.left}
                y1={mousePos.y}
                x2={dimensions.width - padding.right}
                y2={mousePos.y}
                stroke="#71717a"
                strokeWidth={1}
                strokeDasharray="3 3"
              />

              {/* Price badge on right axis */}
              <rect
                x={dimensions.width - padding.right + 2}
                y={mousePos.y - 9}
                width={68}
                height={18}
                rx={3}
                fill="#27272a"
                stroke="#52525b"
              />
              <text
                x={dimensions.width - padding.right + 6}
                y={mousePos.y + 3}
                fill="#f4f4f5"
                fontSize={10}
                fontFamily="monospace"
                fontWeight="bold"
              >
                ${formatPrice(getPriceAtY(mousePos.y))}
              </text>

              {/* Time badge at bottom axis */}
              {hoveredCandleIdx >= 0 && hoveredCandleIdx < candles.length && (
                <g>
                  <rect
                    x={
                      Math.max(
                        36,
                        Math.min(dimensions.width - padding.right - 36, getCandleX(hoveredCandleIdx))
                      ) - 36
                    }
                    y={dimensions.height - padding.bottom + 2}
                    width={72}
                    height={18}
                    rx={3}
                    fill="#27272a"
                    stroke="#52525b"
                  />
                  <text
                    x={Math.max(
                      36,
                      Math.min(dimensions.width - padding.right - 36, getCandleX(hoveredCandleIdx))
                    )}
                    y={dimensions.height - padding.bottom + 14}
                    fill="#f4f4f5"
                    fontSize={9}
                    fontFamily="monospace"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {formatAxisTime(candles[hoveredCandleIdx].timestamp)}
                  </text>
                </g>
              )}
            </g>
          )}
      </svg>
    </div>
  );
};
