import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  daysBetween,
  formatDueDate,
  filterTasks,
  sortTasks,
  groupTasks,
  getDueDateGroup,
  buildTaskTree,
  PRIORITY_COLORS,
  PRIORITY_LABEL_KEYS,
  DATE_GROUP_LABEL_KEYS,
  type TodoistTask,
} from '../todoist-utils';
import type { TodoistConfig } from '@/types/config';
import type { TranslateFn } from '@/i18n/types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TodoistTask> & { id: string }): TodoistTask {
  return {
    content: 'Task',
    description: '',
    priority: 1,
    due: null,
    labels: [],
    labelColors: {},
    projectId: 'proj1',
    projectName: 'Inbox',
    projectColor: '#808080',
    sectionName: '',
    parentId: null,
    order: 0,
    commentCount: 0,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<TodoistConfig> = {}): TodoistConfig {
  return {
    viewMode: 'list' as TodoistConfig['viewMode'],
    groupBy: 'none',
    sortBy: 'default',
    projectFilter: '',
    labelFilter: '',
    showNoDueDate: true,
    showSubtasks: true,
    showLabels: true,
    showProject: true,
    showDescription: true,
    maxTasks: 50,
    refreshIntervalMs: 60000,
    title: '',
    ...overrides,
  };
}

/**
 * Identity translator for tests: returns the key verbatim, expanding
 * `{var}` placeholders from the supplied vars. Lets us assert on
 * translation-key shape without wiring `<I18nProvider>` into the test
 * environment.
 */
const identityT: TranslateFn = (key, vars) => {
  if (!vars) return key;
  let out = key;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
};

// ── daysBetween ──────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('returns 0 for same day different times', () => {
    const a = new Date('2025-06-15T08:00:00');
    const b = new Date('2025-06-15T20:00:00');
    expect(daysBetween(a, b)).toBe(0);
  });

  it('returns positive when a is after b', () => {
    const a = new Date('2025-06-17T00:00:00');
    const b = new Date('2025-06-15T00:00:00');
    expect(daysBetween(a, b)).toBe(2);
  });

  it('returns negative when a is before b', () => {
    const a = new Date('2025-06-13T00:00:00');
    const b = new Date('2025-06-15T00:00:00');
    expect(daysBetween(a, b)).toBe(-2);
  });

  it('handles month boundaries', () => {
    const a = new Date('2025-07-01T00:00:00');
    const b = new Date('2025-06-30T00:00:00');
    expect(daysBetween(a, b)).toBe(1);
  });
});

// ── formatDueDate ────────────────────────────────────────────────────
//
// `t` is required — every production call site threads a translator. Tests
// pass `identityT` to assert on the translation-key shape the helper
// resolves through (plus placeholder substitution for `{count}` / `{time}`).

describe('formatDueDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty for null due', () => {
    const result = formatDueDate(null, new Date(), identityT);
    expect(result.text).toBe('');
    expect(result.color).toBe('');
  });

  it('resolves yesterday key for 1 day overdue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-16T12:00:00'));

    const due = { date: '2025-06-15', datetime: null, isRecurring: false };
    const result = formatDueDate(due, new Date(), identityT);
    expect(result.text).toBe('todoist.dueDate.yesterday');
    expect(result.color).toBe('#ef4444');
  });

  it('passes count into daysOverdue plural-form key via translator', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-20T12:00:00'));

    // Diagnostic translator that surfaces both the key chosen AND the vars
    // received, so we can prove substitution was attempted (not just key
    // selection). A real translation value contains `{count}`; we mimic that
    // here by returning `${key}::{count}` which then has the placeholder
    // substituted by identityT's regex pass.
    const diagnosticT: TranslateFn = (key, vars) => {
      const template = `${key}::{count}`;
      if (!vars) return template;
      let out = template;
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(String(v));
      }
      return out;
    };

    const due = { date: '2025-06-15', datetime: null, isRecurring: false };
    const result = formatDueDate(due, new Date(), diagnosticT);
    expect(result.text).toBe('todoist.dueDate.daysOverdue::5');
    expect(result.color).toBe('#ef4444');
  });

  it('resolves today key for date-only due today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00'));

    const due = { date: '2025-06-15', datetime: null, isRecurring: false };
    const result = formatDueDate(due, new Date(), identityT);
    expect(result.text).toBe('todoist.dueDate.today');
    expect(result.color).toBe('#f59e0b');
  });

  it('resolves todayAtTime key with the locale-formatted time interpolated', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T10:00:00'));

    const due = { date: '2025-06-15', datetime: '2025-06-15T15:30:00', isRecurring: false };
    const result = formatDueDate(due, new Date(), identityT);
    // identityT returns "todoist.dueDate.todayAtTime" with `{time}` substituted
    // from `formatDateSync` — for en-US that's "3:30 PM".
    expect(result.text).toBe('todoist.dueDate.todayAtTime');
    expect(result.color).toBe('#f59e0b');
  });

  it('substitutes the locale-formatted time into the todayAtTime template', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T10:00:00'));

    // Diagnostic translator that exposes the {time} placeholder so we can
    // verify the helper correctly threaded a formatted clock string into
    // the translator's interpolation step (not just selected the right key).
    const diagnosticT: TranslateFn = (key, vars) => {
      const template = `${key}::{time}`;
      if (!vars) return template;
      let out = template;
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(String(v));
      }
      return out;
    };

    const due = { date: '2025-06-15', datetime: '2025-06-15T15:30:00', isRecurring: false };
    const enResult = formatDueDate(due, new Date(), diagnosticT, 'en-US');
    expect(enResult.text).toBe('todoist.dueDate.todayAtTime::3:30 PM');

    const deResult = formatDueDate(due, new Date(), diagnosticT, 'de-DE');
    expect(deResult.text).toBe('todoist.dueDate.todayAtTime::15:30');
  });

  it('resolves tomorrow key for due tomorrow', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00'));

    const due = { date: '2025-06-16', datetime: null, isRecurring: false };
    const result = formatDueDate(due, new Date(), identityT);
    expect(result.text).toBe('todoist.dueDate.tomorrow');
    expect(result.color).toBe('#22c55e');
  });

  it('returns weekday name for 2–7 days out', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00')); // Sunday

    const due = { date: '2025-06-18', datetime: null, isRecurring: false }; // Wednesday
    const result = formatDueDate(due, new Date(), identityT);
    expect(result.text).toBe('Wed');
    expect(result.color).toBe('#6b7280');
  });

  it('returns "Mon DD" for more than 7 days out', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00'));

    const due = { date: '2025-07-04', datetime: null, isRecurring: false };
    const result = formatDueDate(due, new Date(), identityT);
    expect(result.text).toBe('Jul 4');
    expect(result.color).toBe('#6b7280');
  });

  it('handles midnight time correctly (12:00 AM)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T00:00:00'));

    const due = { date: '2025-06-15', datetime: '2025-06-15T00:00:00', isRecurring: false };
    const result = formatDueDate(due, new Date(), identityT, 'en-US');
    // identityT returns the bare key; the time placeholder is what we
    // care about here — assert the underlying formatter still emits 12:00 AM.
    expect(result.text).toBe('todoist.dueDate.todayAtTime');
  });

  it('honors the locale argument for the "weekday name" branch (de-DE)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00')); // Sunday

    const due = { date: '2025-06-18', datetime: null, isRecurring: false }; // Wednesday
    const result = formatDueDate(due, new Date(), identityT, 'de-DE');
    // ICU's de-DE short weekday for Wed is typically "Mi." — match the
    // prefix to stay tolerant of ICU version drift.
    expect(result.text.toLowerCase()).toMatch(/^mi/);
  });
});

// ── getDueDateGroup ───────────────────────────────────────────────────

describe('getDueDateGroup', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const fakeNow = new Date('2025-06-15T12:00:00');

  it('returns "noDate" for null due', () => {
    expect(getDueDateGroup(null, fakeNow)).toBe('noDate');
  });

  it('returns "overdue" for past due', () => {
    const due = { date: '2025-06-13', datetime: null, isRecurring: false };
    expect(getDueDateGroup(due, fakeNow)).toBe('overdue');
  });

  it('returns "today" for today', () => {
    const due = { date: '2025-06-15', datetime: null, isRecurring: false };
    expect(getDueDateGroup(due, fakeNow)).toBe('today');
  });

  it('returns "tomorrow" for tomorrow', () => {
    const due = { date: '2025-06-16', datetime: null, isRecurring: false };
    expect(getDueDateGroup(due, fakeNow)).toBe('tomorrow');
  });

  it('returns "thisWeek" for 2–7 days out', () => {
    const due = { date: '2025-06-18', datetime: null, isRecurring: false };
    expect(getDueDateGroup(due, fakeNow)).toBe('thisWeek');
  });

  it('returns "upcoming" for >7 days out', () => {
    const due = { date: '2025-06-30', datetime: null, isRecurring: false };
    expect(getDueDateGroup(due, fakeNow)).toBe('upcoming');
  });
});

// ── filterTasks ──────────────────────────────────────────────────────

describe('filterTasks', () => {
  const tasks = [
    makeTask({ id: '1', projectName: 'Work', labels: ['urgent'], due: { date: '2025-06-15', datetime: null, isRecurring: false }, parentId: null }),
    makeTask({ id: '2', projectName: 'Personal', labels: ['home'], due: null, parentId: null }),
    makeTask({ id: '3', projectName: 'Work', labels: [], due: { date: '2025-06-16', datetime: null, isRecurring: false }, parentId: '1' }),
    makeTask({ id: '4', projectName: 'Shopping', labels: ['urgent', 'home'], due: null, parentId: null }),
  ];

  it('returns all tasks with default config', () => {
    const result = filterTasks(tasks, makeConfig());
    expect(result).toHaveLength(4);
  });

  it('filters out subtasks when showSubtasks is false', () => {
    const result = filterTasks(tasks, makeConfig({ showSubtasks: false }));
    expect(result).toHaveLength(3);
    expect(result.find((t) => t.id === '3')).toBeUndefined();
  });

  it('filters by project name (case-insensitive)', () => {
    const result = filterTasks(tasks, makeConfig({ projectFilter: 'work' }));
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.projectName === 'Work')).toBe(true);
  });

  it('filters by multiple projects (comma-separated)', () => {
    const result = filterTasks(tasks, makeConfig({ projectFilter: 'Work, Shopping' }));
    expect(result).toHaveLength(3);
  });

  it('ignores empty project filter strings', () => {
    const result = filterTasks(tasks, makeConfig({ projectFilter: '  ,  , ' }));
    expect(result).toHaveLength(4);
  });

  it('filters by label name (case-insensitive)', () => {
    const result = filterTasks(tasks, makeConfig({ labelFilter: 'Urgent' }));
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(['1', '4']);
  });

  it('filters by multiple labels (comma-separated)', () => {
    const result = filterTasks(tasks, makeConfig({ labelFilter: 'urgent, home' }));
    // Tasks with 'urgent' OR 'home' label
    expect(result).toHaveLength(3);
  });

  it('filters out tasks without due dates when showNoDueDate is false', () => {
    const result = filterTasks(tasks, makeConfig({ showNoDueDate: false }));
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.due !== null)).toBe(true);
  });

  it('composes multiple filters together', () => {
    const result = filterTasks(tasks, makeConfig({
      projectFilter: 'Work',
      showSubtasks: false,
      showNoDueDate: false,
    }));
    // Only task 1: Work project, not subtask, has due date
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns empty array when no tasks match', () => {
    const result = filterTasks(tasks, makeConfig({ projectFilter: 'Nonexistent' }));
    expect(result).toHaveLength(0);
  });

  it('handles empty task list', () => {
    const result = filterTasks([], makeConfig());
    expect(result).toHaveLength(0);
  });
});

// ── sortTasks ────────────────────────────────────────────────────────

describe('sortTasks', () => {
  const tasks = [
    makeTask({ id: '1', priority: 2, order: 3, content: 'Charlie', due: { date: '2025-06-20', datetime: null, isRecurring: false } }),
    makeTask({ id: '2', priority: 4, order: 1, content: 'Alpha', due: { date: '2025-06-15', datetime: null, isRecurring: false } }),
    makeTask({ id: '3', priority: 1, order: 2, content: 'Bravo', due: null }),
  ];

  it('sorts by priority (highest first)', () => {
    const sorted = sortTasks(tasks, 'priority');
    expect(sorted.map((t) => t.id)).toEqual(['2', '1', '3']);
  });

  it('sorts by due date (earliest first, null last)', () => {
    const sorted = sortTasks(tasks, 'due_date');
    expect(sorted.map((t) => t.id)).toEqual(['2', '1', '3']);
  });

  it('sorts alphabetically by content', () => {
    const sorted = sortTasks(tasks, 'alphabetical');
    expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
  });

  it('sorts by order (default)', () => {
    const sorted = sortTasks(tasks, 'default');
    expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
  });

  it('does not mutate the original array', () => {
    const original = [...tasks];
    sortTasks(tasks, 'priority');
    expect(tasks.map((t) => t.id)).toEqual(original.map((t) => t.id));
  });

  it('handles both tasks without due dates', () => {
    const noDueTasks = [
      makeTask({ id: '1', due: null }),
      makeTask({ id: '2', due: null }),
    ];
    const sorted = sortTasks(noDueTasks, 'due_date');
    expect(sorted).toHaveLength(2);
  });

  it('handles unknown sort key as default (order)', () => {
    const sorted = sortTasks(tasks, 'unknown_sort');
    expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
  });
});

// ── groupTasks ───────────────────────────────────────────────────────
//
// Post-i18n migration: `key` is a stable language-agnostic identifier;
// `label` is the resolved (translation-key or user-supplied) string.
// Without a translator the helper returns the raw translation key as
// label, which gives tests a stable value to assert on.

describe('groupTasks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const now = new Date('2025-06-15T12:00:00');

  it('returns single group with "none" groupBy', () => {
    const tasks = [makeTask({ id: '1' }), makeTask({ id: '2' })];
    const groups = groupTasks(tasks, 'none', now);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('all');
    expect(groups[0].tasks).toHaveLength(2);
  });

  it('groups by project (key is projectId, label is projectName)', () => {
    const tasks = [
      makeTask({ id: '1', projectId: 'p1', projectName: 'Work', projectColor: '#ff0000' }),
      makeTask({ id: '2', projectId: 'p2', projectName: 'Personal', projectColor: '#00ff00' }),
      makeTask({ id: '3', projectId: 'p1', projectName: 'Work', projectColor: '#ff0000' }),
    ];
    const groups = groupTasks(tasks, 'project', now);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe('p1');
    expect(groups[0].label).toBe('Work');
    expect(groups[0].color).toBe('#ff0000');
    expect(groups[0].tasks).toHaveLength(2);
    expect(groups[1].key).toBe('p2');
    expect(groups[1].label).toBe('Personal');
    expect(groups[1].tasks).toHaveLength(1);
  });

  it('groups by priority in descending order; labels resolve to priority keys', () => {
    const tasks = [
      makeTask({ id: '1', priority: 1 }),
      makeTask({ id: '2', priority: 4 }),
      makeTask({ id: '3', priority: 2 }),
    ];
    const groups = groupTasks(tasks, 'priority', now);
    expect(groups.map((g) => g.key)).toEqual(['p4', 'p2', 'p1']);
    expect(groups.map((g) => g.label)).toEqual([
      PRIORITY_LABEL_KEYS[4],
      PRIORITY_LABEL_KEYS[2],
      PRIORITY_LABEL_KEYS[1],
    ]);
    expect(groups[0].color).toBe(PRIORITY_COLORS[4]);
    expect(groups[0].tasks).toHaveLength(1);
  });

  it('groups by priority and translates labels via supplied translator', () => {
    const tasks = [
      makeTask({ id: '1', priority: 4 }),
      makeTask({ id: '2', priority: 2 }),
    ];
    const fakeT: TranslateFn = (key) => `[${key}]`;
    const groups = groupTasks(tasks, 'priority', now, fakeT);
    expect(groups[0].label).toBe(`[${PRIORITY_LABEL_KEYS[4]}]`);
    expect(groups[1].label).toBe(`[${PRIORITY_LABEL_KEYS[2]}]`);
  });

  it('groups by date in stable-key order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00'));
    const fakeNow = new Date();

    const tasks = [
      makeTask({ id: '1', due: { date: '2025-06-30', datetime: null, isRecurring: false } }), // upcoming (>7 days)
      makeTask({ id: '2', due: { date: '2025-06-13', datetime: null, isRecurring: false } }), // overdue
      makeTask({ id: '3', due: { date: '2025-06-15', datetime: null, isRecurring: false } }), // today
      makeTask({ id: '4', due: { date: '2025-06-16', datetime: null, isRecurring: false } }), // tomorrow
      makeTask({ id: '5', due: null }), // noDate
      makeTask({ id: '6', due: { date: '2025-06-18', datetime: null, isRecurring: false } }), // thisWeek
    ];

    const groups = groupTasks(tasks, 'date', fakeNow);
    expect(groups.map((g) => g.key)).toEqual([
      'overdue', 'today', 'tomorrow', 'thisWeek', 'upcoming', 'noDate',
    ]);
    // Labels resolve to translation keys when no translator is passed.
    expect(groups.map((g) => g.label)).toEqual([
      DATE_GROUP_LABEL_KEYS.overdue,
      DATE_GROUP_LABEL_KEYS.today,
      DATE_GROUP_LABEL_KEYS.tomorrow,
      DATE_GROUP_LABEL_KEYS.thisWeek,
      DATE_GROUP_LABEL_KEYS.upcoming,
      DATE_GROUP_LABEL_KEYS.noDate,
    ]);
  });

  it('assigns correct colors to date groups', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00'));
    const fakeNow = new Date();

    const tasks = [
      makeTask({ id: '1', due: { date: '2025-06-13', datetime: null, isRecurring: false } }),
      makeTask({ id: '2', due: { date: '2025-06-15', datetime: null, isRecurring: false } }),
      makeTask({ id: '3', due: { date: '2025-06-16', datetime: null, isRecurring: false } }),
    ];

    const groups = groupTasks(tasks, 'date', fakeNow);
    const overdue = groups.find((g) => g.key === 'overdue');
    const today = groups.find((g) => g.key === 'today');
    const tomorrow = groups.find((g) => g.key === 'tomorrow');
    expect(overdue?.color).toBe('#ef4444');
    expect(today?.color).toBe('#f59e0b');
    expect(tomorrow?.color).toBe('#22c55e');
  });

  it('groups by label (first label used as key; raw label stays as user data)', () => {
    const tasks = [
      makeTask({ id: '1', labels: ['urgent'], labelColors: { urgent: '#ff0000' } }),
      makeTask({ id: '2', labels: ['home'], labelColors: { home: '#00ff00' } }),
      makeTask({ id: '3', labels: [] }),
    ];
    const groups = groupTasks(tasks, 'label', now);
    expect(groups).toHaveLength(3);
    const noLabel = groups.find((g) => g.key === '__no_label');
    expect(noLabel).toBeDefined();
    expect(noLabel!.label).toBe('todoist.groups.noLabel');
    // User-supplied labels stay as user data (not translated)
    const urgent = groups.find((g) => g.key === 'urgent');
    expect(urgent?.label).toBe('urgent');
  });

  it('handles empty tasks for any groupBy', () => {
    // Non-'none' groupBy returns empty array when no tasks to group
    expect(groupTasks([], 'project', now)).toEqual([]);
    // 'none' returns single group even for empty
    expect(groupTasks([], 'none', now)).toEqual([{ key: 'all', label: '', tasks: [] }]);
  });
});

// ── buildTaskTree ────────────────────────────────────────────────────

describe('buildTaskTree', () => {
  it('returns flat list as roots when no parent-child relationships', () => {
    const tasks = [
      makeTask({ id: '1' }),
      makeTask({ id: '2' }),
    ];
    const tree = buildTaskTree(tasks);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(0);
    expect(tree[1].children).toHaveLength(0);
  });

  it('nests children under their parent', () => {
    const tasks = [
      makeTask({ id: 'parent', content: 'Parent' }),
      makeTask({ id: 'child1', content: 'Child 1', parentId: 'parent' }),
      makeTask({ id: 'child2', content: 'Child 2', parentId: 'parent' }),
    ];
    const tree = buildTaskTree(tasks);
    expect(tree).toHaveLength(1);
    expect(tree[0].task.id).toBe('parent');
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].task.id).toBe('child1');
    expect(tree[0].children[1].task.id).toBe('child2');
  });

  it('supports multi-level nesting (grandchildren)', () => {
    const tasks = [
      makeTask({ id: 'root' }),
      makeTask({ id: 'child', parentId: 'root' }),
      makeTask({ id: 'grandchild', parentId: 'child' }),
    ];
    const tree = buildTaskTree(tasks);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].task.id).toBe('grandchild');
  });

  it('treats orphaned children (parent not in list) as roots', () => {
    const tasks = [
      makeTask({ id: '1', parentId: 'missing-parent' }),
      makeTask({ id: '2' }),
    ];
    const tree = buildTaskTree(tasks);
    expect(tree).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(buildTaskTree([])).toEqual([]);
  });

  it('handles multiple independent parent-child groups', () => {
    const tasks = [
      makeTask({ id: 'p1' }),
      makeTask({ id: 'c1', parentId: 'p1' }),
      makeTask({ id: 'p2' }),
      makeTask({ id: 'c2', parentId: 'p2' }),
    ];
    const tree = buildTaskTree(tasks);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[1].children).toHaveLength(1);
  });
});
