/**
 * Route-level tests for `GET /api/system/network/diagnostics`.
 *
 * The handler promisifies `execFile` for ping / `ip route` / systemctl probes.
 * We stub `child_process.execFile` with a router keyed on the command so each
 * test can force a specific probe to succeed, fail, or be missing entirely.
 * Auth is stubbed at `requireSession` so the real `withAuth` wrapper runs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

// Router receives the full command line ("ping -c 1 ...") and returns either
// { stdout } to resolve or an Error to reject. Reset per test.
const { execRouter } = vi.hoisted(() => ({
  execRouter: { fn: (_line: string) => ({ stdout: '' }) as { stdout: string } | Error },
}));

vi.mock('child_process', () => ({
  execFile: (cmd: string, args: string[], _opts: unknown, cb: (err: unknown, out?: { stdout: string; stderr: string }) => void) => {
    const line = `${cmd} ${args.join(' ')}`;
    const result = execRouter.fn(line);
    if (result instanceof Error) cb(result);
    else cb(null, { stdout: result.stdout, stderr: '' });
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/system/network/diagnostics', { method: 'GET' });
}

describe('GET /api/system/network/diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports unavailable when ping is missing (ENOENT)', async () => {
    execRouter.fn = (line) => {
      if (line.startsWith('ping')) return Object.assign(new Error('nope'), { code: 'ENOENT' });
      return { stdout: '' };
    };
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.gateway).toBeUndefined();
  });

  it('runs all probes and reports reachable gateway, internet, and watchdog', async () => {
    execRouter.fn = (line) => {
      if (line.includes('ip route show default')) return { stdout: 'default via 192.168.1.1 dev eth0 proto dhcp' };
      if (line.startsWith('ping')) return { stdout: '64 bytes from host: icmp_seq=1 ttl=64 time=10.5 ms' };
      if (line.includes('is-active wifi-watchdog.timer')) return { stdout: 'active\n' };
      if (line.includes('LastTriggerUSec')) return { stdout: 'LastTriggerUSec=Sat 2025-01-01 12:00:00 UTC' };
      return { stdout: '' };
    };
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.gateway).toEqual({ ip: '192.168.1.1', reachable: true, latencyMs: 10.5 });
    expect(body.internet).toEqual({ ip: '1.1.1.1', reachable: true, latencyMs: 10.5 });
    expect(body.watchdog.active).toBe(true);
    expect(body.watchdog.lastRun).not.toBeNull();
  });

  it('degrades gracefully when the gateway is unknown and probes fail', async () => {
    execRouter.fn = (line) => {
      // Loopback ping (availability probe) still works.
      if (line.includes('127.0.0.1')) return { stdout: 'time=0.1 ms' };
      // No default route configured.
      if (line.includes('ip route show default')) return { stdout: '' };
      // Internet ping fails.
      if (line.startsWith('ping')) return new Error('unreachable');
      // Watchdog inactive (systemctl exits non-zero).
      if (line.includes('systemctl')) return new Error('inactive');
      return { stdout: '' };
    };
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.gateway).toBeUndefined();
    expect(body.internet.reachable).toBe(false);
    expect(body.internet.latencyMs).toBeNull();
    expect(body.watchdog).toEqual({ active: false, lastRun: null });
  });
});
