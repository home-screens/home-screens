import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, cachedProxyRoute, fetchWithTimeout, validateTodoistToken, requireSecret, parseJsonBody } from '@/lib/api-utils';
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

// Todoist returns Markdown in `content`/`description`. The kiosk has no input
// device, so links/formatting can't be interacted with — collapse to visible text.
// Input is capped at 4 KB: the link/image patterns are O(n²) on pathological
// bracket soup, and Todoist's real field limits sit well under this cap.
const STRIP_MARKDOWN_MAX = 4096;
function stripMarkdown(s: string): string {
  if (!s) return s;
  const input = s.length > STRIP_MARKDOWN_MAX ? s.slice(0, STRIP_MARKDOWN_MAX) : s;
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')             // ![alt](url) → alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')               // [text](url) → text
    .replace(/(\*\*|__)(.+?)\1/g, '$2')                    // **bold** / __bold__
    .replace(/~~(.+?)~~/g, '$1')                           // ~~strike~~
    .replace(/`([^`]+)`/g, '$1')                           // `code`
    .replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, '$1')       // *italic*
    .replace(/(?<![_\w])_([^_\n]+)_(?!\w)/g, '$1');        // _italic_ (skips snake_case)
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

// ─── Paginated fetch ───

const PAGE_LIMIT = 200; // Todoist's max page size — fewer round trips per full fetch
const MAX_PAGES = 20; // sanity ceiling so a misbehaving cursor can't loop forever

/**
 * Fetch a full (paginated) list endpoint, following `next_cursor` until
 * Todoist reports there's nothing left. Handles both a bare array response
 * and the `{ results: [...] }` / `{ items: [...] }` wrapper shapes, and
 * tolerates either snake_case or camelCase cursor field names.
 * Transient-failure retries come from fetchWithTimeout, per attempt.
 */
async function fetchTodoistList(endpoint: string, token: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const url = new URL(`${TODOIST_API}${endpoint}`);
    url.searchParams.set('limit', String(PAGE_LIMIT));
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Todoist API ${endpoint} returned ${res.status}: ${text}`);
    }
    const json = await res.json();

    if (Array.isArray(json)) {
      // Bare array response — no pagination wrapper, so nothing more to fetch.
      results.push(...(json as Record<string, unknown>[]));
      cursor = null;
    } else if (json && typeof json === 'object') {
      const page = json as Record<string, unknown>;
      if (Array.isArray(page.results)) {
        results.push(...(page.results as Record<string, unknown>[]));
      } else if (Array.isArray(page.items)) {
        results.push(...(page.items as Record<string, unknown>[]));
      }
      cursor = strOrNull(page, 'next_cursor', 'nextCursor');
    } else {
      cursor = null;
    }

    pageCount++;
  } while (cursor && pageCount < MAX_PAGES);

  if (cursor) {
    console.error(`Todoist ${endpoint} still had a next_cursor after ${MAX_PAGES} pages — returning a truncated list`);
  }

  return results;
}

// ─── PUT: Save token server-side ───

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ token?: unknown }>(request);
  if (body instanceof NextResponse) return body;
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

const { GET, cache } = cachedProxyRoute<unknown>({
  auth: 'display',
  ttlMs: 60 * 1000, // 1 minute
  execute: async () => {
    const token = await requireSecret('todoist_token', 'Todoist');
    if (token instanceof NextResponse) return token;

    // Tasks are the critical resource — if that fetch fails, the whole route
    // fails. Projects/sections/labels are enrichment only, so a failure
    // there (e.g. a transient 502 on /projects) shouldn't take down tasks
    // too — we fall back to empty maps instead.
    const [tasksResult, projectsResult, sectionsResult, labelsResult] = await Promise.allSettled([
      fetchTodoistList('/tasks', token),
      fetchTodoistList('/projects', token),
      fetchTodoistList('/sections', token),
      fetchTodoistList('/labels', token),
    ]);

    if (tasksResult.status === 'rejected') throw tasksResult.reason;
    const rawTasks = tasksResult.value;

    const rawProjects = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
    const rawSections = sectionsResult.status === 'fulfilled' ? sectionsResult.value : [];
    const rawLabels = labelsResult.status === 'fulfilled' ? labelsResult.value : [];

    if (projectsResult.status === 'rejected') {
      console.error('Failed to fetch Todoist projects (continuing without them):', projectsResult.reason);
    }
    if (sectionsResult.status === 'rejected') {
      console.error('Failed to fetch Todoist sections (continuing without them):', sectionsResult.reason);
    }
    if (labelsResult.status === 'rejected') {
      console.error('Failed to fetch Todoist labels (continuing without them):', labelsResult.reason);
    }

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
        content: stripMarkdown(str(t, 'content')),
        description: stripMarkdown(str(t, 'description')),
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

    return { tasks: enrichedTasks, projects: enrichedProjects };
  },
  errorMessage: 'Failed to fetch Todoist data',
});

/** @internal exported for test cleanup */
export { GET, cache };
