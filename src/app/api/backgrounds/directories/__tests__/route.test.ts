/**
 * Route-level tests for `/api/backgrounds/directories` (GET list + POST create
 * + DELETE remove).
 *
 * Mocks `fs.promises` (readdir / stat / mkdir / rmdir) so nothing touches the
 * filesystem. Covers the directory listing shape, the name-sanitizing and
 * depth guards on create, and the root-protection / not-empty / not-found
 * guards on delete. The real `parseJsonBody` runs. Auth stubbed at
 * `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  readdir: vi.fn(),
  stat: vi.fn(),
  rmdir: vi.fn(async () => undefined),
}));
vi.mock('fs', () => ({ promises: mockFs }));

import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '../route';

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/backgrounds/directories', { method: 'GET' });
}
function bodyRequest(method: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backgrounds/directories', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/backgrounds/directories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // withFileTypes → image dirents for the root count; plain readdir → no subdirs.
    mockFs.readdir.mockImplementation(async (_p: string, opts?: { withFileTypes?: boolean }) => {
      if (opts?.withFileTypes) {
        return [
          { name: 'a.jpg', isFile: () => true, isDirectory: () => false },
          { name: 'b.png', isFile: () => true, isDirectory: () => false },
          { name: 'notes.txt', isFile: () => true, isDirectory: () => false },
        ];
      }
      return [];
    });
  });

  it('lists the root "All Photos" entry with an image count', async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.directories[0]).toEqual({ name: 'All Photos', path: '', imageCount: 2 });
    expect(mockFs.mkdir).toHaveBeenCalled();
  });
});

describe('POST /api/backgrounds/directories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing name with 400', async () => {
    const res = await POST(bodyRequest('POST', {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name is required/);
  });

  it('rejects a name that sanitizes to empty with 400', async () => {
    const res = await POST(bodyRequest('POST', { name: '...' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid directory name/);
  });

  it('creates a directory and returns its relative path with 201', async () => {
    const res = await POST(bodyRequest('POST', { name: 'Vacation 2026!' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    // Illegal characters are replaced with hyphens.
    expect(body.path).toBe('Vacation-2026-');
    expect(mockFs.mkdir).toHaveBeenCalled();
  });

  it('rejects a directory nested deeper than the max depth', async () => {
    const res = await POST(bodyRequest('POST', { name: 'deep', parent: 'level1/level2' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Maximum folder depth/);
  });
});

describe('DELETE /api/backgrounds/directories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.stat.mockResolvedValue({ isDirectory: () => true });
    mockFs.readdir.mockResolvedValue([]);
  });

  it('rejects a missing path with 400', async () => {
    const res = await DELETE(bodyRequest('DELETE', {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/path is required/);
  });

  it('refuses to delete the root directory', async () => {
    const res = await DELETE(bodyRequest('DELETE', { path: '.' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Cannot delete root/);
  });

  it('returns 404 when the directory does not exist', async () => {
    mockFs.stat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const res = await DELETE(bodyRequest('DELETE', { path: 'gone' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Directory not found/);
  });

  it('refuses to delete a non-empty directory with 409', async () => {
    mockFs.readdir.mockResolvedValue(['photo.jpg']);
    const res = await DELETE(bodyRequest('DELETE', { path: 'Vacation' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not empty/);
    expect(mockFs.rmdir).not.toHaveBeenCalled();
  });

  it('deletes an empty directory', async () => {
    const res = await DELETE(bodyRequest('DELETE', { path: 'Vacation' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 'Vacation' });
    expect(mockFs.rmdir).toHaveBeenCalled();
  });
});
