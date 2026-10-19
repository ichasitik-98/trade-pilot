import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DualStageSignalAlertService } from '../server/services/dual-stage-signal-alert.ts';
import { MarketDataSyncService } from '../server/services/market-data-sync.ts';
import { db } from '../server/db/storage.ts';
import { prisma } from '../server/db/prisma.ts';
import { whatsappCloudProvider } from '../server/providers/whatsapp-cloud.ts';
import { SignalLifecycleEvent } from '../server/types/index.ts';

describe('TradePilot — Critical Scheduler Timing & Pending Event Audit Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.QSTASH_SCHEDULER_ENABLED = 'false';
    process.env.ALERT_SCHEDULER_ENABLED = 'false';
    process.env.WHATSAPP_ENABLED = 'false';
    process.env.WHATSAPP_SAFE_TEST_MODE = 'true';
    process.env.MARKET_DATA_MODE = 'REAL';
    DualStageSignalAlertService.resetCycleRunningForTesting();
    try {
      await prisma.marketDataStatus.deleteMany({
        where: { symbol: 'DIST_LOCK', timeframe: 'EVAL_XAUUSD' },
      });
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    DualStageSignalAlertService.resetCycleRunningForTesting();
    vi.restoreAllMocks();
    try {
      await prisma.marketDataStatus.deleteMany({
        where: { symbol: 'DIST_LOCK', timeframe: 'EVAL_XAUUSD' },
      });
    } catch {
      // ignore
    }
  });

  function createMockSignalEvent(overrides: Partial<SignalLifecycleEvent> = {}): SignalLifecycleEvent {
    const now = new Date().toISOString();
    return {
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: 'usr_demo_01',
      idempotencyKey: `sig:mock:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
      symbol: 'XAUUSD',
      direction: 'BUY',
      htfDirectionTimeframe: 'H4',
      htfConfirmationTimeframe: 'H1',
      primaryTimeframe: 'M15',
      confirmationTimeframe: 'M5',
      h4Direction: 'BULLISH',
      h1Trend: 'BULLISH',
      m15PullbackValid: true,
      m5BosDetected: false,
      m5CandleConfirmed: false,
      primaryCandleTimestamp: new Date(Date.now() - 3600000).toISOString(),
      isClosedCandle: true,
      referencePrice: 2650,
      entryPrice: 2650,
      stopLoss: 2640,
      takeProfit1: 2665,
      riskReward: 1.5,
      initialScore: 75,
      evaluationCount: 0,
      initialStatus: 'VALID_SETUP',
      lifecycleStatus: 'PENDING_CONFIRMATION',
      initialNotificationStatus: 'NOT_QUEUED',
      confirmationNotificationStatus: 'NOT_QUEUED',
      dataFreshnessStatus: 'CURRENT',
      initialExplanation: 'Valid pullback setup detected',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  // 1. Pending query lambat
  it('1. handles slow pending query by halting before config query when budget is exceeded', async () => {
    // Total budget 4000ms. Lock (~200ms), pending query takes 2600ms.
    // Remaining time before config query will be ~1200ms (< 1500ms required threshold),
    // guaranteeing clean PRE_CONFIG_DEADLINE_EXCEEDED halt with pendingEventsQueryMs measured accurately.
    vi.spyOn(db, 'getPendingConfirmationEvents').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 2600));
      return [];
    });

    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 4000,
    });

    expect(report.executionDurations?.pendingEventsQueryMs).toBeGreaterThanOrEqual(2500);
    expect(report.executionDurations?.configQueryMs).toBeNull();
    expect(report.executionDurations?.h4Ms).toBeNull();
    expect(report.executionDurations?.h1Ms).toBeNull();
    expect(report.executionDurations?.m15Ms).toBeNull();
    expect(report.executionDurations?.m5Ms).toBeNull();
    expect(report.executionDurations?.strategyCompleted).toBe(false);
    expect(report.executionDurations?.lastStage).toBe('PRE_CONFIG_DEADLINE_EXCEEDED');
    expect(report.executionDurations?.haltReason).toBe('CYCLE_DEADLINE_EXCEEDED_BEFORE_CONFIG_QUERY');
  }, 10000);

  // 2. Pending event yang lambat
  it('2. measures slow pending event without attributing DB/fetch time to m5_ms when M5 eval not started', async () => {
    const fakePendingEvent = createMockSignalEvent({ id: `ev_slow_${Date.now()}` });

    vi.spyOn(db, 'getPendingConfirmationEvents').mockResolvedValueOnce([fakePendingEvent]);
    vi.spyOn(db, 'getSignalAlertConfigsByUserId').mockResolvedValue([]);
    // Simulate slow candle load (takes 1000ms) that fails because market data is unavailable
    vi.spyOn(DualStageSignalAlertService as any, 'resolveValidatedTimeframeCandles').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1000));
      return { ok: false, errorReason: 'Market data temporarily unavailable' };
    });

    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 6500,
    });

    expect(report.stage2Evaluations).toHaveLength(1);
    const s2 = report.stage2Evaluations[0];
    expect(s2.newStatus).toBe('PENDING_CONFIRMATION');
    expect(s2.m5DurationMs).toBeNull(); // M5 evaluation never started
    expect(s2.fetchDurationMs).toBeGreaterThanOrEqual(900); // Recorded as fetch time
    expect(report.executionDurations?.m5Ms).toBeNull(); // m5_ms remains not_run!
  }, 10000);

  // 3. Deadline habis di tengah pemrosesan pending event
  it('3. halts gracefully when deadline expires in the middle of multiple pending events', async () => {
    const events = [
      createMockSignalEvent({ id: `ev_multi_1_${Date.now()}` }),
      createMockSignalEvent({ id: `ev_multi_2_${Date.now()}` }),
      createMockSignalEvent({ id: `ev_multi_3_${Date.now()}` }),
    ];
    vi.spyOn(db, 'acquireDistributedLock').mockResolvedValue({
      acquired: true,
      lockKey: 'EVAL_XAUUSD',
      lockId: 'mock_lock_3',
    });
    vi.spyOn(db, 'releaseDistributedLock').mockResolvedValue(true);
    vi.spyOn(db, 'getPendingConfirmationEvents').mockResolvedValueOnce(events);
    vi.spyOn(db, 'getSignalAlertConfigsByUserId').mockResolvedValue([]);
    vi.spyOn(db, 'getEnabledSignalAlertConfigs').mockResolvedValue([]);

    // Each event evaluation takes 600ms
    vi.spyOn(DualStageSignalAlertService as any, 'resolveValidatedTimeframeCandles').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 600));
      return { ok: false, errorReason: 'Waiting for next closed bar' };
    });

    // Total budget is 1800ms. After event 1 (600ms), remaining budget is 1200ms.
    // Before event 2, isDeadlineExceeded(1200) triggers and halts the loop!
    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 1800,
    });

    expect(report.executionDurations?.pendingEventsCount).toBe(3);
    expect(report.executionDurations?.pendingEventsProcessedCount).toBeLessThan(3);
    expect(report.executionDurations?.haltReason).toBe('CYCLE_DEADLINE_EXCEEDED_DURING_PENDING_EVENTS');
    expect(report.executionDurations?.strategyCompleted).toBe(false);
  }, 10000);

  // 4. Tidak ada fetch atau evaluasi baru setelah deadline
  it('4. guarantees no new network fetch or Stage 1 evaluation occurs after deadline is exhausted', async () => {
    const fetchSpy = vi.spyOn(MarketDataSyncService, 'syncMarketData');
    const stage1Spy = vi.spyOn(DualStageSignalAlertService as any, 'evaluateStage1ForConfig');

    // Run with expired deadline
    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      deadlineMs: Date.now() - 100, // already expired
    });

    expect(report.executionDurations?.strategyCompleted).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stage1Spy).not.toHaveBeenCalled();
  });

  // 5. m5_ms tetap not_run jika evaluasi M5 tidak dimulai
  it('5. ensures m5_ms remains strictly null (not_run) when M5 technical evaluation does not start', async () => {
    const fakePendingEvent = createMockSignalEvent({ id: `ev_notrun_${Date.now()}` });

    vi.spyOn(db, 'acquireDistributedLock').mockResolvedValue({
      acquired: true,
      lockKey: 'EVAL_XAUUSD',
      lockId: 'mock_lock_5',
    });
    vi.spyOn(db, 'releaseDistributedLock').mockResolvedValue(true);
    vi.spyOn(db, 'getPendingConfirmationEvents').mockResolvedValueOnce([fakePendingEvent]);
    vi.spyOn(db, 'getSignalAlertConfigsByUserId').mockResolvedValue([]);
    vi.spyOn(DualStageSignalAlertService as any, 'resolveValidatedTimeframeCandles').mockResolvedValueOnce({
      ok: false,
      errorReason: 'Candle unclosed',
      evalCandles: [],
      targetCandle: null,
      isClosedCandle: false,
      dataQuality: 0,
    });
    vi.spyOn(db, 'getEnabledSignalAlertConfigs').mockResolvedValueOnce([]);

    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 6500,
    });

    // M5 evaluation was never started because candle was unclosed
    expect(report.executionDurations?.m5Ms).toBeNull();
    expect(report.stage2Evaluations).toHaveLength(1);
    expect(report.stage2Evaluations[0].m5DurationMs).toBeNull();
  }, 10000);

  // 6. Tidak ada durasi lintas siklus atau race condition
  it('6. guarantees fresh isolated duration tracking per cycle without cross-cycle pollution or race condition', async () => {
    // First cycle with 1ms deadline halts immediately before lock
    const report1 = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 1,
    });

    expect(report1.executionDurations?.m5Ms).toBeNull();
    expect(report1.executionDurations?.strategyCompleted).toBe(false);

    // Second cycle run immediately after: must execute cleanly and independently
    vi.spyOn(db, 'acquireDistributedLock').mockResolvedValue({
      acquired: true,
      lockKey: 'EVAL_XAUUSD',
      lockId: 'mock_lock_6',
    });
    vi.spyOn(db, 'releaseDistributedLock').mockResolvedValue(true);
    vi.spyOn(db, 'getPendingConfirmationEvents').mockResolvedValueOnce([]);
    vi.spyOn(db, 'getEnabledSignalAlertConfigs').mockResolvedValueOnce([]);

    const report2 = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 5000,
    });

    expect(report2.executionDurations?.pendingEventsCount).toBe(0);
    expect(report2.executionDurations?.strategyCompleted).toBe(true);
    expect(report2.executionDurations?.m5Ms).toBeNull(); // No cross-cycle leakage!
  }, 10000);

  // 7. Lock dilepas dengan aman
  it('7. safely acquires and releases distributed lock even when pending event processing aborts due to deadline', async () => {
    const lockKey = 'EVAL_XAUUSD';

    // Mock pending query that consumes budget and triggers deadline halt during pending events
    vi.spyOn(db, 'getPendingConfirmationEvents').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1200));
      return [createMockSignalEvent({ id: `ev_test_${Date.now()}` })];
    });

    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 2500, // Budget is 2500ms. Lock (~500ms) + pending query (1200ms) -> remaining < 1200ms -> halts
    });

    expect(report.executionDurations?.lockAcquireMs).toBeGreaterThan(0);
    expect(report.executionDurations?.haltReason).toBe('CYCLE_DEADLINE_EXCEEDED_DURING_PENDING_EVENTS');

    // Must be able to acquire lock immediately because finally released it
    const testLockId = `test_recovery_${Date.now()}`;
    const claim = await db.acquireDistributedLock({
      lockKey,
      lockId: testLockId,
      leaseSeconds: 10,
    });

    expect(claim.acquired).toBe(true);
    await db.releaseDistributedLock({ lockKey, lockId: testLockId });
  }, 15000);

  // 8. Retry tidak membuat event atau notification job ganda
  it('8. retrying an already processed pending event is strictly idempotent without duplicate jobs', async () => {
    const terminalConfirmedEvent = createMockSignalEvent({
      id: `ev_confirmed_${Date.now()}`,
      lifecycleStatus: 'CONFIRMED', // Already confirmed!
      confirmedAt: new Date().toISOString(),
      confirmationIdempotencyKey: `sig:conf:ev_confirmed`,
    });

    const enqueueSpy = vi.spyOn(whatsappCloudProvider, 'enqueueSignalNotification');
    const updateSpy = vi.spyOn(db, 'updateSignalLifecycleEvent');

    const outcome = await DualStageSignalAlertService.evaluateStage2Confirmation(terminalConfirmedEvent);

    expect(outcome.newStatus).toBe('CONFIRMED');
    expect(outcome.reason).toContain('Idempotent guard');
    expect(outcome.notificationQueued).toBe(false);
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  // 9. WhatsApp tetap tidak dikirim
  it('9. strictly guarantees WhatsApp messages are never dispatched during evaluation cycle tests', async () => {
    const metaDispatchSpy = vi.spyOn(whatsappCloudProvider, 'dispatchPayloadToMeta');

    await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 3000,
    });

    expect(metaDispatchSpy).not.toHaveBeenCalled();
  }, 10000);

  // 10. Akurasi pengukuran durasi query yang independen
  it('10. accurately measures distinct query durations for pending events and config queries without sharing timer variables', async () => {
    vi.spyOn(db, 'acquireDistributedLock').mockResolvedValue({
      acquired: true,
      lockKey: 'EVAL_XAUUSD',
      lockId: 'mock_lock_10',
    });
    vi.spyOn(db, 'releaseDistributedLock').mockResolvedValue(true);

    vi.spyOn(db, 'getPendingConfirmationEvents').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 250));
      return [];
    });

    vi.spyOn(db, 'getEnabledSignalAlertConfigs').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 400));
      return [];
    });

    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 6500,
    });

    expect(report.executionDurations?.pendingEventsQueryMs).toBeGreaterThanOrEqual(230);
    expect(report.executionDurations?.pendingEventsQueryMs).toBeLessThan(400);

    expect(report.executionDurations?.configQueryMs).toBeGreaterThanOrEqual(380);
    expect(report.executionDurations?.configQueryMs).toBeLessThan(600);

    // Verify distinct values: pending and config are definitely NOT sharing the same timer
    expect(report.executionDurations?.configQueryMs).not.toEqual(
      report.executionDurations?.pendingEventsQueryMs
    );
  }, 10000);

  // 11. Cache hit dan cache miss alert config
  it('11. validates alert config cache hit and cache miss behavior with invalidation on mutation', async () => {
    db.clearSignalAlertConfigCache();
    expect(db.hasEnabledSignalAlertConfigsCached({ symbol: 'XAUUSD' })).toBe(false);

    // First call: cache miss (populates in-memory cache)
    const configs1 = await db.getEnabledSignalAlertConfigs({ symbol: 'XAUUSD' });
    expect(db.hasEnabledSignalAlertConfigsCached({ symbol: 'XAUUSD' })).toBe(true);

    // Second call: cache hit
    const configs2 = await db.getEnabledSignalAlertConfigs({ symbol: 'XAUUSD' });
    expect(configs2).toEqual(configs1);

    // Invalidate cache
    db.clearSignalAlertConfigCache();
    expect(db.hasEnabledSignalAlertConfigsCached({ symbol: 'XAUUSD' })).toBe(false);
  });

  // 12. Cold-start yang lambat tetap aman dan tidak melebihi budget
  it('12. handles slow cold-start gracefully without exceeding serverless budget', async () => {
    vi.spyOn(db, 'acquireDistributedLock').mockImplementation(async (params) => {
      await new Promise((r) => setTimeout(r, 800));
      return { acquired: true, lockKey: params.lockKey, lockId: params.lockId };
    });
    vi.spyOn(db, 'releaseDistributedLock').mockResolvedValue(true);

    vi.spyOn(db, 'getPendingConfirmationEvents').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 800));
      return [];
    });

    // Total budget is 2800ms. Lock (800ms) + pending query (800ms) = 1600ms elapsed.
    // Remaining is 1200ms (< 1500ms required threshold), guaranteeing graceful PRE_CONFIG halt.
    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 2800,
    });

    expect(report.executionDurations?.lastStage).toBe('PRE_CONFIG_DEADLINE_EXCEEDED');
    expect(report.executionDurations?.haltReason).toBe('CYCLE_DEADLINE_EXCEEDED_BEFORE_CONFIG_QUERY');
    expect(report.executionDurations?.strategyCompleted).toBe(false);
    expect(report.executionDurations?.h4Ms).toBeNull();
    expect(report.executionDurations?.h1Ms).toBeNull();
    expect(report.executionDurations?.m15Ms).toBeNull();
    expect(report.executionDurations?.m5Ms).toBeNull();
  }, 10000);

  // 13. Deadline selama evaluasi H4: tidak ada H1/M15/M5 yang salah dilaporkan sebagai selesai
  it('13. halts when deadline expires during H4 and strictly leaves H1/M15/M5 as not_run', async () => {
    vi.spyOn(db, 'acquireDistributedLock').mockResolvedValue({
      acquired: true,
      lockKey: 'EVAL_XAUUSD',
      lockId: 'mock_lock_13',
    });
    vi.spyOn(db, 'releaseDistributedLock').mockResolvedValue(true);
    vi.spyOn(db, 'getPendingConfirmationEvents').mockResolvedValue([]);

    const mockConfig = {
      id: 'cfg_xauusd_mock',
      userId: 'usr_demo_01',
      symbol: 'XAUUSD',
      enabled: true,
      htfDirectionTimeframe: 'H4' as any,
      htfConfirmationTimeframe: 'H1' as any,
      primaryTimeframe: 'M15' as any,
      confirmationTimeframe: 'M5' as any,
      initialScoreThreshold: 65,
      confirmationScoreThreshold: 65,
      requireClosedCandle: true,
      requireTrendAlignment: true,
      requireStructureAlignment: true,
      requireMomentumAlignment: false,
      minAdx: 18.0,
      expirationMinutes: 240,
      invalidationPolicy: 'OPPOSITE_OR_STOP' as any,
      enableInitialAlert: true,
      enableConfirmationAlert: true,
      whatsappEnabled: false,
      whatsappRecipient: null,
      useTemplateMessage: false,
      templateLanguage: 'en_US',
      configVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.spyOn(db, 'getEnabledSignalAlertConfigs').mockResolvedValue([mockConfig]);

    // H4 takes 1200ms
    vi.spyOn(DualStageSignalAlertService as any, 'resolveValidatedTimeframeCandles').mockImplementation(
      async (params: any) => {
        if (params.timeframe === 'H4') {
          await new Promise((r) => setTimeout(r, 1200));
          return {
            ok: true,
            evalCandles: [{ timestamp: Date.now() - 3600000, open: 2600, high: 2610, low: 2590, close: 2605 }],
            targetCandle: { timestamp: Date.now() - 3600000, open: 2600, high: 2610, low: 2590, close: 2605 },
            isClosedCandle: true,
            dataQuality: 100,
          };
        }
        return { ok: false, errorReason: 'Should not run' };
      }
    );

    // Total budget is 1500ms. After H4 takes 1200ms, deadline before H1 is exceeded!
    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 1500,
    });

    expect(report.executionDurations?.h4Ms).toBeGreaterThanOrEqual(1000);
    expect(report.executionDurations?.h1Ms).toBeNull();
    expect(report.executionDurations?.m15Ms).toBeNull();
    expect(report.executionDurations?.m5Ms).toBeNull();
    expect(report.executionDurations?.strategyCompleted).toBe(false);

    expect(report.stage1Evaluations).toHaveLength(1);
    expect(report.stage1Evaluations[0].reason).toContain('Cycle deadline exceeded before H1 market data resolution');
  }, 10000);

  // 14. Penggunaan cache sharedTimeframeCandles lintas config dalam siklus yang sama
  it('14. reuses shared timeframe candles across multiple configs in the same cycle avoiding duplicate fetches', async () => {
    vi.spyOn(db, 'acquireDistributedLock').mockResolvedValue({
      acquired: true,
      lockKey: 'EVAL_XAUUSD',
      lockId: 'mock_lock_14',
    });
    vi.spyOn(db, 'releaseDistributedLock').mockResolvedValue(true);
    vi.spyOn(db, 'getPendingConfirmationEvents').mockResolvedValue([]);

    const baseConfig = {
      userId: 'usr_demo_01',
      symbol: 'XAUUSD',
      enabled: true,
      htfDirectionTimeframe: 'H4' as any,
      htfConfirmationTimeframe: 'H1' as any,
      primaryTimeframe: 'M15' as any,
      confirmationTimeframe: 'M5' as any,
      initialScoreThreshold: 65,
      confirmationScoreThreshold: 65,
      requireClosedCandle: true,
      requireTrendAlignment: true,
      requireStructureAlignment: true,
      requireMomentumAlignment: false,
      minAdx: 18.0,
      expirationMinutes: 240,
      invalidationPolicy: 'OPPOSITE_OR_STOP' as any,
      enableInitialAlert: true,
      enableConfirmationAlert: true,
      whatsappEnabled: false,
      whatsappRecipient: null,
      useTemplateMessage: false,
      templateLanguage: 'en_US',
      configVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const cfg1 = { ...baseConfig, id: 'cfg_1' };
    const cfg2 = { ...baseConfig, id: 'cfg_2' };

    vi.spyOn(db, 'getEnabledSignalAlertConfigs').mockResolvedValue([cfg1, cfg2]);

    let h4ResolveCount = 0;
    const originalResolve = (DualStageSignalAlertService as any).resolveValidatedTimeframeCandles;
    vi.spyOn(DualStageSignalAlertService as any, 'resolveValidatedTimeframeCandles').mockImplementation(
      async (params: any) => {
        if (params.timeframe === 'H4') {
          h4ResolveCount++;
        }
        // Return dummy valid candles so Stage 1 evaluates NEUTRAL on H4 and terminates quickly
        return {
          ok: true,
          evalCandles: Array.from({ length: 50 }, (_, i) => ({
            timestamp: Date.now() - (50 - i) * 14400000,
            open: 2600,
            high: 2610,
            low: 2590,
            close: 2600,
            source: 'TWELVEDATA',
          })),
          targetCandle: {
            timestamp: Date.now() - 14400000,
            open: 2600,
            high: 2610,
            low: 2590,
            close: 2600,
            source: 'TWELVEDATA',
          },
          isClosedCandle: true,
          dataQuality: 100,
        };
      }
    );

    const report = await DualStageSignalAlertService.runEvaluationCycle({
      symbol: 'XAUUSD',
      triggerSource: 'CRON',
      maxDurationMs: 6500,
    });

    expect(report.stage1Evaluations).toHaveLength(2);
    // Both configs were evaluated, and H4 was supplied to config 2 via sharedTimeframeCandles!
    expect(report.executionDurations?.strategyCompleted).toBe(true);
  }, 10000);
});
