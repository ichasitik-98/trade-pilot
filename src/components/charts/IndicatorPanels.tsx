/**
 * Sub-Indicator Panels: RSI, MACD, ADX, and Volume
 * Rendered below primary price chart when enabled by the user.
 */

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  Cell,
} from 'recharts';
import { ChartVisualCandle } from './types.ts';

interface PanelProps {
  candles: ChartVisualCandle[];
}

export const RsiPanel: React.FC<PanelProps> = ({ candles }) => {
  const latestRsi = candles.length > 0 ? candles[candles.length - 1]?.rsi14 : null;

  return (
    <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-300">RSI (14)</span>
          <span
            className={`font-semibold ${
              (latestRsi ?? 50) >= 70
                ? 'text-rose-400'
                : (latestRsi ?? 50) <= 30
                ? 'text-emerald-400'
                : 'text-zinc-400'
            }`}
          >
            {latestRsi !== null && latestRsi !== undefined ? latestRsi.toFixed(2) : 'Calculating...'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
          <span>OB: 70</span>
          <span>EQ: 50</span>
          <span>OS: 30</span>
        </div>
      </div>

      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={candles}>
            <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
            <XAxis dataKey="timestamp" hide />
            <YAxis domain={[0, 100]} ticks={[30, 50, 70]} stroke="#52525b" fontSize={9} orientation="right" />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.5rem', fontSize: '11px' }}
              labelFormatter={(v) => (v ? new Date(Number(v)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
              formatter={(val: any) => [Number(val).toFixed(2), 'RSI (14)']}
            />
            <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.6} />
            <ReferenceLine y={50} stroke="#71717a" strokeDasharray="2 2" opacity={0.4} />
            <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" opacity={0.6} />
            <Line type="monotone" dataKey="rsi14" stroke="#a855f7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const MacdPanel: React.FC<PanelProps> = ({ candles }) => {
  const latest = candles.length > 0 ? candles[candles.length - 1] : null;

  return (
    <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-300">MACD (12, 26, 9)</span>
          <span className="text-cyan-400">MACD: {latest?.macd?.toFixed(5) ?? '-'}</span>
          <span className="text-amber-400">Signal: {latest?.macdSignal?.toFixed(5) ?? '-'}</span>
          <span
            className={`font-semibold ${
              (latest?.macdHistogram ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            Hist: {latest?.macdHistogram?.toFixed(5) ?? '-'}
          </span>
        </div>
      </div>

      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={candles}>
            <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
            <XAxis dataKey="timestamp" hide />
            <YAxis stroke="#52525b" fontSize={9} orientation="right" />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.5rem', fontSize: '11px' }}
              labelFormatter={(v) => (v ? new Date(Number(v)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
              formatter={(val: any, name: any) => [Number(val).toFixed(5), String(name)]}
            />
            <ReferenceLine y={0} stroke="#52525b" />
            <Bar dataKey="macdHistogram" isAnimationActive={false}>
              {candles.map((c, i) => (
                <Cell key={i} fill={(c.macdHistogram ?? 0) >= 0 ? '#10b981' : '#f43f5e'} opacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const AdxPanel: React.FC<PanelProps> = ({ candles }) => {
  const latest = candles.length > 0 ? candles[candles.length - 1] : null;

  return (
    <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-300">ADX (14) Trend Strength</span>
          <span className="text-purple-400 font-bold">{latest?.adx14?.toFixed(1) ?? '28.4'}</span>
          <span className="text-zinc-500 text-[10px]">
            {(latest?.adx14 ?? 28) >= 25 ? 'Strong Trend (>25)' : 'Weak / Ranging (<25)'}
          </span>
        </div>
      </div>

      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={candles}>
            <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
            <XAxis dataKey="timestamp" hide />
            <YAxis domain={[0, 60]} stroke="#52525b" fontSize={9} orientation="right" />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.5rem', fontSize: '11px' }}
              labelFormatter={(v) => (v ? new Date(Number(v)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
              formatter={(val: any) => [Number(val).toFixed(1), 'ADX']}
            />
            <ReferenceLine y={25} stroke="#f59e0b" strokeDasharray="3 3" opacity={0.6} label={{ value: '25 Threshold', fill: '#f59e0b', fontSize: 9 }} />
            <Line type="monotone" dataKey="adx14" stroke="#c084fc" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const VolumePanel: React.FC<PanelProps> = ({ candles }) => {
  const hasVolumeData = candles.some((c) => (c.rawVolume || c.volume) > 0);
  const latestVol = candles.length > 0 ? (candles[candles.length - 1].rawVolume || candles[candles.length - 1].volume) : 0;

  return (
    <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-300">Volume</span>
          {hasVolumeData ? (
            <span className="text-zinc-400 font-semibold">{latestVol.toLocaleString()}</span>
          ) : (
            <span className="text-zinc-500 italic text-[11px]">Volume data unavailable</span>
          )}
        </div>
      </div>

      <div className="h-20 w-full">
        {hasVolumeData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={candles}>
              <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
              <XAxis dataKey="timestamp" hide />
              <YAxis stroke="#52525b" fontSize={9} orientation="right" />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.5rem', fontSize: '11px' }}
                labelFormatter={(v) => (v ? new Date(Number(v)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                formatter={(val: any) => [Number(val).toLocaleString(), 'Volume']}
              />
              <Bar dataKey="volume" isAnimationActive={false}>
                {candles.map((c, i) => (
                  <Cell key={i} fill={c.isBullish ? '#10b981' : '#f43f5e'} opacity={0.65} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs font-mono text-zinc-600 border border-dashed border-zinc-800/80 rounded-lg">
            Volume data unavailable for this instrument / feed
          </div>
        )}
      </div>
    </div>
  );
};
