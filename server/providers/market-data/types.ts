import { Candle, MarketPrice, SymbolInfo, Timeframe } from '../../types/index.ts';

export type ProviderMode = 'REAL' | 'DEMO' | 'DISABLED';

export interface CandleQueryOptions {
  limit?: number;
  startTime?: Date;
  endTime?: Date;
}

export interface MarketDataProvider {
  name: string;
  isDemo: boolean;
  mode: ProviderMode;

  getCandles(
    symbol: string,
    timeframe: Timeframe,
    options?: CandleQueryOptions
  ): Promise<Candle[]>;

  getLatestPrice(
    symbol: string
  ): Promise<MarketPrice>;

  getSymbolInfo(
    symbol: string
  ): Promise<SymbolInfo>;
}

export type MarketDataErrorCode =
  | 'TWELVEDATA_AUTH_ERROR'
  | 'TWELVEDATA_RATE_LIMIT'
  | 'TWELVEDATA_NO_DATA'
  | 'TWELVEDATA_INVALID_RESPONSE'
  | 'TWELVEDATA_NETWORK_ERROR'
  | 'TWELVEDATA_SYMBOL_ERROR'
  | 'TWELVEDATA_QUOTA_EXCEEDED'
  | 'UNKNOWN_ERROR';

export class MarketDataProviderError extends Error {
  public statusCode?: number;
  public isRetryable: boolean;
  public providerName: string;
  public code?: MarketDataErrorCode;

  constructor(
    message: string,
    providerName: string,
    statusCode?: number,
    isRetryable: boolean = false,
    code?: MarketDataErrorCode
  ) {
    super(message);
    this.name = 'MarketDataProviderError';
    this.providerName = providerName;
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
    this.code = code;
  }
}
