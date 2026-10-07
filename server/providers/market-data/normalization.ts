import {
  Candle,
  Timeframe,
  TIMEFRAMES,
  TradingSession,
} from '../../types/index.ts';

// Standard supported instruments
export const SUPPORTED_SYMBOLS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'USDCAD',
  'AUDUSD',
  'NZDUSD',
  'EURJPY',
  'GBPJPY',
  'XAUUSD',
  'BTCUSD',
] as const;

/**
 * Normalizes any external provider symbol representation into the canonical internal symbol.
 * Examples:
 * EUR/USD -> EURUSD
 * EUR_USD -> EURUSD
 * EURUSD=X -> EURUSD
 * BTC/USDT -> BTCUSD
 * XAU/USD -> XAUUSD
 */
export function normalizeSymbol(raw: string): string {
  if (!raw) return 'EURUSD';
  let cleaned = raw.toUpperCase().trim();

  // Strip slashes, underscores, dashes, prefixes, and suffixes
  cleaned = cleaned.replace(/[\/\_\-\.]/g, '');
  cleaned = cleaned.replace(/=X$/i, '');
  cleaned = cleaned.replace(/:.*$/i, ''); // e.g. FX:EURUSD -> EURUSD

  // Map USDT or USD variants
  if (cleaned.endsWith('USDT')) {
    cleaned = cleaned.substring(0, cleaned.length - 4) + 'USD';
  }

  // Common aliases
  if (cleaned === 'GOLD') return 'XAUUSD';
  if (cleaned === 'BTC') return 'BTCUSD';

  return cleaned;
}

export function isValidSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  const normalized = normalizeSymbol(symbol);
  return normalized.length >= 3 && /^[A-Z0-9]+$/.test(normalized);
}

export function parseTimeframe(input: string): Timeframe {
  const upper = (input || 'H1').toUpperCase().trim();
  if (upper in TIMEFRAMES) {
    return upper as Timeframe;
  }
  // Fallbacks
  if (upper === '1M' || upper === '1MIN') return 'M1';
  if (upper === '5M' || upper === '5MIN') return 'M5';
  if (upper === '15M' || upper === '15MIN') return 'M15';
  if (upper === '30M' || upper === '30MIN') return 'M30';
  if (upper === '1H' || upper === '60M') return 'H1';
  if (upper === '4H' || upper === '240M') return 'H4';
  if (upper === '1D' || upper === 'D') return 'D1';
  if (upper === '1W' || upper === 'W') return 'W1';

  return 'H1';
}

export class CandleValidator {
  public static validate(candle: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!candle || typeof candle !== 'object') {
      return { valid: false, errors: ['Candle must be an object'] };
    }

    const { symbol, timeframe, timestamp, open, high, low, close } = candle;

    if (!symbol || typeof symbol !== 'string') {
      errors.push('Missing or invalid symbol');
    }

    if (!timeframe || !(timeframe in TIMEFRAMES)) {
      errors.push(`Invalid timeframe: ${timeframe}`);
    }

    const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (!Number.isFinite(ts) || ts <= 0 || Number.isNaN(ts)) {
      errors.push(`Invalid timestamp: ${timestamp}`);
    }

    const o = Number(open);
    const h = Number(high);
    const l = Number(low);
    const c = Number(close);

    if (!Number.isFinite(o) || o <= 0) errors.push(`open must be > 0 (got ${o})`);
    if (!Number.isFinite(h) || h <= 0) errors.push(`high must be > 0 (got ${h})`);
    if (!Number.isFinite(l) || l <= 0) errors.push(`low must be > 0 (got ${l})`);
    if (!Number.isFinite(c) || c <= 0) errors.push(`close must be > 0 (got ${c})`);

    if (h < o) errors.push(`high (${h}) cannot be less than open (${o})`);
    if (h < c) errors.push(`high (${h}) cannot be less than close (${c})`);
    if (h < l) errors.push(`high (${h}) cannot be less than low (${l})`);

    if (l > o) errors.push(`low (${l}) cannot be greater than open (${o})`);
    if (l > c) errors.push(`low (${l}) cannot be greater than close (${c})`);
    if (l > h) errors.push(`low (${l}) cannot be greater than high (${h})`);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public static validateBatch(candles: any[]): {
    validCandles: Candle[];
    invalidCount: number;
    errors: string[];
  } {
    if (!Array.isArray(candles)) {
      return { validCandles: [], invalidCount: 0, errors: ['Input is not an array'] };
    }

    const validCandles: Candle[] = [];
    const allErrors: string[] = [];
    let invalidCount = 0;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const check = CandleValidator.validate(c);
      if (check.valid) {
        const ts = typeof c.timestamp === 'number' ? c.timestamp : new Date(c.timestamp).getTime();
        validCandles.push({
          symbol: normalizeSymbol(c.symbol),
          timeframe: parseTimeframe(c.timeframe),
          timestamp: ts,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume ?? 0),
          source: c.source || 'TWELVEDATA',
          isClosed: c.isClosed !== false,
        });
      } else {
        invalidCount++;
        allErrors.push(`Candle [${i}]: ${check.errors.join('; ')}`);
      }
    }

    return {
      validCandles,
      invalidCount,
      errors: allErrors,
    };
  }
}

/**
 * Determines trading session based on UTC timestamp
 * - ASIA: 00:00 - 08:00 UTC
 * - LONDON: 08:00 - 16:00 UTC
 * - NEW_YORK: 13:00 - 21:00 UTC
 * - OVERLAP: 13:00 - 16:00 UTC (London + NY overlap)
 * - OTHER: 21:00 - 24:00 UTC
 */
export function getTradingSession(timestamp: number | Date): TradingSession {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const hour = date.getUTCHours();

  if (hour >= 13 && hour < 16) {
    return 'OVERLAP';
  }
  if (hour >= 8 && hour < 16) {
    return 'LONDON';
  }
  if (hour >= 13 && hour < 21) {
    return 'NEW_YORK';
  }
  if (hour >= 0 && hour < 8) {
    return 'ASIA';
  }
  return 'OTHER';
}
