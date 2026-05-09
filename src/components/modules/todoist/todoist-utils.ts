import type { TodoistConfig, TodoistGroupBy } from '@/types/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';

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
}

export interface TaskGroup {
  key: string;
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

const PRIORITY_LABELS: Record<number, string> = {
  4: 'Urgent',
  3: 'High',
  2: 'Medium',
  1: 'Normal',
};

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
 * Format a Todoist task's due date for display. The literal "Yesterday" /
 * "Today" / "Tomorrow" / AM/PM strings stay English here — Tasks 4–5
 * extract them into the `modules.todoist` namespace. `locale` only
 * affects the weekday-name and month-short branches, which are
 * locale-aware via `toLocaleDateString`.
 *
 * Defaults `locale` to `DEFAULT_LOCALE` so out-of-scope callers (the
 * Todoist module views, which Tasks 4–5 will migrate) keep working.
 */
export function formatDueDate(
  due: TodoistTask['due'],
  now: Date,
  locale: string = DEFAULT_LOCALE,
): { text: string; color: string } {
  if (!due) return { text: '', color: '' };

  const dueDate = new Date(due.datetime ?? due.date + 'T23:59:59');
  const diff = daysBetween(dueDate, now);

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    return {
      text: absDiff === 1 ? 'Yesterday' : `${absDiff}d overdue`,
      color: '#ef4444',
    };
  }
  if (diff === 0) {
    if (due.datetime) {
      const h = dueDate.getHours();
      const m = dueDate.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return {
        text: `Today ${h12}:${m.toString().padStart(2, '0')} ${ampm}`,
        color: '#f59e0b',
      };
    }
    return { text: 'Today', color: '#f59e0b' };
  }
  if (diff === 1) return { text: 'Tomorrow', color: '#22c55e' };
  if (diff <= 7) {
    const dayName = dueDate.toLocaleDateString(locale, { weekday: 'short' });
    return { text: dayName, color: '#6b7280' };
  }
  const formatted = dueDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return { text: formatted, color: '#6b7280' };
}

function getDueDateGroup(due: TodoistTask['due'], now: Date): string {
  if (!due) return 'No Date';
  const dueDate = new Date(due.datetime ?? due.date + 'T23:59:59');
  const diff = daysBetween(dueDate, now);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return 'This Week';
  return 'Upcoming';
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

export function groupTasks(
  tasks: TodoistTask[],
  groupBy: TodoistGroupBy,
  now: Date,
): TaskGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '', tasks }];
  }

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
        label = PRIORITY_LABELS[task.priority] ?? 'Normal';
        color = PRIORITY_COLORS[task.priority];
        break;
      case 'date':
        label = getDueDateGroup(task.due, now);
        key = label;
        if (label === 'Overdue') color = '#ef4444';
        else if (label === 'Today') color = '#f59e0b';
        else if (label === 'Tomorrow') color = '#22c55e';
        break;
      case 'label':
        if (task.labels.length === 0) {
          key = '__no_label';
          label = 'No Label';
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
    const dateOrder = ['Overdue', 'Today', 'Tomorrow', 'This Week', 'Upcoming', 'No Date'];
    order.sort((a, b) => dateOrder.indexOf(a) - dateOrder.indexOf(b));
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
