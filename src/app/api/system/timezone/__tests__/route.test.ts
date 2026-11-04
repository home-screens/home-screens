/**
 * Route-level tests for `PUT /api/system/timezone`.
 *
 * Mocks `child_process` so no real `timedatectl` runs, and focuses on the
 * route's own logic: the zone allowlist gating the privileged call, the
 * sudo guard running before it, and the success/failure mapping.
 *
 * Modelled on `src/app/api/system/network/hostname/__tests__/route.test.ts`,
 * which is the closest existing shape.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// The route asks for passwordless sudo before touching the device; ready by
// default here, and a test flips it to exercise the 409 that opens the
// editor's password prompt.
const { sudoState } = vi.hoisted(() => ({ sudoState: { ready: true } }));
vi.mock('@/lib/sudo-grant', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireSudo: async () =>
      sudoState.ready
        ? null
        : NextResponse.json({ ok: false, error: 'needs password', needsSudoPassword: true }, { status: 409 }),
  };
});

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, withAuth: (handler: unknown) => handler };
});

// `promisify(execFile)` resolves through the callback, so the stub only has to
// satisfy the callback form. `state.shouldFail` forces the one invocation the
// route makes to reject with stderr attached, the way a real failure arrives.
const { execFileMock, state } = vi.hoisted(() => {
  const state = { shouldFail: false };
  const execFileMock = vi.fn(
    (_cmd: string, _args: string[], cb?: (err: unknown, out?: { stdout: string; stderr: string }) => void) => {
      queueMicrotask(() => {
        if (state.shouldFail) {
          cb?.(Object.assign(new Error('failed'), { stderr: 'Failed to set time zone: boom' }));
        } else {
          cb?.(null, { stdout: '', stderr: '' });
        }
      });
      return {};
    },
  );
  return { execFileMock, state };
});

vi.mock('child_process', () => ({ execFile: execFileMock }));

import { NextRequest } from 'next/server';
import { PUT } from '../route';

const originalTZ = process.env.TZ;

function putRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/timezone', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/system/timezone', () => {
  beforeEach(() => {
    execFileMock.mockClear();
    state.shouldFail = false;
    sudoState.ready = true;
  });

  // The route assigns `process.env.TZ` on success so the running process stops
  // reporting the old zone. Put it back so later suites format dates the way
  // this machine does.
  afterAll(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it('sets the zone via timedatectl and returns ok on success', async () => {
    const res = await PUT(putRequest({ timezone: 'Europe/Berlin' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, timezone: 'Europe/Berlin' });
    expect(execFileMock).toHaveBeenCalledWith(
      'sudo',
      ['timedatectl', 'set-timezone', 'Europe/Berlin'],
      expect.any(Function),
    );
  });

  it('points the running process at the new zone so it stops reporting the old one', async () => {
    await PUT(putRequest({ timezone: 'Asia/Tokyo' }));
    // Assigning process.env.TZ is what invalidates Node's cached system zone;
    // without it the hub keeps stamping (and reporting) the pre-change zone
    // until the service restarts.
    expect(process.env.TZ).toBe('Asia/Tokyo');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Tokyo');
  });

  it('answers 409 with needsSudoPassword before running anything when sudo is not ready', async () => {
    sudoState.ready = false;
    const res = await PUT(putRequest({ timezone: 'Europe/Berlin' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, needsSudoPassword: true });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('returns 500 with stderr detail when timedatectl fails', async () => {
    state.shouldFail = true;
    const res = await PUT(putRequest({ timezone: 'Europe/Berlin' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    // A plain sentence for the page; timedatectl's own words ride as detail for the log and a support thread.
    expect(body.error).toBe('Failed to set the device timezone');
    expect(body.detail).toBe('Failed to set time zone: boom');
  });

  it('rejects a zone that is not a real IANA name with 400', async () => {
    const res = await PUT(putRequest({ timezone: 'Mars/Olympus_Mons' }));
    expect(res.status).toBe(400);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a shell injection attempt', 'Europe/Berlin; rm -rf /'],
    ['a command substitution attempt', 'Europe/Berlin$(reboot)'],
    ['an argument-splitting attempt', 'Europe/Berlin --adjust-system-clock'],
    ['a path traversal attempt', '../../etc/shadow'],
    ['a UTC offset rather than a zone name', '+05:30'],
    ['an empty string', ''],
    ['a non-string', 42],
    ['a missing field', undefined],
  ])('never lets %s reach execFile', async (_label, timezone) => {
    const res = await PUT(putRequest({ timezone }));
    expect(res.status).toBe(400);
    // The allowlist is the guarantee: a crafted string is rejected by name
    // before any privileged call is made, not neutralized afterwards.
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('accepts a renamed zone under either spelling', async () => {
    // `Intl.supportedValuesOf` names only one of an alias pair, and which one
    // depends on the runtime's ICU. Rejecting the other told a household its
    // own timezone was unknown, so both have to reach timedatectl verbatim:
    // the zone the user picked is the zone the device gets told about.
    for (const zone of ['Europe/Kyiv', 'Europe/Kiev', 'America/Nuuk', 'Asia/Kolkata']) {
      execFileMock.mockClear();
      const res = await PUT(putRequest({ timezone: zone }));
      expect(res.status, zone).toBe(200);
      expect(execFileMock).toHaveBeenCalledWith(
        'sudo',
        ['timedatectl', 'set-timezone', zone],
        expect.any(Function),
      );
    }
  });

  it('accepts UTC, which the Intl zone list omits and the picker adds back', async () => {
    const res = await PUT(putRequest({ timezone: 'UTC' }));
    expect(res.status).toBe(200);
    expect(execFileMock).toHaveBeenCalledWith('sudo', ['timedatectl', 'set-timezone', 'UTC'], expect.any(Function));
  });
});
