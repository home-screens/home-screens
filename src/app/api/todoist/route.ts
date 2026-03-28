import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, createTTLCache, fetchWithTimeout, validateTodoistToken, requireSecret } from '@/lib/api-utils';
import { setSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

const TODOIST_API = 'https://api.todoist.com/api/v1';

// Named color → hex map (v2 style, kept for backwards compat)
const TODOIST_COLORS: Record<string, string> = {
  berry_red: '#b8255f',
  red: '#db4035',
  orange: '#ff9933',
  yellow: '#fad000',
  olive_green: '#afb83b',
  lime_green: '#7ecc49',
  green: '#299438',
  mint_green: '#6accbc',
  teal: '#158fad',
  sky_blue: '#14aaf5',
  light_blue: '#96c3eb',
  blue: '#4073ff',
  grape: '#884dff',
  violet: '#af38eb',
  lavender: '#eb96eb',
  magenta: '#e05194',
  salmon: '#ff8d85',
  charcoal: '#808080',
  grey: '#b8b8b8',
  taupe: '#ccac93',
};

/** Resolve a color value that may be a named color or already a hex string. */
function resolveColor(color: string | undefined | null): string {
  if (!color) return '#808080';
  if (color.startsWith('#')) return color;
  return TODOIST_COLORS[color] ?? '#808080';
}

// ─── Field accessors ───
// The v1 API may return snake_case (raw) or camelCase (if proxied through SDK).

function str(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) if (obj[k] != null) return String(obj[k]);
  return '';
}

function strOrNull(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) if (obj[k] != null) return String(obj[k]);
  return null;
}

function num(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) if (obj[k] != null) return Number(obj[k]);
  return 0;
}

function bool(obj: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) if (obj[k] != null) return Boolean(obj[k]);
  return false;
}

function arr(obj: Record<string, unknown>, ...keys: string[]): string[] {
  for (const k of keys) if (Array.isArray(obj[k])) return obj[k] as string[];
  return [];
}

/** Fetch a list endpoint, handling { results: [...] } wrapper or bare array. */
async function fetchTodoistList(endpoint: string, token: string): Promise<Record<string, unknown>[]> {
  const res = await fetchWithTimeout(`${TODOIST_API}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Todoist API ${endpoint} returned ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    if (Array.isArray(json.results)) return json.results;
    if (Array.isArray(json.items)) return json.items;
  }
  return [];
}

// ─── PUT: Save token server-side ───

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 400 });
  }

  // Validate the token by making a quick API call
  const result = await validateTodoistToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: 'Invalid token — Todoist returned ' + result.status }, { status: 401 });
  }

  await setSecret('todoist_token', token);
  cache.clear(); // invalidate cached tasks from previous token

  return NextResponse.json({ ok: true });
}, 'Failed to save Todoist token');

// ─── GET: Fetch tasks ───

/** @internal exported for test cleanup */
export const cache = createTTLCache<unknown>(60 * 1000); // 1 minute

export const GET = withDisplayAuth(async () => {
  const token = await requireSecret('todoist_token', 'Todoist');
  if (token instanceof NextResponse) return token;

  const cached = cache.get('todoist');
  if (cached) return NextResponse.json(cached);

  const [rawTasks, rawProjects, rawSections, rawLabels] = await Promise.all([
    fetchTodoistList('/tasks', token),
    fetchTodoistList('/projects', token),
    fetchTodoistList('/sections', token),
    fetchTodoistList('/labels', token),
  ]);

  const projectMap = new Map<string, { name: string; color: string }>();
  for (const p of rawProjects) {
    const id = str(p, 'id');
    projectMap.set(id, {
      name: str(p, 'name'),
      color: resolveColor(str(p, 'color')),
    });
  }

  const sectionMap = new Map<string, string>();
  for (const s of rawSections) {
    sectionMap.set(str(s, 'id'), str(s, 'name'));
  }

  const labelColorMap = new Map<string, string>();
  for (const l of rawLabels) {
    labelColorMap.set(str(l, 'name'), resolveColor(str(l, 'color')));
  }

  const enrichedTasks = rawTasks.map((t) => {
    const projectId = str(t, 'project_id', 'projectId');
    const sectionId = str(t, 'section_id', 'sectionId');
    const project = projectMap.get(projectId);
    const labels = arr(t, 'labels');

    const rawDue = t.due as Record<string, unknown> | null | undefined;
    const due = rawDue
      ? {
          date: str(rawDue, 'date'),
          datetime: strOrNull(rawDue, 'datetime'),
          isRecurring: bool(rawDue, 'is_recurring', 'isRecurring'),
        }
      : null;

    return {
      id: str(t, 'id'),
      content: str(t, 'content'),
      description: str(t, 'description'),
      priority: num(t, 'priority'),
      due,
      labels,
      labelColors: Object.fromEntries(
        labels.map((l) => [l, labelColorMap.get(l) ?? '#808080']),
      ),
      projectId,
      projectName: project?.name ?? 'Unknown',
      projectColor: project?.color ?? '#808080',
      sectionId,
      sectionName: sectionMap.get(sectionId) ?? '',
      parentId: strOrNull(t, 'parent_id', 'parentId'),
      order: num(t, 'child_order', 'childOrder', 'order'),
      commentCount: num(t, 'note_count', 'noteCount', 'comment_count', 'commentCount'),
    };
  });

  const enrichedProjects = rawProjects.map((p) => ({
    id: str(p, 'id'),
    name: str(p, 'name'),
    color: resolveColor(str(p, 'color')),
    order: num(p, 'child_order', 'childOrder', 'order'),
  }));

  const result = { tasks: enrichedTasks, projects: enrichedProjects };
  cache.set('todoist', result);
  return NextResponse.json(result);
}, 'Failed to fetch Todoist data');
