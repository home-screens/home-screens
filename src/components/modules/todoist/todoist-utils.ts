import type { TodoistConfig, TodoistGroupBy, TimeFormat } from '@/types/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import type { TranslateFn } from '@/i18n/types';
import { formatTimeInTZ, isoDateInTZ, parseDateInTZ } from '@/lib/timezone';
import { daysBetween, parseISODate } from '@/lib/todo-due-labels';
import { householdTimeFormat } from '@/lib/clock-time';

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  priority: number; // 1=normal(p4), 2=p3, 3=p2, 4=urgent(p1)
  /**
   * `date` is the due day, `YYYY-MM-DD`. `datetime` is set for a timed task:
   * `YYYY-MM-DDTHH:MM:SS` for a floating time (read on the household's wall
   * clock) or the same ending in `Z` for a time Todoist pinned to a zone. For a
   * pinned time `date` is the UTC day, so read the day through `dueDayKey`.
   */
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

type TodoistDue = NonNullable<TodoistTask['due']>;

/**
 * The real instant a timed task is due, or null for an all-day task. A
 * floating time is the household's own wall clock, so it is read in
 * `timezone`; a pinned time already names its instant.
 */
export function dueInstant(due: TodoistDue, timezone?: string): Date | null {
  if (!due.datetime) return null;
  const at = parseDateInTZ(due.datetime, timezone);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The household calendar day a task is due, `YYYY-MM-DD`. An all-day task's
 * day is its date as written; a timed task's day is wherever its instant falls
 * in `timezone`, so a 7 PM Chicago task stored as midnight UTC stays today.
 */
export function dueDayKey(due: TodoistDue, timezone?: string): string {
  const at = dueInstant(due, timezone);
  return at ? isoDateInTZ(at, timezone) : due.date;
}

/**
 * Whole household days from today to the task's due day: 0 today, -1
 * yesterday, 1 tomorrow. Null for no due date or one that cannot be read.
 * `now` is a real instant; today is its day in `timezone`, not the Pi's.
 */
export function dueDaysFromToday(due: TodoistTask['due'], now: Date, timezone?: string): number | null {
  if (!due) return null;
  return daysBetween(isoDateInTZ(now, timezone), dueDayKey(due, timezone));
}

export interface DueFormat {
  /** BCP-47 tag for weekday, month and time-of-day text. */
  locale?: string;
  /** Household 12/24 choice; absent falls back to the locale's own cycle. */
  timeFormat?: TimeFormat;
  /** Household zone: decides which day "today" is and the clock a time reads on. */
  timezone?: string;
}

/**
 * Format a Todoist task's due date for display. Returns translated text
 * via `t`.
 */
export function formatDueDate(
  due: TodoistTask['due'],
  now: Date,
  t: TranslateFn,
  { locale = DEFAULT_LOCALE, timeFormat, timezone }: DueFormat = {},
): { text: string; color: string } {
  if (!due) return { text: '', color: '' };

  const diff = dueDaysFromToday(due, now, timezone);
  if (diff === null) return { text: '', color: '' };

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
    const at = dueInstant(due, timezone);
    if (at) {
      const hour12 = householdTimeFormat(timeFormat, locale) === '12h';
      // Two-digit hours on a 24-hour clock ("09:05"), the HH:mm this label has always used.
      const timeText = formatTimeInTZ(at, { timezone, locale, hour12 }, hour12 ? undefined : { hour: '2-digit' });
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
  // A calendar day, not an instant: local midnight of the day key, formatted
  // with no zone, names the same day on any machine.
  const day = parseISODate(dueDayKey(due, timezone));
  if (!day) return { text: '', color: '' };
  if (diff <= 7) {
    return { text: day.toLocaleDateString(locale, { weekday: 'short' }), color: '#6b7280' };
  }
  return { text: day.toLocaleDateString(locale, { month: 'short', day: 'numeric' }), color: '#6b7280' };
}

/**
 * Bucket a task's due date into a stable, language-agnostic group key.
 * Callers map the key to a translated label via
 * `DATE_GROUP_LABEL_KEYS[key]`.
 */
export function getDueDateGroup(due: TodoistTask['due'], now: Date, timezone?: string): DateGroupKey {
  const diff = dueDaysFromToday(due, now, timezone);
  if (diff === null) return 'noDate';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'thisWeek';
  return 'upcoming';
}

export function filterTasks(
  tasks: TodoistTask[],
  config: TodoistConfig,
): TodoistTask[] {
  let filtered = tasks;

  if (!config.showSubtasks) {
    filtered = filtered.filter((t) => !t.parentId);
  }

  if (config.projectFilter) {
    const names = config.projectFilter.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (names.length > 0) {
      filtered = filtered.filter((t) => names.includes(t.projectName.toLowerCase()));
    }
  }

  if (config.labelFilter) {
    const names = config.labelFilter.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (names.length > 0) {
      filtered = filtered.filter((t) =>
        t.labels.some((l) => names.includes(l.toLowerCase())),
      );
    }
  }

  if (!config.showNoDueDate) {
    filtered = filtered.filter((t) => t.due !== null);
  }

  return filtered;
}

export function sortTasks(tasks: TodoistTask[], sortBy: string, timezone?: string): TodoistTask[] {
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
        // By household day, then an all-day task ahead of the timed ones,
        // then by time.
        const dayA = dueDayKey(a.due, timezone);
        const dayB = dueDayKey(b.due, timezone);
        if (dayA !== dayB) return dayA < dayB ? -1 : 1;
        const atA = dueInstant(a.due, timezone)?.getTime() ?? -Infinity;
        const atB = dueInstant(b.due, timezone)?.getTime() ?? -Infinity;
        return atA === atB ? 0 : atA < atB ? -1 : 1;
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
  timezone?: string,
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
        const dateKey = getDueDateGroup(task.due, now, timezone);
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

  function attachChildren(node: TaskNode) {
    node.children = childrenMap.get(node.task.id) ?? [];
    node.children.forEach(attachChildren);
  }
  roots.forEach(attachChildren);

  return roots;
}
