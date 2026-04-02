'use client';

import { useMemo } from 'react';
import type { TodoistConfig } from '@/types/config';
import type { TodoistTask, TaskNode } from './todoist-utils';
import {
  PRIORITY_COLORS,
  daysBetween,
  formatDueDate,
  groupTasks,
  buildTaskTree,
} from './todoist-utils';
import { TEXT_OPACITY, DIVIDER_COLOR } from '@/lib/constants';

// ─── Task Row ───

export function TaskRow({
  task,
  config,
  now,
  depth = 0,
}: {
  task: TaskNode;
  config: TodoistConfig;
  now: Date;
  depth?: number;
}) {
  const t = task.task;
  const dueInfo = formatDueDate(t.due, now);
  const isOverdue = t.due
    ? daysBetween(new Date(t.due.datetime ?? t.due.date + 'T23:59:59'), now) < 0
    : false;
  const priorityColor = PRIORITY_COLORS[t.priority];

  return (
    <>
      <div
        className="flex items-start gap-2 rounded-lg px-2.5 py-2 group"
        style={{
          backgroundColor: isOverdue
            ? 'rgba(239, 68, 68, 0.08)'
            : 'rgba(255,255,255,0.06)',
          marginLeft: depth * 20,
        }}
      >
        {/* Priority bar */}
        <div
          className="w-[3px] self-stretch rounded-full shrink-0 mt-0.5"
          style={{
            backgroundColor: priorityColor,
            minHeight: 16,
          }}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className="leading-tight font-medium"
              style={{ fontSize: '0.85em' }}
            >
              {depth > 0 && (
                <span className="mr-1" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.tertiary }}>
                  ↳
                </span>
              )}
              {t.content}
              {t.due?.isRecurring && (
                <span
                  className="ml-1.5 inline-block"
                  style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}
                  title="Recurring"
                >
                  ↻
                </span>
              )}
            </p>

            {/* Due date badge */}
            {dueInfo.text && (
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap"
                style={{
                  fontSize: '0.65em',
                  color: dueInfo.color,
                  backgroundColor: `${dueInfo.color}15`,
                }}
              >
                {dueInfo.text}
              </span>
            )}
          </div>

          {/* Description */}
          {config.showDescription && t.description && (
            <p
              className="leading-snug mt-0.5 line-clamp-2"
              style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}
            >
              {t.description}
            </p>
          )}

          {/* Meta row: project + labels */}
          {(config.showProject || config.showLabels) && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {config.showProject && (
                <span
                  className="flex items-center gap-1"
                  style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: t.projectColor }}
                  />
                  {t.projectName}
                </span>
              )}
              {config.showLabels &&
                t.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full px-1.5 py-px"
                    style={{
                      fontSize: '0.6em',
                      backgroundColor: `${t.labelColors[label] ?? '#808080'}25`,
                      color: t.labelColors[label] ?? '#808080',
                    }}
                  >
                    {label}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Subtasks */}
      {config.showSubtasks &&
        task.children.map((child) => (
          <TaskRow
            key={child.task.id}
            task={child}
            config={config}
            now={now}
            depth={depth + 1}
          />
        ))}
    </>
  );
}

// ─── List View ───

export default function ListView({
  tasks,
  config,
  now,
}: {
  tasks: TodoistTask[];
  config: TodoistConfig;
  now: Date;
}) {
  const groups = useMemo(
    () => groupTasks(tasks, config.groupBy, now),
    [tasks, config.groupBy, now],
  );

  return (
    <div className="flex flex-col gap-3 overflow-hidden h-full">
      {groups.map((group) => {
        const tree = buildTaskTree(group.tasks);
        return (
          <div key={group.key}>
            {/* Group header */}
            {group.label && (
              <div className="flex items-center gap-2 mb-1.5">
                {group.color && group.color !== 'transparent' && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                <span
                  className="font-semibold uppercase tracking-wider shrink-0"
                  style={{
                    fontSize: '0.65em',
                    opacity: group.key === 'Overdue' ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary,
                    color:
                      group.key === 'Overdue' ? '#ef4444' : undefined,
                  }}
                >
                  {group.label}
                </span>
                <span
                  style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}
                >
                  {group.tasks.length}
                </span>
                <div
                  className="flex-1 h-px"
                  style={{ backgroundColor: DIVIDER_COLOR }}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              {tree.map((node) => (
                <TaskRow
                  key={node.task.id}
                  task={node}
                  config={config}
                  now={now}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
