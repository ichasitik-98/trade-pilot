/**
 * Timezone & Timestamp Utility
 * TradePilot Decision-Support Platform
 *
 * CORE ARCHITECTURAL INVARIANCE:
 * 1. Neon PostgreSQL database strictly stores timestamps in UTC.
 * 2. Jakarta (or configured APP_TIMEZONE) is used for display presentation only.
 * 3. Never shift timestamps twice.
 */

export const DEFAULT_APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';

/**
 * Normalizes any timestamp representation (Twelve Data datetime string, unix epoch, Date object)
 * into a UTC epoch timestamp (milliseconds).
 *
 * Twelve Data format can be:
 * - "2026-09-30 02:00:00"
 * - "2026-09-29" (daily)
 * - ISO string "2026-09-30T02:00:00.000Z"
 */
export function parseToUtcTimestamp(rawDatetime: string | number | Date): number {
  if (typeof rawDatetime === 'number') {
    return rawDatetime;
  }
  if (rawDatetime instanceof Date) {
    return rawDatetime.getTime();
  }

  const str = String(rawDatetime).trim();

  // If already standard ISO with Z or offset, parse directly
  if (str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
    return new Date(str).getTime();
  }

  // Handle "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD"
  const [datePart, timePart = '00:00:00'] = str.split(' ');
  const isoUtc = `${datePart}T${timePart}Z`;
  const parsed = new Date(isoUtc).getTime();

  if (isNaN(parsed)) {
    throw new Error(`Invalid timestamp format: "${rawDatetime}"`);
  }

  return parsed;
}

/**
 * Converts a timestamp to ISO UTC string (e.g. "2026-09-30T02:00:00.000Z")
 */
export function toUtcIsoString(rawDatetime: string | number | Date): string {
  const ts = parseToUtcTimestamp(rawDatetime);
  return new Date(ts).toISOString();
}

/**
 * Formats a UTC timestamp into the configured presentation timezone (e.g. Asia/Jakarta - UTC+7)
 */
export function formatToTimezone(
  rawDatetime: string | number | Date,
  timezone: string = DEFAULT_APP_TIMEZONE
): string {
  const date = typeof rawDatetime === 'object' && rawDatetime instanceof Date
    ? rawDatetime
    : new Date(parseToUtcTimestamp(rawDatetime));

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return formatter.format(date).replace(' ', 'T');
}
