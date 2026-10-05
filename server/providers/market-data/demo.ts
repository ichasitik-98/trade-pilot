import {
  AssetClass,
  Candle,
  MarketPrice,
  SymbolInfo,
  Timeframe,
  TIMEFRAMES,
} from '../../types/index.ts';
import { MarketDataProvider, CandleQueryOptions } from './types.ts';
import { normalizeSymbol } from './normalization.ts';

export const DEMO_BASE_PRICES: Record<string, number> = {
  EURUSD: 1.0850,
  GBPUSD: 1.2880,
  USDJPY: 154.20,
  USDCHF: 0.8950,
  USDCAD: 1.3650,
  AUDUSD: 0.6550,
  NZDUSD: 0.5980,
  EURJPY: 167.30,
  GBPJPY: 198.60,
  XAUUSD: 2360.50,
  BTCUSD: 64200.0,
};

export class DemoMarketDataProvider implements MarketDataProvider {
  public name = 'TradePilot Seeded Demo Provider';
  public isDemo = true;
  public mode = 'DEMO' as const;

  public async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const sym = normalizeSymbol(symbol);
    const isJPY = sym.includes('JPY');
    const isCrypto = sym.startsWith('BTC');
    const isMetal = sym === 'XAUUSD';

    let pipSize = 0.0001;
    let pricePrecision = 4;
    let assetClass: AssetClass = 'FOREX';
    let baseCurrency = sym.substring(0, 3);
    let quoteCurrency = sym.substring(3);
    let contractSize = 100000;

    if (isJPY) {
      pipSize = 0.01;
      pricePrecision = 2;
    }
    if (isMetal) {
      pipSize = 0.01;
      pricePrecision = 2;
      assetClass = 'METAL';
      baseCurrency = 'XAU';
      quoteCurrency = 'USD';
      contractSize = 100;
    }
    if (isCrypto) {
      pipSize = 1.0;
      pricePrecision = 2;
      assetClass = 'CRYPTO';
      baseCurrency = 'BTC';
      quoteCurrency = 'USD';
      contractSize = 1;
    }

    return {
      symbol: sym,
      displayName: `${baseCurrency}/${quoteCurrency}`,
      assetClass,
      baseCurrency,
      quoteCurrency,
      pipSize,
      contractSize,
      pricePrecision,
      source: 'DEMO',
    };
  }

  public async getLatestPrice(symbol: string): Promise<MarketPrice> {
    const sym = normalizeSymbol(symbol);
    const base = DEMO_BASE_PRICES[sym] || 1.0850;
    const now = Date.now();

    // Deterministic periodic oscillation based on symbol characters and time
    const seed = Math.sin((now / (1000 * 60 * 15)) + sym.charCodeAt(0)) * 0.0015;
    const isJPY = sym.includes('JPY') || sym === 'XAUUSD' || sym.startsWith('BTC');
    const decimals = isJPY ? 2 : 4;

    const price = Number((base * (1 + seed)).toFixed(decimals));
    const change24h = Number((seed * 100).toFixed(2));
    const high24h = Number((price * 1.008).toFixed(decimals));
    const low24h = Number((price * 0.992).toFixed(decimals));

    return {
      symbol: sym,
      pair: sym,
      price,
      bid: Number((price - (isJPY ? 0.02 : 0.00015)).toFixed(decimals)),
      ask: Number((price + (isJPY ? 0.02 : 0.00015)).toFixed(decimals)),
      change24h,
      high24h,
      low24h,
      timestamp: now,
      source: 'DEMO',
      status: 'DEMO',
    };
  }

  public async getCandles(
    symbol: string,
    timeframe: Timeframe = 'H1',
    options?: CandleQueryOptions
  ): Promise<Candle[]> {
    const sym = normalizeSymbol(symbol);
    const base = DEMO_BASE_PRICES[sym] || 1.0850;
    const isJPY = sym.includes('JPY') || sym === 'XAUUSD' || sym.startsWith('BTC');
    const decimals = isJPY ? 2 : 4;

    const limit = Math.max(10, Math.min(options?.limit ?? 300, 1000));
    const durationSec = TIMEFRAMES[timeframe]?.durationSeconds ?? 3600;
    const durationMs = durationSec * 1000;

    const now = Date.now();
    // Align to open time of current forming candle
    const currentOpenTime = Math.floor(now / durationMs) * durationMs;

    const candles: Candle[] = [];
    const symSeed = sym.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    for (let i = limit - 1; i >= 0; i--) {
      const openTime = currentOpenTime - i * durationMs;
      const stepIdx = Math.floor(openTime / durationMs);

      // Deterministic synthetic price path
      const trendComponent = Math.sin(stepIdx * 0.04 + symSeed) * 0.012;
      const noise = Math.cos(stepIdx * 0.2 + symSeed) * 0.004;
      const micro = Math.sin(stepIdx * 1.1) * 0.002;
      const centerPrice = base * (1 + trendComponent + noise + micro);

      const open = Number(centerPrice.toFixed(decimals));
      const delta = (Math.sin(stepIdx * 0.7) * 0.003) * base;
      const close = Number(Math.max(0.0001, (centerPrice + delta)).toFixed(decimals));

      const wickUp = Math.abs(Math.cos(stepIdx * 1.3)) * (base * 0.0025);
      const wickDown = Math.abs(Math.sin(stepIdx * 1.7)) * (base * 0.0025);

      const high = Number((Math.max(open, close) + wickUp).toFixed(decimals));
      const low = Number(Math.max(0.0001, Math.min(open, close) - wickDown).toFixed(decimals));
      const volume = Math.floor(800 + Math.abs(Math.sin(stepIdx * 0.5)) * 2500);

      candles.push({
        symbol: sym,
        timeframe,
        timestamp: openTime,
        open,
        high,
        low,
        close,
        volume,
        source: 'DEMO',
        isClosed: i > 0, // i === 0 is the current unfinished candle
      });
    }

    return candles;
  }
}
