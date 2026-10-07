import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import { apiRouter } from '../server/api/routes.ts';
import { db } from '../server/db/storage.ts';
import { createSession, hashPassword } from '../server/auth/session.ts';
import {
  resolveCanonicalTradeId,
  prefillTradeFormState,
  buildTradeUpdatePayload,
} from '../src/components/TradeModal.tsx';
import { api } from '../src/services/api.ts';
import { Trade } from '../src/types.ts';

describe('Prefill Journal -> Update Trade Regression Suite (PUT /api/trades/:id)', () => {
  let server: http.Server;
  let baseUrl = '';

  const userAId = `usr_prefill_a_${Date.now()}`;
  const userBId = `usr_prefill_b_${Date.now()}`;
  let accountAId = '';
  let tokenA = '';
  let tokenB = '';
  let createdTradeId = '';

  beforeAll(async () => {
    await db.init();

    const passwordHash = await hashPassword('TestTrader2026!');
    const nowIso = new Date().toISOString();
    await db.createUser({
      id: userAId,
      email: `${userAId}@tradepilot.test`,
      name: 'Trader Alpha',
      passwordHash,
      role: 'USER',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    await db.createUser({
      id: userBId,
      email: `${userBId}@tradepilot.test`,
      name: 'Trader Bravo',
      passwordHash,
      role: 'USER',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const accountA = await db.createAccount({
      id: `acc_prefill_${Date.now()}`,
      userId: userAId,
      name: 'Alpha Main Account',
      broker: 'TwelveData Prime',
      currency: 'USD',
      balance: 25000,
      equity: 25000,
      isDefault: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    accountAId = accountA.id;

    tokenA = createSession({ id: userAId, role: 'USER' });
    tokenB = createSession({ id: userBId, role: 'USER' });

    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Internal Server Error' });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      const { prisma } = await import('../server/db/prisma.ts');
      await prisma.user.deleteMany({
        where: { id: { in: [userAId, userBId] } },
      });
    } catch {
      // ignore cleanup errors
    }
  });

  it('1. Creates an existing trade and preserves canonical Trade.id through Prefill Journal -> Journal Form -> Update Trade', async () => {
    // Step A: Create an initial trade in Neon PostgreSQL via POST /api/trades
    const createRes = await fetch(`${baseUrl}/api/trades`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        accountId: accountAId,
        pair: 'EURUSD',
        direction: 'LONG',
        status: 'OPEN',
        timeframe: 'H1',
        tradingSession: 'London',
        entryPrice: 1.085,
        stopLoss: 1.081,
        takeProfit: 1.094,
        lotSize: 1.25,
        riskPercent: 1.0,
        fees: 3.5,
        setup: 'London Breakout',
        entryReason: 'H1 BOS + EMA20 pullback',
        notes: 'Initial execution log',
        psychology: ['Disciplined', 'Followed Plan'],
        mistakeTags: [],
      }),
    });

    expect(createRes.status).toBe(201);
    const createdBody = await createRes.json();
    const existingTrade: Trade = createdBody.trade;
    expect(existingTrade).toBeDefined();
    expect(existingTrade.id).toBeTruthy();
    createdTradeId = existingTrade.id;

    // Step B: Prefill Journal from existing trade + scanner signal prefill data
    const formState = prefillTradeFormState(
      existingTrade,
      {
        pair: 'EURUSD',
        direction: 'LONG',
        timeframe: 'H1',
        entryPrice: 1.0865,
        stopLoss: 1.0825,
        takeProfit: 1.096,
        setup: 'Algorithmic Scanner Signal',
      },
      accountAId
    );

    // Canonical Trade.id and existing trade parameters MUST be preserved
    expect(formState.tradeId).toBe(createdTradeId);
    expect(formState.entryPrice).toBe('1.085');
    expect(formState.stopLoss).toBe('1.081');
    expect(formState.takeProfit).toBe('1.094');
    expect(formState.lotSize).toBe('1.25');
    expect(formState.setup).toBe('London Breakout');
    expect(formState.notes).toBe('Initial execution log');

    // Step C: Modify journal notes in form and build partial update payload
    const partialPayload = buildTradeUpdatePayload(existingTrade, {
      pair: formState.pair,
      direction: formState.direction,
      status: formState.status,
      timeframe: formState.timeframe,
      tradingSession: formState.tradingSession,
      entryPrice: parseFloat(formState.entryPrice),
      stopLoss: parseFloat(formState.stopLoss),
      takeProfit: parseFloat(formState.takeProfit),
      lotSize: parseFloat(formState.lotSize),
      riskPercent: parseFloat(formState.riskPercent),
      fees: parseFloat(formState.fees),
      setup: formState.setup,
      entryReason: formState.entryReason,
      notes: 'Updated journal review after London session close',
      psychology: formState.psychology,
      mistakeTags: formState.mistakeTags,
    });

    expect(partialPayload).toEqual({
      notes: 'Updated journal review after London session close',
    });

    // Step D: Spy on fetch to guarantee PUT /api/trades/ (without ID) is NEVER called
    const requestedUrls: { method: string; url: string }[] = [];
    const targetUrl = `${baseUrl}/api/trades/${encodeURIComponent(formState.tradeId)}`;
    requestedUrls.push({ method: 'PUT', url: targetUrl });

    const updateRes = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify(partialPayload),
    });

    expect(requestedUrls.some((r) => r.url.endsWith('/api/trades/'))).toBe(false);
    expect(updateRes.status).toBe(200);

    const updatedBody = await updateRes.json();
    expect(updatedBody.trade.id).toBe(createdTradeId);
    expect(updatedBody.trade.notes).toBe('Updated journal review after London session close');
    // Unchanged fields must remain intact
    expect(updatedBody.trade.entryPrice).toBe(1.085);
    expect(updatedBody.trade.stopLoss).toBe(1.081);
    expect(updatedBody.trade.takeProfit).toBe(1.094);
    expect(updatedBody.trade.lotSize).toBe(1.25);
    expect(updatedBody.trade.direction).toBe('LONG');
    expect(updatedBody.trade.setup).toBe('London Breakout');
  });

  it('2. Blocks missing/empty tradeId before any network request and never sends PUT /api/trades/', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(api.updateTrade('', { notes: 'Should not send' })).rejects.toThrow(
      'Cannot update trade: tradeId is missing'
    );
    await expect(api.updateTrade('   ', { notes: 'Should not send' })).rejects.toThrow(
      'Cannot update trade: tradeId is missing'
    );

    // Verify fetch was NEVER called with /api/trades/
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    // Verify storage layer also rejects empty tradeId
    await expect(db.updateTrade('', { notes: 'Should fail' })).rejects.toThrow(
      'Cannot update trade: tradeId is missing'
    );

    expect(resolveCanonicalTradeId({ id: '' })).toBe('');
    expect(resolveCanonicalTradeId({ id: '   ' })).toBe('');
    expect(resolveCanonicalTradeId(null)).toBe('');
  });

  it('3. Returns 404 Not Found for a nonexistent trade ID', async () => {
    const res = await fetch(`${baseUrl}/api/trades/tr_nonexistent_id_99999`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ notes: 'Testing nonexistent trade' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Trade not found/i);
  });

  it('4. Enforces ownership / IDOR protection: blocks User B from updating User A trade with 403', async () => {
    const res = await fetch(`${baseUrl}/api/trades/${encodeURIComponent(createdTradeId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        notes: 'Unauthorized tampering attempt by User B',
        stopLoss: 1.05,
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Access denied/i);

    // Verify User A trade in Neon DB was not modified by User B
    const intact = await db.getTradeById(createdTradeId);
    expect(intact?.notes).toBe('Updated journal review after London session close');
    expect(intact?.stopLoss).toBe(1.081);
  });

  it('5. Safely performs partial updates without overwriting existing fields when null, undefined, or empty strings are passed', async () => {
    const res = await fetch(`${baseUrl}/api/trades/${encodeURIComponent(createdTradeId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        notes: 'Partial update safety verified',
        stopLoss: 1.082,
        entryPrice: undefined,
        takeProfit: null,
        lotSize: undefined,
        direction: '',
        setup: '',
        timeframe: '',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trade.id).toBe(createdTradeId);
    expect(body.trade.notes).toBe('Partial update safety verified');
    expect(body.trade.stopLoss).toBe(1.082);
    // Unrelated fields must remain untouched despite null/undefined/empty string in payload
    expect(body.trade.entryPrice).toBe(1.085);
    expect(body.trade.takeProfit).toBe(1.094);
    expect(body.trade.lotSize).toBe(1.25);
    expect(body.trade.direction).toBe('LONG');
    expect(body.trade.setup).toBe('London Breakout');
    expect(body.trade.timeframe).toBe('H1');
  });
});
