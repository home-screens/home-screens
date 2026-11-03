// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { DisplayTargetContext, type DisplayTargetValue } from '../../display-target';

const mocks = vi.hoisted(() => ({
  editorFetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
}));

// Keep `isSessionExpired` real so the hook sees the same error shape `editorFetch` throws.
vi.mock('@/lib/editor-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editor-fetch')>();
  return { ...actual, editorFetch: mocks.editorFetch };
});

import { useSendToWall } from '../useSendToWall';

const WALLS = [{ id: 'kitchen', name: 'Kitchen' }, { id: 'hall', name: 'Hallway' }];
const WORDS = { everyWall: 'every wall', theWall: 'the wall' };

/** The hub's answer with `status` and an optional JSON body. */
function answer(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

/** What the hook posted: the route and the parsed body. */
function posted(): { route: string; body: Record<string, unknown> } {
  const [route, init] = mocks.editorFetch.mock.calls[0];
  return { route, body: JSON.parse(init!.body as string) };
}

function setup(displays = WALLS) {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(
    DisplayTargetContext.Provider,
    { value: { target: undefined, setTarget: () => {}, displays, timerTargetIds: [], setTimerTargetIds: () => {}, live: [] } },
    children,
  );
  const { result } = renderHook(() => useSendToWall(), { wrapper });
  return (target: DisplayTargetValue) => result.current.send('/api/display/show-photo', { file: 'a.jpg' }, target, WORDS);
}

beforeEach(() => {
  mocks.editorFetch.mockReset().mockResolvedValue(answer(200, { ok: true }));
});

afterEach(() => {
  cleanup();
});

describe('useSendToWall', () => {
  it('posts the body to the route with the wall it is for', async () => {
    const send = setup();
    await send('kitchen');
    expect(posted()).toEqual({ route: '/api/display/show-photo', body: { file: 'a.jpg', displayId: 'kitchen' } });
    expect(mocks.editorFetch.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
  });

  it('leaves the wall out on a single-display install', async () => {
    const send = setup([]);
    await send(undefined);
    expect(posted().body).toEqual({ file: 'a.jpg' });
  });

  it('names where it went: the wall, every wall, or just the wall', async () => {
    const send = setup();
    expect(await send('kitchen')).toEqual({ ok: true, where: 'Kitchen' });
    expect(await send('all')).toEqual({ ok: true, where: 'every wall' });
    expect(await send('gone')).toEqual({ ok: true, where: 'the wall' });
    expect(await send(undefined)).toEqual({ ok: true, where: 'the wall' });
  });

  it('hands back the status and body of a refusal', async () => {
    const send = setup();
    mocks.editorFetch.mockResolvedValueOnce(answer(502, { error: 'no', failure: 'unreachable' }));
    expect(await send('kitchen')).toEqual({ ok: false, status: 502, refusal: { error: 'no', failure: 'unreachable' } });

    mocks.editorFetch.mockResolvedValueOnce(answer(404));
    expect(await send('kitchen')).toEqual({ ok: false, status: 404, refusal: null });
  });

  it('says a session that ran out is expired, and nothing about a hub that never answered', async () => {
    const send = setup();
    mocks.editorFetch.mockRejectedValueOnce(new Error('Session expired'));
    expect(await send('kitchen')).toEqual({ ok: false, expired: true });

    mocks.editorFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    expect(await send('kitchen')).toEqual({ ok: false });
  });
});
