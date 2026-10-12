import React, { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Send,
  Plus,
  Settings2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Play,
  ShieldCheck,
  XCircle,
  ArrowRight,
  MessageSquare,
  Activity,
} from 'lucide-react';
import { api } from '../services/api.ts';
import {
  SignalAlertConfig,
  SignalLifecycleEvent,
  NotificationJob,
  WhatsAppConnectionStatus,
  TwelveDataQuotaBudgetStatus,
  InvalidationPolicy,
} from '../types.ts';

interface SignalAlertsPageProps {
  onSelectPairForAnalysis?: (pair: string) => void;
}

const DEFAULT_SYMBOLS = [
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'USDCAD',
  'AUDUSD',
  'NZDUSD',
  'EURJPY',
  'GBPJPY',
  'BTCUSD',
];

const DEFAULT_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export function SignalAlertsPage({ onSelectPairForAnalysis }: SignalAlertsPageProps) {
  const [configs, setConfigs] = useState<SignalAlertConfig[]>([]);
  const [events, setEvents] = useState<SignalLifecycleEvent[]>([]);
  const [notificationJobs, setNotificationJobs] = useState<NotificationJob[]>([]);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [creditBudget, setCreditBudget] = useState<TwelveDataQuotaBudgetStatus | null>(null);
  const [supportedSymbols, setSupportedSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [supportedTimeframes, setSupportedTimeframes] = useState<string[]>(DEFAULT_TIMEFRAMES);

  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluatingSymbol, setEvaluatingSymbol] = useState<string | null>(null);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [activeSubView, setActiveSubView] = useState<'LIFECYCLE' | 'WHATSAPP_QUEUE'>('LIFECYCLE');

  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Config Editor Modal State
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [editingConfig, setEditingConfig] = useState<{
    id?: string;
    symbol: string;
    enabled: boolean;
    primaryTimeframe: string;
    confirmationTimeframe: string;
    initialScoreThreshold: number;
    confirmationScoreThreshold: number;
    requireClosedCandle: boolean;
    requireTrendAlignment: boolean;
    requireStructureAlignment: boolean;
    requireMomentumAlignment: boolean;
    minAdx: number;
    expirationMinutes: number;
    invalidationPolicy: InvalidationPolicy;
    enableInitialAlert: boolean;
    enableConfirmationAlert: boolean;
    whatsappEnabled: boolean;
    whatsappRecipient: string;
    useTemplateMessage: boolean;
    initialTemplateName: string;
    confirmationTemplateName: string;
    templateLanguage: string;
  }>({
    symbol: 'XAUUSD',
    enabled: true,
    primaryTimeframe: 'M15',
    confirmationTimeframe: 'M5',
    initialScoreThreshold: 65,
    confirmationScoreThreshold: 65,
    requireClosedCandle: true,
    requireTrendAlignment: true,
    requireStructureAlignment: true,
    requireMomentumAlignment: false,
    minAdx: 18,
    expirationMinutes: 240,
    invalidationPolicy: 'OPPOSITE_OR_STOP',
    enableInitialAlert: true,
    enableConfirmationAlert: true,
    whatsappEnabled: false,
    whatsappRecipient: '',
    useTemplateMessage: false,
    initialTemplateName: '',
    confirmationTemplateName: '',
    templateLanguage: 'en_US',
  });

  const loadOverview = async () => {
    try {
      setLoading(true);
      const res = await api.getAlertsOverview();
      setConfigs(res.configs || []);
      setEvents(res.events || []);
      setNotificationJobs(res.notificationJobs || []);
      setWhatsappStatus(res.whatsappStatus || null);
      setCreditBudget(res.creditBudget || null);
      if (res.supportedSymbols?.length) setSupportedSymbols(res.supportedSymbols);
      if (res.supportedTimeframes?.length) setSupportedTimeframes(res.supportedTimeframes);
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Failed to load dual-stage signal alert overview.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleOpenNewConfig = () => {
    setEditingConfig({
      symbol: 'XAUUSD',
      enabled: true,
      primaryTimeframe: 'M15',
      confirmationTimeframe: 'M5',
      initialScoreThreshold: 65,
      confirmationScoreThreshold: 65,
      requireClosedCandle: true,
      requireTrendAlignment: true,
      requireStructureAlignment: true,
      requireMomentumAlignment: false,
      minAdx: 18,
      expirationMinutes: 240,
      invalidationPolicy: 'OPPOSITE_OR_STOP',
      enableInitialAlert: true,
      enableConfirmationAlert: true,
      whatsappEnabled: false,
      whatsappRecipient: configs.find((c) => c.whatsappRecipient)?.whatsappRecipient || '',
      useTemplateMessage: false,
      initialTemplateName: '',
      confirmationTemplateName: '',
      templateLanguage: 'en_US',
    });
    setShowConfigEditor(true);
  };

  const handleOpenEditConfig = (cfg: SignalAlertConfig) => {
    setEditingConfig({
      id: cfg.id,
      symbol: cfg.symbol,
      enabled: cfg.enabled,
      primaryTimeframe: cfg.primaryTimeframe,
      confirmationTimeframe: cfg.confirmationTimeframe,
      initialScoreThreshold: cfg.initialScoreThreshold,
      confirmationScoreThreshold: cfg.confirmationScoreThreshold,
      requireClosedCandle: cfg.requireClosedCandle,
      requireTrendAlignment: cfg.requireTrendAlignment,
      requireStructureAlignment: cfg.requireStructureAlignment,
      requireMomentumAlignment: cfg.requireMomentumAlignment,
      minAdx: cfg.minAdx,
      expirationMinutes: cfg.expirationMinutes,
      invalidationPolicy: cfg.invalidationPolicy,
      enableInitialAlert: cfg.enableInitialAlert,
      enableConfirmationAlert: cfg.enableConfirmationAlert,
      whatsappEnabled: cfg.whatsappEnabled,
      whatsappRecipient: cfg.whatsappRecipient || '',
      useTemplateMessage: cfg.useTemplateMessage,
      initialTemplateName: cfg.initialTemplateName || '',
      confirmationTemplateName: cfg.confirmationTemplateName || '',
      templateLanguage: cfg.templateLanguage || 'en_US',
    });
    setShowConfigEditor(true);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingConfig(true);
      await api.saveAlertConfig({
        ...editingConfig,
        whatsappRecipient: editingConfig.whatsappRecipient.trim() || null,
        initialTemplateName: editingConfig.initialTemplateName.trim() || null,
        confirmationTemplateName: editingConfig.confirmationTemplateName.trim() || null,
      });
      setShowConfigEditor(false);
      setFeedbackBanner({
        type: 'success',
        message: `Saved dual-stage alert configuration for ${editingConfig.symbol} (${editingConfig.primaryTimeframe} ➔ ${editingConfig.confirmationTimeframe}).`,
      });
      await loadOverview();
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Failed to save alert configuration.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleToggleConfigFlag = async (
    cfg: SignalAlertConfig,
    field: 'enabled' | 'whatsappEnabled'
  ) => {
    try {
      await api.saveAlertConfig({
        id: cfg.id,
        symbol: cfg.symbol,
        primaryTimeframe: cfg.primaryTimeframe,
        confirmationTimeframe: cfg.confirmationTimeframe,
        [field]: !cfg[field],
      });
      await loadOverview();
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Failed to update configuration toggle.',
      });
    }
  };

  const handleDeleteConfig = async (cfg: SignalAlertConfig) => {
    try {
      await api.deleteAlertConfig(cfg.id);
      setFeedbackBanner({
        type: 'info',
        message: `Removed alert configuration for ${cfg.symbol} (${cfg.primaryTimeframe} ➔ ${cfg.confirmationTimeframe}).`,
      });
      await loadOverview();
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Failed to delete configuration.',
      });
    }
  };

  const handleRunEvaluation = async (symbol?: string) => {
    try {
      if (symbol) setEvaluatingSymbol(symbol);
      else setEvaluating(true);

      const res = await api.runDualStageEvaluation(symbol);
      setEvents(res.events || []);
      setNotificationJobs(res.notificationJobs || []);
      setWhatsappStatus(res.whatsappStatus || null);
      if (res.report?.creditBudget) {
        setCreditBudget(res.report.creditBudget);
      }

      const s1 = res.report?.stage1Evaluations || [];
      const s2 = res.report?.stage2Evaluations || [];
      const s1Summary = s1
        .map((item: any) => `${item.symbol}[${item.primaryTimeframe}]: ${item.state} (${item.score}/100)`)
        .join(' · ');
      const s2Confirmed = s2.filter((item: any) => item.newStatus === 'CONFIRMED').length;

      setFeedbackBanner({
        type: 'success',
        message: `Evaluation complete. ${
          s1Summary || 'No active Stage 1 configs'
        } · Stage 2 Confirmations: ${s2Confirmed}/${s2.length}.`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Dual-stage signal evaluation failed.',
      });
    } finally {
      setEvaluating(false);
      setEvaluatingSymbol(null);
    }
  };

  const handleSendWhatsAppTest = async () => {
    try {
      setTestingWhatsApp(true);
      const res = await api.sendWhatsAppTestMessage(testRecipient.trim() || undefined);
      setConfigs(res.configs || []);
      setWhatsappStatus(res.whatsappStatus || null);
      setNotificationJobs(res.notificationJobs || []);

      if (res.success) {
        setFeedbackBanner({
          type: 'success',
          message:
            'WhatsApp Cloud API manual test succeeded. Automated signal delivery is now unlocked for enabled configurations.',
        });
      } else {
        setFeedbackBanner({
          type: 'error',
          message: res.error || 'WhatsApp manual test message failed. Check Cloud API credentials and recipient.',
        });
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'WhatsApp manual test failed.',
      });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleProcessQueue = async () => {
    try {
      setProcessingQueue(true);
      const res = await api.processWhatsAppQueue();
      setEvents(res.events || []);
      setNotificationJobs(res.notificationJobs || []);
      setWhatsappStatus(res.whatsappStatus || null);
      setFeedbackBanner({
        type: 'info',
        message: `Processed ${res.queueResult.processedCount} queued job(s): ${res.queueResult.sentCount} sent, ${res.queueResult.failedCount} failed.`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        message: err.message || 'Failed to process WhatsApp notification queue.',
      });
    } finally {
      setProcessingQueue(false);
    }
  };

  const filteredEvents = events.filter((ev) => {
    if (statusFilter === 'ALL') return true;
    return ev.lifecycleStatus === statusFilter;
  });

  const pendingCount = events.filter((e) => e.lifecycleStatus === 'PENDING_CONFIRMATION').length;
  const confirmedCount = events.filter((e) => e.lifecycleStatus === 'CONFIRMED').length;
  const invalidatedCount = events.filter((e) => e.lifecycleStatus === 'INVALIDATED').length;
  const expiredCount = events.filter((e) => e.lifecycleStatus === 'EXPIRED').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
              Dual-Stage Trading Signal Alerts & WhatsApp Automation
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-3xl leading-relaxed">
            Stage 1 detects confirmed closed-candle setups on your primary timeframe and dispatches an initial
            alert. Stage 2 monitors higher-timeframe structure, trend, and momentum rules before dispatching a
            confirmed alert. Technical scores reflect rule alignment, not statistically guaranteed win probabilities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleRunEvaluation()}
            disabled={evaluating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition cursor-pointer"
          >
            {evaluating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{evaluating ? 'Evaluating Market...' : 'Run Dual-Stage Evaluation'}</span>
          </button>

          <button
            onClick={handleOpenNewConfig}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-medium transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Configure Symbol</span>
          </button>

          <button
            onClick={loadOverview}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 text-xs transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : feedbackBanner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300'
          }`}
        >
          <span>{feedbackBanner.message}</span>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-zinc-400 hover:text-zinc-200 text-xs font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Telemetry & Safeguards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Meta WhatsApp Cloud API Status & Manual Test */}
        <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                Meta WhatsApp Cloud API
              </span>
              <span
                className={`text-xs font-mono ${
                  whatsappStatus?.configured && whatsappStatus?.envEnabled
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {whatsappStatus?.configured && whatsappStatus?.envEnabled
                  ? 'CLOUD API READY'
                  : 'SAFE MODE (INACTIVE)'}
              </span>
            </div>

            <div className="text-xs text-zinc-400 space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <span>Environment Gate</span>
                <span className="font-mono text-zinc-300">
                  WHATSAPP_ENABLED={whatsappStatus?.envEnabled ? 'true' : 'false'} · {whatsappStatus?.apiVersion || 'v21.0'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Phone Number ID</span>
                <span className="font-mono text-zinc-300">
                  {whatsappStatus?.maskedPhoneNumberId || 'Not configured'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Default Recipient</span>
                <span className="font-mono text-zinc-300">
                  {whatsappStatus?.maskedDefaultRecipient || 'Not configured'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Manual Verification Gate</span>
                <span
                  className={`font-mono ${
                    whatsappStatus?.verifiedByManualTest ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {whatsappStatus?.verifiedByManualTest ? 'Verified' : 'Required Before Auto-Send'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="Recipient E.164 (e.g. 6281234567890)"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleSendWhatsAppTest}
                disabled={testingWhatsApp}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>{testingWhatsApp ? 'Sending...' : 'Test WhatsApp'}</span>
              </button>
            </div>
            {whatsappStatus?.lastFailureReason && (
              <p className="text-[11px] text-rose-400 leading-snug">
                Last error: {whatsappStatus.lastFailureReason}
              </p>
            )}
          </div>
        </div>

        {/* 2. Twelve Data Basic 8 Credit Budget Guard */}
        <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Twelve Data Basic 8 Quota Guard
              </span>
              <span
                className={`text-xs font-mono ${
                  creditBudget?.isRateLimited ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {creditBudget?.isRateLimited ? 'COOLDOWN ACTIVE' : 'REAL FEED PROTECTED'}
              </span>
            </div>

            <div className="text-xs text-zinc-400 space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span>Minute Credit Budget</span>
                <span className="font-mono text-zinc-200">
                  {creditBudget?.creditsUsedThisMinute ?? 0} / {creditBudget?.maxCreditsPerMinute ?? 6} credits/min
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Daily Credit Budget</span>
                <span className="font-mono text-zinc-200">
                  {creditBudget?.creditsUsedToday ?? 0} / {creditBudget?.maxCreditsPerDay ?? 750} credits/day
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Active Polling Symbols</span>
                <span className="font-mono text-zinc-200">
                  {configs.filter((c) => c.enabled).map((c) => c.symbol).join(', ') || 'None'} (of 11 supported)
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-400 leading-relaxed">
            XAUUSD is activated first by default. Persisted Neon PostgreSQL candles are reused when fresh so
            background evaluations never exhaust Twelve Data Basic 8 limits.
          </div>
        </div>

        {/* 3. Signal Lifecycle State Machine Summary */}
        <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Signal Lifecycle Telemetry
              </span>
              <span className="text-xs font-mono text-zinc-400">{events.length} tracked events</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                <div className="text-[11px] text-zinc-400">Pending Confirmation</div>
                <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">{pendingCount}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                <div className="text-[11px] text-zinc-400">Confirmed (Stage 2)</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{confirmedCount}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                <div className="text-[11px] text-zinc-400">Invalidated</div>
                <div className="text-lg font-bold font-mono text-rose-400 mt-0.5">{invalidatedCount}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                <div className="text-[11px] text-zinc-400">Expired</div>
                <div className="text-lg font-bold font-mono text-zinc-400 mt-0.5">{expiredCount}</div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <span>WhatsApp Jobs: {notificationJobs.length}</span>
            <button
              onClick={handleProcessQueue}
              disabled={processingQueue}
              className="text-emerald-400 hover:underline font-medium cursor-pointer disabled:opacity-50"
            >
              {processingQueue ? 'Processing Queue...' : 'Process Retry Queue'}
            </button>
          </div>
        </div>
      </div>

      {/* Configured Dual-Timeframe Symbols Section */}
      <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Configurable Dual-Timeframe Symbol Rules
            </h2>
            <p className="text-xs text-zinc-400">
              Configure Stage 1 (Primary Timeframe) and Stage 2 (Confirmation Timeframe) rules across any of the
              11 supported instruments and 8 timeframes.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400">
            {configs.filter((c) => c.enabled).length} active / {configs.length} configured
          </span>
        </div>

        <div className="divide-y divide-zinc-800/70">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-zinc-900/40 transition"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold font-mono text-zinc-100">{cfg.symbol}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="font-mono text-xs text-emerald-400">
                    Stage 1: {cfg.primaryTimeframe} ➔ Stage 2: {cfg.confirmationTimeframe}
                  </span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-xs text-zinc-400">
                    Thresholds: {cfg.initialScoreThreshold}/100 init, {cfg.confirmationScoreThreshold}/100 confirm
                  </span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-xs text-zinc-400">Min ADX: {cfg.minAdx}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span>{cfg.requireClosedCandle ? 'Closed Candle Only' : 'Intrabar Allowed'}</span>
                  <span>·</span>
                  <span>
                    Rules:{' '}
                    {[
                      cfg.requireTrendAlignment ? 'Trend' : null,
                      cfg.requireStructureAlignment ? 'Structure' : null,
                      cfg.requireMomentumAlignment ? 'Momentum' : null,
                    ]
                      .filter(Boolean)
                      .join(' + ') || 'Score Only'}
                  </span>
                  <span>·</span>
                  <span>Expires: {cfg.expirationMinutes}m</span>
                  <span>·</span>
                  <span>Invalidation: {cfg.invalidationPolicy}</span>
                  {cfg.whatsappRecipient && (
                    <>
                      <span>·</span>
                      <span className="font-mono text-zinc-300">WA: {cfg.whatsappRecipient}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleToggleConfigFlag(cfg, 'enabled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    cfg.enabled
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {cfg.enabled ? 'Monitoring Active' : 'Monitoring Paused'}
                </button>

                <button
                  onClick={() => handleToggleConfigFlag(cfg, 'whatsappEnabled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    cfg.whatsappEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {cfg.whatsappEnabled ? 'WhatsApp On' : 'WhatsApp Off'}
                </button>

                <button
                  onClick={() => handleRunEvaluation(cfg.symbol)}
                  disabled={evaluatingSymbol === cfg.symbol}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${evaluatingSymbol === cfg.symbol ? 'animate-spin' : ''}`}
                  />
                  <span>Evaluate {cfg.symbol}</span>
                </button>

                <button
                  onClick={() => handleOpenEditConfig(cfg)}
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition cursor-pointer"
                  title="Edit Configuration"
                >
                  <Settings2 className="w-4 h-4" />
                </button>

                {configs.length > 1 && (
                  <button
                    onClick={() => handleDeleteConfig(cfg)}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-950/50 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition cursor-pointer"
                    title="Delete Configuration"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-View Switcher & Lifecycle / Queue Logs */}
      <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-zinc-950 rounded-lg border border-zinc-800 w-fit">
            <button
              onClick={() => setActiveSubView('LIFECYCLE')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
                activeSubView === 'LIFECYCLE'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Signal Lifecycle Events ({events.length})
            </button>
            <button
              onClick={() => setActiveSubView('WHATSAPP_QUEUE')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
                activeSubView === 'WHATSAPP_QUEUE'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              WhatsApp Delivery Jobs ({notificationJobs.length})
            </button>
          </div>

          {activeSubView === 'LIFECYCLE' && (
            <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
              {(['ALL', 'PENDING_CONFIRMATION', 'CONFIRMED', 'INVALIDATED', 'EXPIRED'] as const).map(
                (st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                      statusFilter === st
                        ? 'bg-zinc-800 text-emerald-400'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {st === 'ALL' ? 'All States' : st.replace('_', ' ')}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {activeSubView === 'LIFECYCLE' ? (
          filteredEvents.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm text-zinc-300 font-medium">
                No dual-stage signal lifecycle events recorded in this filter yet.
              </p>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Click &ldquo;Run Dual-Stage Evaluation&rdquo; above to evaluate your active symbol configuration
                against live Twelve Data candles. When market conditions are NO SIGNAL, no false alert is created.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {filteredEvents.map((ev) => {
                const isExpanded = expandedEventId === ev.id;
                const precision =
                  ev.symbol.includes('JPY') || ev.symbol === 'XAUUSD' || ev.symbol.includes('BTC')
                    ? 2
                    : 4;

                return (
                  <div key={ev.id} className="p-4 sm:px-5 space-y-3 hover:bg-zinc-900/30 transition">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-bold font-mono text-zinc-100">{ev.symbol}</span>
                          <span className="text-zinc-500">·</span>
                          <span
                            className={`font-mono font-bold ${
                              ev.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {ev.direction}
                          </span>
                          <span className="text-zinc-500">·</span>
                          <span className="font-mono text-xs text-zinc-300">
                            {ev.primaryTimeframe} ➔ {ev.confirmationTimeframe}
                          </span>
                          <span className="text-zinc-500">·</span>
                          <span
                            className={`font-mono text-xs font-semibold ${
                              ev.lifecycleStatus === 'CONFIRMED'
                                ? 'text-emerald-400'
                                : ev.lifecycleStatus === 'PENDING_CONFIRMATION'
                                ? 'text-amber-400'
                                : ev.lifecycleStatus === 'INVALIDATED'
                                ? 'text-rose-400'
                                : 'text-zinc-400'
                            }`}
                          >
                            {ev.lifecycleStatus}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 font-mono">
                          <span>Entry: {ev.entryPrice.toFixed(precision)}</span>
                          <span>·</span>
                          <span>SL: {ev.stopLoss.toFixed(precision)}</span>
                          <span>·</span>
                          <span>TP1: {ev.takeProfit1.toFixed(precision)}</span>
                          <span>·</span>
                          <span>R:R 1:{ev.riskReward.toFixed(2)}</span>
                          <span>·</span>
                          <span>
                            Stage 1 Score: {ev.initialScore}/100
                            {ev.confirmationScore !== null && ev.confirmationScore !== undefined
                              ? ` ➔ Stage 2 Score: ${ev.confirmationScore}/100`
                              : ''}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                          <span>
                            Stage 1 WA: <strong className="font-mono text-zinc-300">{ev.initialNotificationStatus}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Stage 2 WA:{' '}
                            <strong className="font-mono text-zinc-300">{ev.confirmationNotificationStatus}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Primary Candle: {new Date(ev.primaryCandleTimestamp).toLocaleString()} (
                            {ev.isClosedCandle ? 'Closed' : 'Intrabar'})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {onSelectPairForAnalysis && (
                          <button
                            onClick={() => onSelectPairForAnalysis(ev.symbol)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <span>Open Terminal</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <span>Audit Trail ({ev.evaluations?.length || 0})</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Status Reason Summary */}
                    <div className="text-xs text-zinc-300 bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
                      {ev.lifecycleStatus === 'CONFIRMED' && ev.confirmationReason
                        ? ev.confirmationReason
                        : ev.lifecycleStatus === 'INVALIDATED' && ev.invalidationReason
                        ? ev.invalidationReason
                        : ev.lifecycleStatus === 'EXPIRED' && ev.expirationReason
                        ? ev.expirationReason
                        : ev.initialExplanation}
                    </div>

                    {/* Expanded Evaluation Audit Trail */}
                    {isExpanded && ev.evaluations && ev.evaluations.length > 0 && (
                      <div className="pt-2 space-y-2">
                        <div className="text-xs font-semibold text-zinc-300">
                          Chronological Stage 1 & Stage 2 Evaluation Log
                        </div>
                        <div className="space-y-2">
                          {ev.evaluations.map((rec) => (
                            <div
                              key={rec.id}
                              className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/90 text-xs space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="text-emerald-400 font-semibold">{rec.stage}</span>
                                  <span>·</span>
                                  <span className="text-zinc-200">{rec.timeframe}</span>
                                  <span>·</span>
                                  <span className="text-zinc-400">Result: {rec.resultStatus}</span>
                                  {rec.score !== null && rec.score !== undefined && (
                                    <>
                                      <span>·</span>
                                      <span className="text-zinc-300">Score: {rec.score}/100</span>
                                    </>
                                  )}
                                </div>
                                <span className="text-zinc-500 font-mono text-[11px]">
                                  {new Date(rec.evaluatedAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-zinc-300">{rec.reason}</p>
                              {rec.satisfiedRules.length > 0 && (
                                <div className="text-[11px] text-emerald-400/90">
                                  Passed: {rec.satisfiedRules.join(' · ')}
                                </div>
                              )}
                              {rec.failedRules.length > 0 && (
                                <div className="text-[11px] text-amber-400/90">
                                  Pending / Failed: {rec.failedRules.join(' · ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : notificationJobs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm text-zinc-300 font-medium">No WhatsApp notification jobs queued yet.</p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Use the &ldquo;Test WhatsApp&rdquo; button above to verify your Meta Cloud API configuration and log
              your first delivery attempt.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/70">
            {notificationJobs.map((job) => (
              <div key={job.id} className="p-4 sm:px-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-zinc-200">{job.notificationType}</span>
                    <span>·</span>
                    <span
                      className={`font-mono font-semibold ${
                        job.status === 'SENT'
                          ? 'text-emerald-400'
                          : job.status === 'FAILED'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {job.status}
                    </span>
                    <span>·</span>
                    <span className="font-mono text-zinc-400">
                      Attempts: {job.attemptCount}/{job.maxAttempts}
                    </span>
                    {job.isAmbiguousTimeout && (
                      <>
                        <span>·</span>
                        <span className="text-amber-400 font-mono">
                          AMBIGUOUS TIMEOUT (Auto-Retry Locked)
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-mono text-zinc-500">
                    {new Date(job.createdAt).toLocaleString()}
                  </span>
                </div>

                {job.sanitizedError && (
                  <div className="text-xs text-rose-400 bg-rose-950/20 border border-rose-900/40 rounded-lg px-3 py-2">
                    {job.sanitizedError}
                  </div>
                )}

                <details className="text-xs text-zinc-400">
                  <summary className="cursor-pointer hover:text-zinc-200 select-none">
                    View formatted WhatsApp message & attempt logs ({job.attempts?.length || 0})
                  </summary>
                  <div className="mt-2 space-y-2">
                    <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-[11px] whitespace-pre-wrap">
                      {job.messageBody}
                    </pre>
                    {job.attempts && job.attempts.length > 0 && (
                      <div className="space-y-1">
                        {job.attempts.map((att) => (
                          <div
                            key={att.id}
                            className="p-2 rounded bg-zinc-950/80 border border-zinc-800/80 font-mono text-[11px] flex flex-wrap items-center justify-between gap-2"
                          >
                            <span>
                              Attempt #{att.attemptNumber}: {att.status} (HTTP {att.httpStatus ?? 'N/A'}) ·{' '}
                              {att.durationMs}ms
                            </span>
                            <span className="text-zinc-400">{att.sanitizedResponse}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuration Modal */}
      {showConfigEditor && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-zinc-100">
                  Configure Dual-Stage Signal Alert
                </h3>
                <p className="text-xs text-zinc-400">
                  Set primary detection timeframe, confirmation timeframe, confluence thresholds, and WhatsApp recipient.
                </p>
              </div>
              <button
                onClick={() => setShowConfigEditor(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Instrument Symbol</label>
                  <select
                    value={editingConfig.symbol}
                    onChange={(e) => setEditingConfig({ ...editingConfig, symbol: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  >
                    {supportedSymbols.map((sym) => (
                      <option key={sym} value={sym}>
                        {sym}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Stage 1 Primary Timeframe</label>
                  <select
                    value={editingConfig.primaryTimeframe}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, primaryTimeframe: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  >
                    {supportedTimeframes.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Stage 2 Confirmation Timeframe</label>
                  <select
                    value={editingConfig.confirmationTimeframe}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, confirmationTimeframe: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  >
                    {supportedTimeframes.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Initial Score (40-95)</label>
                  <input
                    type="number"
                    min={40}
                    max={95}
                    value={editingConfig.initialScoreThreshold}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        initialScoreThreshold: Number(e.target.value),
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Confirm Score (40-95)</label>
                  <input
                    type="number"
                    min={40}
                    max={95}
                    value={editingConfig.confirmationScoreThreshold}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        confirmationScoreThreshold: Number(e.target.value),
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Min ADX (0-60)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    step="0.5"
                    value={editingConfig.minAdx}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, minAdx: Number(e.target.value) })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Expiration (Minutes)</label>
                  <input
                    type="number"
                    min={15}
                    max={10080}
                    value={editingConfig.expirationMinutes}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        expirationMinutes: Number(e.target.value),
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Invalidation Policy</label>
                  <select
                    value={editingConfig.invalidationPolicy}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        invalidationPolicy: e.target.value as InvalidationPolicy,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  >
                    <option value="OPPOSITE_OR_STOP">
                      Invalidate on Opposite Signal OR Stop-Loss Breach
                    </option>
                    <option value="OPPOSITE_SIGNAL">Invalidate on Opposite Signal Only</option>
                    <option value="PRICE_STOP_BREACH">Invalidate on Stop-Loss Breach Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">WhatsApp Recipient (E.164)</label>
                  <input
                    type="text"
                    placeholder="e.g. 6281234567890"
                    value={editingConfig.whatsappRecipient}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, whatsappRecipient: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.enabled}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, enabled: e.target.checked })
                    }
                  />
                  <span>Enable Dual-Stage Signal Detection</span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.requireClosedCandle}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        requireClosedCandle: e.target.checked,
                      })
                    }
                  />
                  <span>Require Confirmed Closed Candle (Recommended)</span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.requireTrendAlignment}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        requireTrendAlignment: e.target.checked,
                      })
                    }
                  />
                  <span>Require Stage 2 Trend Alignment</span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.requireStructureAlignment}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        requireStructureAlignment: e.target.checked,
                      })
                    }
                  />
                  <span>Require Stage 2 Structure Alignment</span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.requireMomentumAlignment}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        requireMomentumAlignment: e.target.checked,
                      })
                    }
                  />
                  <span>Require Stage 2 Momentum Alignment</span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.whatsappEnabled}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        whatsappEnabled: e.target.checked,
                      })
                    }
                  />
                  <span>Enable WhatsApp Notification Delivery</span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.enableInitialAlert}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        enableInitialAlert: e.target.checked,
                      })
                    }
                  />
                  <span>Notify on Stage 1 (Initial Signal)</span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingConfig.enableConfirmationAlert}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        enableConfirmationAlert: e.target.checked,
                      })
                    }
                  />
                  <span>Notify on Stage 2 (Confirmed Signal)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowConfigEditor(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingConfig ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
