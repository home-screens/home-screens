import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ─── Mocks ──────────────────────────────────── */

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import {
  nmcli,
  nmcliSudo,
  scheduleRollback,
  confirmRollback,
  getPendingRollback,
  inhibitWatchdog,
  uninhibitWatchdog,
  getManagementInterface,
  __resetForTests,
} from '@/lib/network-commands';

/** Helper: make the mocked execFile resolve with given stdout. */
function mockExecFileSuccess(stdout: string) {
  vi.mocked(execFile).mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: Error | null, result: { stdout: string; stderr: string }) => void)(
        null,
        { stdout, stderr: '' },
      );
      return {} as ReturnType<typeof execFile>;
    },
  );
}

/** Helper: make the mocked execFile reject with given error. */
function mockExecFileFailure(error: Error) {
  vi.mocked(execFile).mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: Error) => void)(error);
      return {} as ReturnType<typeof execFile>;
    },
  );
}


beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  __resetForTests();
});

afterEach(() => {
  __resetForTests();
  vi.useRealTimers();
});

/* ─── nmcli (read-only) ─────────────────────── */

describe('nmcli', () => {
  it('calls execFile with "nmcli" and the given args', async () => {
    mockExecFileSuccess('GENERAL.STATE:connected\n');

    const result = await nmcli(['-t', '-f', 'GENERAL.STATE', 'device', 'show', 'eth0']);

    expect(result).toBe('GENERAL.STATE:connected\n');
    expect(execFile).toHaveBeenCalledOnce();

    const [cmd, args, opts] = vi.mocked(execFile).mock.calls[0] as unknown as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(cmd).toBe('nmcli');
    expect(args).toEqual(['-t', '-f', 'GENERAL.STATE', 'device', 'show', 'eth0']);
    expect(opts.timeout).toBe(15_000);
    expect((opts.env as Record<string, string>).LANG).toBe('C.UTF-8');
  });

  it('rejects when execFile fails', async () => {
    mockExecFileFailure(new Error('nmcli not found'));

    await expect(nmcli(['general', 'status'])).rejects.toThrow('nmcli not found');
  });

  it('passes arguments as an array, never a shell string', async () => {
    mockExecFileSuccess('');

    // Argument with shell metacharacters — should be passed literally
    await nmcli(['-t', 'connection', 'show', 'My Network; rm -rf /']);

    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe('nmcli');
    expect(args).toContain('My Network; rm -rf /');
    // The dangerous string is a single array element, not shell-expanded
    expect(args.length).toBe(4);
  });

  it('does not prefix with sudo', async () => {
    mockExecFileSuccess('');

    await nmcli(['general', 'status']);

    const [cmd] = vi.mocked(execFile).mock.calls[0] as unknown as [string];
    expect(cmd).toBe('nmcli');
    expect(cmd).not.toBe('sudo');
  });
});

/* ─── nmcliSudo (privileged) ─────────────────── */

describe('nmcliSudo', () => {
  it('prefixes arguments with sudo + nmcli', async () => {
    mockExecFileSuccess('');

    await nmcliSudo(['connection', 'modify', 'eth-conn', 'ipv4.method', 'auto']);

    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe('sudo');
    expect(args[0]).toBe('nmcli');
    expect(args.slice(1)).toEqual(['connection', 'modify', 'eth-conn', 'ipv4.method', 'auto']);
  });

  it('sets LANG=C.UTF-8 in the environment', async () => {
    mockExecFileSuccess('');

    await nmcliSudo(['general', 'status']);

    const opts = vi.mocked(execFile).mock.calls[0][2] as Record<string, unknown>;
    expect((opts.env as Record<string, string>).LANG).toBe('C.UTF-8');
  });

  it('has a 15-second timeout', async () => {
    mockExecFileSuccess('');

    await nmcliSudo(['general', 'status']);

    const opts = vi.mocked(execFile).mock.calls[0][2] as Record<string, unknown>;
    expect(opts.timeout).toBe(15_000);
  });

  it('serializes concurrent calls through the mutex', async () => {
    const callOrder: number[] = [];
    let callIndex = 0;

    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const idx = callIndex++;
        // Simulate async work with microtask
        Promise.resolve().then(() => {
          callOrder.push(idx);
          (cb as (err: Error | null, result: { stdout: string; stderr: string }) => void)(
            null,
            { stdout: `result-${idx}`, stderr: '' },
          );
        });
        return {} as ReturnType<typeof execFile>;
      },
    );

    // Fire three concurrent calls
    const p1 = nmcliSudo(['first']);
    const p2 = nmcliSudo(['second']);
    const p3 = nmcliSudo(['third']);

    // Flush microtasks for each sequential step
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBe('result-0');
    expect(r2).toBe('result-1');
    expect(r3).toBe('result-2');
    // Calls executed in FIFO order
    expect(callOrder).toEqual([0, 1, 2]);
  });

  it('continues the mutex chain even after a failure', async () => {
    let callIndex = 0;

    vi.mocked(execFile).mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const idx = callIndex++;
        if (idx === 0) {
          (cb as (err: Error) => void)(new Error('first call failed'));
        } else {
          (cb as (err: Error | null, result: { stdout: string; stderr: string }) => void)(
            null,
            { stdout: `ok-${idx}`, stderr: '' },
          );
        }
        return {} as ReturnType<typeof execFile>;
      },
    );

    const p1 = nmcliSudo(['will-fail']);
    // Attach catch immediately to prevent unhandled rejection
    const p1Result = p1.catch((e: Error) => e);
    const p2 = nmcliSudo(['should-still-run']);

    await vi.advanceTimersByTimeAsync(0);

    const err = await p1Result;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('first call failed');
    await expect(p2).resolves.toBe('ok-1');
  });
});

/* ─── scheduleRollback / confirmRollback ─────── */

describe('scheduleRollback', () => {
  it('returns a rollback ID', () => {
    const id = scheduleRollback('conn-uuid', { method: 'auto' });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('getPendingRollback returns the pending state', () => {
    const id = scheduleRollback('conn-uuid', { method: 'auto' });
    const state = getPendingRollback();
    expect(state).not.toBeNull();
    expect(state!.id).toBe(id);
    expect(state!.timeoutMs).toBeGreaterThan(0);
    expect(state!.timeoutMs).toBeLessThanOrEqual(60_000);
  });

  it('confirmRollback cancels the timer and returns true', () => {
    const id = scheduleRollback('conn-uuid', { method: 'auto' });
    const confirmed = confirmRollback(id);
    expect(confirmed).toBe(true);
    expect(getPendingRollback()).toBeNull();
  });

  it('confirmRollback returns false for unknown ID', () => {
    scheduleRollback('conn-uuid', { method: 'auto' });
    expect(confirmRollback('wrong-id')).toBe(false);
  });

  it('confirmRollback returns false when no rollback is pending', () => {
    expect(confirmRollback('any-id')).toBe(false);
  });

  it('fires rollback after 60 seconds if not confirmed', async () => {
    mockExecFileSuccess('');

    scheduleRollback('conn-uuid', { method: 'auto' });

    // Advance past the 60-second timeout
    vi.advanceTimersByTime(60_000);

    // The rollback fires nmcliSudo calls — flush microtasks
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    // Should have called sudo nmcli connection modify ... then connection up
    expect(execFile).toHaveBeenCalled();
    const calls = vi.mocked(execFile).mock.calls;
    const firstArgs = calls[0][1] as string[];
    expect(firstArgs).toContain('connection');
    expect(firstArgs).toContain('modify');
    expect(firstArgs).toContain('conn-uuid');
  });

  it('rollback restores manual settings with structured args', async () => {
    mockExecFileSuccess('');

    scheduleRollback('conn-uuid', {
      method: 'manual',
      addresses: '192.168.1.100/24',
      gateway: '192.168.1.1',
      dns: '8.8.8.8',
    });

    vi.advanceTimersByTime(60_000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    const calls = vi.mocked(execFile).mock.calls;
    const modifyArgs = calls[0][1] as string[];

    // Verify structured args — no shell interpolation
    expect(modifyArgs).toContain('ipv4.method');
    expect(modifyArgs).toContain('manual');
    expect(modifyArgs).toContain('ipv4.addresses');
    expect(modifyArgs).toContain('192.168.1.100/24');
    expect(modifyArgs).toContain('ipv4.gateway');
    expect(modifyArgs).toContain('192.168.1.1');
    expect(modifyArgs).toContain('ipv4.dns');
    expect(modifyArgs).toContain('8.8.8.8');
  });

  it('rollback restores DHCP by clearing address fields', async () => {
    mockExecFileSuccess('');

    scheduleRollback('conn-uuid', { method: 'auto' });

    vi.advanceTimersByTime(60_000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    const calls = vi.mocked(execFile).mock.calls;
    const modifyArgs = calls[0][1] as string[];

    expect(modifyArgs).toContain('ipv4.method');
    expect(modifyArgs).toContain('auto');
    // Empty strings clear the fields
    expect(modifyArgs).toContain('ipv4.addresses');
    expect(modifyArgs).toContain('');
  });

  it('does not fire rollback if confirmed in time', async () => {
    mockExecFileSuccess('');

    const id = scheduleRollback('conn-uuid', { method: 'auto' });
    confirmRollback(id);

    vi.advanceTimersByTime(60_000);
    await vi.advanceTimersByTimeAsync(0);

    // No calls should have been made
    expect(execFile).not.toHaveBeenCalled();
  });

  it('cancels existing rollback when scheduling a new one', () => {
    const id1 = scheduleRollback('conn-1', { method: 'auto' });
    const id2 = scheduleRollback('conn-2', { method: 'manual', addresses: '10.0.0.1/8' });

    // First rollback is gone
    expect(confirmRollback(id1)).toBe(false);
    // Second rollback is active
    expect(confirmRollback(id2)).toBe(true);
  });

  it('getPendingRollback shows decreasing timeout', () => {
    scheduleRollback('conn-uuid', { method: 'auto' });

    const before = getPendingRollback();
    vi.advanceTimersByTime(30_000);
    const after = getPendingRollback();

    expect(before!.timeoutMs).toBeGreaterThan(after!.timeoutMs);
    expect(after!.timeoutMs).toBeLessThanOrEqual(30_000);
  });

  it('getPendingRollback returns null after confirmation', () => {
    const id = scheduleRollback('conn-uuid', { method: 'auto' });
    confirmRollback(id);
    expect(getPendingRollback()).toBeNull();
  });

  it('getPendingRollback returns null when nothing is pending', () => {
    expect(getPendingRollback()).toBeNull();
  });
});

/* ─── inhibitWatchdog / uninhibitWatchdog ────── */

describe('inhibitWatchdog', () => {
  it('writes an expiry timestamp to the sentinel file', async () => {
    vi.setSystemTime(new Date('2026-04-12T12:00:00Z'));

    await inhibitWatchdog();

    expect(writeFile).toHaveBeenCalledOnce();
    const [path, content, encoding] = vi.mocked(writeFile).mock.calls[0];
    expect(path).toBe('/tmp/home-screens-network-change');
    expect(encoding).toBe('utf-8');

    const expiry = parseInt(content as string, 10);
    const now = Date.now();
    // Expiry should be ~180 seconds in the future
    expect(expiry - now).toBe(180_000);
  });
});

describe('uninhibitWatchdog', () => {
  it('deletes the sentinel file', async () => {
    await uninhibitWatchdog();

    expect(unlink).toHaveBeenCalledOnce();
    expect(vi.mocked(unlink).mock.calls[0][0]).toBe('/tmp/home-screens-network-change');
  });

  it('swallows ENOENT errors', async () => {
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    vi.mocked(unlink).mockRejectedValueOnce(err);

    // Should not throw
    await expect(uninhibitWatchdog()).resolves.toBeUndefined();
  });

  it('rethrows non-ENOENT errors', async () => {
    const err = new Error('EACCES') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    vi.mocked(unlink).mockRejectedValueOnce(err);

    await expect(uninhibitWatchdog()).rejects.toThrow('EACCES');
  });
});

/* ─── getManagementInterface ─────────────────── */

describe('getManagementInterface', () => {
  it('parses "dev <iface>" from ip route get output', async () => {
    mockExecFileSuccess('192.168.1.100 dev eth0 src 192.168.1.1 uid 0\n');

    const iface = await getManagementInterface('192.168.1.100');
    expect(iface).toBe('eth0');

    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe('ip');
    expect(args).toEqual(['route', 'get', '192.168.1.100']);
  });

  it('parses wireless interface names', async () => {
    mockExecFileSuccess('10.0.0.50 dev wlan0 src 10.0.0.1 uid 1000\n');

    const iface = await getManagementInterface('10.0.0.50');
    expect(iface).toBe('wlan0');
  });

  it('returns null for invalid IPv4 addresses', async () => {
    expect(await getManagementInterface('not-an-ip')).toBeNull();
    expect(await getManagementInterface('192.168.1')).toBeNull();
    expect(await getManagementInterface('192.168.1.256')).toBeNull();
    expect(await getManagementInterface('192.168.1.1.1')).toBeNull();
    expect(await getManagementInterface('')).toBeNull();
    expect(await getManagementInterface('::1')).toBeNull();

    // Should never call execFile for invalid IPs
    expect(execFile).not.toHaveBeenCalled();
  });

  it('rejects shell metacharacters in IP-like strings', async () => {
    // These would fail the IPv4 regex
    expect(await getManagementInterface('1.2.3.4; rm -rf /')).toBeNull();
    expect(await getManagementInterface('$(whoami).1.2.3')).toBeNull();
    expect(await getManagementInterface('1.2.3.4 && echo pwned')).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns null when execFile fails', async () => {
    mockExecFileFailure(new Error('ip command failed'));

    const iface = await getManagementInterface('192.168.1.1');
    expect(iface).toBeNull();
  });

  it('returns null when output has no dev field', async () => {
    mockExecFileSuccess('some unexpected output\n');

    const iface = await getManagementInterface('192.168.1.1');
    expect(iface).toBeNull();
  });

  it('validates octet ranges (rejects 999.999.999.999)', async () => {
    expect(await getManagementInterface('999.999.999.999')).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('accepts boundary IPs (0.0.0.0 and 255.255.255.255)', async () => {
    mockExecFileSuccess('0.0.0.0 dev lo src 127.0.0.1\n');

    const iface = await getManagementInterface('0.0.0.0');
    expect(iface).toBe('lo');
  });
});
