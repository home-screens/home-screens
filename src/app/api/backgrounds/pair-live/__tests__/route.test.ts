import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level tests for POST /api/backgrounds/pair-live: body validation and a
 * `LibraryMoveError` reaching the route wrapper. The pairing itself is covered
 * by `src/lib/__tests__/library-moves.test.ts` on a real temp library.
 */
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/library-moves', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/library-moves')>()),
  pairLiveClips: vi.fn(),
}));

import { LibraryMoveError, pairLiveClips } from '@/lib/library-moves';
import { POST } from '../route';

const pair = vi.mocked(pairLiveClips);

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backgrounds/pair-live', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => pair.mockReset());

describe('POST /api/backgrounds/pair-live', () => {
  it('pairs the folder it is given and returns what was paired', async () => {
    const result = { paired: [{ from: 'trip/IMG_1.MOV', to: 'trip/IMG_1.live.mov' }], rewritten: 0, revision: 'r1', previousRevision: 'r0' };
    pair.mockResolvedValueOnce(result);
    const res = await POST(request({ directory: 'trip' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(pair).toHaveBeenCalledWith('trip');
  });

  it('rejects a missing directory', async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect(pair).not.toHaveBeenCalled();
  });

  it('answers a refusal with its status and code', async () => {
    pair.mockRejectedValueOnce(new LibraryMoveError(404, 'library.folderGone', 'Folder not found'));
    const res = await POST(request({ directory: 'gone' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'library.folderGone' });
  });
});
