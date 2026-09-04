'use client';

import { useMemo } from 'react';
import type { TodoistConfig, TodoistGroupBy, TimeFormat } from '@/types/config';
import type { TodoistTask } from './todoist-utils';
import {
  PRIORITY_COLORS,
  daysBetween,
  formatDueDate,
  groupTasks,
} from './todoist-utils';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate, useFormattingLocale } from '@/i18n';

export default function BoardView({
  tasks,
  config,
  now,
  onComplete,
  timeFormat,
}: {
  tasks: TodoistTask[];
  config: TodoistConfig;
  now: Date;
  onComplete?: (taskId: string) => void;
  /** Household 12/24 choice; absent falls back to the locale's own cycle. */
  timeFormat?: TimeFormat;
}) {
  const tr = useTranslate('modules');
  const locale = useFormattingLocale();
  const groupBy = config.groupBy === 'none' ? 'project' : config.groupBy;
  const allGroups = useMemo(
    () => groupTasks(tasks, groupBy as TodoistGroupBy, now, tr),
    [tasks, groupBy, now, tr],
  );
  // Cap at 3 columns to avoid broken multi-row layouts in a fixed-height module
  const groups = allGroups.slice(0, 3);

  return (
    <div
      className="grid gap-2 h-full overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${groups.length}, 1fr)`,
      }}
    >
      {groups.map((group) => (
        <div
          key={group.key}
          className="flex flex-col rounded-lg overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
        >
          {/* Column header */}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/[0.06]">
            {group.color && group.color !== 'transparent' && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span
              className="font-semibold truncate"
              style={{ fontSize: '0.75em' }}
            >
              {group.label}
            </span>
            <span
              className="shrink-0"
              style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}
            >
              {group.tasks.length}
            </span>
          </div>

          {/* Task cards */}
          <div className="flex flex-col gap-1 p-1.5 overflow-hidden flex-1">
            {group.tasks.map((t) => {
              const dueInfo = formatDueDate(t.due, now, tr, locale, timeFormat);
              const isOverdue = t.due
                ? daysBetween(
                    new Date(t.due.datetime ?? t.due.date + 'T23:59:59'),
                    now,
                  ) < 0
                : false;
              const priorityColor = PRIORITY_COLORS[t.priority];
              const visiblePriorityColor = priorityColor === 'transparent' ? 'rgba(255,255,255,0.4)' : priorityColor;
              return (
                <div
                  key={t.id}
                  className="flex items-start gap-1.5 rounded-md px-2 py-1.5"
                  style={{
                    backgroundColor: isOverdue
                      ? 'rgba(239, 68, 68, 0.08)'
                      : 'rgba(255,255,255,0.05)',
                  }}
                >
                  {onComplete ? (
                    <button
                      type="button"
                      onClick={() => onComplete(t.id)}
                      className="rounded-full shrink-0 transition-colors hover:bg-white/10 active:bg-white/20"
                      style={{
                        width: 18,
                        height: 18,
                        borderWidth: 2,
                        borderStyle: 'solid',
                        borderColor: visiblePriorityColor,
                        backgroundColor: 'transparent',
                      }}
                      aria-label={tr('todoist.completeAriaLabel', { content: t.content })}
                    />
                  ) : (
                    <div
                      className="w-[3px] self-stretch rounded-full shrink-0"
                      style={{
                        backgroundColor: priorityColor,
                        minHeight: 14,
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="leading-tight font-medium truncate"
                      style={{ fontSize: '0.75em' }}
                    >
                      {t.content}
                    </p>
                    {dueInfo.text && (
                      <span
                        className="mt-0.5 block"
                        style={{
                          fontSize: '0.6em',
                          color: dueInfo.color,
                          opacity: TEXT_OPACITY.secondary,
                        }}
                      >
                        {dueInfo.text}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
