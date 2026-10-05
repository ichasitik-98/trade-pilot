/**
 * Twelve Data Real Market Data Engine Provider
 * TradePilot Decision-Support Platform
 * Location: server/lib/market-data/twelve-data-provider.ts
 *
 * ARCHITECTURAL REQUIREMENTS:
 * 1. Strict real market data engine connecting to Twelve Data API.
 * 2. Conforms to canonical MarketDataProvider interface.
 * 3. Handles internal-to-provider symbol and timeframe mapping.
 * 4. Normalizes raw Twelve Data payload into canonical UTC-normalized candles.
 * 5. NEVER exposes MARKET_DATA_API_KEY to browser, client responses, or logs.
 * 6. Never falls back to DEMO when mode is REAL.
 * 7. Requests H4 (4h) timeframe directly without artificial synthetic aggregation.
 */

import {
  AssetClass,
  Candle,
  MarketPrice,
  SymbolInfo,
  Timeframe,
  TIMEFRAMES,
} from '../../types/index.ts';
import {
  MarketDataProvider,
  CandleQueryOptions,
  MarketDataProviderError,
  MarketDataErrorCode,
} from '../../providers/market-data/types.ts';
import { normalizeSymbol, CandleValidator } from '../../providers/market-data/normalization.ts';
import { parseToUtcTimestamp, toUtcIsoString } from '../../utils/timezone.ts';
import { db } from '../../db/storage.ts';

export class TwelveDataProvider implements MarketDataProvider {
  public readonly name = 'Twelve Data';
  public readonly isDemo = false;
  public readonly mode = 'REAL' as const;

  private apiKey: string;
  private apiUrl: string;
  private appTimezone: string;

  // Fallback canonical mapping if DB is initializing
  public static readonly CANONICAL_SYMBOL_MAP: Record<string, string> = {
    EURUSD: 'EUR/USD',
    GBPUSD: 'GBP/USD',
    USDJPY: 'USD/JPY',
    USDCHF: 'USD/CHF',
    USDCAD: 'USD/CAD',
    AUDUSD: 'AUD/USD',
    NZDUSD: 'NZD/USD',
    EURJPY: 'EUR/JPY',
    GBPJPY: 'GBP/JPY',
    XAUUSD: 'XAU/USD',
    BTCUSD: 'BTC/USD',
  };

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = (apiKey ?? process.env.MARKET_DATA_API_KEY ?? '').trim();
    const envUrl = process.env.MARKET_DATA_API_URL;
    const defaultApiUrl = envUrl && envUrl !== 'http://localhost' && envUrl.startsWith('http')
      ? envUrl
      : 'https://api.twelvedata.com';
    this.apiUrl = (apiUrl ?? defaultApiUrl).replace(/\/$/, '');
    this.appTimezone = process.env.APP_TIMEZONE || 'Asia/Jakarta';
  }

  /**
   * Safe credentials validation
   */
  public hasValidCredentials(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey.length > 0 &&
      this.apiKey !== 'MY_MARKET_DATA_API_KEY'
    );
  }

  /**
   * Redacts sensitive secrets from log strings and error messages
   */
  private redact(message: string): string {
    if (!message) return '';
    let sanitized = message;
    if (this.apiKey && this.apiKey.length > 3) {
      sanitized = sanitized.split(this.apiKey).join('[REDACTED_API_KEY]');
    }
    sanitized = sanitized.replace(/apikey=([^&]+)/gi, 'apikey=[REDACTED]');
    return sanitized;
  }

  /**
   * Internal timeframe to Twelve Data interval mapping
   * M1 -> 1min, M5 -> 5min, M15 -> 15min, M30 -> 30min,
   * H1 -> 1h, H4 -> 4h, D1 -> 1day, W1 -> 1week
   */
  public mapTimeframeToProvider(timeframe: Timeframe): string {
    switch (timeframe) {
      case 'M1': return '1min';
      case 'M5': return '5min';
      case 'M15': return '15min';
      case 'M30': return '30min';
      case 'H1': return '1h';
      case 'H4': return '4h'; // Explicitly requested directly from Twelve Data
      case 'D1': return '1day';
      case 'W1': return '1week';
      default: return '1h';
    }
  }

  /**
   * Resolves internal symbol (e.g. EURUSD) to Twelve Data external symbol (e.g. EUR/USD)
   * Database-driven via ProviderSymbolMapping with canonical fallback.
   */
  public async resolveExternalSymbol(symbol: string): Promise<string> {
    const sym = normalizeSymbol(symbol);
    try {
      const dbMapping = await db.getProviderSymbolMapping('TWELVEDATA', sym);
      if (dbMapping) return dbMapping;
    } catch {
      // Storage might still be initializing, use canonical fallback
    }

    if (TwelveDataProvider.CANONICAL_SYMBOL_MAP[sym]) {
      return TwelveDataProvider.CANONICAL_SYMBOL_MAP[sym];
    }

    // Default 6-char currency pair format (e.g. USDNOK -> USD/NOK)
    if (sym.length === 6) {
      return `${sym.slice(0, 3)}/${sym.slice(3)}`;
    }

    return sym;
  }

  /**
   * Centralized HTTP fetcher with bounded retry, exponential backoff, and strict error classification
   */
  private async fetchFromTwelveData(
    endpoint: string,
    params: Record<string, string>,
    maxRetries = 2
  ): Promise<any> {
    if (!this.hasValidCredentials()) {
      throw new MarketDataProviderError(
        'Twelve Data API key is missing or not configured in environment variables.',
        this.name,
        401,
        false,
        'TWELVEDATA_AUTH_ERROR'
      );
    }

    const query = new URLSearchParams({
      ...params,
      apikey: this.apiKey,
    });

    const fullUrl = `${this.apiUrl}${endpoint}?${query.toString()}`;

    let attempt = 0;
    let delay = 500;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(fullUrl, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TradePilot-Engine/2.0',
          },
        });
        clearTimeout(timeout);

        // HTTP-level error handling
        if (response.status === 429) {
          throw new MarketDataProviderError(
            'Twelve Data rate limit reached (HTTP 429). Please slow down requests.',
            this.name,
            429,
            false,
            'TWELVEDATA_RATE_LIMIT'
          );
        }

        if (response.status === 401 || response.status === 403) {
          throw new MarketDataProviderError(
            'Twelve Data authentication failed (HTTP 401/403). Invalid or expired API credentials.',
            this.name,
            response.status,
            false,
            'TWELVEDATA_AUTH_ERROR'
          );
        }

        if (response.status === 404) {
          throw new MarketDataProviderError(
            'Twelve Data endpoint or symbol resource not found (HTTP 404).',
            this.name,
            404,
            false,
            'TWELVEDATA_NO_DATA'
          );
        }

        // Retry on 5xx server errors
        if (response.status >= 500 && attempt <= maxRetries) {
          await new Promise((res) => setTimeout(res, delay));
          delay *= 2;
          continue;
        }

        if (!response.ok) {
          throw new MarketDataProviderError(
            `Twelve Data returned HTTP ${response.status}`,
            this.name,
            response.status,
            false,
            'TWELVEDATA_NETWORK_ERROR'
          );
        }

        let data: any;
        try {
          data = await response.json();
        } catch (jsonErr: any) {
          throw new MarketDataProviderError(
            `Twelve Data returned invalid JSON: ${jsonErr.message}`,
            this.name,
            500,
            false,
            'TWELVEDATA_INVALID_RESPONSE'
          );
        }

        // Payload-level error classification per Twelve Data official schema
        if (data.status === 'error' || data.code) {
          const rawMsg = this.redact(data.message || data.error || 'Unknown Twelve Data error');
          const code = Number(data.code);

          // 1. Quota / Rate limit
          if (code === 429 || /rate limit|minute|credits|credit limit/i.test(rawMsg)) {
            const isQuota = /quota|plan limit|exceeded/i.test(rawMsg);
            throw new MarketDataProviderError(
              rawMsg,
              this.name,
              429,
              false,
              isQuota ? 'TWELVEDATA_QUOTA_EXCEEDED' : 'TWELVEDATA_RATE_LIMIT'
            );
          }

          // 2. Authentication
          if (code === 401 || code === 403 || /api key|unauthorized|forbidden|familiarity/i.test(rawMsg)) {
            throw new MarketDataProviderError(
              rawMsg,
              this.name,
              code || 401,
              false,
              'TWELVEDATA_AUTH_ERROR'
            );
          }

          // 3. Symbol not found / no data
          if (code === 404 || /not found|no data|cannot be found/i.test(rawMsg)) {
            throw new MarketDataProviderError(
              rawMsg,
              this.name,
              404,
              false,
              'TWELVEDATA_NO_DATA'
            );
          }

          // 4. Invalid symbol syntax
          if (/symbol|instrument|ticker/i.test(rawMsg)) {
            throw new MarketDataProviderError(
              rawMsg,
              this.name,
              400,
              false,
              'TWELVEDATA_SYMBOL_ERROR'
            );
          }

          // Generic invalid response error
          throw new MarketDataProviderError(
            rawMsg,
            this.name,
            code || 400,
            false,
            'TWELVEDATA_INVALID_RESPONSE'
          );
        }

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
          this.redact(isNetworkOrTimeout ? 'Network timeout connecting to Twelve Data.' : err.message),
          this.name,
          500,
          isNetworkOrTimeout,
          'TWELVEDATA_NETWORK_ERROR'
        );
      }
    }

    throw new MarketDataProviderError(
      `Failed to connect to Twelve Data after ${maxRetries} retries`,
      this.name,
      504,
      false,
      'TWELVEDATA_NETWORK_ERROR'
    );
  }

  /**
   * Fetches historical time series candles from Twelve Data
   */
  public async getCandles(
    symbol: string,
    timeframe: Timeframe = 'H1',
    options?: CandleQueryOptions
  ): Promise<Candle[]> {
    const sym = normalizeSymbol(symbol);
    const externalSymbol = await this.resolveExternalSymbol(sym);
    const interval = this.mapTimeframeToProvider(timeframe);

    // Twelve Data max limit is 5000 per request
    const limit = Math.max(10, Math.min(options?.limit ?? 300, 5000));

    const params: Record<string, string> = {
      symbol: externalSymbol,
      interval,
      outputsize: String(limit),
      timezone: 'UTC', // Enforce UTC normalization at the provider source
    };

    if (options?.startTime) {
      params.start_date = toUtcIsoString(options.startTime).replace('T', ' ').replace('.000Z', '');
    }
    if (options?.endTime) {
      params.end_date = toUtcIsoString(options.endTime).replace('T', ' ').replace('.000Z', '');
    }

    const data = await this.fetchFromTwelveData('/time_series', params);

    if (!Array.isArray(data.values) || data.values.length === 0) {
      throw new MarketDataProviderError(
        `Twelve Data returned no candle records for ${externalSymbol} [${timeframe}]`,
        this.name,
        404,
        false,
        'TWELVEDATA_NO_DATA'
      );
    }

    // Map raw records into canonical UTC-normalized candles
    const rawCandles: any[] = [];
    for (const v of data.values) {
      try {
        const utcTimestamp = parseToUtcTimestamp(v.datetime);
        const open = parseFloat(v.open);
        const high = parseFloat(v.high);
        const low = parseFloat(v.low);
        const close = parseFloat(v.close);
        const volume = parseFloat(v.volume || '0');

        rawCandles.push({
          symbol: sym,
          pair: sym,
          timeframe,
          timestamp: utcTimestamp,
          open,
          high,
          low,
          close,
          volume: isNaN(volume) ? 0 : volume,
          source: 'TWELVEDATA',
          isClosed: true,
        });
      } catch (parseErr: any) {
        // Skip malformed individual row
        console.warn(`[TwelveDataProvider] Skipping unparseable row for ${sym}:`, parseErr.message);
      }
    }

    // Sort ascending by timestamp chronologically
    rawCandles.sort((a, b) => a.timestamp - b.timestamp);

    // Validate batch
    const { validCandles, errors } = CandleValidator.validateBatch(rawCandles);

    if (validCandles.length === 0 && rawCandles.length > 0) {
      throw new MarketDataProviderError(
        `All Twelve Data candles failed validation: ${errors.slice(0, 3).join('; ')}`,
        this.name,
        422,
        false,
        'TWELVEDATA_INVALID_RESPONSE'
      );
    }

    return validCandles;
  }

  /**
   * Retrieves real-time quote for a symbol
   */
  public async getLatestPrice(symbol: string): Promise<MarketPrice> {
    const sym = normalizeSymbol(symbol);
    const externalSymbol = await this.resolveExternalSymbol(sym);

    const data = await this.fetchFromTwelveData('/quote', {
      symbol: externalSymbol,
    });

    if (!data.close) {
      throw new MarketDataProviderError(
        `Failed to retrieve current price for ${externalSymbol} from Twelve Data`,
        this.name,
        400,
        false,
        'TWELVEDATA_NO_DATA'
      );
    }

    const price = parseFloat(data.close);
    const isJPY = sym.includes('JPY') || sym === 'XAUUSD';
    const decimals = isJPY ? 2 : 4;

    const bid = data.bid ? Number(parseFloat(data.bid).toFixed(decimals)) : undefined;
    const ask = data.ask ? Number(parseFloat(data.ask).toFixed(decimals)) : undefined;
    const change24h = data.percent_change ? Number(parseFloat(data.percent_change).toFixed(2)) : 0;
    const high24h = data.high ? Number(parseFloat(data.high).toFixed(decimals)) : price;
    const low24h = data.low ? Number(parseFloat(data.low).toFixed(decimals)) : price;
    const timestamp = data.timestamp ? data.timestamp * 1000 : Date.now();

    return {
      symbol: sym,
      pair: sym,
      price: Number(price.toFixed(decimals)),
      bid,
      ask,
      change24h,
      high24h,
      low24h,
      timestamp,
      source: 'TWELVEDATA',
      status: 'LIVE',
    };
  }

  /**
   * Provides instrument specification metadata
   */
  public async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const sym = normalizeSymbol(symbol);

    // Attempt DB lookup first
    try {
      const dbInst = await db.getInstrumentBySymbol(sym);
      if (dbInst) {
        return {
          symbol: dbInst.symbol,
          displayName: dbInst.displayName,
          assetClass: dbInst.assetClass,
          baseCurrency: dbInst.baseCurrency,
          quoteCurrency: dbInst.quoteCurrency,
          pipSize: Number(dbInst.pipSize),
          contractSize: Number(dbInst.contractSize),
          pricePrecision: dbInst.pricePrecision,
          source: 'TWELVEDATA',
        };
      }
    } catch {
      // Fallback below
    }

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
      source: 'TWELVEDATA',
    };
  }
}

export default TwelveDataProvider;
