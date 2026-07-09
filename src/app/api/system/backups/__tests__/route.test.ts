/**
 * Route-level tests for `/api/system/backups` (GET list/download + POST restore).
 *
 * Mocks `child_process.execFile` (the `upgrade.sh` shell-out used for listing
 * and restoring) and `fs/promises.readFile` (for the download branch). The real
 * `parseJsonBody` runs. Covers the path-traversal guard on filenames, the
 * download success / not-found branches, and the restore success / rejection.
 * Auth stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

// execFile('bash', [script, action, ...args], opts, cb) — router keyed on action.
const { execRouter, readFileMock } = vi.hoisted(() => ({
  execRouter: { fn: (_action: string) => '' as string | Error },
  readFileMock: vi.fn(async () => Buffer.from('{"backup":true}')),
}));

vi.mock('child_process', () => ({
  execFile: (_cmd: string, args: string[], _opts: unknown, cb: (err: unknown, stdout?: string) => void) => {
    const action = args[1];
    const result = execRouter.fn(action);
    if (result instanceof Error) cb(result);
    else cb(null, result);
  },
}));

vi.mock('fs/promises', () => ({ readFile: readFileMock }));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

const VALID_NAME = 'config-v1.2.3-20260101-120000.json';

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/system/backups${query}`, { method: 'GET' });
}
function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/backups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/system/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileMock.mockResolvedValue(Buffer.from('{"backup":true}'));
  });

  it('lists backups from the upgrade script output', async () => {
    execRouter.fn = () => JSON.stringify([VALID_NAME]);
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ backups: [VALID_NAME] });
  });

  it('rejects a download filename that fails the path-traversal guard', async () => {
    const res = await GET(getRequest('?download=../../etc/passwd'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid backup filename/);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('streams a valid backup file for download', async () => {
    const res = await GET(getRequest(`?download=${VALID_NAME}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain(VALID_NAME);
    expect(readFileMock).toHaveBeenCalledOnce();
  });

  it('returns 404 when the requested backup file is missing', async () => {
    readFileMock.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const res = await GET(getRequest(`?download=${VALID_NAME}`));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Backup not found/);
  });
});

describe('POST /api/system/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing name with 400', async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing "name"/);
  });

  it('rejects an invalid backup filename with 400', async () => {
    const res = await POST(postRequest({ name: 'totally-bogus.json' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid backup filename/);
  });

  it('restores a valid backup', async () => {
    execRouter.fn = () => JSON.stringify({ ok: true, restored: VALID_NAME });
    const res = await POST(postRequest({ name: VALID_NAME }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('surfaces a restore failure reported by the script as 400', async () => {
    execRouter.fn = () => JSON.stringify({ ok: false, error: 'checksum mismatch' });
    const res = await POST(postRequest({ name: VALID_NAME }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('checksum mismatch');
  });
});
