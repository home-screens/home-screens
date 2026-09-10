import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireDataLock, bootId, DataLockBusyError, DataLockLostError } from '../data-lock';

let directory: string;
let lock: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-data-lock-'));
  lock = path.join(directory, 'app.data.lock');
});
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

const owner = (over: Partial<Record<string, unknown>> = {}) => {
  const base: Record<string, unknown> = { token: 'other', pid: process.ppid, boot: bootId(), host: os.hostname(), at: Date.now() };
  return Object.entries({ ...base, ...over }).map(([k, v]) => `${k}=${String(v)}`).join('\n') + '\n';
};
const take = () => acquireDataLock(lock, { waitMs: 500, pollMs: 20 });

describe('taking the lock', () => {
  it('writes a complete owner record, so a contender never reads a half-made lock', async () => {
    const held = await take();
    const text = await fs.readFile(lock, 'utf8');
    expect(text).toContain(`token=${held.token}`);
    expect(text).toContain(`pid=${process.pid}`);
    expect(text).toContain(`host=${os.hostname()}`);
    await held.assertOwned();
  });

  it('leaves no staging file behind, on success or on failure', async () => {
    const held = await take();
    await expect(take()).rejects.toBeInstanceOf(DataLockBusyError);
    await held.release();
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it('refuses a lock a live owner still holds', async () => {
    await fs.writeFile(lock, owner());
    await expect(take()).rejects.toBeInstanceOf(DataLockBusyError);
  });

  it('waits for a live owner rather than giving up at once', async () => {
    await fs.writeFile(lock, owner());
    const started = Date.now();
    await expect(acquireDataLock(lock, { waitMs: 300, pollMs: 20 })).rejects.toBeInstanceOf(DataLockBusyError);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });

  it('takes over an owner whose process is gone, without waiting', async () => {
    // A pid that cannot be running: allocated, then reaped.
    await fs.writeFile(lock, owner({ pid: 2147483646 }));
    const started = Date.now();
    const held = await acquireDataLock(lock, { waitMs: 10_000, pollMs: 20 });
    expect(Date.now() - started).toBeLessThan(2_000);
    await held.assertOwned();
  });

  it('takes over an owner recorded before this machine booted', async () => {
    await fs.writeFile(lock, owner({ boot: 'a-previous-boot' }));
    const held = await take();
    await held.assertOwned();
  });

  it('keeps a lock whose owner is only paused, not gone', async () => {
    // However long ago it was taken, a live owner keeps its lock: nothing here
    // expires on elapsed time, so a slow writer is never mistaken for a dead one.
    await fs.writeFile(lock, owner({ at: Date.now() - 30 * 24 * 60 * 60 * 1000 }));
    await expect(take()).rejects.toBeInstanceOf(DataLockBusyError);
  });

  it('takes over a lock nobody can be identified from', async () => {
    await fs.writeFile(lock, 'this is not an owner record');
    const held = await take();
    await held.assertOwned();
  });

  it('reports a lock path it can never claim instead of retrying forever', async () => {
    await fs.mkdir(lock);
    const started = Date.now();
    await expect(acquireDataLock(lock, { waitMs: 10_000, pollMs: 20 })).rejects.not.toBeInstanceOf(DataLockBusyError);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('proving the lock is still ours', () => {
  it('fails once another owner is at the lock path', async () => {
    const held = await take();
    await fs.writeFile(lock, owner());
    await expect(held.assertOwned()).rejects.toBeInstanceOf(DataLockLostError);
  });

  it('fails once the lock is gone entirely', async () => {
    const held = await take();
    await fs.rm(lock);
    await expect(held.assertOwned()).rejects.toBeInstanceOf(DataLockLostError);
  });

  it('still passes for the true owner after somebody else fails to take it', async () => {
    const held = await take();
    await expect(take()).rejects.toBeInstanceOf(DataLockBusyError);
    await held.assertOwned();
  });
});

describe('releasing the lock', () => {
  it('removes it when it is ours', async () => {
    const held = await take();
    await held.release();
    await expect(fs.stat(lock)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('leaves the next owner alone when ours was already taken over', async () => {
    const held = await take();
    const next = owner({ token: 'the-next-writer' });
    await fs.writeFile(lock, next);
    await held.release();
    // Releasing a lock that is no longer ours would hand a third writer the
    // door while this one is still working.
    expect(await fs.readFile(lock, 'utf8')).toBe(next);
  });

  it('is safe to call twice', async () => {
    const held = await take();
    await held.release();
    await expect(held.release()).resolves.toBeUndefined();
  });
});

describe('contending processes', () => {
  it('grants the lock to exactly one of many simultaneous takers', async () => {
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => acquireDataLock(lock, { waitMs: 0, pollMs: 5 })));
    const won = results.filter((r) => r.status === 'fulfilled');
    expect(won).toHaveLength(1);
    const text = await fs.readFile(lock, 'utf8');
    expect(text).toContain(`token=${(won[0] as PromiseFulfilledResult<{ token: string }>).value.token}`);
  });

  it('lets only one of many simultaneous takers own a reclaimed lock', async () => {
    await fs.writeFile(lock, owner({ pid: 2147483646 }));
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => acquireDataLock(lock, { waitMs: 2_000, pollMs: 5 })));
    const won = results.filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<{ assertOwned: () => Promise<void> }>).value);
    expect(won.length).toBeGreaterThanOrEqual(1);
    // Many of them see it as abandoned at the same moment. Whatever order they
    // race in, only one can prove it owns the lock, and that is the property
    // every write depends on.
    const proven = await Promise.all(won.map((h) => h.assertOwned().then(() => true, () => false)));
    expect(proven.filter(Boolean)).toHaveLength(1);
  });
});

describe('reclaiming never wedges the lock', () => {
  it('leaves the path claimable after a contender takes a lock somebody else just claimed', async () => {
    // The reclaim path judges a lock finished with, then moves it aside. If
    // something is claimed in between, the loser must still end up with a lock
    // path anyone can take, never one naming an owner that has already gone.
    await fs.writeFile(lock, owner({ pid: 2147483646 }));
    const racers = await Promise.allSettled(Array.from({ length: 8 }, () => acquireDataLock(lock, { waitMs: 1_500, pollMs: 5 })));
    const held = racers.filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<{ release: () => Promise<void> }>).value);
    for (const handle of held) await handle.release();
    const after = await acquireDataLock(lock, { waitMs: 2_000, pollMs: 20 });
    await after.assertOwned();
    await after.release();
    expect(await fs.readdir(directory)).toEqual([]);
  });
})

describe('waiting never spins', () => {
  it('gives up within its budget even while contenders keep moving the lock', async () => {
    // A lock that keeps vanishing and reappearing drives the retry paths that
    // do not simply wait on a live owner. They must still respect the budget.
    let stop = false;
    const churn = (async () => {
      while (!stop) {
        await fs.writeFile(lock, owner({ pid: 2147483646 })).catch(() => {});
        await fs.rm(lock, { force: true }).catch(() => {});
      }
    })();
    const started = Date.now();
    await acquireDataLock(lock, { waitMs: 400, pollMs: 20 }).then((handle) => handle.release(), () => undefined);
    const elapsed = Date.now() - started;
    stop = true;
    await churn;
    expect(elapsed).toBeLessThan(5_000);
  });
})

describe('clearing up after writers that died mid-take', () => {
  it('removes only old staging and set-aside files, never a live lock', async () => {
    const held = await take();
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const name of ['app.data.lock.staging.1.aaa', 'app.data.lock.abandoned.bbb']) {
      await fs.writeFile(path.join(directory, name), 'x');
      await fs.utimes(path.join(directory, name), old, old);
    }
    await fs.writeFile(path.join(directory, 'app.data.lock.staging.2.fresh'), 'x');
    await fs.writeFile(path.join(directory, 'unrelated.json'), 'x');
    const { sweepAbandonedLockFiles } = await import('../data-lock');
    await sweepAbandonedLockFiles(lock);
    const left = (await fs.readdir(directory)).sort();
    expect(left).toEqual(['app.data.lock', 'app.data.lock.staging.2.fresh', 'unrelated.json']);
    // The lock itself is untouched, so its owner still holds it.
    await held.assertOwned();
  });
})

describe('a record left by this process itself', () => {
  it('takes over its own leftover record instead of waiting on itself forever', async () => {
    // Our own process id against a token we are not using. Asking the system
    // whether that process is alive says yes, so nothing but knowing our own
    // tokens can tell this apart from a lock we are still using. Left
    // unhandled it blocks every writer until the machine restarts.
    await fs.writeFile(lock, owner({ pid: process.pid, token: 'a-token-we-let-go-of' }));
    const held = await take();
    await held.assertOwned();
  });

  it('still refuses a lock this process is genuinely using', async () => {
    const held = await take();
    await expect(take()).rejects.toBeInstanceOf(DataLockBusyError);
    await held.assertOwned();
  });

  it('stops defending a token once it has been released', async () => {
    const held = await take();
    await held.release();
    await fs.writeFile(lock, owner({ pid: process.pid, token: held.token }));
    // Released, so this is a leftover like any other and must not block.
    const next = await take();
    await next.assertOwned();
  });
})
