/**
 * Route-level tests for `/api/system/backups` (GET list/download + POST restore).
 *
 * Mocks `child_process.execFile` (the `upgrade.sh` shell-out used for listing
 * for listing) and `fs/promises.readFile` (for snapshot reads). Restores use
 * the coordinated import service, never the script. The real
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
const { execRouter, readFileMock, saveImportedConfigMock, access } = vi.hoisted(() => ({
  access: { depth: 0 },
  saveImportedConfigMock: vi.fn(),
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
vi.mock('@/lib/data-transaction', () => ({
  assertStillOwned: async () => {},
  durableRemove: async (file: string) => {
    const { promises: fs } = await import('fs');
    await fs.rm(file, { force: true });
  },
  onDataTransactionCommit: vi.fn(),
  withDataTransaction: async (operation: () => Promise<unknown>) => {
    access.depth++;
    try { return await operation(); } finally { access.depth--; }
  },
}));
vi.mock('@/lib/family-import', () => ({ saveImportedConfig: saveImportedConfigMock }));

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

  it('accepts the prerelease-versioned and pinned snapshot names', async () => {
    // A snapshot taken on a test build carries that build's dash-suffixed
    // version; the pinned pre-prerelease copy has a fixed name.
    for (const name of ['config-v1.12.3-dev.20260908-20260908-031500.json', 'config-v1.13.0-rc.1-20260908-031500.json', 'last-stable-config.json']) {
      const res = await GET(getRequest(`?download=${name}`));
      expect(res.status, name).toBe(200);
    }
    for (const name of ['config-v1.12.3-dev.20260908.json', 'last-stable-config.json.bak', '../last-stable-config.json']) {
      const res = await GET(getRequest(`?download=${encodeURIComponent(name)}`));
      expect(res.status, name).toBe(400);
    }
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
    readFileMock.mockResolvedValue(Buffer.from(JSON.stringify({ version: 13, screens: [], settings: {} })));
    saveImportedConfigMock.mockImplementation(async (config) => {
      expect(access.depth).toBe(1);
      return config;
    });
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

  it('restores a validated snapshot through the coordinated import service', async () => {
    execRouter.fn = () => { throw new Error('Restore must not invoke upgrade.sh'); };
    const res = await POST(postRequest({ name: VALID_NAME }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, restored: VALID_NAME });
    expect(saveImportedConfigMock).toHaveBeenCalledWith({ version: 13, screens: [], settings: {} });
    expect(access.depth).toBe(0);
  });

  it('returns 404 for a missing snapshot without attempting an import', async () => {
    readFileMock.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const res = await POST(postRequest({ name: VALID_NAME }));
    expect(res.status).toBe(404);
    expect(saveImportedConfigMock).not.toHaveBeenCalled();
  });

  it.each(['{', '{}', 'null', '{"screens":[],"settings":[]}', '{"screens":[null],"settings":{}}'])('rejects malformed snapshot %s before mutation', async (contents) => {
    readFileMock.mockResolvedValueOnce(Buffer.from(contents));
    const res = await POST(postRequest({ name: VALID_NAME }));
    expect(res.status).toBe(400);
    expect(saveImportedConfigMock).not.toHaveBeenCalled();
  });

  it('does not return success if the coordinated import fails', async () => {
    saveImportedConfigMock.mockRejectedValueOnce(new Error('write failed'));
    const res = await POST(postRequest({ name: VALID_NAME }));
    expect(res.status).toBe(500);
    expect(access.depth).toBe(0);
  });
});
