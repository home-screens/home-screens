import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(),
  setSecret: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn((...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args)),
  };
});

import { getSecret, setSecret } from '@/lib/secrets';
import { requireSession } from '@/lib/auth';

const { GET, PUT, cache } = await import('@/app/api/todoist/route');

// ─── Helpers ───

function makeTodoistTask(overrides: Record<string, unknown> = {}) {
  return {
    id: '123',
    content: 'Buy groceries',
    description: 'Milk, eggs, bread',
    priority: 4,
    due: { date: '2026-03-10', datetime: null, is_recurring: false },
    labels: ['urgent'],
    project_id: 'proj1',
    section_id: 'sec1',
    parent_id: null,
    child_order: 1,
    note_count: 2,
    ...overrides,
  };
}

function makeTodoistProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj1',
    name: 'Shopping',
    color: 'berry_red',
    child_order: 1,
    ...overrides,
  };
}

function makeTodoistSection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sec1',
    name: 'High Priority',
    ...overrides,
  };
}

function makeTodoistLabel(overrides: Record<string, unknown> = {}) {
  return {
    name: 'urgent',
    color: 'red',
    ...overrides,
  };
}

/**
 * Sets up global.fetch to return the given data for each Todoist endpoint.
 * Endpoints are called in order: /tasks, /projects, /sections, /labels.
 */
function mockTodoistAPI(data: {
  tasks?: Record<string, unknown>[];
  projects?: Record<string, unknown>[];
  sections?: Record<string, unknown>[];
  labels?: Record<string, unknown>[];
}) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/tasks')) {
      return Promise.resolve({
        ok: true,
        json: async () => data.tasks ?? [],
        text: async () => '',
      });
    }
    if (url.includes('/projects')) {
      return Promise.resolve({
        ok: true,
        json: async () => data.projects ?? [],
        text: async () => '',
      });
    }
    if (url.includes('/sections')) {
      return Promise.resolve({
        ok: true,
        json: async () => data.sections ?? [],
        text: async () => '',
      });
    }
    if (url.includes('/labels')) {
      return Promise.resolve({
        ok: true,
        json: async () => data.labels ?? [],
        text: async () => '',
      });
    }
    return Promise.resolve({ ok: false, status: 404, text: async () => 'Not found' });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  cache.clear();
});

// ─── GET ───

describe('GET /api/todoist', () => {
  it('returns 400 when no todoist_token is configured', async () => {
    vi.mocked(getSecret).mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No Todoist API key configured/);
  });

  it('returns enriched tasks with project name, color, and section name', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [makeTodoistTask()],
      projects: [makeTodoistProject()],
      sections: [makeTodoistSection()],
      labels: [makeTodoistLabel()],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(res.status).toBe(200);
    const task = json.tasks[0];
    expect(task.projectName).toBe('Shopping');
    expect(task.projectColor).toBe('#b8255f'); // berry_red resolved
    expect(task.sectionName).toBe('High Priority');
    expect(task.content).toBe('Buy groceries');
    expect(task.description).toBe('Milk, eggs, bread');
    expect(task.priority).toBe(4);
  });

  it('strips markdown from content and description', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [
        // Mirrors Todoist's default "getting started" tasks which embed [text](url) links.
        makeTodoistTask({
          id: 'a',
          content: 'All about tasks ([Watch](https://youtu.be/abc))',
          description: 'See **bold**, *italic*, ~~strike~~, `code`, and ![img](https://x/y.png) handling.',
        }),
        makeTodoistTask({
          id: 'b',
          content: '__Underline bold__ and _emphasis_',
          description: 'snake_case_var should survive italic stripping',
        }),
      ],
      projects: [makeTodoistProject()],
      sections: [],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(json.tasks[0].content).toBe('All about tasks (Watch)');
    expect(json.tasks[0].description).toBe('See bold, italic, strike, code, and img handling.');
    expect(json.tasks[1].content).toBe('Underline bold and emphasis');
    expect(json.tasks[1].description).toBe('snake_case_var should survive italic stripping');
  });

  it('caps markdown stripping input at 4 KB to prevent pathological-regex stalls', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    // 10k unmatched `[` chars would trigger quadratic scan in the link regex.
    // The cap forces input down to 4096, bounding worst-case work.
    const huge = '['.repeat(10_000) + 'tail';
    mockTodoistAPI({
      tasks: [makeTodoistTask({ content: huge })],
      projects: [makeTodoistProject()],
      sections: [],
      labels: [],
    });

    const start = Date.now();
    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const elapsed = Date.now() - start;
    const json = await res.json();

    expect(res.status).toBe(200);
    // Truncated to the 4 KB cap — `tail` sat at char 10k, so it's dropped.
    expect(json.tasks[0].content.length).toBeLessThanOrEqual(4096);
    // Sanity: even a punishing input completes in well under a second.
    expect(elapsed).toBeLessThan(500);
  });

  it('resolveColor maps named colors to hex (berry_red -> #b8255f)', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [makeTodoistTask()],
      projects: [makeTodoistProject({ color: 'berry_red' })],
      sections: [],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(json.tasks[0].projectColor).toBe('#b8255f');
  });

  it('resolveColor passes through hex values unchanged', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [makeTodoistTask()],
      projects: [makeTodoistProject({ color: '#ff00ff' })],
      sections: [],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(json.tasks[0].projectColor).toBe('#ff00ff');
  });

  it('resolveColor defaults to #808080 for null/undefined color', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [makeTodoistTask()],
      projects: [makeTodoistProject({ color: undefined })],
      sections: [],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    // Project color should default when color is falsy
    expect(json.tasks[0].projectColor).toBe('#808080');
  });

  it('tasks include due date info when present', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [
        makeTodoistTask({
          due: { date: '2026-03-10', datetime: '2026-03-10T14:00:00Z', is_recurring: true },
        }),
      ],
      projects: [makeTodoistProject()],
      sections: [],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(json.tasks[0].due).toEqual({
      date: '2026-03-10',
      datetime: '2026-03-10T14:00:00Z',
      isRecurring: true,
    });
  });

  it('tasks have null due when no due date', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [makeTodoistTask({ due: null })],
      projects: [makeTodoistProject()],
      sections: [],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(json.tasks[0].due).toBeNull();
  });

  it('labels include colors from label definitions', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [makeTodoistTask({ labels: ['urgent', 'home'] })],
      projects: [makeTodoistProject()],
      sections: [],
      labels: [
        makeTodoistLabel({ name: 'urgent', color: 'red' }),
        makeTodoistLabel({ name: 'home', color: 'blue' }),
      ],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(json.tasks[0].labelColors).toEqual({
      urgent: '#db4035', // red
      home: '#4073ff', // blue
    });
  });

  it('labels default to #808080 for unknown label colors', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [makeTodoistTask({ labels: ['urgent', 'unknown-label'] })],
      projects: [makeTodoistProject()],
      sections: [],
      labels: [makeTodoistLabel({ name: 'urgent', color: 'red' })],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    // 'unknown-label' is not in the label list, so should default
    expect(json.tasks[0].labelColors['unknown-label']).toBe('#808080');
  });

  it('fetchTodoistList handles bare array response', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    // When the API returns a bare array (not wrapped in { results: [...] })
    mockTodoistAPI({
      tasks: [makeTodoistTask()],
      projects: [makeTodoistProject()],
      sections: [makeTodoistSection()],
      labels: [makeTodoistLabel()],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.tasks).toHaveLength(1);
  });

  it('fetchTodoistList handles { results: [...] } wrapper', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [makeTodoistTask()] }),
          text: async () => '',
        });
      }
      if (url.includes('/projects')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [makeTodoistProject()] }),
          text: async () => '',
        });
      }
      if (url.includes('/sections')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [] }),
          text: async () => '',
        });
      }
      if (url.includes('/labels')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [] }),
          text: async () => '',
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => '' });
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0].content).toBe('Buy groceries');
  });

  it('fetchTodoistList handles { items: [...] } wrapper', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [makeTodoistTask({ content: 'Item wrapper' })] }),
          text: async () => '',
        });
      }
      if (url.includes('/projects')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [makeTodoistProject()] }),
          text: async () => '',
        });
      }
      if (url.includes('/sections')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [] }),
          text: async () => '',
        });
      }
      if (url.includes('/labels')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [] }),
          text: async () => '',
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => '' });
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0].content).toBe('Item wrapper');
  });

  it('multiple tasks correctly associated with their projects', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [
        makeTodoistTask({ id: '1', content: 'Task A', project_id: 'proj1' }),
        makeTodoistTask({ id: '2', content: 'Task B', project_id: 'proj2' }),
        makeTodoistTask({ id: '3', content: 'Task C', project_id: 'proj1' }),
      ],
      projects: [
        makeTodoistProject({ id: 'proj1', name: 'Work', color: 'blue' }),
        makeTodoistProject({ id: 'proj2', name: 'Personal', color: 'green' }),
      ],
      sections: [],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(json.tasks).toHaveLength(3);
    expect(json.tasks[0].projectName).toBe('Work');
    expect(json.tasks[0].projectColor).toBe('#4073ff');
    expect(json.tasks[1].projectName).toBe('Personal');
    expect(json.tasks[1].projectColor).toBe('#299438');
    expect(json.tasks[2].projectName).toBe('Work');
  });

  it('snake_case and camelCase field names both work', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [
        makeTodoistTask({
          project_id: undefined,
          projectId: 'proj1',
          section_id: undefined,
          sectionId: 'sec1',
          parent_id: undefined,
          parentId: 'parent1',
          child_order: undefined,
          childOrder: 5,
          note_count: undefined,
          noteCount: 3,
        }),
      ],
      projects: [makeTodoistProject()],
      sections: [makeTodoistSection()],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    const task = json.tasks[0];
    expect(task.projectId).toBe('proj1');
    expect(task.sectionId).toBe('sec1');
    expect(task.parentId).toBe('parent1');
    expect(task.order).toBe(5);
    expect(task.commentCount).toBe(3);
  });

  it('network error returns 500', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to fetch Todoist data');
  });

  it('returns enriched projects alongside tasks', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    mockTodoistAPI({
      tasks: [],
      projects: [
        makeTodoistProject({ id: 'p1', name: 'Work', color: 'teal', child_order: 2 }),
        makeTodoistProject({ id: 'p2', name: 'Personal', color: '#abcdef', child_order: 1 }),
      ],
      sections: [],
      labels: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/todoist'));
    const json = await res.json();

    expect(json.projects).toHaveLength(2);
    expect(json.projects[0]).toEqual({ id: 'p1', name: 'Work', color: '#158fad', order: 2 });
    expect(json.projects[1]).toEqual({ id: 'p2', name: 'Personal', color: '#abcdef', order: 1 });
  });
});

// ─── PUT ───

describe('PUT /api/todoist', () => {
  it('returns auth error when session is invalid', async () => {
    vi.mocked(requireSession).mockRejectedValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const req = new NextRequest('http://localhost/api/todoist', {
      method: 'PUT',
      body: JSON.stringify({ token: 'abc' }),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when no token in body', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/todoist', {
      method: 'PUT',
      body: JSON.stringify({}),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No token provided/);
  });

  it('returns 400 when token is empty string', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/todoist', {
      method: 'PUT',
      body: JSON.stringify({ token: '' }),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No token provided/);
  });

  it('returns 400 when token is whitespace only', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/todoist', {
      method: 'PUT',
      body: JSON.stringify({ token: '   ' }),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No token provided/);
  });

  it('returns 401 when Todoist API rejects the token', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    const req = new NextRequest('http://localhost/api/todoist', {
      method: 'PUT',
      body: JSON.stringify({ token: 'bad-token' }),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toMatch(/Invalid token/);
  });

  it('saves token and returns success when valid', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    const req = new NextRequest('http://localhost/api/todoist', {
      method: 'PUT',
      body: JSON.stringify({ token: 'valid-token-123' }),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(setSecret).toHaveBeenCalledWith('todoist_token', 'valid-token-123');
  });

  it('trims whitespace from token before validation and saving', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    const req = new NextRequest('http://localhost/api/todoist', {
      method: 'PUT',
      body: JSON.stringify({ token: '  valid-token  ' }),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(setSecret).toHaveBeenCalledWith('todoist_token', 'valid-token');

    // Verify the trimmed token was used for validation
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/projects'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
      }),
    );
  });
});
