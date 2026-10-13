/**
 * TradePilot — Scheduler & QStash Signature Authentication Guard
 *
 * Implements:
 * 1. Constant-time secret comparison (timingSafeCompare) for CRON_SECRET to eliminate timing attack vectors.
 * 2. Official Upstash QStash signature verification using @upstash/qstash Receiver.
 *    - Verifies upstash-signature against raw request body and target URL.
 *    - Validates with QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.
 *    - Never logs secrets, tokens, or raw keys.
 * 3. Separate feature-flag gating:
 *    - QSTASH_SCHEDULER_ENABLED / EXTERNAL_SCHEDULER_ENABLED for external QStash calls (default: false).
 *    - ALERT_SCHEDULER_ENABLED for internal scheduler calls (default: false).
 */

import crypto from 'crypto';
import { Request } from 'express';
import { Receiver } from '@upstash/qstash';

export interface SchedulerAuthResult {
  authenticated: boolean;
  isQStash: boolean;
  status: 'AUTHORIZED' | 'UNAUTHORIZED' | 'DISABLED';
  statusCode: number;
  error?: string;
  reason?: string;
}

/**
 * Constant-time comparison between two secret strings to prevent timing attacks.
 */
export function timingSafeCompare(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Perform dummy constant-time comparison on same length to equalize timing profile
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies QStash signature from incoming request.
 */
export async function verifyQStashSignature(params: {
  signature: string;
  rawBody: string;
  url?: string;
}): Promise<{ valid: boolean; reason?: string }> {
  const currentSigningKey = (process.env.QSTASH_CURRENT_SIGNING_KEY || '').trim();
  const nextSigningKey = (process.env.QSTASH_NEXT_SIGNING_KEY || '').trim();

  if (!currentSigningKey && !nextSigningKey) {
    return {
      valid: false,
      reason: 'QStash signing keys are not configured in environment variables (QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY).',
    };
  }

  try {
    const receiver = new Receiver({
      currentSigningKey: currentSigningKey || nextSigningKey,
      nextSigningKey: nextSigningKey || currentSigningKey,
      devMode: false,
    });

    // Check signature with raw request body and optional URL subject check
    const verifyOpts: { signature: string; body: string; url?: string } = {
      signature: params.signature,
      body: params.rawBody || '',
    };

    if (params.url) {
      verifyOpts.url = params.url;
    }

    const isValid = await receiver.verify(verifyOpts);
    return { valid: isValid };
  } catch (err: any) {
    return {
      valid: false,
      reason: `QStash signature verification failed: ${err?.message || 'Invalid signature'}`,
    };
  }
}

/**
 * Authenticates incoming request to /api/alerts/cron.
 * Distinguishes QStash signatures from internal CRON_SECRET headers.
 */
export async function authenticateSchedulerRequest(req: Request): Promise<SchedulerAuthResult> {
  const qstashSignatureHeader = req.headers['upstash-signature'];
  const qstashSignature = typeof qstashSignatureHeader === 'string'
    ? qstashSignatureHeader.trim()
    : Array.isArray(qstashSignatureHeader)
    ? qstashSignatureHeader[0]?.trim()
    : '';

  // 1. QStash Invocation Path
  if (qstashSignature) {
    const rawBody = (req as any).rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    
    // Resolve destination URL
    const expectedUrlFromEnv = (process.env.QSTASH_EXPECTED_URL || '').trim();
    const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    const defaultProdUrl = 'https://trade-pilot-sage.vercel.app/api/alerts/cron';
    
    // Attempt verification with configured target URL
    const targetUrl = expectedUrlFromEnv || (appUrl ? `${appUrl}/api/alerts/cron` : defaultProdUrl);
    
    // First try with targetUrl
    let verification = await verifyQStashSignature({
      signature: qstashSignature,
      rawBody: typeof rawBody === 'string' ? rawBody : '',
      url: targetUrl,
    });

    // If subject check failed due to URL discrepancy, try with current request URL or without url constraint if allowed
    if (!verification.valid && verification.reason?.includes('invalid subject')) {
      const host = req.get('host');
      const reqUrl = host ? `${req.protocol}://${host}${req.originalUrl.split('?')[0]}` : undefined;
      if (reqUrl && reqUrl !== targetUrl) {
        verification = await verifyQStashSignature({
          signature: qstashSignature,
          rawBody: typeof rawBody === 'string' ? rawBody : '',
          url: reqUrl,
        });
      }
    }

    if (!verification.valid) {
      return {
        authenticated: false,
        isQStash: true,
        status: 'UNAUTHORIZED',
        statusCode: 401,
        error: 'Unauthorized: Invalid QStash signature',
      };
    }

    // Check external scheduler feature flag
    const externalSchedulerEnabled =
      (process.env.QSTASH_SCHEDULER_ENABLED || process.env.EXTERNAL_SCHEDULER_ENABLED || 'false')
        .toLowerCase() === 'true';

    if (!externalSchedulerEnabled) {
      return {
        authenticated: true,
        isQStash: true,
        status: 'DISABLED',
        statusCode: 200,
        reason:
          'External QStash scheduler is disabled (QSTASH_SCHEDULER_ENABLED=false). Keep disabled until all validation gates and manual WhatsApp test succeed.',
      };
    }

    return {
      authenticated: true,
      isQStash: true,
      status: 'AUTHORIZED',
      statusCode: 200,
    };
  }

  // 2. Internal / Admin CRON_SECRET Path
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const customHeader = String(req.headers['x-cron-secret'] || '').trim();

  const isBearerValid = timingSafeCompare(bearerToken, cronSecret);
  const isCustomValid = timingSafeCompare(customHeader, cronSecret);

  if (!cronSecret || (!isBearerValid && !isCustomValid)) {
    return {
      authenticated: false,
      isQStash: false,
      status: 'UNAUTHORIZED',
      statusCode: 401,
      error: 'Unauthorized: Valid CRON_SECRET or QStash signature required',
    };
  }

  // Check internal scheduler feature flag
  const internalSchedulerEnabled =
    (process.env.ALERT_SCHEDULER_ENABLED || 'false').toLowerCase() === 'true';

  if (!internalSchedulerEnabled) {
    return {
      authenticated: true,
      isQStash: false,
      status: 'DISABLED',
      statusCode: 200,
      reason:
        'Automated alert scheduler is disabled (ALERT_SCHEDULER_ENABLED=false). Keep disabled until all validation gates and manual WhatsApp test succeed.',
    };
  }

  return {
    authenticated: true,
    isQStash: false,
    status: 'AUTHORIZED',
    statusCode: 200,
  };
}
