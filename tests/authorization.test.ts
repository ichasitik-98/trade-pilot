import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  comparePassword,
  assertOwnership,
  createSession,
  getSession,
  destroySession,
} from '../server/auth/session.ts';

describe('Authentication & Authorization / IDOR Prevention Tests', () => {
  it('hashes passwords securely and verifies them with bcrypt', async () => {
    const plain = 'SecretTraderPass2026!';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash.startsWith('$2')).toBe(true); // bcrypt signature

    const isValid = await comparePassword(plain, hash);
    expect(isValid).toBe(true);

    const isInvalid = await comparePassword('WrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('enforces IDOR prevention: blocks User B from accessing User A resources with 403', () => {
    const userA_id = 'usr_001_alice';
    const userB_id = 'usr_002_bob';

    // Alice accessing Alice's resource -> allowed
    expect(() => assertOwnership(userA_id, userA_id, 'USER')).not.toThrow();

    // Bob attempting to access Alice's resource -> throws 403 Forbidden
    expect(() => assertOwnership(userA_id, userB_id, 'USER')).toThrowError(/Access denied/);

    try {
      assertOwnership(userA_id, userB_id, 'USER');
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
    }
  });

  it('allows ADMIN users to inspect resources for compliance and support', () => {
    const userA_id = 'usr_001_alice';
    const adminId = 'usr_admin_09';

    expect(() => assertOwnership(userA_id, adminId, 'ADMIN')).not.toThrow();
  });

  it('creates, retrieves, and expires session tokens properly', () => {
    const token = createSession({ id: 'u1', role: 'USER' });
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const session = getSession(token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe('u1');

    destroySession(token);
    expect(getSession(token)).toBeNull();
  });
});
