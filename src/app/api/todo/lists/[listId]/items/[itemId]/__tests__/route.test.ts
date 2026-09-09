import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(true),
}));

const todoWrite = vi.fn(async () => NextResponse.json({ lists: [] }));
vi.mock('@/lib/todo-api', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/todo-api')>()),
  todoWrite: () => todoWrite(),
}));

import { requireSession } from '@/lib/auth';
const { PATCH } = await import('../route');

const ctx = { params: Promise.resolve({ listId: 'l1', itemId: 'i1' }) };

function patch(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/todo/lists/l1/items/i1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const unauthorized = () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The display token (every kiosk, plus any sign-in-bypass address) may tick
 * an item and nothing more. Rewriting what a list says needs a session.
 */
describe('PATCH /api/todo/lists/[listId]/items/[itemId] auth', () => {
  it('lets the display token flip completed without a session', async () => {
    const res = await PATCH(patch({ completed: true }), ctx);
    expect(res.status).toBe(200);
    expect(requireSession).not.toHaveBeenCalled();
    expect(todoWrite).toHaveBeenCalledTimes(1);
  });

  it('refuses a text edit from the display token', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(unauthorized());
    const res = await PATCH(patch({ text: 'Rewritten' }), ctx);
    expect(res.status).toBe(401);
    expect(todoWrite).not.toHaveBeenCalled();
  });

  it('refuses a mixed body from the display token', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(unauthorized());
    const res = await PATCH(patch({ completed: true, dueDate: '2026-09-10' }), ctx);
    expect(res.status).toBe(401);
    expect(todoWrite).not.toHaveBeenCalled();
  });

  it('refuses a body that is not an object', async () => {
    const res = await PATCH(patch(null), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Expected an object');
    expect(todoWrite).not.toHaveBeenCalled();
  });

  it('allows a full edit with a session', async () => {
    const res = await PATCH(patch({ text: 'Bananas', dueDate: '2026-09-10' }), ctx);
    expect(res.status).toBe(200);
    expect(requireSession).toHaveBeenCalledTimes(1);
    expect(todoWrite).toHaveBeenCalledTimes(1);
  });
});
