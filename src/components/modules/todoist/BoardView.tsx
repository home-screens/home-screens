'use client';

import { useMemo } from 'react';
import type { TodoistConfig, TodoistGroupBy } from '@/types/config';
import type { TodoistTask } from './todoist-utils';
import {
  PRIORITY_COLORS,
  dueDaysFromToday,
  formatDueDate,
  groupTasks,
} from './todoist-utils';
import { TEXT_OPACITY, ink, inkLikeTailwind } from '@/lib/constants';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { wallRowPress } from '../shared/wallPress';
import { MoreLine } from '../shared/MoreLine';
import { TaskTapRing, type TodoistWallProps } from './ListView';

/** Columns the board draws side by side. */
const MAX_COLUMNS = 3;

export default function BoardView({
  tasks,
  config,
  now,
  onComplete,
  pressedId,
  timeFormat,
  timezone,
}: {
  tasks: TodoistTask[];
  config: TodoistConfig;
  now: Date;
} & TodoistWallProps) {
  const tr = useTranslate('modules');
  const locale = useFormattingLocale();
  const groupBy = config.groupBy === 'none' ? 'project' : config.groupBy;
  const allGroups = useMemo(
    () => groupTasks(tasks, groupBy as TodoistGroupBy, now, tr, timezone),
    [tasks, groupBy, now, tr, timezone],
  );
  // Cap at 3 columns to avoid broken multi-row layouts in a fixed-height
  // module; the groups left out are counted under the board.
  const groups = allGroups.slice(0, MAX_COLUMNS);
  const moreGroups = allGroups.length - groups.length;

  return (
    <>
    <div
      className="grid gap-2 flex-1 min-h-0 overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${groups.length}, 1fr)`,
      }}
    >
      {groups.map((group) => (
        <div
          key={group.key}
          className="flex flex-col rounded-lg overflow-hidden"
          style={{ backgroundColor: ink(0.03) }}
        >
          {/* Column header */}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: inkLikeTailwind(0.06) }}>
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
              const dueInfo = formatDueDate(t.due, now, tr, { locale, timeFormat, timezone });
              const isOverdue = (dueDaysFromToday(t.due, now, timezone) ?? 0) < 0;
              const priorityColor = PRIORITY_COLORS[t.priority];
              const background = isOverdue ? 'rgba(239, 68, 68, 0.08)' : ink(0.05);
              const body = (
                <>
                  {onComplete ? (
                    <TaskTapRing priorityColor={priorityColor} pressed={pressedId === t.id} size={22} />
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
                </>
              );
              // With taps on, the whole card is the button.
              return onComplete ? (
                <button
                  key={t.id}
                  type="button"
                  data-testid="todoist-task"
                  data-pressed={pressedId === t.id ? '' : undefined}
                  onClick={() => onComplete(t.id)}
                  aria-label={tr('todoist.completeAriaLabel', { content: t.content })}
                  {...wallRowPress('flex items-center gap-2 rounded-md px-2 py-1.5 text-left cursor-pointer select-none shrink-0')}
                  style={{ backgroundColor: background, minHeight: 44, touchAction: 'pan-y' }}
                >
                  {body}
                </button>
              ) : (
                <div
                  key={t.id}
                  data-testid="todoist-task"
                  className="flex items-start gap-1.5 rounded-md px-2 py-1.5"
                  style={{ backgroundColor: background }}
                >
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
    <MoreLine
      n={moreGroups}
      label={tr('todoist.moreGroups', { count: moreGroups })}
      testId="todoist-more-groups"
      className="shrink-0"
      style={{ fontSize: '0.7em', paddingTop: '0.3em' }}
    />
    </>
  );
}
