import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ hasSignedInSession: vi.fn(async () => false) }));

import { hasSignedInSession } from '@/lib/auth';
import { asksForCode, cleanGrownUpActions, cleanUnlockMinutes, GROWN_UP_HEADER, isGrownUpCode, NO_GROWN_UP_CODE } from '@/lib/grown-up-code';
import { checkGrownUpCode, isGrownUpUnlock, readGrownUpStatus, removeGrownUpCode, setGrownUpCode, updateGrownUpPrefs } from '@/lib/grown-up-code-data';
import { requireGrownUp } from '@/lib/grown-up-gate';
import { POST as unlock } from '@/app/api/grown-up-code/unlock/route';

afterEach(async () => {
  vi.useRealTimers();
  vi.mocked(hasSignedInSession).mockResolvedValue(false);
  await removeGrownUpCode();
});

const write = (headers: Record<string, string> = {}) => new Request('http://localhost/api/rewards', { method: 'POST', headers });

async function token(code = '2468'): Promise<string> {
  const result = await checkGrownUpCode(code);
  if (!result.ok) throw new Error('expected the code to unlock');
  return result.token;
}

describe('grown-up code rules', () => {
  it('takes exactly four numbers', () => {
    expect(isGrownUpCode('0123')).toBe(true);
    for (const bad of ['123', '12345', '12a4', ' 1234', 1234, null]) expect(isGrownUpCode(bad)).toBe(false);
  });

  it('keeps only known jobs, in order, and only offered unlock lengths', () => {
    expect(cleanGrownUpActions(['todoist-close', 'nope', 'redeem'])).toEqual(['redeem', 'todoist-close']);
    expect(cleanGrownUpActions('redeem')).toBeNull();
    expect(cleanUnlockMinutes(5)).toBe(5);
    expect(cleanUnlockMinutes(7)).toBeNull();
  });

  it('asks only when a code is set and the job is ticked', () => {
    expect(asksForCode(NO_GROWN_UP_CODE, 'redeem')).toBe(false);
    expect(asksForCode({ set: true, actions: ['redeem'], unlockMinutes: 5 }, 'redeem')).toBe(true);
    expect(asksForCode({ set: true, actions: ['redeem'], unlockMinutes: 5 }, 'untick')).toBe(false);
  });
});

describe('the code on the hub', () => {
  it('starts with no code, and a first code guards spending tickets for five minutes', async () => {
    expect(await readGrownUpStatus()).toEqual(NO_GROWN_UP_CODE);
    expect(await setGrownUpCode('2468')).toEqual({ set: true, actions: ['redeem'], unlockMinutes: 5 });
  });

  it('keeps the jobs and length when the code changes, and the old unlocks stop working', async () => {
    await setGrownUpCode('2468');
    await updateGrownUpPrefs({ actions: ['redeem', 'untick'], unlockMinutes: 15 });
    const old = await token();
    expect(await isGrownUpUnlock(old)).toBe(true);
    expect(await setGrownUpCode('1357')).toEqual({ set: true, actions: ['redeem', 'untick'], unlockMinutes: 15 });
    expect(await isGrownUpUnlock(old)).toBe(false);
    expect((await checkGrownUpCode('2468')).ok).toBe(false);
    expect((await checkGrownUpCode('1357')).ok).toBe(true);
  });

  it('refuses to change the jobs of a code that does not exist', async () => {
    expect(await updateGrownUpPrefs({ actions: ['untick'] })).toBeNull();
  });

  it('keeps both changes when the jobs and the unlock length are saved at the same moment', async () => {
    await setGrownUpCode('2468');
    await Promise.all([
      updateGrownUpPrefs({ actions: ['redeem', 'untick'] }),
      updateGrownUpPrefs({ unlockMinutes: 15 }),
    ]);
    expect(await readGrownUpStatus()).toEqual({ set: true, actions: ['redeem', 'untick'], unlockMinutes: 15 });
  });

  it('answers a right code with an unlock that runs out after the set minutes', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-21T12:00:00Z') });
    await setGrownUpCode('2468');
    const result = await checkGrownUpCode('2468');
    expect(result).toMatchObject({ ok: true, expiresAt: Date.parse('2026-11-21T12:05:00Z') });
    const unlock = (result as { token: string }).token;
    vi.setSystemTime(new Date('2026-11-21T12:04:59Z'));
    expect(await isGrownUpUnlock(unlock)).toBe(true);
    vi.setSystemTime(new Date('2026-11-21T12:05:01Z'));
    expect(await isGrownUpUnlock(unlock)).toBe(false);
  });

  it('turns down a wrong code, a forged unlock, and anything once the code is removed', async () => {
    await setGrownUpCode('2468');
    expect(await checkGrownUpCode('1111')).toEqual({ ok: false, reason: 'wrong' });
    const unlock = await token();
    const [body] = unlock.split('.');
    expect(await isGrownUpUnlock(`${body}.AAAA`)).toBe(false);
    await removeGrownUpCode();
    expect(await isGrownUpUnlock(unlock)).toBe(false);
    expect(await checkGrownUpCode('2468')).toEqual({ ok: false, reason: 'none' });
  });
});

describe('requireGrownUp', () => {
  it('lets every job through while no code is set', async () => {
    expect(await requireGrownUp(write(), 'redeem')).toBeNull();
  });

  it('asks for a ticked job, and only for that one', async () => {
    await setGrownUpCode('2468');
    const refused = await requireGrownUp(write(), 'redeem');
    expect(refused?.status).toBe(403);
    expect(await refused!.json()).toMatchObject({ needsGrownUpCode: true, action: 'redeem' });
    expect(await requireGrownUp(write(), 'untick')).toBeNull();
  });

  it('lets a live unlock through, but not a stale or made-up one', async () => {
    await setGrownUpCode('2468');
    expect(await requireGrownUp(write({ [GROWN_UP_HEADER]: await token() }), 'redeem')).toBeNull();
    expect((await requireGrownUp(write({ [GROWN_UP_HEADER]: 'nonsense' }), 'redeem'))?.status).toBe(403);
  });

  it('never asks a signed-in grown-up', async () => {
    await setGrownUpCode('2468');
    vi.mocked(hasSignedInSession).mockResolvedValue(true);
    expect(await requireGrownUp(write(), 'redeem')).toBeNull();
  });
});

describe('POST /api/grown-up-code/unlock', () => {
  const ask = (code: unknown, ip = '10.0.0.7') => unlock(new NextRequest('http://localhost/api/grown-up-code/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hs-client-ip': ip },
    body: JSON.stringify({ code }),
  }));

  it('says when there is no code to unlock', async () => {
    expect((await ask('2468')).status).toBe(409);
  });

  it('hands out an unlock for the right code and refuses a malformed one', async () => {
    await setGrownUpCode('2468');
    expect((await ask('24')).status).toBe(400);
    const res = await ask('2468', '10.0.0.8');
    expect(res.status).toBe(200);
    const { token: unlockToken } = await res.json();
    expect(await isGrownUpUnlock(unlockToken)).toBe(true);
  });

  it('makes an address wait after five wrong codes, even for the right one', async () => {
    await setGrownUpCode('2468');
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await ask('0000', '10.0.0.9')).status);
    expect(statuses).toEqual([422, 422, 422, 422, 429]);
    const waited = await ask('2468', '10.0.0.9');
    expect(waited.status).toBe(429);
    expect((await waited.json()).retryAfterSeconds).toBeGreaterThan(0);
    // Another address is not held up by this one.
    expect((await ask('2468', '10.0.0.10')).status).toBe(200);
  });
});
