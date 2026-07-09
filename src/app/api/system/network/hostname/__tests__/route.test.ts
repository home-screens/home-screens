/**
 * Route-level tests for `PUT /api/system/network/hostname`.
 *
 * Mocks `child_process` (used both promisified for hostnamectl/systemctl and
 * callback-form with stdin for the `tee` writes) and `fs/promises` so no real
 * commands run. Focuses on the route's own logic: hostname validation, the
 * hostnamectl success/failure mapping, and the best-effort follow-up steps
 * being non-fatal.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, withAuth: (handler: unknown) => handler };
});

// A single execFile stub that satisfies both call styles the route uses:
//   - promisify(execFile)('sudo', [...])         → resolves via the callback
//   - execFile('sudo', ['tee', ...], cb)         → returns a child with stdin
// The `state` flags let a test force a specific invocation to reject
// (hostnamectl → fatal 500; systemctl/avahi → non-fatal, should still 200)
// while every other call succeeds. `teeWrites` captures the content piped to
// the `tee` children so the /etc/hosts rewrite can be asserted. Defined via
// `vi.hoisted` so it exists before the hoisted `vi.mock` factories run.
const { execFileMock, readFileMock, state } = vi.hoisted(() => {
  const state = {
    hostnamectlShouldFail: false,
    avahiShouldFail: false,
    teeWrites: [] as string[],
  };
  const execFileMock = vi.fn(
    (_cmd: string, args: string[], cb?: (err: unknown, out?: { stdout: string; stderr: string }) => void) => {
      const isHostnamectl = args[0] === 'hostnamectl';
      const isAvahiRestart = args[0] === 'systemctl';
      if (cb) {
        queueMicrotask(() => {
          if (isHostnamectl && state.hostnamectlShouldFail) {
            cb(Object.assign(new Error('failed'), { stderr: 'hostnamectl: boom' }));
          } else if (isAvahiRestart && state.avahiShouldFail) {
            cb(Object.assign(new Error('failed'), { stderr: 'avahi down' }));
          } else {
            cb(null, { stdout: '', stderr: '' });
          }
        });
      }
      return {
        stdin: {
          write: vi.fn((chunk: string) => state.teeWrites.push(chunk)),
          end: vi.fn(),
        },
        on: (event: string, handler: () => void) => {
          if (event === 'close') queueMicrotask(handler);
        },
      };
    },
  );
  const readFileMock = vi.fn(async () => '127.0.0.1 localhost\n127.0.1.1 oldname oldname\n');
  return { execFileMock, readFileMock, state };
});

vi.mock('child_process', () => ({ execFile: execFileMock }));

vi.mock('fs/promises', () => ({ readFile: readFileMock }));

import { NextRequest } from 'next/server';
import { PUT } from '../route';

function putRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/network/hostname', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/system/network/hostname', () => {
  beforeEach(() => {
    execFileMock.mockClear();
    readFileMock.mockClear();
    readFileMock.mockResolvedValue('127.0.0.1 localhost\n127.0.1.1 oldname oldname\n');
    state.hostnamectlShouldFail = false;
    state.avahiShouldFail = false;
    state.teeWrites = [];
  });

  it('rejects an empty hostname with 400 and runs no commands', async () => {
    const res = await PUT(putRequest({ hostname: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('rejects a hostname with illegal characters with 400', async () => {
    const res = await PUT(putRequest({ hostname: 'bad_host!' }));
    expect(res.status).toBe(400);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('rejects a hostname longer than 63 characters with 400', async () => {
    const res = await PUT(putRequest({ hostname: 'a'.repeat(64) }));
    expect(res.status).toBe(400);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('sets the hostname via hostnamectl and returns ok on success', async () => {
    const res = await PUT(putRequest({ hostname: 'living-room' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, hostname: 'living-room' });
    expect(execFileMock).toHaveBeenCalledWith(
      'sudo',
      ['hostnamectl', 'set-hostname', 'living-room'],
      expect.any(Function),
    );
  });

  it('returns 500 with stderr detail when hostnamectl fails', async () => {
    state.hostnamectlShouldFail = true;
    const res = await PUT(putRequest({ hostname: 'living-room' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/hostnamectl: boom/);
  });

  it('still succeeds when the avahi restart fails (non-fatal follow-up)', async () => {
    state.avahiShouldFail = true;
    const res = await PUT(putRequest({ hostname: 'living-room' }));
    // hostnamectl succeeded, so the change stands even though the mDNS
    // daemon restart threw — the route swallows it and returns 200.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, hostname: 'living-room' });
  });

  it('still succeeds when reading /etc/hosts fails (non-fatal follow-up)', async () => {
    readFileMock.mockRejectedValue(new Error('EACCES'));
    const res = await PUT(putRequest({ hostname: 'living-room' }));
    // The /etc/hosts update is best-effort; a read failure is swallowed
    // and the hostname change is still reported as successful.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, hostname: 'living-room' });
  });

  it('appends a 127.0.1.1 line when /etc/hosts has none', async () => {
    readFileMock.mockResolvedValue('127.0.0.1 localhost\n');
    const res = await PUT(putRequest({ hostname: 'living-room' }));
    expect(res.status).toBe(200);
    // The append branch (no existing 127.0.1.1 line) writes the new mapping
    // to the tee child's stdin rather than replacing an existing line.
    const hostsWrite = state.teeWrites.find((w) => w.includes('127.0.1.1'));
    expect(hostsWrite).toContain('127.0.0.1 localhost');
    expect(hostsWrite).toContain('127.0.1.1 living-room living-room');
  });
});
