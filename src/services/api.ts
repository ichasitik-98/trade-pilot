import { User, TradingAccount, RiskSetting, Trade, TradeStatistics, ScannerItem, Watchlist, AuditLog } from '../types.ts';

const TOKEN_KEY = 'tradepilot_session_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      !res.ok
        ? `Server error (${res.status}): Request timed out or service temporarily busy.`
        : 'Received unexpected non-JSON response from server.'
    );
  }

  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  register: (details: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(details),
    }),

  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),

  getMe: () => request<{ user: User }>('/auth/me'),

  // Accounts
  getAccounts: () => request<{ accounts: TradingAccount[] }>('/accounts'),

  createAccount: (data: { name: string; broker?: string; currency?: string; initialBalance?: number }) =>
    request<{ account: TradingAccount }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getRisk: (accountId: string) => request<{ risk: RiskSetting }>(`/accounts/${accountId}/risk`),

  updateRisk: (accountId: string, settings: Partial<RiskSetting>) =>
    request<{ risk: RiskSetting }>(`/accounts/${accountId}/risk`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  // Dashboard & Analytics
  getDashboard: (accountId?: string) =>
    request<{
      account: TradingAccount | null;
      stats: TradeStatistics | null;
      recentTrades: Trade[];
    }>(`/dashboard${accountId ? `?accountId=${accountId}` : ''}`),

  getAnalytics: (accountId?: string) =>
    request<{
      stats: TradeStatistics;
      equityCurve: { time: string; balance: number; equity: number }[];
      pairBreakdown: { pair: string; trades: number; netPnL: number; winRate: number }[];
      setupBreakdown: { setup: string; trades: number; netPnL: number; winRate: number }[];
    }>(`/analytics${accountId ? `?accountId=${accountId}` : ''}`),

  // Trades
  getTrades: (params: {
    accountId?: string;
    status?: string;
    pair?: string;
    direction?: string;
    timeframe?: string;
    offset?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params.accountId) query.set('accountId', params.accountId);
    if (params.status) query.set('status', params.status);
    if (params.pair) query.set('pair', params.pair);
    if (params.direction) query.set('direction', params.direction);
    if (params.timeframe) query.set('timeframe', params.timeframe);
    if (params.offset !== undefined) query.set('offset', params.offset.toString());
    if (params.limit !== undefined) query.set('limit', params.limit.toString());
    return request<{ trades: Trade[]; total: number }>(`/trades?${query.toString()}`);
  },

  createTrade: (trade: Partial<Trade>) =>
    request<{ trade: Trade }>('/trades', {
      method: 'POST',
      body: JSON.stringify(trade),
    }),

  updateTrade: (id: string, updates: Partial<Trade>) =>
    request<{ trade: Trade }>(`/trades/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  closeTrade: (id: string, data: { exitPrice: number; exitReason?: string; fees?: number }) =>
    request<{ trade: Trade }>(`/trades/${id}/close`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteTrade: (id: string) =>
    request<{ success: boolean }>(`/trades/${id}`, {
      method: 'DELETE',
    }),

  // Scanner & Pair Analysis
  getInstruments: () => request<{ instruments: any[] }>('/market/instruments'),

  getScanner: () => request<{ pairs: ScannerItem[]; mode?: string; dataSourceLabel: string }>('/market/scanner'),

  getMarketBySymbol: (symbol: string, timeframe: string = 'H1') =>
    request<{
      symbol: string;
      timeframe: string;
      currentPrice: number;
      latestPrice: { price: number; change24h: number; high24h: number; low24h: number };
      symbolInfo: any;
      candles: any[];
      indicators: any;
      marketAnalysis: any;
      support: any;
      resistance: any;
      multiTimeframe: any;
      dataStatus: string;
      dataQuality: number;
      lastUpdated: string;
      isDemo: boolean;
      dataSourceLabel: string;
    }>(`/market/${symbol}?timeframe=${timeframe}`),

  getPairAnalysis: (pair: string, timeframe: string = 'H1') =>
    request<{
      symbol: string;
      pair: string;
      timeframe: string;
      currentPrice: number;
      latestPrice: { price: number; change24h: number; high24h: number; low24h: number };
      symbolInfo: { symbol: string; baseAsset: string; quoteAsset: string; pipSize: number; category: string };
      candles: any[];
      indicator: any;
      indicators: any;
      structure: any;
      marketAnalysis: any;
      support: any;
      resistance: any;
      multiTimeframe: any;
      dataStatus: string;
      dataQuality: number;
      lastUpdated: string;
      isDemo: boolean;
      dataSourceLabel: string;
    }>(`/market/pair?pair=${pair}&timeframe=${timeframe}`),

  refreshMarketSymbol: (symbol: string) =>
    request<{ success: boolean; symbol: string; analysis: any }>(`/market/refresh/${symbol}`, {
      method: 'POST',
    }),

  evaluateSignal: (data: {
    pair: string;
    timeframe: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
  }) =>
    request<{ signal: any }>('/market/signal', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  calculatePositionSize: (data: {
    pair: string;
    accountId: string;
    riskPercent: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit?: number;
  }) =>
    request<{ sizing: any; riskCheck: any }>('/market/position-size', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Watchlist
  getWatchlists: () => request<{ watchlists: Watchlist[] }>('/watchlists'),

  addWatchlist: (pair: string, notes?: string) =>
    request<{ watchlist: Watchlist }>('/watchlists', {
      method: 'POST',
      body: JSON.stringify({ pair, notes }),
    }),

  removeWatchlist: (pair: string) =>
    request<{ success: boolean }>(`/watchlists/${pair}`, {
      method: 'DELETE',
    }),

  // AI Analyst
  askAI: (query: string, accountId?: string) =>
    request<{ response: string; contextUsed: any }>('/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ query, accountId }),
    }),

  // Audit Logs
  getAuditLogs: () => request<{ logs: AuditLog[] }>('/audit-logs'),
};
