/**
 * Route-level tests for `GET /api/system/status` (upgrade-progress SSE stream).
 *
 * Mocks `subscribeToEvents` so we can capture the emit callback and drive
 * events into the stream. Covers the SSE response headers, the named-event
 * framing of an emitted progress event, and the unsubscribe-on-terminal-state
 * teardown. Auth stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

const { subscribeMock, unsubscribeMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}));

vi.mock('@/lib/upgrade', () => ({
  subscribeToEvents: subscribeMock,
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

type Emit = (event: { type: string; step?: string; [k: string]: unknown }) => void;

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/system/status', { method: 'GET' });
}

describe('GET /api/system/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeMock.mockImplementation(() => unsubscribeMock);
  });

  it('returns an SSE response and subscribes to upgrade events', async () => {
    const res = await GET(getRequest());
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toMatch(/no-cache/);
    expect(subscribeMock).toHaveBeenCalledOnce();
  });

  it('frames an emitted progress event as a named SSE event', async () => {
    const res = await GET(getRequest());
    const emit = subscribeMock.mock.calls[0][0] as Emit;

    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    emit({ type: 'progress', step: 'downloading', progress: 50 });
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: progress');
    expect(text).toContain('"step":"downloading"');
    await reader.cancel();
  });

  describe('terminal teardown', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('unsubscribes shortly after a terminal (complete) event', async () => {
      await GET(getRequest());
      const emit = subscribeMock.mock.calls[0][0] as Emit;

      emit({ type: 'progress', step: 'complete' });
      await vi.advanceTimersByTimeAsync(200);
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe('keepalive', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('sends a comment every 15 s while the install is silent', async () => {
      const res = await GET(getRequest());
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      await vi.advanceTimersByTimeAsync(15_000);
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toBe(': keepalive\n\n');
      await reader.cancel();
    });

    it('stops with the stream: no timers left after cancel or the terminal close', async () => {
      const res = await GET(getRequest());
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      await reader.cancel();
      expect(unsubscribeMock).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);

      await GET(getRequest());
      const emit = subscribeMock.mock.calls[1][0] as Emit;
      emit({ type: 'progress', step: 'error' });
      await vi.advanceTimersByTimeAsync(200);
      expect(unsubscribeMock).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
