import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User, Role } from '../types/index.ts';

export interface Session {
  token: string;
  userId: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
}

const SESSIONS = new Map<string, Session>();
const REVOKED_TOKENS = new Set<string>();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET;
  if (secret && secret.trim().length >= 16) {
    return secret.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[Auth Security] WARNING: AUTH_SECRET is not set or too short (<16 chars). Please set AUTH_SECRET in your production environment variables.'
    );
  }
  return 'tradepilot-default-dev-auth-secret-key-2026-hmac-sha256';
}

function signPayload(payloadBase64: string): string {
  return crypto
    .createHmac('sha256', getAuthSecret())
    .update(payloadBase64)
    .digest('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Creates a cryptographically signed stateless session token (HMAC-SHA256)
 * compatible with Vercel Serverless cold starts and multi-instance deployments.
 */
export function createSession(user: { id: string; role: Role }): string {
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(8).toString('hex');

  const payload = {
    u: user.id,
    r: user.role,
    c: now,
    e: expiresAt,
    n: nonce,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(payloadBase64);
  const token = `${payloadBase64}.${signature}`;

  const session: Session = {
    token,
    userId: user.id,
    role: user.role,
    createdAt: now,
    expiresAt,
  };

  SESSIONS.set(token, session);
  return token;
}

/**
 * Verifies a session token via HMAC-SHA256 signature (stateless & serverless-safe)
 * with in-memory revocation check.
 */
export function getSession(token: string | undefined): Session | null {
  if (!token) return null;
  if (REVOKED_TOKENS.has(token)) return null;

  // 1. Verify stateless signed token (payload.signature)
  if (token.includes('.')) {
    const parts = token.split('.');
    if (parts.length === 2) {
      const [payloadBase64, providedSig] = parts;
      const expectedSig = signPayload(payloadBase64);

      const providedBuf = Buffer.from(providedSig, 'utf8');
      const expectedBuf = Buffer.from(expectedSig, 'utf8');

      if (
        providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf)
      ) {
        try {
          const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
          if (!decoded.u || !decoded.e || Date.now() > decoded.e) {
            SESSIONS.delete(token);
            return null;
          }
          return {
            token,
            userId: decoded.u,
            role: decoded.r || 'USER',
            createdAt: decoded.c || Date.now(),
            expiresAt: decoded.e,
          };
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  // 2. Fallback for legacy in-memory tokens
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    SESSIONS.delete(token);
    return null;
  }
  return session;
}

export function destroySession(token: string | undefined): void {
  if (token) {
    SESSIONS.delete(token);
    REVOKED_TOKENS.add(token);
  }
}

export function assertOwnership(
  resourceUserId: string,
  currentUserId: string,
  userRole?: Role
): void {
  if (userRole === 'ADMIN') return;
  if (resourceUserId !== currentUserId) {
    const error = new Error('Access denied: You do not own this resource');
    (error as any).statusCode = 403;
    throw error;
  }
}

export function sanitizeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}
