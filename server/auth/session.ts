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
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createSession(user: { id: string; role: Role }): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  SESSIONS.set(token, {
    token,
    userId: user.id,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  return token;
}

export function getSession(token: string | undefined): Session | null {
  if (!token) return null;
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
