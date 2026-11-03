import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const withDataTransaction = vi.fn(async (operation: () => Promise<unknown>) => operation());
vi.mock('@/lib/data-transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data-transaction')>()),
  withDataTransaction: (op: () => Promise<unknown>) => withDataTransaction(op),
}));
vi.mock('@/lib/family-data', () => ({
  settleFamilyMigration: vi.fn(async () => {}),
  readFamilyData: vi.fn(async () => ({ members: [], groups: [] })),
}));

import { withFamilyWrite } from '@/lib/family-api';

const CAP = 1024;
const post = (body: string, headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/chores', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body,
});

beforeEach(() => {
  withDataTransaction.mockClear();
});

describe('withFamilyWrite', () => {
  it('parses the body, then runs the operation inside the transaction with it', async () => {
    const operation = vi.fn(async (body: { choreId: string }) => NextResponse.json({ got: body.choreId }));
    const res = await withFamilyWrite<{ choreId: string }, Response>(post(JSON.stringify({ choreId: 'car' })), { maxBytes: CAP }, operation);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: 'car' });
    expect(operation).toHaveBeenCalledWith({ choreId: 'car' });
    expect(withDataTransaction).toHaveBeenCalledTimes(1);
  });

  it('answers 413 to an honest oversized Content-Length without reading the body or taking the lock', async () => {
    const operation = vi.fn();
    const res = await withFamilyWrite<unknown, Response>(post('{}', { 'Content-Length': String(CAP + 1) }), { maxBytes: CAP }, operation);
    expect(res.status).toBe(413);
    expect(operation).not.toHaveBeenCalled();
    expect(withDataTransaction).not.toHaveBeenCalled();
  });

  it('answers 413 to a body that runs past the cap, before taking the lock', async () => {
    const operation = vi.fn();
    const res = await withFamilyWrite<unknown, Response>(post(JSON.stringify({ pad: 'x'.repeat(CAP * 2) })), { maxBytes: CAP }, operation);
    expect(res.status).toBe(413);
    expect(operation).not.toHaveBeenCalled();
    expect(withDataTransaction).not.toHaveBeenCalled();
  });

  it('answers 400 to malformed JSON before taking the lock', async () => {
    const operation = vi.fn();
    const res = await withFamilyWrite<unknown, Response>(post('{not json'), { maxBytes: CAP }, operation);
    expect(res.status).toBe(400);
    expect(operation).not.toHaveBeenCalled();
    expect(withDataTransaction).not.toHaveBeenCalled();
  });
});
