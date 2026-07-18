/**
 * Route-level tests for `POST /api/system/power`.
 *
 * Mocks `child_process` (`spawn` for the delayed reboot/restart, `execSync` for
 * the systemd-managed check). The real `parseJsonBody` runs so the malformed-body
 * and invalid-action branches are exercised. Auth stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

const { spawnMock, execSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn((_cmd: string, _args: string[]) => ({ unref: vi.fn() })),
  execSyncMock: vi.fn(() => Buffer.from('active')),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
  execSync: execSyncMock,
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

function postRequest(body: unknown, raw = false): NextRequest {
  return new NextRequest('http://localhost/api/system/power', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe('POST /api/system/power', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockReturnValue({ unref: vi.fn() });
    execSyncMock.mockReturnValue(Buffer.from('active'));
  });

  it('rejects a malformed JSON body with 400', async () => {
    const res = await POST(postRequest('{not json', true));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid JSON/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown action with 400', async () => {
    const res = await POST(postRequest({ action: 'explode' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid action/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('schedules a service restart when systemd manages the service', async () => {
    const res = await POST(postRequest({ action: 'restart-service' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: 'Service restart scheduled' });
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it('refuses to restart when the service is not systemd-managed', async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('Unit home-screens not found');
    });
    const res = await POST(postRequest({ action: 'restart-service' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not managed by systemd/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('schedules a reboot', async () => {
    const res = await POST(postRequest({ action: 'reboot' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: 'System reboot scheduled' });
    expect(spawnMock).toHaveBeenCalledOnce();
    const [, args] = spawnMock.mock.calls[0];
    expect((args as string[]).join(' ')).toMatch(/sudo reboot/);
  });
});
