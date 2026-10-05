export * from './types.ts';
export * from './normalization.ts';
export * from './demo.ts';
export * from './real.ts';
export * from './twelve-data.ts';
export * from './disabled.ts';
export * from './factory.ts';

import { MarketDataProviderFactory } from './factory.ts';

// Convenience accessor for default singleton provider
export const defaultMarketDataProvider = {
  get name() {
    return MarketDataProviderFactory.getProvider().name;
  },
  get isDemo() {
    return MarketDataProviderFactory.getProvider().isDemo;
  },
  get mode() {
    return MarketDataProviderFactory.getProvider().mode;
  },
  getCandles: (symbol: string, timeframe: any = 'H1', optionsOrLimit?: any) => {
    const opts = typeof optionsOrLimit === 'number' ? { limit: optionsOrLimit } : optionsOrLimit;
    return MarketDataProviderFactory.getProvider().getCandles(symbol, timeframe, opts);
  },
  getLatestPrice: (symbol: string) => {
    return MarketDataProviderFactory.getProvider().getLatestPrice(symbol);
  },
  getSymbolInfo: (symbol: string) => {
    return MarketDataProviderFactory.getProvider().getSymbolInfo(symbol);
  },
};
