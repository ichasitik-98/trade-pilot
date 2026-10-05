import {
  Candle,
  MarketPrice,
  SymbolInfo,
  Timeframe,
} from '../../types/index.ts';
import { MarketDataProvider, CandleQueryOptions, MarketDataProviderError } from './types.ts';
import { normalizeSymbol } from './normalization.ts';

export class DisabledMarketDataProvider implements MarketDataProvider {
  public name = 'Disabled Market Data Provider';
  public isDemo = false;
  public mode = 'DISABLED' as const;

  public async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const sym = normalizeSymbol(symbol);
    return {
      symbol: sym,
      displayName: sym,
      assetClass: 'FOREX',
      baseCurrency: sym.substring(0, 3),
      quoteCurrency: sym.substring(3),
      pipSize: 0.0001,
      contractSize: 100000,
      pricePrecision: 4,
      source: 'DISABLED',
    };
  }

  public async getLatestPrice(symbol: string): Promise<MarketPrice> {
    throw new MarketDataProviderError(
      'Market data is currently DISABLED by configuration.',
      'DISABLED',
      503,
      false
    );
  }

  public async getCandles(
    symbol: string,
    timeframe: Timeframe = 'H1',
    options?: CandleQueryOptions
  ): Promise<Candle[]> {
    throw new MarketDataProviderError(
      'Market data is currently DISABLED by configuration.',
      'DISABLED',
      503,
      false
    );
  }
}
