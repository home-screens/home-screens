import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level tests for POST /api/backgrounds/move: body validation and a
 * `LibraryMoveError` reaching the route wrapper, which answers with its code. The move itself is
 * covered by `src/lib/__tests__/library-moves.test.ts` on a real temp library.
 */
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

// The real refusal class, so the route wrapper recognises what the mocked
// move throws; only the move itself is faked.
vi.mock('@/lib/library-moves', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/library-moves')>()),
  moveLibraryFiles: vi.fn(),
}));

import { LibraryMoveError, moveLibraryFiles } from '@/lib/library-moves';
import { POST } from '../route';

const move = vi.mocked(moveLibraryFiles);

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backgrounds/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => move.mockReset());

describe('POST /api/backgrounds/move', () => {
  it('passes files and directory through and returns the move result', async () => {
    move.mockResolvedValueOnce({ moved: [{ from: 'a.jpg', to: 'trips/a.jpg' }], kept: [], rewritten: 1, revision: 'r1', previousRevision: 'r0' });
    const res = await POST(request({ files: ['a.jpg'], directory: 'trips' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ moved: [{ from: 'a.jpg', to: 'trips/a.jpg' }], kept: [], rewritten: 1, revision: 'r1', previousRevision: 'r0' });
    expect(move).toHaveBeenCalledWith(['a.jpg'], 'trips');
  });

  it('rejects a missing or empty file list and a missing directory', async () => {
    expect((await POST(request({ directory: 'trips' }))).status).toBe(400);
    expect((await POST(request({ files: [], directory: 'trips' }))).status).toBe(400);
    expect((await POST(request({ files: [1], directory: 'trips' }))).status).toBe(400);
    expect((await POST(request({ files: ['a.jpg'] }))).status).toBe(400);
    expect(move).not.toHaveBeenCalled();
  });

  it('answers a refusal with its status, code, params and sentence', async () => {
    move.mockRejectedValueOnce(new LibraryMoveError(409, 'library.fileExists', 'a.jpg is already in that folder', { name: 'a.jpg' }));
    const res = await POST(request({ files: ['a.jpg'], directory: 'trips' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'a.jpg is already in that folder', code: 'library.fileExists', params: { name: 'a.jpg' } });
  });

  it('answers 500 with the generic message on an unexpected error', async () => {
    move.mockRejectedValueOnce(new Error('disk on fire'));
    const res = await POST(request({ files: ['a.jpg'], directory: 'trips' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to move files');
  });
});
