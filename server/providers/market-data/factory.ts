import { MarketDataProvider, ProviderMode } from './types.ts';
import { DemoMarketDataProvider } from './demo.ts';
import { TwelveDataProvider } from './twelve-data.ts';
import { DisabledMarketDataProvider } from './disabled.ts';

export class MarketDataProviderFactory {
  private static instance: MarketDataProvider | null = null;
  private static forcedMode: ProviderMode | null = null;

  public static getMode(): ProviderMode {
    if (this.forcedMode) return this.forcedMode;
    const envMode = (process.env.MARKET_DATA_MODE || 'REAL').toUpperCase();
    if (envMode === 'DEMO') return 'DEMO';
    if (envMode === 'DISABLED') return 'DISABLED';
    return 'REAL';
  }

  public static setMode(mode: ProviderMode): void {
    this.forcedMode = mode;
    this.instance = null; // Invalidate current instance
  }

  public static getProvider(): MarketDataProvider {
    if (this.instance) {
      return this.instance;
    }

    const mode = this.getMode();

    if (mode === 'DISABLED') {
      this.instance = new DisabledMarketDataProvider();
      return this.instance;
    }

    if (mode === 'REAL') {
      // In REAL mode, instantiate TwelveDataProvider.
      // Strict Architectural Rule: NEVER silently fall back to DEMO when mode is REAL.
      this.instance = new TwelveDataProvider();
      return this.instance;
    }

    // Default to seeded deterministic DEMO data
    this.instance = new DemoMarketDataProvider();
    return this.instance;
  }

  public static setProvider(provider: MarketDataProvider): void {
    this.instance = provider;
  }
}
