import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { CLIENT_IP_HEADER } from '@/lib/client-ip';
import { WRONG_CODES_PER_ADDRESS, WRONG_CODES_PER_HUB } from '@/lib/grown-up-code';

/**
 * The wrong-try limit has to hold against tries sent all at once, not only
 * one after another: a guess is only ever hashed inside the limit, and a right
 * code that arrives once the limit has tripped opens nothing.
 */

let tmpDir: string;
let origCwd: () => string;
let POST: (request: NextRequest) => Promise<Response>;
let hashes: ReturnType<typeof vi.spyOn>;

const RIGHT = '4821';

function unlock(code: unknown, ip = '192.168.1.50'): Promise<Response> {
  return POST(new NextRequest('http://localhost/api/grown-up-code/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CLIENT_IP_HEADER]: ip },
    body: JSON.stringify({ code }),
  }));
}

/** Four digits that are never the right code. */
const wrong = (n: number) => String(1000 + n);

function count(responses: Response[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const res of responses) out[res.status] = (out[res.status] ?? 0) + 1;
  return out;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  // The limits live in the route module, so each case gets its own.
  vi.resetModules();
  const data = await import('@/lib/grown-up-code-data');
  await data.setGrownUpCode(RIGHT);
  ({ POST } = await import('../route'));
  hashes = vi.spyOn(crypto, 'scrypt');
});

afterEach(async () => {
  hashes.mockRestore();
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('POST /api/grown-up-code/unlock', () => {
  it('answers a right code with an unlock and a wrong one without', async () => {
    const bad = await unlock(wrong(1));
    expect(bad.status).toBe(422);
    const good = await unlock(RIGHT);
    expect(good.status).toBe(200);
    expect(Object.keys(await good.json()).sort()).toEqual(['expiresAt', 'token']);
  });

  it('hashes only as many guesses as the limit allows when fifty arrive at once', async () => {
    const responses = await Promise.all(Array.from({ length: 50 }, (_, i) => unlock(wrong(i))));

    expect(hashes).toHaveBeenCalledTimes(WRONG_CODES_PER_ADDRESS);
    const statuses = count(responses);
    // The fifth wrong try is the one told to wait, like every try after it.
    expect(statuses[422]).toBe(WRONG_CODES_PER_ADDRESS - 1);
    expect(statuses[429]).toBe(50 - (WRONG_CODES_PER_ADDRESS - 1));
  });

  it('gives no unlock to a right code sent in the same burst, after the limit has tripped', async () => {
    // Few enough to all stand in the line, so the right code is checked in its turn.
    const burst = Array.from({ length: WRONG_CODES_PER_ADDRESS + 1 }, (_, i) => unlock(wrong(i)));
    const last = unlock(RIGHT);
    await Promise.all(burst);

    const res = await last;
    expect(res.status).toBe(429);
    expect((await res.json()).token).toBeUndefined();
    expect(hashes).toHaveBeenCalledTimes(WRONG_CODES_PER_ADDRESS);
  });

  it('holds the hub-wide limit against a burst from many addresses', async () => {
    const responses = await Promise.all(Array.from({ length: 200 }, (_, i) => unlock(wrong(i), `192.168.1.${i + 1}`)));

    expect(hashes.mock.calls.length).toBeLessThanOrEqual(WRONG_CODES_PER_HUB);
    expect(count(responses)[200]).toBeUndefined();
  });

  it('never counts a right code against the hub-wide limit', async () => {
    for (let i = 0; i < WRONG_CODES_PER_HUB + 5; i++) {
      expect((await unlock(RIGHT, `192.168.2.${i + 1}`)).status).toBe(200);
    }
  });

  it('refuses a guess that is not four numbers without hashing it', async () => {
    expect((await unlock('12345')).status).toBe(400);
    expect(hashes).not.toHaveBeenCalled();
  });
});
