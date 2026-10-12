/**
 * Twelve Data Basic 8 Credit Budget & Rate-Limit Protection Service
 *
 * Passively tracks API credit consumption per minute and per UTC day without polling
 * external /api_usage endpoints. Reserves headroom so background Dual-Stage Signal
 * evaluations never starve interactive user chart requests or exceed Twelve Data Basic 8 limits.
 */

export interface TwelveDataBudgetSnapshot {
  creditsUsedThisMinute: number;
  maxCreditsPerMinute: number;
  creditsUsedToday: number;
  maxCreditsPerDay: number;
  providerReportedCreditsUsed: number | null;
  providerReportedCreditsLeft: number | null;
  isRateLimited: boolean;
  rateLimitResetAt: string | null;
}

class TwelveDataBudgetManager {
  private minuteTimestamps: number[] = [];
  private dayKey: string = new Date().toISOString().slice(0, 10);
  private dayCreditsUsed: number = 0;
  private providerReportedUsed: number | null = null;
  private providerReportedLeft: number | null = null;
  private rateLimitedUntilMs: number = 0;

  public getMaxPerMinute(): number {
    const raw = Number(process.env.TWELVEDATA_MAX_CREDITS_PER_MINUTE || 6);
    return Number.isFinite(raw) && raw >= 1 && raw <= 60 ? raw : 6;
  }

  public getMaxPerDay(): number {
    const raw = Number(process.env.TWELVEDATA_MAX_CREDITS_PER_DAY || 750);
    return Number.isFinite(raw) && raw >= 10 ? raw : 750;
  }

  private pruneOldTimestamps(nowMs: number = Date.now()): void {
    const oneMinuteAgo = nowMs - 60_000;
    this.minuteTimestamps = this.minuteTimestamps.filter((ts) => ts > oneMinuteAgo);

    const currentDayKey = new Date(nowMs).toISOString().slice(0, 10);
    if (currentDayKey !== this.dayKey) {
      this.dayKey = currentDayKey;
      this.dayCreditsUsed = 0;
    }
  }

  /**
   * Checks whether a background alert evaluation job is permitted to make a Twelve Data HTTP request.
   */
  public canSpendBackgroundCredit(creditsNeeded: number = 1, nowMs: number = Date.now()): {
    allowed: boolean;
    reason?: string;
    snapshot: TwelveDataBudgetSnapshot;
  } {
    this.pruneOldTimestamps(nowMs);

    if (nowMs < this.rateLimitedUntilMs) {
      return {
        allowed: false,
        reason: `Twelve Data provider rate-limit cooldown active until ${new Date(this.rateLimitedUntilMs).toISOString()}`,
        snapshot: this.getSnapshot(nowMs),
      };
    }

    const maxMinute = this.getMaxPerMinute();
    if (this.minuteTimestamps.length + creditsNeeded > maxMinute) {
      return {
        allowed: false,
        reason: `Twelve Data per-minute budget reached (${this.minuteTimestamps.length}/${maxMinute} credits/min used). Evaluation deferred to protect Basic 8 quota.`,
        snapshot: this.getSnapshot(nowMs),
      };
    }

    const maxDay = this.getMaxPerDay();
    const effectiveDayUsed =
      this.providerReportedUsed !== null
        ? Math.max(this.dayCreditsUsed, this.providerReportedUsed)
        : this.dayCreditsUsed;

    if (effectiveDayUsed + creditsNeeded > maxDay) {
      return {
        allowed: false,
        reason: `Twelve Data daily budget reached (${effectiveDayUsed}/${maxDay} credits/day used). Evaluation deferred.`,
        snapshot: this.getSnapshot(nowMs),
      };
    }

    if (this.providerReportedLeft !== null && this.providerReportedLeft < creditsNeeded) {
      return {
        allowed: false,
        reason: `Twelve Data reported 0 remaining API credits (${this.providerReportedLeft} left). Evaluation deferred.`,
        snapshot: this.getSnapshot(nowMs),
      };
    }

    return {
      allowed: true,
      snapshot: this.getSnapshot(nowMs),
    };
  }

  /**
   * Records an outbound Twelve Data request and any credit telemetry headers returned by the response.
   */
  public recordCreditUsage(
    credits: number = 1,
    headers?: {
      creditsUsed?: number | null;
      creditsLeft?: number | null;
    },
    nowMs: number = Date.now()
  ): void {
    this.pruneOldTimestamps(nowMs);
    for (let i = 0; i < credits; i++) {
      this.minuteTimestamps.push(nowMs);
    }
    this.dayCreditsUsed += credits;

    if (headers?.creditsUsed !== undefined && headers.creditsUsed !== null && Number.isFinite(headers.creditsUsed)) {
      this.providerReportedUsed = headers.creditsUsed;
    }
    if (headers?.creditsLeft !== undefined && headers.creditsLeft !== null && Number.isFinite(headers.creditsLeft)) {
      this.providerReportedLeft = headers.creditsLeft;
    }
  }

  public recordRateLimitHit(cooldownMs: number = 60_000, nowMs: number = Date.now()): void {
    this.rateLimitedUntilMs = Math.max(this.rateLimitedUntilMs, nowMs + cooldownMs);
  }

  public getSnapshot(nowMs: number = Date.now()): TwelveDataBudgetSnapshot {
    this.pruneOldTimestamps(nowMs);
    const isRateLimited = nowMs < this.rateLimitedUntilMs;
    return {
      creditsUsedThisMinute: this.minuteTimestamps.length,
      maxCreditsPerMinute: this.getMaxPerMinute(),
      creditsUsedToday:
        this.providerReportedUsed !== null
          ? Math.max(this.dayCreditsUsed, this.providerReportedUsed)
          : this.dayCreditsUsed,
      maxCreditsPerDay: this.getMaxPerDay(),
      providerReportedCreditsUsed: this.providerReportedUsed,
      providerReportedCreditsLeft: this.providerReportedLeft,
      isRateLimited,
      rateLimitResetAt: isRateLimited ? new Date(this.rateLimitedUntilMs).toISOString() : null,
    };
  }

  public resetForTests(): void {
    this.minuteTimestamps = [];
    this.dayCreditsUsed = 0;
    this.providerReportedUsed = null;
    this.providerReportedLeft = null;
    this.rateLimitedUntilMs = 0;
  }
}

export const twelveDataBudget = new TwelveDataBudgetManager();
