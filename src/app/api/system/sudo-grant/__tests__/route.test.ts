/**
 * Route-level tests for `POST /api/system/sudo-grant`.
 *
 * The grant itself is `grantSudo`'s job (covered in sudo-grant.test.ts); this
 * file covers what the route adds: input checks, the wrong-password brake,
 * the audit trail, and that the password never lands anywhere but the call
 * into grantSudo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

const { grantSudoMock, auditMock } = vi.hoisted(() => ({
  grantSudoMock: vi.fn(),
  auditMock: vi.fn(),
}));
vi.mock('@/lib/sudo-grant', () => ({ grantSudo: grantSudoMock }));
vi.mock('@/lib/audit', () => ({ audit: auditMock }));

import { NextRequest } from 'next/server';
import { POST } from '../route';

function post(body: unknown, ip = '10.0.0.7'): NextRequest {
  return new NextRequest('http://localhost/api/system/sudo-grant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hs-client-ip': ip },
    body: JSON.stringify(body),
  });
}

describe('POST /api/system/sudo-grant', () => {
  beforeEach(() => {
    grantSudoMock.mockReset();
    auditMock.mockReset();
  });

  it('rejects a missing password with 400 and never calls sudo', async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(grantSudoMock).not.toHaveBeenCalled();
  });

  it('rejects a password containing a newline, which would truncate the stdin line', async () => {
    const res = await POST(post({ password: 'abc\ndef' }));
    expect(res.status).toBe(400);
    expect(grantSudoMock).not.toHaveBeenCalled();
  });

  it('hands the password to grantSudo and audits success without it', async () => {
    grantSudoMock.mockResolvedValue({ ok: true });
    const res = await POST(post({ password: 'screens' }, '10.0.0.8'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(grantSudoMock).toHaveBeenCalledWith('screens');
    expect(auditMock).toHaveBeenCalledWith({ action: 'sudo_grant_success', ip: '10.0.0.8' });
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain('screens');
  });

  it('answers 403 (never 401, which editorFetch treats as a lost session) with wrongPassword and audits the failure', async () => {
    grantSudoMock.mockResolvedValue({ ok: false, wrongPassword: true, error: 'That password did not work.' });
    const res = await POST(post({ password: 'nope' }, '10.0.0.9'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: 'That password did not work.', wrongPassword: true });
    expect(auditMock).toHaveBeenCalledWith({ action: 'sudo_grant_failure', ip: '10.0.0.9' });
  });

  it('answers 500 when the password worked but the grant could not be written', async () => {
    grantSudoMock.mockResolvedValue({ ok: false, wrongPassword: false, error: 'visudo missing' });
    const res = await POST(post({ password: 'ok' }, '10.0.0.10'));
    expect(res.status).toBe(500);
    expect((await res.json()).wrongPassword).toBe(false);
  });

  it('locks an address out after five wrong passwords and clears it on success', async () => {
    grantSudoMock.mockResolvedValue({ ok: false, wrongPassword: true, error: 'no' });
    for (let i = 0; i < 5; i++) {
      expect((await POST(post({ password: 'no' }, '10.0.0.11'))).status).toBe(403);
    }
    const limited = await POST(post({ password: 'no' }, '10.0.0.11'));
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.retryAfterMinutes).toBeGreaterThan(0);
    expect(grantSudoMock).toHaveBeenCalledTimes(5);

    // Another address is unaffected
    expect((await POST(post({ password: 'no' }, '10.0.0.12'))).status).toBe(403);
  });
});
