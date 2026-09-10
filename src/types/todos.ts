/**
 * Shared to-do lists, stored in `data/todos.json` (see `lib/todo-data.ts`).
 *
 * Lists are family data the way chores and meals are: the phone remote, the
 * wall and the editor all read and write this one store. A To-Do module
 * points at a list by id (`TodoConfig.listId`) and never carries items of its
 * own, so the same list can sit on two displays and a check-off from a phone
 * never touches `config.json`.
 */

export type TodoRepeat = 'never' | 'daily' | 'weekly';

export interface TodoListItem {
  id: string;
  text: string;
  completed: boolean;
  /** ISO timestamp of the most recent check-off; cleared when unchecked. */
  completedAt?: string;
  createdAt: string;
  /** YYYY-MM-DD, local calendar date. */
  dueDate?: string;
  /** Family member ids (see `types/family.ts`). Unknown ids are ignored at render. */
  assigneeIds?: string[];
}

export interface TodoList {
  id: string;
  name: string;
  /**
   * Stable key segment derived from the name at creation (`groceries`,
   * `before_school`). Never renamed, so anything keyed on it (shared-state
   * facts, templates) survives a rename.
   */
  slug: string;
  /** Swatch used by the phone chips and the board view's column headers. */
  color?: string;
  /** Array order is the display order everywhere. */
  items: TodoListItem[];
  /** Uncheck everything on a schedule. `never` for groceries, `daily` for a before-school list. */
  repeat: TodoRepeat;
  /** 0 = Sunday. Read only when `repeat` is `weekly`. */
  repeatDay?: number;
  /**
   * The IANA zone whose midnight the repeat means, captured from the device
   * that set it (the phone or laptop standing in the household). The hub's
   * own clock is UTC on the shipped image, so without this a "daily" list
   * would start fresh in the early evening. Falls back to
   * `GlobalSettings.timezone`, then the hub clock.
   */
  repeatTimezone?: string;
  /** ISO timestamp of the last scheduled uncheck. */
  lastResetAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodoData {
  lists: TodoList[];
  /** Set once the pre-v2 inline module items have been folded into lists. */
  migratedFromConfig?: boolean;
}

/** Limits enforced by the store; the phone and editor surfaces mirror them. */
export const TODO_LIMITS = {
  maxLists: 64,
  maxItemsPerList: 500,
  maxItemTextLength: 200,
  maxListNameLength: 60,
} as const;
