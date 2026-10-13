/**
 * Official Meta WhatsApp Business Platform Cloud API Provider & Notification Queue Processor
 *
 * Architectural Guarantees:
 * 1. Uses ONLY the official Meta Graph API (https://graph.facebook.com/{version}/{phone_number_id}/messages).
 * 2. Never uses unofficial WhatsApp Web scraping or session-based browser automation.
 * 3. Strictly redacts WHATSAPP_ACCESS_TOKEN and WHATSAPP_APP_SECRET from all logs, DB records, and API responses.
 * 4. Separates notification delivery state from trading signal lifecycle state.
 * 5. Protects against duplicate delivery on ambiguous HTTP timeouts (isAmbiguousTimeout = true -> no auto-retry).
 */

import crypto from 'crypto';
import {
  NotificationJob,
  SignalAlertConfig,
  SignalLifecycleEvent,
  WhatsAppConnectionStatus,
} from '../types/index.ts';
import { db } from '../db/storage.ts';
import { getPricePrecisionForPair } from '../engines/signal-scoring.ts';
import { TwelveDataProvider } from '../lib/market-data/twelve-data-provider.ts';

export interface WhatsAppSendResult {
  success: boolean;
  status: 'SENT' | 'FAILED' | 'TIMEOUT_AMBIGUOUS';
  httpStatus?: number | null;
  providerMessageId?: string | null;
  errorCode?: string | null;
  sanitizedResponse?: string | null;
  durationMs: number;
  isRetryable: boolean;
  isAmbiguousTimeout: boolean;
}

export function normalizeWhatsAppRecipient(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return '';
  }
  return digits;
}

export function maskSensitiveIdentifier(value?: string | null, visibleSuffix = 4): string | null {
  if (!value || value.trim().length === 0) return null;
  const clean = value.trim();
  if (clean.length <= visibleSuffix) return '****';
  const prefix = clean.slice(0, Math.min(3, clean.length - visibleSuffix));
  const suffix = clean.slice(-visibleSuffix);
  return `${prefix}****${suffix}`;
}

export function formatJakartaTimestamp(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone: process.env.APP_TIMEZONE || 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(d) + ' WIB'
    );
  } catch {
    return String(isoOrDate);
  }
}

export class WhatsAppCloudProvider {
  private getEnvConfig() {
    const enabled = (process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true';
    const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
    const defaultRecipient = (process.env.WHATSAPP_RECIPIENT_NUMBER || '').trim();
    const apiVersion = (process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
    const webhookVerifyToken = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
    const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();

    return {
      enabled,
      phoneNumberId,
      accessToken,
      defaultRecipient,
      apiVersion: /^v\d+\.\d+$/.test(apiVersion) ? apiVersion : 'v21.0',
      webhookVerifyToken,
      appSecret,
    };
  }

  public redactSecrets(input: string): string {
    if (!input) return '';
    const { accessToken, appSecret } = this.getEnvConfig();
    let out = input;
    if (accessToken && accessToken.length > 4) {
      out = out.split(accessToken).join('[REDACTED_WA_TOKEN]');
    }
    if (appSecret && appSecret.length > 4) {
      out = out.split(appSecret).join('[REDACTED_WA_SECRET]');
    }
    out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
    return out;
  }

  public isConfigured(): boolean {
    const cfg = this.getEnvConfig();
    return Boolean(
      cfg.phoneNumberId &&
        cfg.phoneNumberId.length >= 5 &&
        cfg.accessToken &&
        cfg.accessToken.length >= 10
    );
  }

  public async getConnectionStatus(userId: string): Promise<WhatsAppConnectionStatus> {
    const cfg = this.getEnvConfig();
    const configs = await db.getSignalAlertConfigsByUserId(userId);
    const recentJobs = await db.getNotificationJobsByUserId(userId, 25);

    const verifiedByManualTest = configs.some((c) => Boolean(c.lastVerifiedTestAt));
    const lastSentJob = recentJobs.find((j) => j.status === 'SENT' && j.sentAt);
    const lastFailedJob = recentJobs.find((j) => j.status === 'FAILED');

    const userRecipient = configs.find((c) => c.whatsappRecipient)?.whatsappRecipient || cfg.defaultRecipient;

    return {
      configured: this.isConfigured(),
      envEnabled: cfg.enabled,
      hasPhoneNumberId: Boolean(cfg.phoneNumberId),
      hasAccessToken: Boolean(cfg.accessToken),
      hasDefaultRecipient: Boolean(normalizeWhatsAppRecipient(userRecipient)),
      maskedPhoneNumberId: maskSensitiveIdentifier(cfg.phoneNumberId, 4),
      maskedDefaultRecipient: maskSensitiveIdentifier(userRecipient, 4),
      apiVersion: cfg.apiVersion,
      verifiedByManualTest,
      lastSuccessfulDeliveryAt: lastSentJob?.sentAt || null,
      lastFailureAt: lastFailedJob?.lastAttemptAt || null,
      lastFailureReason: lastFailedJob?.sanitizedError || null,
    };
  }

  /**
   * Formats Stage 1 (INITIAL_SIGNAL) WhatsApp message body
   * Explicitly states that the setup is detected on H4 + H1 + M15 and ENTRY IS NOT YET CONFIRMED (awaiting M5 BOS & closed candle).
   */
  public formatInitialSignalMessage(event: SignalLifecycleEvent): string {
    const precision = getPricePrecisionForPair(event.symbol);
    const extSymbol = TwelveDataProvider.CANONICAL_SYMBOL_MAP[event.symbol] || event.symbol;
    const htfDir = event.htfDirectionTimeframe || 'H4';
    const htfConf = event.htfConfirmationTimeframe || 'H1';
    const candleMode = event.isClosedCandle
      ? 'Confirmed Closed Candle'
      : 'Intrabar Forming Candle (Subject to Invalidation)';

    return [
      `📡 *TRADEPILOT — STAGE 1: INITIAL SETUP ALERT (ENTRY BELUM DIKONFIRMASI)*`,
      ``,
      `⚠️ *STATUS ENTRY*: *BELUM DIKONFIRMASI (ENTRY NOT YET CONFIRMED)*`,
      `Setup awal terdeteksi setelah *${htfDir}*, *${htfConf}*, dan *${event.primaryTimeframe}* memenuhi kriteria. *Jangan eksekusi entry sebelum konfirmasi BOS & candle tertutup pada ${event.confirmationTimeframe} (Stage 2).*`,
      ``,
      `• *Instrument*: ${event.symbol} (${extSymbol})`,
      `• *Setup Direction*: *${event.direction}*`,
      `• *Multi-Timeframe Chain*:`,
      `  1. ${htfDir} Market Direction: *${event.h4Direction || (event.direction === 'BUY' ? 'BULLISH' : 'BEARISH')}*`,
      `  2. ${htfConf} Trend Alignment: *${event.h1Trend || (event.direction === 'BUY' ? 'BULLISH' : 'BEARISH')}* (Aligned)`,
      `  3. ${event.primaryTimeframe} Pullback Setup: *VALID* (${candleMode})`,
      `  4. ${event.confirmationTimeframe} Entry Trigger: *WAITING FOR BOS + CLOSED CANDLE*`,
      `• *Setup Candle Timestamp*: ${formatJakartaTimestamp(event.primaryCandleTimestamp)} (${event.primaryCandleTimestamp})`,
      ``,
      `📊 *Reference Levels (Unconfirmed Setup)*`,
      `• Reference Price: ${event.referencePrice.toFixed(precision)}`,
      `• Planned Entry Zone: ${event.entryPrice.toFixed(precision)}`,
      `• Stop Loss (Invalidation): ${event.stopLoss.toFixed(precision)}`,
      `• Take Profit 1: ${event.takeProfit1.toFixed(precision)}`,
      ...(event.takeProfit2 ? [`• Take Profit 2: ${event.takeProfit2.toFixed(precision)}`] : []),
      `• Risk : Reward: 1 : ${event.riskReward.toFixed(2)}R`,
      ``,
      `🧮 *Technical Confluence Score*: ${event.initialScore}/100 (${event.initialStatus})`,
      `_(Note: Technical confluence score reflects rule alignment, not a statistically calibrated win probability.)_`,
      ``,
      `📝 *Analysis*: ${event.initialExplanation}`,
      `⏳ *Lifecycle Status*: *PENDING_CONFIRMATION* — Menunggu BOS & konfirmasi candle tertutup pada ${event.confirmationTimeframe} (Expires ${formatJakartaTimestamp(event.expiresAt)})`,
      ``,
      `⚠️ _Decision-support alert only. Entry belum dikonfirmasi. No automated trade execution._`,
    ].join('\n');
  }

  /**
   * Formats Stage 2 (CONFIRMED_SIGNAL) WhatsApp message body
   */
  public formatConfirmedSignalMessage(event: SignalLifecycleEvent): string {
    const precision = getPricePrecisionForPair(event.symbol);
    const extSymbol = TwelveDataProvider.CANONICAL_SYMBOL_MAP[event.symbol] || event.symbol;
    const htfDir = event.htfDirectionTimeframe || 'H4';
    const htfConf = event.htfConfirmationTimeframe || 'H1';

    return [
      `✅ *TRADEPILOT — STAGE 2: CONFIRMED ENTRY ALERT*`,
      ``,
      `🟢 *STATUS ENTRY*: *ENTRY DIKONFIRMASI (BOS & CLOSED CANDLE ${event.confirmationTimeframe} TERPENUHI)*`,
      ``,
      `• *Instrument*: ${event.symbol} (${extSymbol})`,
      `• *Confirmed Direction*: *${event.direction}*`,
      `• *4-Timeframe Alignment*: ${htfDir} (${event.h4Direction || 'ALIGNED'}) ➔ ${htfConf} (${event.h1Trend || 'ALIGNED'}) ➔ ${event.primaryTimeframe} (Valid Pullback) ➔ *${event.confirmationTimeframe} (BOS + Closed Candle Confirmed)*`,
      `• *Confirmation Candle*: ${
        event.confirmationCandleTimestamp
          ? `${formatJakartaTimestamp(event.confirmationCandleTimestamp)} (${event.confirmationCandleTimestamp})`
          : 'Latest Validated Closed Bar'
      }`,
      ``,
      `📊 *Validated Trade Plan Levels*`,
      `• Entry Price: ${event.entryPrice.toFixed(precision)}`,
      `• Stop Loss: ${event.stopLoss.toFixed(precision)}`,
      `• Take Profit 1: ${event.takeProfit1.toFixed(precision)}`,
      ...(event.takeProfit2 ? [`• Take Profit 2: ${event.takeProfit2.toFixed(precision)}`] : []),
      `• Risk : Reward: 1 : ${event.riskReward.toFixed(2)}R`,
      ``,
      `🧮 *Scores*: Stage 1 (${event.primaryTimeframe}) ${event.initialScore}/100 ➔ Stage 2 (${event.confirmationTimeframe}) ${event.confirmationScore ?? event.initialScore}/100`,
      `_(Note: Technical confluence score reflects rule alignment, not a guaranteed win probability.)_`,
      ``,
      `🔍 *Confirmation Basis*: ${event.confirmationReason || `${event.confirmationTimeframe} Break of Structure (BOS) and closed confirmation candle rules satisfied.`}`,
      `🟢 *Lifecycle Status*: *CONFIRMED*`,
      ``,
      `⚠️ _Decision-support alert only. No automated trade execution._`,
    ].join('\n');
  }

  /**
   * Builds the Meta WhatsApp Cloud API JSON payload.
   * Supports structured template messages (type: "template") for proactive notifications outside the 24-hour service window.
   */
  public buildCloudApiPayload(params: {
    recipient: string;
    messageBody: string;
    notificationType: 'INITIAL_SIGNAL' | 'CONFIRMED_SIGNAL' | 'MANUAL_TEST';
    config?: SignalAlertConfig;
    event?: SignalLifecycleEvent;
    useTemplateOverride?: boolean;
    templateNameOverride?: string;
  }): Record<string, any> {
    const cleanRecipient = normalizeWhatsAppRecipient(params.recipient);
    const cfg = params.config;
    const shouldUseTemplate = Boolean(
      params.useTemplateOverride ??
        cfg?.useTemplateMessage ??
        (process.env.WHATSAPP_FORCE_TEMPLATE_FOR_PROACTIVE || 'false').toLowerCase() === 'true'
    );

    const defaultTemplateForType =
      params.notificationType === 'INITIAL_SIGNAL'
        ? process.env.WHATSAPP_INITIAL_TEMPLATE_NAME || 'tradepilot_stage1_setup_alert'
        : params.notificationType === 'CONFIRMED_SIGNAL'
        ? process.env.WHATSAPP_CONFIRMATION_TEMPLATE_NAME || 'tradepilot_stage2_entry_confirmed'
        : process.env.WHATSAPP_TEST_TEMPLATE_NAME || 'hello_world';

    const resolvedTemplateName = (
      params.templateNameOverride ||
      (params.notificationType === 'INITIAL_SIGNAL'
        ? cfg?.initialTemplateName
        : params.notificationType === 'CONFIRMED_SIGNAL'
        ? cfg?.confirmationTemplateName
        : null) ||
      defaultTemplateForType
    ).trim();

    if (shouldUseTemplate && resolvedTemplateName) {
      if (params.event) {
        const precision = getPricePrecisionForPair(params.event.symbol);
        const htfDir = params.event.htfDirectionTimeframe || 'H4';
        const htfConf = params.event.htfConfirmationTimeframe || 'H1';
        const stageSummary =
          params.notificationType === 'INITIAL_SIGNAL'
            ? `ENTRY BELUM DIKONFIRMASI (${htfDir}->${htfConf}->${params.event.primaryTimeframe} Pullback; Waiting ${params.event.confirmationTimeframe} BOS)`
            : `ENTRY CONFIRMED (${htfDir}->${htfConf}->${params.event.primaryTimeframe}->${params.event.confirmationTimeframe} BOS + Closed Candle)`;

        return {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanRecipient,
          type: 'template',
          template: {
            name: resolvedTemplateName,
            language: {
              code: cfg?.templateLanguage || 'en_US',
            },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: params.event.symbol },
                  { type: 'text', text: params.event.direction },
                  { type: 'text', text: stageSummary },
                  { type: 'text', text: params.event.entryPrice.toFixed(precision) },
                  { type: 'text', text: params.event.stopLoss.toFixed(precision) },
                  { type: 'text', text: params.event.takeProfit1.toFixed(precision) },
                  {
                    type: 'text',
                    text: `${
                      params.notificationType === 'CONFIRMED_SIGNAL'
                        ? params.event.confirmationScore ?? params.event.initialScore
                        : params.event.initialScore
                    }/100`,
                  },
                ],
              },
            ],
          },
        };
      }

      return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanRecipient,
        type: 'template',
        template: {
          name: resolvedTemplateName,
          language: {
            code: cfg?.templateLanguage || 'en_US',
          },
        },
      };
    }

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanRecipient,
      type: 'text',
      text: {
        preview_url: false,
        body: params.messageBody,
      },
    };
  }

  /**
   * Executes a single HTTP POST call to Meta Graph API with strict timeout & secret redaction.
   */
  public async dispatchPayloadToMeta(payload: Record<string, any>): Promise<WhatsAppSendResult> {
    const startMs = Date.now();
    const env = this.getEnvConfig();

    // Safe Test Mode Guard: Completely intercepts HTTP calls to Meta Graph API
    const isSafeTestMode =
      (process.env.WHATSAPP_SAFE_TEST_MODE || 'false').toLowerCase() === 'true';

    if (isSafeTestMode) {
      return {
        success: true,
        status: 'SENT',
        httpStatus: 200,
        providerMessageId: `wamid.SIMULATED_TEST_${crypto.randomUUID().slice(0, 8)}`,
        sanitizedResponse:
          'Safe test mode active: WhatsApp message dispatch simulated successfully without calling Meta Graph API.',
        durationMs: Date.now() - startMs,
        isRetryable: false,
        isAmbiguousTimeout: false,
      };
    }

    if (!env.enabled) {
      return {
        success: false,
        status: 'FAILED',
        httpStatus: 503,
        errorCode: 'WHATSAPP_DISABLED_IN_ENV',
        sanitizedResponse: 'WHATSAPP_ENABLED is set to false in server environment variables.',
        durationMs: Date.now() - startMs,
        isRetryable: false,
        isAmbiguousTimeout: false,
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'FAILED',
        httpStatus: 401,
        errorCode: 'WHATSAPP_CREDENTIALS_MISSING',
        sanitizedResponse:
          'Meta WhatsApp Cloud API credentials (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN) are missing.',
        durationMs: Date.now() - startMs,
        isRetryable: false,
        isAmbiguousTimeout: false,
      };
    }

    const url = `https://graph.facebook.com/${env.apiVersion}/${env.phoneNumberId}/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'TradePilot-WhatsApp-Notifier/1.0',
        },
        body: JSON.stringify(payload),
      });
      clearTimeout(timeout);

      const durationMs = Date.now() - startMs;
      let rawText = '';
      let parsed: any = null;
      try {
        rawText = await response.text();
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsed = null;
      }

      if (response.ok) {
        const msgId = parsed?.messages?.[0]?.id || null;
        return {
          success: true,
          status: 'SENT',
          httpStatus: response.status,
          providerMessageId: msgId,
          errorCode: null,
          sanitizedResponse: `Delivered to Meta Cloud API (message_id: ${msgId || 'accepted'})`,
          durationMs,
          isRetryable: false,
          isAmbiguousTimeout: false,
        };
      }

      const metaError = parsed?.error;
      const errCode = metaError?.code ? `META_${metaError.code}` : `HTTP_${response.status}`;
      const errMessage = this.redactSecrets(
        metaError?.message || rawText.slice(0, 240) || `HTTP ${response.status} from Meta Graph API`
      );
      const isRetryable = response.status >= 500 || response.status === 429;

      return {
        success: false,
        status: 'FAILED',
        httpStatus: response.status,
        providerMessageId: null,
        errorCode: errCode,
        sanitizedResponse: errMessage,
        durationMs,
        isRetryable,
        isAmbiguousTimeout: false,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      const durationMs = Date.now() - startMs;
      const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';

      if (isTimeout) {
        return {
          success: false,
          status: 'TIMEOUT_AMBIGUOUS',
          httpStatus: 504,
          providerMessageId: null,
          errorCode: 'WHATSAPP_AMBIGUOUS_TIMEOUT',
          sanitizedResponse:
            'Request to Meta WhatsApp Cloud API timed out after dispatch. Automatic retry suppressed to prevent duplicate message delivery.',
          durationMs,
          isRetryable: false,
          isAmbiguousTimeout: true,
        };
      }

      return {
        success: false,
        status: 'FAILED',
        httpStatus: 502,
        providerMessageId: null,
        errorCode: 'WHATSAPP_NETWORK_ERROR',
        sanitizedResponse: this.redactSecrets(err?.message || 'Network failure connecting to Meta Graph API'),
        durationMs,
        isRetryable: true,
        isAmbiguousTimeout: false,
      };
    }
  }

  /**
   * Queues and optionally dispatches a Stage 1 or Stage 2 signal notification job idempotently.
   * Respects the rule: "Do not activate message delivery until configuration and a manual test have succeeded."
   */
  public async enqueueSignalNotification(params: {
    userId: string;
    config: SignalAlertConfig;
    event: SignalLifecycleEvent;
    notificationType: 'INITIAL_SIGNAL' | 'CONFIRMED_SIGNAL';
    dispatchImmediately?: boolean;
  }): Promise<{
    queued: boolean;
    skippedReason?: string;
    job?: NotificationJob;
  }> {
    const { userId, config, event, notificationType, dispatchImmediately = true } = params;
    const env = this.getEnvConfig();

    if (!config.whatsappEnabled) {
      return {
        queued: false,
        skippedReason: 'WhatsApp delivery is disabled on this symbol alert configuration.',
      };
    }

    if (!env.enabled || !this.isConfigured()) {
      return {
        queued: false,
        skippedReason: 'Server WHATSAPP_ENABLED is false or Meta Cloud API credentials are not configured.',
      };
    }

    if (!config.lastVerifiedTestAt) {
      return {
        queued: false,
        skippedReason:
          'WhatsApp delivery requires a successful manual test verification before automated signal delivery is activated.',
      };
    }

    const rawRecipient = config.whatsappRecipient || env.defaultRecipient;
    const recipient = normalizeWhatsAppRecipient(rawRecipient);
    if (!recipient) {
      return {
        queued: false,
        skippedReason: 'No valid E.164 WhatsApp recipient phone number configured.',
      };
    }

    const idempotencyKey = `wa:${notificationType}:${event.id}`;
    const existingJob = await db.getNotificationJobByIdempotencyKey(idempotencyKey);
    if (existingJob) {
      return { queued: true, job: existingJob };
    }

    const messageBody =
      notificationType === 'INITIAL_SIGNAL'
        ? this.formatInitialSignalMessage(event)
        : this.formatConfirmedSignalMessage(event);

    const payloadJson = this.buildCloudApiPayload({
      recipient,
      messageBody,
      notificationType,
      config,
      event,
    });

    const job = await db.createNotificationJob({
      id: crypto.randomUUID(),
      userId,
      signalEventId: event.id,
      notificationType,
      idempotencyKey,
      channel: 'WHATSAPP',
      recipient,
      payloadJson,
      messageBody,
      status: 'PENDING',
      attemptCount: 0,
      maxAttempts: 3,
      nextRetryAt: new Date().toISOString(),
      isAmbiguousTimeout: false,
    });

    // Update SignalLifecycleEvent notification delivery status to NOTIFICATION_PENDING
    await db.updateSignalLifecycleEvent(
      event.id,
      notificationType === 'INITIAL_SIGNAL'
        ? { initialNotificationStatus: 'NOTIFICATION_PENDING' }
        : { confirmationNotificationStatus: 'NOTIFICATION_PENDING' }
    );

    if (dispatchImmediately) {
      const processedJob = await this.processJob(job);
      return { queued: true, job: processedJob };
    }

    return { queued: true, job };
  }

  /**
   * Sends a manual test message to verify WhatsApp Cloud API credentials & recipient before enabling automation.
   */
  public async sendManualTestMessage(params: {
    userId: string;
    recipientOverride?: string;
  }): Promise<{
    success: boolean;
    job: NotificationJob;
    error?: string;
  }> {
    const env = this.getEnvConfig();
    const configs = await db.getSignalAlertConfigsByUserId(params.userId);
    const rawRecipient =
      params.recipientOverride ||
      configs.find((c) => c.whatsappRecipient)?.whatsappRecipient ||
      env.defaultRecipient;

    const recipient = normalizeWhatsAppRecipient(rawRecipient);
    if (!recipient) {
      throw new Error(
        'Invalid or missing WhatsApp recipient phone number. Provide an international number (e.g., 6281234567890).'
      );
    }

    const nowIso = new Date().toISOString();
    const messageBody = [
      `🔔 *TRADEPILOT — WHATSAPP CLOUD API VERIFICATION*`,
      ``,
      `Your TradePilot Dual-Stage Signal Alert integration with the official Meta WhatsApp Business Cloud API is active and verified.`,
      ``,
      `• *Timestamp*: ${formatJakartaTimestamp(nowIso)}`,
      `• *Primary Default Pair*: XAUUSD (H4 Bias ➔ H1 Trend ➔ M15 Pullback ➔ M5 BOS + Closed Candle)`,
      `• *Data Provider*: Twelve Data (REAL Mode)`,
      ``,
      `⚠️ _Decision-support notification channel only. TradePilot never executes trades automatically._`,
    ].join('\n');

    const payloadJson = this.buildCloudApiPayload({
      recipient,
      messageBody,
      notificationType: 'MANUAL_TEST',
    });

    const job = await db.createNotificationJob({
      id: crypto.randomUUID(),
      userId: params.userId,
      signalEventId: null,
      notificationType: 'MANUAL_TEST',
      idempotencyKey: `wa:MANUAL_TEST:${params.userId}:${Date.now()}`,
      channel: 'WHATSAPP',
      recipient,
      payloadJson,
      messageBody,
      status: 'PENDING',
      attemptCount: 0,
      maxAttempts: 1,
      nextRetryAt: nowIso,
      isAmbiguousTimeout: false,
    });

    const processed = await this.processJob(job);
    if (processed.status === 'SENT') {
      await db.markWhatsAppVerifiedForUser(params.userId, new Date());
      return { success: true, job: processed };
    }

    return {
      success: false,
      job: processed,
      error: processed.sanitizedError || 'WhatsApp manual test delivery failed.',
    };
  }

  /**
   * Processes a single NotificationJob and records the NotificationAttempt.
   */
  public async processJob(job: NotificationJob): Promise<NotificationJob> {
    if (job.status === 'SENT' || job.isAmbiguousTimeout) {
      return job;
    }

    const result = await this.dispatchPayloadToMeta(job.payloadJson);
    const attemptNumber = job.attemptCount + 1;

    let nextRetryAt: Date | null = null;
    if (!result.success && result.isRetryable && !result.isAmbiguousTimeout && attemptNumber < job.maxAttempts) {
      const backoffSeconds = attemptNumber === 1 ? 30 : 120;
      nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
    }

    return db.recordNotificationAttempt({
      jobId: job.id,
      status: result.status,
      httpStatus: result.httpStatus,
      providerMessageId: result.providerMessageId,
      errorCode: result.errorCode,
      sanitizedResponse: result.sanitizedResponse,
      durationMs: result.durationMs,
      nextRetryAt,
      isAmbiguousTimeout: result.isAmbiguousTimeout,
    });
  }

  /**
   * Processes all due pending/retry-scheduled jobs in the notification queue.
   */
  public async processPendingQueue(limit: number = 10, userId?: string): Promise<{
    processedCount: number;
    sentCount: number;
    failedCount: number;
    jobs: NotificationJob[];
  }> {
    const pending = await db.getPendingNotificationJobs(limit, userId);
    const results: NotificationJob[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const job of pending) {
      const updated = await this.processJob(job);
      results.push(updated);
      if (updated.status === 'SENT') sentCount++;
      else if (updated.status === 'FAILED') failedCount++;
    }

    return {
      processedCount: results.length,
      sentCount,
      failedCount,
      jobs: results,
    };
  }

  /**
   * Verifies optional Meta Webhook X-Hub-Signature-256 header when WHATSAPP_APP_SECRET is set.
   */
  public verifyWebhookSignature(rawBody: string, signatureHeader?: string): boolean {
    const { appSecret } = this.getEnvConfig();
    if (!appSecret) return true;
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
    const expected =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  public verifyWebhookChallenge(mode?: string, token?: string, challenge?: string): {
    verified: boolean;
    challenge?: string;
  } {
    const { webhookVerifyToken } = this.getEnvConfig();
    if (mode === 'subscribe' && webhookVerifyToken && token === webhookVerifyToken) {
      return { verified: true, challenge: challenge || '' };
    }
    return { verified: false };
  }
}

export const whatsappCloudProvider = new WhatsAppCloudProvider();
