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
});
