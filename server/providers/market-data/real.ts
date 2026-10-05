import {
  AssetClass,
  Candle,
  MarketPrice,
  SymbolInfo,
  Timeframe,
  TIMEFRAMES,
} from '../../types/index.ts';
import { MarketDataProvider, CandleQueryOptions, MarketDataProviderError } from './types.ts';
import { normalizeSymbol, CandleValidator } from './normalization.ts';

export class RealMarketDataProvider implements MarketDataProvider {
  public name = 'External Market Data Provider';
  public isDemo = false;
  public mode = 'REAL' as const;

  private apiKey: string;
  private apiUrl: string;
  private providerType: string;

  constructor() {
    this.apiKey = process.env.MARKET_DATA_API_KEY || '';
    this.apiUrl = process.env.MARKET_DATA_API_URL || 'https://api.twelvedata.com';
    this.providerType = (process.env.MARKET_DATA_PROVIDER || 'twelvedata').toLowerCase();
  }

  private hasValidCredentials(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 3 && this.apiKey !== 'MY_MARKET_DATA_API_KEY');
  }

  private mapTimeframeToProvider(timeframe: Timeframe): string {
    switch (timeframe) {
      case 'M1': return '1min';
      case 'M5': return '5min';
      case 'M15': return '15min';
      case 'M30': return '30min';
      case 'H1': return '1h';
      case 'H4': return '4h';
      case 'D1': return '1day';
      case 'W1': return '1week';
      default: return '1h';
    }
  }

  private async fetchWithRetry(url: string, maxRetries = 2): Promise<any> {
    let attempt = 0;
    let delay = 500;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          },
        });
        clearTimeout(timeout);

        if (response.status === 429) {
          throw new MarketDataProviderError(
            'Market data provider rate limit reached.',
            this.providerType,
            429,
            false
          );
        }

        if (response.status === 401 || response.status === 403) {
          throw new MarketDataProviderError(
            'Authentication failed with market data provider. Invalid or expired API key.',
            this.providerType,
            response.status,
            false
          );
        }

        if (response.status === 404) {
          throw new MarketDataProviderError(
            'Requested market data resource not found.',
            this.providerType,
            404,
            false
          );
        }

        if (response.status >= 500 && attempt <= maxRetries) {
          // Transient server error: retry with exponential backoff
          await new Promise((res) => setTimeout(res, delay));
          delay *= 2;
          continue;
        }

        if (!response.ok) {
          throw new MarketDataProviderError(
            `Market data provider returned HTTP ${response.status}`,
            this.providerType,
            response.status,
            false
          );
        }

        const data = await response.json();
        return data;
      } catch (err: any) {
        if (err instanceof MarketDataProviderError) {
          throw err;
        }

        const isNetworkOrTimeout = err.name === 'AbortError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
        if (isNetworkOrTimeout && attempt <= maxRetries) {
          await new Promise((res) => setTimeout(res, delay));
          delay *= 2;
          continue;
        }

        throw new MarketDataProviderError(
          isNetworkOrTimeout ? 'Network timeout connecting to market data provider.' : err.message,
          this.providerType,
          500,
          isNetworkOrTimeout
        );
      }
    }
  }

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
      source: 'REAL',
    };
  }

  public async getLatestPrice(symbol: string): Promise<MarketPrice> {
    const sym = normalizeSymbol(symbol);

    if (!this.hasValidCredentials()) {
      throw new MarketDataProviderError(
        'REAL MARKET DATA REQUIRES API CREDENTIALS. Please configure MARKET_DATA_API_KEY in environment variables.',
        this.providerType,
        401,
        false
      );
    }

    try {
      // Build TwelveData quote endpoint URL
      const url = `${this.apiUrl}/quote?symbol=${encodeURIComponent(sym)}&apikey=${encodeURIComponent(this.apiKey)}`;
      const data = await this.fetchWithRetry(url);

      if (data.status === 'error' || !data.close) {
        throw new MarketDataProviderError(
          data.message || 'Failed to retrieve quote from provider',
          this.providerType,
          400,
          false
        );
      }

      const price = parseFloat(data.close);
      const isJPY = sym.includes('JPY') || sym === 'XAUUSD';
      const decimals = isJPY ? 2 : 4;

      return {
        symbol: sym,
        pair: sym,
        price: Number(price.toFixed(decimals)),
        bid: data.bid ? Number(parseFloat(data.bid).toFixed(decimals)) : undefined,
        ask: data.ask ? Number(parseFloat(data.ask).toFixed(decimals)) : undefined,
        change24h: data.percent_change ? Number(parseFloat(data.percent_change).toFixed(2)) : 0,
        high24h: data.high ? Number(parseFloat(data.high).toFixed(decimals)) : price,
        low24h: data.low ? Number(parseFloat(data.low).toFixed(decimals)) : price,
        timestamp: data.timestamp ? data.timestamp * 1000 : Date.now(),
        source: 'REAL',
        status: 'LIVE',
      };
    } catch (err: any) {
      console.warn(`[MarketData Real Provider] getLatestPrice failed for ${sym}:`, err.message);
      throw err;
    }
  }

  public async getCandles(
    symbol: string,
    timeframe: Timeframe = 'H1',
    options?: CandleQueryOptions
  ): Promise<Candle[]> {
    const sym = normalizeSymbol(symbol);

    if (!this.hasValidCredentials()) {
      throw new MarketDataProviderError(
        'REAL MARKET DATA REQUIRES API CREDENTIALS. Please configure MARKET_DATA_API_KEY in environment variables.',
        this.providerType,
        401,
        false
      );
    }

    const interval = this.mapTimeframeToProvider(timeframe);
    const outputSize = Math.max(30, Math.min(options?.limit ?? 300, 1000));

    const url = `${this.apiUrl}/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=${outputSize}&apikey=${encodeURIComponent(this.apiKey)}`;
    const data = await this.fetchWithRetry(url);

    if (data.status === 'error' || !Array.isArray(data.values)) {
      throw new MarketDataProviderError(
        data.message || 'No candle data returned from external provider',
        this.providerType,
        400,
        false
      );
    }

    // TwelveData returns candles newest first; parse into ascending chronological order
    const rawCandles = data.values.map((v: any) => ({
      symbol: sym,
      timeframe,
      timestamp: new Date(v.datetime).getTime(),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || '0'),
      source: 'REAL',
      isClosed: true,
    })).sort((a: any, b: any) => a.timestamp - b.timestamp);

    const { validCandles } = CandleValidator.validateBatch(rawCandles);
    return validCandles;
  }
}
