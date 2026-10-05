import { useEffect, useState } from 'react';
import { api, clearStoredToken } from './services/api.ts';
import { User, TradingAccount, Trade } from './types.ts';
import { Header } from './components/Header.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { MobileNav } from './components/MobileNav.tsx';
import { TradeModal } from './components/TradeModal.tsx';
import { CsvImportModal } from './components/CsvImportModal.tsx';

// Pages
import { DashboardPage } from './pages/DashboardPage.tsx';
import { JournalPage } from './pages/JournalPage.tsx';
import { CalendarPage } from './pages/CalendarPage.tsx';
import { AnalyticsPage } from './pages/AnalyticsPage.tsx';
import { ScannerPage } from './pages/ScannerPage.tsx';
import { PairAnalysisPage } from './pages/PairAnalysisPage.tsx';
import { WatchlistPage } from './pages/WatchlistPage.tsx';
import { RiskManagerPage } from './pages/RiskManagerPage.tsx';
import { AiAnalystPage } from './pages/AiAnalystPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { AuthPage } from './pages/AuthPage.tsx';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<TradingAccount | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedTerminalPair, setSelectedTerminalPair] = useState<string>('EURUSD');

  // Modals
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Initialize session & account
  const initApp = async () => {
    try {
      setInitialLoading(true);
      const meRes = await api.getMe();
      setUser(meRes.user);

      const accRes = await api.getAccounts();
      setAccounts(accRes.accounts);
      if (accRes.accounts.length > 0) {
        const defaultAcc = accRes.accounts.find((a) => a.isDefault) || accRes.accounts[0];
        setActiveAccount(defaultAcc);
      }
    } catch {
      setUser(null);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    clearStoredToken();
    setUser(null);
    setAccounts([]);
    setActiveAccount(null);
  };

  const handleOpenTradeModal = (trade?: Trade) => {
    setTradeToEdit(trade || null);
    setShowTradeModal(true);
  };

  const handleSelectPairForTerminal = (pair: string) => {
    setSelectedTerminalPair(pair);
    setCurrentTab('pair-analysis');
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-zinc-400">Loading TradePilot Workspace...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthSuccess={() => initApp()} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      {/* Top Header */}
      <Header
        user={user}
        accounts={accounts}
        activeAccount={activeAccount}
        onSelectAccount={(acc) => setActiveAccount(acc)}
        onNewTrade={() => handleOpenTradeModal()}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <Sidebar currentTab={currentTab} onTabChange={(tab) => setCurrentTab(tab)} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-6">
          {currentTab === 'dashboard' && (
            <DashboardPage
              activeAccount={activeAccount}
              onOpenTradeModal={() => handleOpenTradeModal()}
              onNavigateTab={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === 'journal' && (
            <JournalPage
              activeAccount={activeAccount}
              onOpenTradeModal={(t) => handleOpenTradeModal(t)}
              onOpenCsvModal={() => setShowCsvModal(true)}
            />
          )}

          {currentTab === 'calendar' && <CalendarPage activeAccount={activeAccount} />}

          {currentTab === 'analytics' && <AnalyticsPage activeAccount={activeAccount} />}

          {currentTab === 'scanner' && (
            <ScannerPage onSelectPairForAnalysis={(pair) => handleSelectPairForTerminal(pair)} />
          )}

          {currentTab === 'pair-analysis' && (
            <PairAnalysisPage
              initialPair={selectedTerminalPair}
              onOpenTradeModalWithPair={(p, dir, entry, sl, tp) => {
                setTradeToEdit({
                  id: '',
                  userId: user.id,
                  accountId: activeAccount?.id || '',
                  pair: p,
                  direction: dir,
                  status: 'OPEN',
                  timeframe: 'H1',
                  tradingSession: 'London',
                  entryPrice: entry,
                  stopLoss: sl,
                  takeProfit: tp,
                  lotSize: 0.5,
                  riskPercent: 1.0,
                  riskAmount: (activeAccount?.balance || 10000) * 0.01,
                  fees: 0,
                  entryTime: new Date().toISOString(),
                  setup: 'Algorithmic Scanner Signal',
                  psychology: ['Disciplined'],
                  mistakeTags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
                setShowTradeModal(true);
              }}
            />
          )}

          {currentTab === 'watchlist' && (
            <WatchlistPage onSelectPairForAnalysis={(pair) => handleSelectPairForTerminal(pair)} />
          )}

          {currentTab === 'risk-manager' && <RiskManagerPage activeAccount={activeAccount} />}

          {currentTab === 'ai-analyst' && <AiAnalystPage activeAccount={activeAccount} />}

          {currentTab === 'settings' && (
            <SettingsPage
              user={user}
              accounts={accounts}
              onRefreshAccounts={() => initApp()}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav currentTab={currentTab} onTabChange={(tab) => setCurrentTab(tab)} />

      {/* Trade Modal */}
      {showTradeModal && (
        <TradeModal
          activeAccount={activeAccount}
          tradeToEdit={tradeToEdit}
          onClose={() => {
            setShowTradeModal(false);
            setTradeToEdit(null);
          }}
          onSaved={() => {
            setShowTradeModal(false);
            setTradeToEdit(null);
            initApp();
          }}
        />
      )}

      {/* CSV Batch Import Modal */}
      {showCsvModal && (
        <CsvImportModal
          activeAccount={activeAccount}
          onClose={() => setShowCsvModal(false)}
          onImportComplete={() => {
            setShowCsvModal(false);
            initApp();
          }}
        />
      )}
    </div>
  );
}
