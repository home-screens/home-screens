import type { TodoistConfig, TodoistGroupBy } from '@/types/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { formatDateSync } from '@/i18n/formatters';
import type { TranslateFn } from '@/i18n/types';

// ─── Types ───

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  priority: number; // 1=normal(p4), 2=p3, 3=p2, 4=urgent(p1)
  due: {
    date: string;
    datetime: string | null;
    isRecurring: boolean;
  } | null;
  labels: string[];
  labelColors: Record<string, string>;
  projectId: string;
  projectName: string;
  projectColor: string;
  sectionName: string;
  parentId: string | null;
  order: number;
  commentCount: number;
}

export interface TodoistData {
  tasks: TodoistTask[];
  projects: { id: string; name: string; color: string; order: number }[];
  /**
   * Set when the task fetch hit the route's page ceiling (20 × 200 = 4000
   * items), so `tasks` is a partial list. Consumers must not present a count
   * derived from it as authoritative.
   */
  truncated?: boolean;
}

/**
 * Stable, language-agnostic identifiers for date-based grouping.
 * Consumers compare on `TaskGroup['key']` rather than `label` so locale
 * switches don't break highlight logic.
 */
export type DateGroupKey =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'thisWeek'
  | 'upcoming'
  | 'noDate';

export interface TaskGroup {
  /**
   * Stable identifier — language-agnostic. For date groups one of
   * `DateGroupKey`. For priority groups `'p1'..'p4'`. For project groups
   * the `projectId`. For label groups the raw label string (user data,
   * not translatable) or `'__no_label'`. For `'none'` groupBy: `'all'`.
   */
  key: string;
  /** Resolved, translated, or user-provided display label. */
  label: string;
  color?: string;
  tasks: TodoistTask[];
}

export interface TaskNode {
  task: TodoistTask;
  children: TaskNode[];
}

// ─── Constants ───

export const PRIORITY_COLORS: Record<number, string> = {
  4: '#d1453b', // P1 urgent
  3: '#eb8909', // P2 high
  2: '#246fe0', // P3 medium
  1: 'transparent', // P4 normal
};

/**
 * Translation-key map for priority labels. Consumers call
 * `t(PRIORITY_LABEL_KEYS[priority])` against the `modules` namespace.
 * Mirrors the `getMealSlotLabelKey` precedent in `meal-constants.ts`.
 */
export const PRIORITY_LABEL_KEYS: Record<number, string> = {
  4: 'todoist.priority.urgent',
  3: 'todoist.priority.high',
  2: 'todoist.priority.medium',
  1: 'todoist.priority.normal',
};

/** Translation-key map for date-group labels. */
export const DATE_GROUP_LABEL_KEYS: Record<DateGroupKey, string> = {
  overdue: 'todoist.groups.overdue',
  today: 'todoist.groups.today',
  tomorrow: 'todoist.groups.tomorrow',
  thisWeek: 'todoist.groups.thisWeek',
  upcoming: 'todoist.groups.upcoming',
  noDate: 'todoist.groups.noDate',
};

const DATE_GROUP_COLORS: Partial<Record<DateGroupKey, string>> = {
  overdue: '#ef4444',
  today: '#f59e0b',
  tomorrow: '#22c55e',
};

const DATE_GROUP_ORDER: DateGroupKey[] = [
  'overdue',
  'today',
  'tomorrow',
  'thisWeek',
  'upcoming',
  'noDate',
];

// ─── Date Helpers ───

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

/**
 * Pick a clock-time format string based on the locale's resolved hour
 * cycle. `Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions()
 * .hourCycle` returns `'h11' | 'h12' | 'h23' | 'h24'` — the first two are
 * 12-hour, the latter two 24-hour. This correctly classifies en-GB and
 * fr-CA as 24h (which `locale.startsWith('en')` misses).
 */
function pickTimeFormat(locale: string): string {
  const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
  return cycle === 'h11' || cycle === 'h12' ? 'h:mm a' : 'HH:mm';
}

/**
 * Format a Todoist task's due date for display. Returns translated text
 * via `t`. `locale` controls weekday-name, month-short, and time-of-day
 * rendering.
 */
export function formatDueDate(
  due: TodoistTask['due'],
  now: Date,
  t: TranslateFn,
  locale: string = DEFAULT_LOCALE,
): { text: string; color: string } {
  if (!due) return { text: '', color: '' };

  const dueDate = new Date(due.datetime ?? due.date + 'T23:59:59');
  const diff = daysBetween(dueDate, now);

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff === 1) {
      return { text: t('todoist.dueDate.yesterday'), color: '#ef4444' };
    }
    return {
      text: t('todoist.dueDate.daysOverdue', { count: absDiff }),
      color: '#ef4444',
    };
  }
  if (diff === 0) {
    if (due.datetime) {
      const timeText = formatDateSync(dueDate, pickTimeFormat(locale), { locale });
      return {
        text: t('todoist.dueDate.todayAtTime', { time: timeText }),
        color: '#f59e0b',
      };
    }
    return { text: t('todoist.dueDate.today'), color: '#f59e0b' };
  }
  if (diff === 1) {
    return { text: t('todoist.dueDate.tomorrow'), color: '#22c55e' };
  }
  if (diff <= 7) {
    const dayName = dueDate.toLocaleDateString(locale, { weekday: 'short' });
    return { text: dayName, color: '#6b7280' };
  }
  const formatted = dueDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return { text: formatted, color: '#6b7280' };
}

/**
 * Bucket a task's due date into a stable, language-agnostic group key.
 * Callers map the key to a translated label via
 * `DATE_GROUP_LABEL_KEYS[key]`.
 */
export function getDueDateGroup(due: TodoistTask['due'], now: Date): DateGroupKey {
  if (!due) return 'noDate';
  const dueDate = new Date(due.datetime ?? due.date + 'T23:59:59');
  const diff = daysBetween(dueDate, now);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'thisWeek';
  return 'upcoming';
}

// ─── Sorting & Filtering ───

export function filterTasks(
  tasks: TodoistTask[],
  config: TodoistConfig,
): TodoistTask[] {
  let filtered = tasks;

  // Filter out subtasks if hidden
  if (!config.showSubtasks) {
    filtered = filtered.filter((t) => !t.parentId);
  }

  // Filter by project
  if (config.projectFilter) {
    const names = config.projectFilter.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (names.length > 0) {
      filtered = filtered.filter((t) => names.includes(t.projectName.toLowerCase()));
    }
  }

  // Filter by label
  if (config.labelFilter) {
    const names = config.labelFilter.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (names.length > 0) {
      filtered = filtered.filter((t) =>
        t.labels.some((l) => names.includes(l.toLowerCase())),
      );
    }
  }

  // Filter tasks without due dates
  if (!config.showNoDueDate) {
    filtered = filtered.filter((t) => t.due !== null);
  }

  return filtered;
}

export function sortTasks(tasks: TodoistTask[], sortBy: string): TodoistTask[] {
  const sorted = [...tasks];
  switch (sortBy) {
    case 'priority':
      sorted.sort((a, b) => b.priority - a.priority);
      break;
    case 'due_date':
      sorted.sort((a, b) => {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return new Date(a.due.datetime ?? a.due.date).getTime() -
          new Date(b.due.datetime ?? b.due.date).getTime();
      });
      break;
    case 'alphabetical':
      sorted.sort((a, b) => a.content.localeCompare(b.content));
      break;
    default:
      sorted.sort((a, b) => a.order - b.order);
  }
  return sorted;
}

/**
 * Group tasks for list/board views. `key` on each returned group is a
 * STABLE language-agnostic identifier; `label` is the resolved
 * translated string (or user data for project/label grouping). The
 * optional `t` arg defaults to identity so unit tests and any residual
 * untranslated callers see translation keys verbatim — that lets tests
 * assert on key shape without wiring a fake translator.
 */
export function groupTasks(
  tasks: TodoistTask[],
  groupBy: TodoistGroupBy,
  now: Date,
  t?: TranslateFn,
): TaskGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '', tasks }];
  }

  const tr: TranslateFn = t ?? ((key) => key);

  const map = new Map<string, TaskGroup>();
  const order: string[] = [];

  for (const task of tasks) {
    let key: string;
    let label: string;
    let color: string | undefined;

    switch (groupBy) {
      case 'project':
        key = task.projectId;
        label = task.projectName;
        color = task.projectColor;
        break;
      case 'priority':
        key = `p${task.priority}`;
        label = tr(PRIORITY_LABEL_KEYS[task.priority] ?? PRIORITY_LABEL_KEYS[1]);
        color = PRIORITY_COLORS[task.priority];
        break;
      case 'date': {
        const dateKey = getDueDateGroup(task.due, now);
        key = dateKey;
        label = tr(DATE_GROUP_LABEL_KEYS[dateKey]);
        color = DATE_GROUP_COLORS[dateKey];
        break;
      }
      case 'label':
        if (task.labels.length === 0) {
          key = '__no_label';
          label = tr('todoist.groups.noLabel');
        } else {
          key = task.labels[0];
          label = task.labels[0];
          color = task.labelColors[task.labels[0]];
        }
        break;
      default:
        key = 'all';
        label = '';
    }

    if (!map.has(key)) {
      map.set(key, { key, label, color, tasks: [] });
      order.push(key);
    }
    map.get(key)!.tasks.push(task);
  }

  // Sort groups for date grouping in logical order
  if (groupBy === 'date') {
    order.sort(
      (a, b) =>
        DATE_GROUP_ORDER.indexOf(a as DateGroupKey) -
        DATE_GROUP_ORDER.indexOf(b as DateGroupKey),
    );
  }
  if (groupBy === 'priority') {
    order.sort((a, b) => {
      const pa = Number(a.replace('p', ''));
      const pb = Number(b.replace('p', ''));
      return pb - pa;
    });
  }

  return order.map((k) => map.get(k)!);
}

// ─── Subtask Tree ───

export function buildTaskTree(tasks: TodoistTask[]): TaskNode[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const roots: TaskNode[] = [];
  const childrenMap = new Map<string, TaskNode[]>();

  for (const task of tasks) {
    const node: TaskNode = { task, children: [] };
    if (task.parentId && taskMap.has(task.parentId)) {
      if (!childrenMap.has(task.parentId)) childrenMap.set(task.parentId, []);
      childrenMap.get(task.parentId)!.push(node);
    } else {
      roots.push(node);
    }
  }

  // Attach children
  function attachChildren(node: TaskNode) {
    node.children = childrenMap.get(node.task.id) ?? [];
    node.children.forEach(attachChildren);
  }
  roots.forEach(attachChildren);

  return roots;
}
