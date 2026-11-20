'use client';

import { useMemo } from 'react';
import type { TodoistConfig } from '@/types/config';
import type { TodoistTask } from './todoist-utils';
import { dueDaysFromToday } from './todoist-utils';
import { TaskSections, taskRows, type TaskSection, type TodoistWallProps } from './ListView';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';

function SectionHeader({ label, count, color, rule }: { label: string; count: number; color: string; rule: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="font-semibold uppercase tracking-wider" style={{ fontSize: '0.65em', color }}>
        {label}
      </span>
      <span style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>
        {count}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: rule }} />
    </div>
  );
}

/**
 * What is due: the overdue tasks, then today's, each in the order the
 * module's "Sort by" gives (the caller hands them over sorted).
 */
export default function FocusView({
  allTasks,
  config,
  now,
  fontPx,
  scroll,
  ...wall
}: {
  allTasks: TodoistTask[];
  config: TodoistConfig;
  now: Date;
  fontPx: number;
  scroll: boolean;
} & TodoistWallProps) {
  const tr = useTranslate('modules');
  const { timezone } = wall;
  const { overdue, today, sections } = useMemo(() => {
    const overdue: TodoistTask[] = [];
    const today: TodoistTask[] = [];
    const focusTasks: TodoistTask[] = [];
    for (const t of allTasks) {
      const diff = dueDaysFromToday(t.due, now, timezone);
      if (diff === null || diff > 0) continue;
      (diff < 0 ? overdue : today).push(t);
      focusTasks.push(t);
    }
    // One tree over both, so a subtask sits under its parent whichever day
    // it is due; each section then takes the top-level tasks that are its own.
    const rows = taskRows(focusTasks, config);
    const rowsUnder = (own: TodoistTask[]) => {
      const ids = new Set(own.map((t) => t.id));
      let mine = false;
      return rows.filter((row) => {
        if (row.depth === 0) mine = ids.has(row.task.id);
        return mine;
      });
    };
    const sections: TaskSection[] = [];
    if (overdue.length > 0) {
      sections.push({
        key: 'overdue',
        rows: rowsUnder(overdue),
        header: <SectionHeader label={tr('todoist.groups.overdue')} count={overdue.length} color="#ef4444" rule="rgba(239, 68, 68, 0.2)" />,
      });
    }
    if (today.length > 0) {
      sections.push({
        key: 'today',
        rows: rowsUnder(today),
        header: <SectionHeader label={tr('todoist.groups.today')} count={today.length} color="#f59e0b" rule="rgba(245, 158, 11, 0.2)" />,
      });
    }
    return { overdue, today, sections };
  }, [allTasks, config, now, timezone, tr]);

  const totalToday = today.length + overdue.length;

  // Todoist's API only returns active tasks, so completed-today can't be counted — show remaining count instead.
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Remaining tasks header */}
      <div className="flex items-center justify-center py-3 shrink-0">
        <div className="text-center">
          <span className="font-bold block" style={{ fontSize: '2em', opacity: totalToday === 0 ? 0.3 : 0.9 }}>
            {totalToday}
          </span>
          <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.secondary }}>
            {totalToday === 0
              ? tr('todoist.focus.allClear')
              : tr('todoist.focus.taskRemaining', { count: totalToday })}
          </span>
        </div>
      </div>

      {totalToday === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="block" style={{ fontSize: '2em', opacity: TEXT_OPACITY.tertiary }}>
              ✓
            </span>
            <p className="mt-1" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.tertiary }}>
              {tr('todoist.focus.allCaughtUp')}
            </p>
          </div>
        </div>
      ) : (
        <TaskSections sections={sections} config={config} now={now} fontPx={fontPx} scroll={scroll} {...wall} />
      )}
    </div>
  );
}
