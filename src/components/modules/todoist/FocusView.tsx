'use client';

import { useMemo } from 'react';
import type { TodoistConfig } from '@/types/config';
import type { TodoistTask } from './todoist-utils';
import { daysBetween, buildTaskTree } from './todoist-utils';
import { TaskRow } from './ListView';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';

export default function FocusView({
  allTasks,
  config,
  now,
  onComplete,
}: {
  allTasks: TodoistTask[];
  config: TodoistConfig;
  now: Date;
  onComplete?: (taskId: string) => void;
}) {
  const tr = useTranslate('modules');
  const focusTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (!t.due) return false;
      const dueDate = new Date(t.due.datetime ?? t.due.date + 'T23:59:59');
      const diff = daysBetween(dueDate, now);
      return diff <= 0; // today or overdue
    });
  }, [allTasks, now]);

  const overdue = focusTasks.filter((t) => {
    const dueDate = new Date(t.due!.datetime ?? t.due!.date + 'T23:59:59');
    return daysBetween(dueDate, now) < 0;
  });
  const today = focusTasks.filter((t) => {
    const dueDate = new Date(t.due!.datetime ?? t.due!.date + 'T23:59:59');
    return daysBetween(dueDate, now) === 0;
  });

  const totalToday = today.length + overdue.length;

  // Todoist's API only returns active tasks, so completed-today can't be counted — show remaining count instead.
  const tree = buildTaskTree(focusTasks);

  return (
    <div className="flex flex-col h-full">
      {/* Remaining tasks header */}
      <div className="flex items-center justify-center py-3">
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
        <div className="flex flex-col gap-3 overflow-hidden flex-1">
          {/* Overdue section */}
          {overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="font-semibold uppercase tracking-wider"
                  style={{ fontSize: '0.65em', color: '#ef4444' }}
                >
                  {tr('todoist.groups.overdue')}
                </span>
                <span style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>
                  {overdue.length}
                </span>
                <div
                  className="flex-1 h-px"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                {tree
                  .filter((n) => overdue.some((t) => t.id === n.task.id))
                  .map((node) => (
                    <TaskRow
                      key={node.task.id}
                      task={node}
                      config={config}
                      now={now}
                      onComplete={onComplete}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Today section */}
          {today.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="font-semibold uppercase tracking-wider"
                  style={{ fontSize: '0.65em', color: '#f59e0b' }}
                >
                  {tr('todoist.groups.today')}
                </span>
                <span style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>
                  {today.length}
                </span>
                <div
                  className="flex-1 h-px"
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                {tree
                  .filter((n) => today.some((t) => t.id === n.task.id))
                  .map((node) => (
                    <TaskRow
                      key={node.task.id}
                      task={node}
                      config={config}
                      now={now}
                      onComplete={onComplete}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
