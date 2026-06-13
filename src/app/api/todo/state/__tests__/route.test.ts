import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TodoState } from '@/lib/todo-data';

let todoState: TodoState;

vi.mock('@/lib/todo-data', () => ({
  readTodoState: vi.fn(async () => todoState),
}));

// Auth is satisfied — we exercise the read, not the auth wrapper.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET } from '@/app/api/todo/state/route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/todo/state', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  todoState = { completed: {} };
});

describe('GET /api/todo/state', () => {
  it('returns the empty completion map by default', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ completed: {} });
  });

  it('returns the current runtime completion map', async () => {
    todoState = { completed: { i1: true, i2: false } };
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.completed).toEqual({ i1: true, i2: false });
  });
});
