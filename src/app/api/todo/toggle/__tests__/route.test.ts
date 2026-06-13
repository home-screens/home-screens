import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { ScreenConfiguration } from '@/types/config';
import type { TodoState } from '@/lib/todo-data';

// In-memory config the mocked readConfig returns. The toggle route reads this
// for VALIDATION only — it never writes config. Each test resets it.
let currentConfig: ScreenConfiguration;
// In-memory runtime completion store the mocked updateTodoState mutates. This
// is where completion actually lives now (not in config).
let todoState: TodoState;

// readConfig is read-only here; the route validates against it and writes
// completion to the separate todo-state store.
vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => currentConfig),
}));

// Mirror the real updateTodoState contract: run the mutator against the current
// state and persist its result. A mutator that returns the same reference is a
// no-op (not exercised here). The route never throws to short-circuit anymore —
// it returns NextResponse directly on validation failure, before touching this.
vi.mock('@/lib/todo-data', () => ({
  updateTodoState: vi.fn(async (mutator: (c: TodoState) => TodoState | Promise<TodoState>) => {
    todoState = await mutator(todoState);
    return todoState;
  }),
}));

// Auth is satisfied — we exercise the toggle logic, not the auth wrapper.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { POST } from '@/app/api/todo/toggle/route';
import { updateTodoState } from '@/lib/todo-data';

function todoModule(id: string, interactive: boolean) {
  return {
    id,
    type: 'todo' as const,
    position: { x: 0, y: 0 },
    size: { w: 350, h: 400 },
    zIndex: 0,
    style: {},
    config: {
      title: 'To Do',
      interactive,
      items: [
        { id: 'i1', text: 'First', completed: false },
        { id: 'i2', text: 'Second', completed: true },
      ],
    },
  } as never;
}

/** Legacy single-display config with one interactive todo on screen "s1". */
function makeConfig(): ScreenConfiguration {
  return {
    version: 4,
    settings: {} as never,
    screens: [
      { id: 's1', name: 'Screen 1', backgroundImage: '', modules: [todoModule('m1', true)] },
    ],
  } as ScreenConfiguration;
}

/** Multi-display config: a "kitchen" display owns the interactive todo. */
function makeMultiDisplayConfig(): ScreenConfiguration {
  return {
    version: 4,
    settings: {} as never,
    screens: [
      { id: 's1', name: 'Pool', backgroundImage: '', modules: [todoModule('m1', true)] },
    ],
    displays: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [
          { id: 's1', name: 'Kitchen', backgroundImage: '', modules: [todoModule('m1', true)] },
        ],
      },
    ],
  } as ScreenConfiguration;
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/todo/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentConfig = makeConfig();
  todoState = { completed: {} };
});

describe('POST /api/todo/toggle', () => {
  it('flips an item from its authored default and persists to the runtime store', async () => {
    // i1's authored default is false → first toggle flips it to true.
    const res = await POST(makeRequest({ screenId: 's1', moduleId: 'm1', itemId: 'i1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.completed.i1).toBe(true);
    // Persisted to the runtime store, NOT config.
    expect(todoState.completed.i1).toBe(true);
  });

  it('seeds the first flip from the authored default (true → false for i2)', async () => {
    const res = await POST(makeRequest({ screenId: 's1', moduleId: 'm1', itemId: 'i2' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.completed.i2).toBe(false);
  });

  it('is idempotent per call — on → off → on', async () => {
    await POST(makeRequest({ screenId: 's1', moduleId: 'm1', itemId: 'i1' }));
    expect(todoState.completed.i1).toBe(true);
    await POST(makeRequest({ screenId: 's1', moduleId: 'm1', itemId: 'i1' }));
    expect(todoState.completed.i1).toBe(false);
    await POST(makeRequest({ screenId: 's1', moduleId: 'm1', itemId: 'i1' }));
    expect(todoState.completed.i1).toBe(true);
  });

  it('resolves the item via the addressed display in multi-display mode', async () => {
    currentConfig = makeMultiDisplayConfig();
    const res = await POST(makeRequest({ displayId: 'kitchen', screenId: 's1', moduleId: 'm1', itemId: 'i1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.completed.i1).toBe(true);
    expect(todoState.completed.i1).toBe(true);
  });

  it('returns 404 for an explicit displayId that does not match a display', async () => {
    currentConfig = makeMultiDisplayConfig();
    const res = await POST(makeRequest({ displayId: 'nope', screenId: 's1', moduleId: 'm1', itemId: 'i1' }));
    expect(res.status).toBe(404);
    // No write happened — the store is untouched.
    expect(updateTodoState).not.toHaveBeenCalled();
    expect(todoState.completed).toEqual({});
  });

  it('returns 404 for an unknown screen', async () => {
    const res = await POST(makeRequest({ screenId: 'nope', moduleId: 'm1', itemId: 'i1' }));
    expect(res.status).toBe(404);
    expect(updateTodoState).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown module', async () => {
    const res = await POST(makeRequest({ screenId: 's1', moduleId: 'nope', itemId: 'i1' }));
    expect(res.status).toBe(404);
    expect(updateTodoState).not.toHaveBeenCalled();
  });

  it('returns 404 when the addressed module is not a todo module', async () => {
    currentConfig.screens[0].modules = [
      { id: 'm1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, zIndex: 0, style: {}, config: {} } as never,
    ];
    const res = await POST(makeRequest({ screenId: 's1', moduleId: 'm1', itemId: 'i1' }));
    expect(res.status).toBe(404);
    expect(updateTodoState).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown item', async () => {
    const res = await POST(makeRequest({ screenId: 's1', moduleId: 'm1', itemId: 'nope' }));
    expect(res.status).toBe(404);
    expect(updateTodoState).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-interactive module', async () => {
    currentConfig.screens[0].modules = [todoModule('m1', false)];
    const res = await POST(makeRequest({ screenId: 's1', moduleId: 'm1', itemId: 'i1' }));
    expect(res.status).toBe(403);
    // No write should have happened.
    expect(updateTodoState).not.toHaveBeenCalled();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({ screenId: 's1' }));
    expect(res.status).toBe(400);
    expect(updateTodoState).not.toHaveBeenCalled();
  });

  it('rejects a malformed JSON body without crashing', async () => {
    const req = new NextRequest('http://localhost/api/todo/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    const res = await POST(req);
    // withDisplayAuth's error wrapper turns the thrown parse error into a 500.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(updateTodoState).not.toHaveBeenCalled();
  });
});
