/**
 * `sudo-grant` drives `scripts/upgrade.sh sudo-check` / `grant-sudo`. What
 * matters here is the contract with that script: the password reaches it on
 * stdin and nowhere else, the JSON answers map to the right result shapes,
 * and a positive check is cached so the routes stop spawning bash once the
 * grant exists.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const mockSpawn = vi.fn();
vi.mock('child_process', () => ({ spawn: (...args: unknown[]) => mockSpawn(...args) }));
vi.mock('fs', () => ({ existsSync: () => false }));

import { ensureSudo, grantSudo, requireSudo, resetSudoCache } from '../sudo-grant';

interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
}

/** A child that prints `line` and exits with `code` on the next tick. */
function fakeChild(line: string, code = 0): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn();
  process.nextTick(() => {
    child.stdout.write(line + '\n');
    child.stdout.end();
    child.stderr.end();
    setTimeout(() => child.emit('close', code), 2);
  });
  return child;
}

describe('sudo-grant', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    resetSudoCache();
  });

  it('ensureSudo maps a ready answer to ok and caches it', async () => {
    mockSpawn.mockReturnValue(fakeChild('{"ok":true}'));
    expect(await ensureSudo()).toEqual({ ok: true });
    expect(await ensureSudo()).toEqual({ ok: true });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn.mock.calls[0][1]).toEqual([expect.stringMatching(/upgrade\.sh$/), 'sudo-check']);
  });

  it('ensureSudo reports needsPassword and does not cache a refusal', async () => {
    mockSpawn.mockReturnValue(fakeChild('{"ok":false,"needsPassword":true,"error":"nope"}'));
    expect(await ensureSudo()).toEqual({ ok: false, needsPassword: true, error: 'nope' });
    mockSpawn.mockReturnValue(fakeChild('{"ok":true}'));
    expect(await ensureSudo()).toEqual({ ok: true });
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('grantSudo sends the password on stdin only, never as an argument', async () => {
    const child = fakeChild('{"ok":true}');
    mockSpawn.mockReturnValue(child);
    expect(await grantSudo('hunter2')).toEqual({ ok: true, alreadyGranted: false });
    expect(child.stdin.write).toHaveBeenCalledWith('hunter2\n');
    expect(child.stdin.end).toHaveBeenCalled();
    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toEqual([expect.stringMatching(/upgrade\.sh$/), 'grant-sudo']);
    expect(JSON.stringify(args)).not.toContain('hunter2');
  });

  it('grantSudo maps a wrong password and keeps the cache cold', async () => {
    mockSpawn.mockReturnValue(fakeChild('{"ok":false,"wrongPassword":true,"error":"That password did not work."}'));
    expect(await grantSudo('wrong')).toEqual({
      ok: false,
      wrongPassword: true,
      error: 'That password did not work.',
    });
    mockSpawn.mockReturnValue(fakeChild('{"ok":false,"needsPassword":true,"error":"nope"}'));
    expect((await ensureSudo()).ok).toBe(false);
  });

  it('grantSudo success primes the cache for later route checks', async () => {
    mockSpawn.mockReturnValue(fakeChild('{"ok":true}'));
    await grantSudo('right');
    expect(await ensureSudo()).toEqual({ ok: true });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('treats garbage output as a failure rather than a grant', async () => {
    mockSpawn.mockImplementation(() => fakeChild('sudo: command not found', 127));
    const result = await grantSudo('x');
    expect(result.ok).toBe(false);
    expect(await ensureSudo()).toMatchObject({ ok: false });
  });

  it('requireSudo answers null when ready and a 409 with the prompt flag otherwise', async () => {
    mockSpawn.mockReturnValue(fakeChild('{"ok":false,"needsPassword":true,"error":"nope"}'));
    const res = await requireSudo();
    expect(res?.status).toBe(409);
    expect(await res!.json()).toEqual({ ok: false, error: 'nope', needsSudoPassword: true });

    mockSpawn.mockReturnValue(fakeChild('{"ok":true}'));
    expect(await requireSudo()).toBeNull();
  });
});
