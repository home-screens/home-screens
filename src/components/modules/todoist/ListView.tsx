'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import type { TodoistConfig, TimeFormat } from '@/types/config';
import type { TodoistTask, FlatTaskRow } from './todoist-utils';
import {
  PRIORITY_COLORS,
  dueDaysFromToday,
  formatDueDate,
  groupTasks,
  buildTaskTree,
  flattenTaskTree,
} from './todoist-utils';
import { TEXT_OPACITY, DIVIDER, ink } from '@/lib/constants';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { withAlpha } from '@/lib/hex-color';
import { TapCheckbox, TAP_CHECKBOX_ACCENT } from '../shared/TapCheckbox';
import { wallRowPress } from '../shared/wallPress';
import { useFitCount } from '../shared/useFitCount';
import { MoreLine } from '../shared/MoreLine';
import { WallScroller } from '../shared/WallScroller';
import { smallWallScrollLook } from '../shared/wallScrollLook';

/** What every Todoist view is handed about the wall it is on. */
export interface TodoistWallProps {
  /** Closes a task; set only when "Tap to complete" is on. */
  onComplete?: (taskId: string) => void;
  /** The task whose tap is on its way to Todoist. */
  pressedId?: string | null;
  /** Household 12/24 choice; absent falls back to the locale's own cycle. */
  timeFormat?: TimeFormat;
  /** Household zone: which day counts as today, and the clock times read on. */
  timezone?: string;
}

/** The ring a finger aims at. The row around it is the real target. */
const TAP_RING_PX = 26;
/** The house minimum for a row a finger ticks. */
const TAP_ROW_MIN_PX = 44;

/**
 * The tap ring of a task: the shared tap checkbox, round as Todoist draws
 * it, with the task's priority as its border so urgency stays visible.
 */
export function TaskTapRing({ priorityColor, pressed, size = TAP_RING_PX }: { priorityColor: string; pressed: boolean; size?: number }) {
  const hasPriority = priorityColor !== 'transparent';
  return (
    <TapCheckbox
      checked={false}
      pressed={pressed}
      color={hasPriority ? priorityColor : TAP_CHECKBOX_ACCENT}
      size={size}
      style={{ borderRadius: '50%', ...(pressed ? {} : { borderColor: hasPriority ? priorityColor : ink(0.4) }) }}
    />
  );
}

/**
 * One task. With "Tap to complete" on, the whole row is the button (a finger
 * does not have to find the ring) and it tints while its tap is in flight.
 */
export function TaskRow({
  task: t,
  config,
  now,
  depth = 0,
  onComplete,
  pressedId,
  timeFormat,
  timezone,
}: {
  task: TodoistTask;
  config: TodoistConfig;
  now: Date;
  depth?: number;
} & TodoistWallProps) {
  const tr = useTranslate('modules');
  const locale = useFormattingLocale();
  const dueInfo = formatDueDate(t.due, now, tr, { locale, timeFormat, timezone });
  const isOverdue = (dueDaysFromToday(t.due, now, timezone) ?? 0) < 0;
  const priorityColor = PRIORITY_COLORS[t.priority];
  const pressed = pressedId === t.id;
  const background = isOverdue ? 'rgba(239, 68, 68, 0.08)' : ink(0.06);

  const body = (
    <>
      {onComplete ? (
        <TaskTapRing priorityColor={priorityColor} pressed={pressed} />
      ) : (
        <div
          className="w-[3px] self-stretch rounded-full shrink-0 mt-0.5"
          style={{
            backgroundColor: priorityColor,
            minHeight: 16,
          }}
        />
      )}

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
                title={tr('todoist.recurringTooltip')}
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
                backgroundColor: withAlpha(dueInfo.color, 0.08),
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
                    backgroundColor: withAlpha(t.labelColors[label] ?? '#808080', 0.145),
                    color: t.labelColors[label] ?? '#808080',
                  }}
                >
                  {label}
                </span>
              ))}
          </div>
        )}
      </div>
    </>
  );

  if (onComplete) {
    return (
      <button
        type="button"
        data-fit
        data-testid="todoist-task"
        data-pressed={pressed ? '' : undefined}
        onClick={() => onComplete(t.id)}
        aria-label={tr('todoist.completeAriaLabel', { content: t.content })}
        {...wallRowPress('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left cursor-pointer select-none shrink-0')}
        style={{ backgroundColor: background, marginLeft: depth * 20, minHeight: TAP_ROW_MIN_PX, touchAction: 'pan-y' }}
      >
        {body}
      </button>
    );
  }
  return (
    <div
      data-fit
      data-testid="todoist-task"
      className="flex items-start gap-2 rounded-lg px-2.5 py-2 shrink-0"
      style={{ backgroundColor: background, marginLeft: depth * 20 }}
    >
      {body}
    </div>
  );
}

/** A headed run of task rows: a date or project group, or the Focus view's Overdue and Today. */
export interface TaskSection {
  key: string;
  /** The line above the rows; absent for an ungrouped list. */
  header?: ReactNode;
  rows: FlatTaskRow[];
}

/** The rows of every task under `tasks`, in drawing order. */
export function taskRows(tasks: TodoistTask[], config: TodoistConfig): FlatTaskRow[] {
  return flattenTaskTree(buildTaskTree(tasks), !!config.showSubtasks);
}

/**
 * The task rows of a list, under their headers. A card has no scrollbar, so
 * the rows that do not fit whole are left out and counted ("and N more")
 * instead of the last one being cut in half; a header whose rows are all
 * left out goes with them. On a touch wall with "Tap to complete" on, a
 * finger scrolls the whole list instead and nothing is left out.
 */
export function TaskSections({ sections, config, now, fontPx, scroll, onComplete, pressedId, timeFormat, timezone }: {
  sections: TaskSection[];
  config: TodoistConfig;
  now: Date;
  /** The card's type size in px: the room kept for "and N more". */
  fontPx: number;
  /** A touch wall with taps on: the list scrolls under a finger. */
  scroll: boolean;
} & TodoistWallProps) {
  const tr = useTranslate('modules');
  const boxRef = useRef<HTMLDivElement>(null);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const key = [
    sections.map((s) => `${s.key}:${s.rows.map((r) => `${r.task.id}.${r.task.content.length}`).join(',')}`).join('|'),
    fontPx, !!onComplete, !!config.showDescription, !!config.showProject, !!config.showLabels,
  ].join('#');
  const visible = useFitCount(boxRef, key, fontPx * 1.3, { active: !scroll });
  const look = useMemo(() => smallWallScrollLook(TAP_CHECKBOX_ACCENT), []);

  let room = visible ?? total;
  const drawn = sections
    .map((section) => {
      const rows = section.rows.slice(0, room);
      room -= rows.length;
      return { ...section, rows };
    })
    .filter((section) => section.rows.length > 0);
  const more = total - drawn.reduce((n, s) => n + s.rows.length, 0);

  const groups = drawn.map((section) => (
    <div key={section.key} className="shrink-0">
      {section.header}
      <div className="flex flex-col gap-1">
        {section.rows.map(({ task, depth }) => (
          <TaskRow
            key={task.id}
            task={task}
            depth={depth}
            config={config}
            now={now}
            onComplete={onComplete}
            pressedId={pressedId}
            timeFormat={timeFormat}
            timezone={timezone}
          />
        ))}
      </div>
    </div>
  ));

  if (scroll) {
    return (
      <WallScroller enabled backLabel={tr('wallScroll.backToTop')} {...look} testId="todoist-scroll">
        <div className="flex flex-col gap-3">{groups}</div>
      </WallScroller>
    );
  }
  return (
    <>
      <div ref={boxRef} className="flex flex-col gap-3 overflow-hidden flex-1 min-h-0" data-testid="todoist-rows">
        {groups}
      </div>
      <MoreLine
        n={more}
        label={tr('todo.andMore', { n: more })}
        testId="todoist-more"
        className="shrink-0"
        style={{ fontSize: '0.7em', paddingTop: '0.3em' }}
      />
    </>
  );
}

export default function ListView({
  tasks,
  config,
  now,
  fontPx,
  scroll,
  ...wall
}: {
  tasks: TodoistTask[];
  config: TodoistConfig;
  now: Date;
  fontPx: number;
  scroll: boolean;
} & TodoistWallProps) {
  const tr = useTranslate('modules');
  const { timezone } = wall;
  const sections = useMemo<TaskSection[]>(
    () => groupTasks(tasks, config.groupBy, now, tr, timezone).map((group) => ({
      key: group.key,
      rows: taskRows(group.tasks, config),
      header: group.label ? (
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
              opacity: group.key === 'overdue' ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary,
              color:
                group.key === 'overdue' ? '#ef4444' : undefined,
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
            style={{ backgroundColor: DIVIDER.default }}
          />
        </div>
      ) : undefined,
    })),
    [tasks, config, now, tr, timezone],
  );

  return <TaskSections sections={sections} config={config} now={now} fontPx={fontPx} scroll={scroll} {...wall} />;
}
