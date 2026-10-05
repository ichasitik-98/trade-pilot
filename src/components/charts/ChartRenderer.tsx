/**
 * ChartRenderer: Interactive SVG Price Chart Engine
 * Renders Candlestick, OHLC, Line, Area, and Heikin Ashi charts with
 * indicator overlays, support/resistance bands, dynamic crosshair, and precision axes.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChartVisualCandle, SupportedChartType, IndicatorVisibility } from './types.ts';

interface ChartRendererProps {
  candles: ChartVisualCandle[];
  chartType: SupportedChartType;
  visibleIndicators: IndicatorVisibility;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  showCrosshair: boolean;
  symbol: string;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  candles,
  chartType,
  visibleIndicators,
  supportLevel,
  resistanceLevel,
  showCrosshair,
  symbol,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // ResizeObserver for responsive auto-sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height: Math.max(300, height) });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const padding = { top: 20, right: 65, bottom: 30, left: 10 };
  const plotWidth = Math.max(50, dimensions.width - padding.left - padding.right);
  const plotHeight = Math.max(50, dimensions.height - padding.top - padding.bottom);

  // Compute price bounds across visible candles and active indicators
  const { minPrice, maxPrice, priceRange } = useMemo(() => {
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

    // Add a 4% buffer so candles don't touch plot edges
    const span = max - min || 1;
    const buffer = span * 0.04;
    return {
      minPrice: min - buffer,
      maxPrice: max + buffer,
      priceRange: span + buffer * 2,
    };
  }, [candles, visibleIndicators, supportLevel, resistanceLevel]);

  // Coordinate conversion helpers
  const getY = (price: number | null | undefined): number => {
    if (price === null || price === undefined || priceRange === 0) return 0;
    return padding.top + (1 - (price - minPrice) / priceRange) * plotHeight;
  };

  const getPriceAtY = (y: number): number => {
    const ratio = 1 - (y - padding.top) / plotHeight;
    return minPrice + ratio * priceRange;
  };

  const candleCount = candles.length;
  const candleSpacing = candleCount > 0 ? plotWidth / candleCount : 10;
  const candleWidth = Math.max(2, Math.min(18, candleSpacing * 0.7));

  const getX = (index: number): number => {
    return padding.left + (index + 0.5) * candleSpacing;
  };

  // SVG Path generator for line/overlay series
  const buildLinePath = (getValue: (c: ChartVisualCandle) => number | null | undefined): string => {
    let path = '';
    let isDrawing = false;

    candles.forEach((c, i) => {
      const val = getValue(c);
      if (val !== null && val !== undefined) {
        const x = getX(i);
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
  };

  // Bollinger Bands shaded area path
  const bbAreaPath = useMemo(() => {
    if (!visibleIndicators.bollingerBands || candles.length === 0) return '';
    const upperPoints: { x: number; y: number }[] = [];
    const lowerPoints: { x: number; y: number }[] = [];

    candles.forEach((c, i) => {
      if (c.bbUpper && c.bbLower) {
        upperPoints.push({ x: getX(i), y: getY(c.bbUpper) });
        lowerPoints.push({ x: getX(i), y: getY(c.bbLower) });
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
  }, [candles, visibleIndicators.bollingerBands, minPrice, maxPrice, dimensions.width]);

  // Area chart path
  const areaChartPath = useMemo(() => {
    if (chartType !== 'AREA' || candles.length === 0) return '';
    const firstX = getX(0);
    const lastX = getX(candles.length - 1);
    const bottomY = padding.top + plotHeight;

    let d = `M ${firstX.toFixed(2)} ${bottomY.toFixed(2)}`;
    candles.forEach((c, i) => {
      d += ` L ${getX(i).toFixed(2)} ${getY(c.close).toFixed(2)}`;
    });
    d += ` L ${lastX.toFixed(2)} ${bottomY.toFixed(2)} Z`;
    return d;
  }, [candles, chartType, minPrice, maxPrice, dimensions.width]);

  // Handle Mouse Hover / Crosshair
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current || candles.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    // Determine hovered candle index
    const relX = x - padding.left;
    const idx = Math.floor(relX / candleSpacing);
    if (idx >= 0 && idx < candles.length) {
      setHoveredIndex(idx);
    } else {
      setHoveredIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setMousePos(null);
  };

  // Format Price based on symbol precision
  const formatPrice = (p: number) => {
    const isJpyOrGold = symbol.includes('JPY') || symbol === 'XAUUSD' || symbol.includes('BTC');
    return p.toFixed(isJpyOrGold ? 2 : 4);
  };

  // Generate 6 horizontal price grid lines
  const priceGridTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = priceRange / 5;
    for (let i = 0; i <= 5; i++) {
      ticks.push(minPrice + i * step);
    }
    return ticks;
  }, [minPrice, priceRange]);

  // Generate 6 horizontal time labels
  const timeGridTicks = useMemo(() => {
    if (candles.length === 0) return [];
    const ticks: { index: number; timestamp: number }[] = [];
    const step = Math.max(1, Math.floor(candles.length / 5));
    for (let i = 0; i < candles.length; i += step) {
      ticks.push({ index: i, timestamp: candles[i].timestamp });
    }
    return ticks;
  }, [candles]);

  const activeCandle =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < candles.length
      ? candles[hoveredIndex]
      : candles[candles.length - 1];

  if (candles.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-full flex flex-col items-center justify-center p-12 text-center rounded-xl bg-zinc-950 border border-zinc-800/80 min-h-[320px] select-none"
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
    <div ref={containerRef} className="relative w-full h-80 sm:h-96 select-none bg-zinc-950 rounded-xl overflow-hidden">
      {/* Top HUD: Floating OHLCV and Indicators Status */}
      {activeCandle && (
        <div className="absolute top-2 left-3 right-16 z-20 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono pointer-events-none bg-zinc-950/80 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-zinc-800/80 shadow-md">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-zinc-200">{symbol}</span>
            <span className="text-zinc-500">
              {new Date(activeCandle.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span>
              O: <strong className="text-zinc-300">${formatPrice(chartType === 'HEIKIN_ASHI' ? activeCandle.rawOpen : activeCandle.open)}</strong>
            </span>
            <span>
              H: <strong className="text-zinc-300">${formatPrice(chartType === 'HEIKIN_ASHI' ? activeCandle.rawHigh : activeCandle.high)}</strong>
            </span>
            <span>
              L: <strong className="text-zinc-300">${formatPrice(chartType === 'HEIKIN_ASHI' ? activeCandle.rawLow : activeCandle.low)}</strong>
            </span>
            <span>
              C:{' '}
              <strong className={activeCandle.isBullish ? 'text-emerald-400' : 'text-rose-400'}>
                ${formatPrice(chartType === 'HEIKIN_ASHI' ? activeCandle.rawClose : activeCandle.close)}
              </strong>
            </span>
            {chartType === 'HEIKIN_ASHI' && (
              <span className="text-cyan-400 font-semibold">
                [HA-C: ${formatPrice(activeCandle.close)}]
              </span>
            )}
          </div>

          {/* Active Overlay Indicator Readouts at Cursor */}
          <div className="hidden md:flex items-center gap-2 text-[10px] text-zinc-400">
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
                BB: [${formatPrice(activeCandle.bbUpper)} / ${formatPrice(activeCandle.bbLower ?? 0)}]
              </span>
            )}
          </div>
        </div>
      )}

      {/* Primary SVG Chart Plot Area */}
      <svg
        width={dimensions.width}
        height={dimensions.height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full h-full cursor-crosshair"
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
        </defs>

        {/* Horizontal Price Grid Lines & Labels */}
        {priceGridTicks.map((price, idx) => {
          const y = getY(price);
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={dimensions.width - padding.right}
                y2={y}
                stroke="#27272a"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={dimensions.width - padding.right + 8}
                y={y + 3}
                fill="#71717a"
                fontSize={10}
                fontFamily="monospace"
              >
                ${formatPrice(price)}
              </text>
            </g>
          );
        })}

        {/* Vertical Time Grid Lines & Labels */}
        {timeGridTicks.map((tick, idx) => {
          const x = getX(tick.index);
          return (
            <g key={idx}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={dimensions.height - padding.bottom}
                stroke="#27272a"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={x}
                y={dimensions.height - 10}
                fill="#71717a"
                fontSize={9}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {new Date(tick.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </text>
            </g>
          );
        })}

        {/* Bollinger Bands Shaded Area & Lines */}
        {visibleIndicators.bollingerBands && bbAreaPath && (
          <path d={bbAreaPath} fill="url(#bbBandGradient)" />
        )}
        {visibleIndicators.bollingerBands && (
          <>
            <path
              d={buildLinePath((c) => c.bbUpper)}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.7}
            />
            <path
              d={buildLinePath((c) => c.bbMiddle)}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="1 2"
              opacity={0.5}
            />
            <path
              d={buildLinePath((c) => c.bbLower)}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.7}
            />
          </>
        )}

        {/* Technical Support Level (Dashed Horizontal Line) */}
        {visibleIndicators.support && supportLevel && supportLevel > 0 && (
          <g>
            <line
              x1={padding.left}
              y1={getY(supportLevel)}
              x2={dimensions.width - padding.right}
              y2={getY(supportLevel)}
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <rect
              x={dimensions.width - padding.right + 2}
              y={getY(supportLevel) - 8}
              width={58}
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

        {/* Technical Resistance Level (Dashed Horizontal Line) */}
        {visibleIndicators.resistance && resistanceLevel && resistanceLevel > 0 && (
          <g>
            <line
              x1={padding.left}
              y1={getY(resistanceLevel)}
              x2={dimensions.width - padding.right}
              y2={getY(resistanceLevel)}
              stroke="#f43f5e"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <rect
              x={dimensions.width - padding.right + 2}
              y={getY(resistanceLevel) - 8}
              width={58}
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

        {/* AREA CHART Rendering */}
        {chartType === 'AREA' && (
          <>
            {areaChartPath && <path d={areaChartPath} />}
            <path
              d={buildLinePath((c) => c.close)}
              fill="none"
              stroke="#10b981"
              strokeWidth={2}
            />
          </>
        )}

        {/* LINE CHART Rendering */}
        {chartType === 'LINE' && (
          <path
            d={buildLinePath((c) => c.close)}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
          />
        )}

        {/* OHLC BAR CHART Rendering */}
        {chartType === 'OHLC' &&
          candles.map((c, i) => {
            const x = getX(i);
            const yHigh = getY(c.high);
            const yLow = getY(c.low);
            const yOpen = getY(c.open);
            const yClose = getY(c.close);
            const color = c.isBullish ? '#10b981' : '#f43f5e';
            const tickWidth = Math.max(3, candleWidth * 0.45);

            return (
              <g key={i}>
                {/* Vertical Spine from High to Low */}
                <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1.5} />
                {/* Left Notch for Open */}
                <line x1={x - tickWidth} y1={yOpen} x2={x} y2={yOpen} stroke={color} strokeWidth={1.5} />
                {/* Right Notch for Close */}
                <line x1={x} y1={yClose} x2={x + tickWidth} y2={yClose} stroke={color} strokeWidth={1.5} />
              </g>
            );
          })}

        {/* CANDLESTICK & HEIKIN ASHI Rendering */}
        {(chartType === 'CANDLESTICK' || chartType === 'HEIKIN_ASHI') &&
          candles.map((c, i) => {
            const x = getX(i);
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
                {/* Upper and Lower Wicks */}
                <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1.2} />
                {/* Candle Body */}
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
        {visibleIndicators.ema20 && (
          <path
            d={buildLinePath((c) => c.ema20)}
            fill="none"
            stroke="#06b6d4"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        )}
        {visibleIndicators.ema50 && (
          <path
            d={buildLinePath((c) => c.ema50)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        )}
        {visibleIndicators.ema200 && (
          <path
            d={buildLinePath((c) => c.ema200)}
            fill="none"
            stroke="#a855f7"
            strokeWidth={2}
          />
        )}
        {visibleIndicators.sma20 && (
          <path
            d={buildLinePath((c) => c.sma20)}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.5}
          />
        )}
        {visibleIndicators.sma50 && (
          <path
            d={buildLinePath((c) => c.sma50)}
            fill="none"
            stroke="#6366f1"
            strokeWidth={1.5}
          />
        )}
        {visibleIndicators.sma200 && (
          <path
            d={buildLinePath((c) => c.sma200)}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth={2}
          />
        )}

        {/* Interactive Crosshair (Cursor Tracker) */}
        {showCrosshair && mousePos && (
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
              width={60}
              height={18}
              rx={3}
              fill="#27272a"
              stroke="#3f3f46"
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
            {hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < candles.length && (
              <g>
                <rect
                  x={getX(hoveredIndex) - 28}
                  y={dimensions.height - padding.bottom + 2}
                  width={56}
                  height={18}
                  rx={3}
                  fill="#27272a"
                  stroke="#3f3f46"
                />
                <text
                  x={getX(hoveredIndex)}
                  y={dimensions.height - padding.bottom + 14}
                  fill="#f4f4f5"
                  fontSize={9}
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {new Date(candles[hoveredIndex].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </text>
              </g>
            )}
          </g>
        )}
      </svg>
    </div>
  );
};
