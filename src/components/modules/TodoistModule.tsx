'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { TodoistConfig, ModuleStyle, TimeFormat } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { useRealClock } from '@/hooks/useTZClock';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';
import { usePressedKey } from './shared/usePressedKey';
import { wallScrollOn } from '@/lib/wall-scroll-views';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { todoistUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { displayFetch } from '@/lib/display-fetch';
import { displayCache } from '@/lib/display-cache';
import type { TodoistData } from './todoist/todoist-utils';
import { filterTasks, sortTasks } from './todoist/todoist-utils';
import ListView from './todoist/ListView';
import BoardView from './todoist/BoardView';
import FocusView from './todoist/FocusView';
import { useTranslate } from '@/i18n';
import { grownUpFetch, isGrownUpCancelled } from '@/lib/grown-up-client';
import { logger } from '@/lib/logger';
import { ModuleTitleRow } from './shared/ModuleTitleRow';

const log = logger('todoist');

interface TodoistModuleProps {
  config: TodoistConfig;
  style: ModuleStyle;
  /** Household 12/24 choice, threaded by buildModuleProps. Absent means nobody
   *  has chosen, and due times fall back to the locale's own hour cycle. */
  timeFormat?: TimeFormat;
  /** Household zone: which day counts as today, and the clock due times read on. */
  timezone?: string;
  /** Instance address, threaded by ScreenRenderer. Present only on the display. */
  screenId?: string;
  moduleId?: string;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['todoist']?.ttlMs ?? 60_000;

export default function TodoistModule({ config, style, timeFormat, timezone, screenId, moduleId }: TodoistModuleProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const [data, error] = useFetchData<TodoistData>(todoistUrl(), config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);

  // Optimistic close: tasks the user has tapped, hidden locally until the next
  // refresh confirms Todoist no longer returns them.
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(() => new Set());

  // Reconcile against fresh data: prune IDs that are no longer in the live list
  // (Todoist confirmed the close), and keep IDs that still appear (so the
  // optimistic hide survives the in-flight refresh between tap and Todoist
  // accepting the close).
  useEffect(() => {
    if (!data?.tasks) return;
    const live = new Set(data.tasks.map((t) => t.id));
    setCompletedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [data]);

  const { run: runComplete } = useOptimisticMutation();
  // The tapped task's ring glows until Todoist answers.
  const [pressedId, press] = usePressedKey();

  const handleComplete = useCallback((taskId: string) => {
    // A closed task cannot be opened again from the wall, so closing may need the grown-up code.
    const task = data?.tasks.find((tk) => tk.id === taskId);
    const closeFetch = grownUpFetch(displayFetch, tCore('grownUp.why.todoistClose', { task: task?.content ?? '' }));
    void press(taskId, () => runComplete(taskId, {
      apply: () => setCompletedIds((prev) => {
        if (prev.has(taskId)) return prev;
        const next = new Set(prev);
        next.add(taskId);
        return next;
      }),
      request: async () => {
        const res = await closeFetch('/api/todoist/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Bust the client-side cache so screen rotations within the 5-minute
        // refresh window don't re-show the closed task from a stale mount.
        // The server cache is already cleared by the POST handler.
        displayCache.invalidate(todoistUrl());
      },
      rollback: (err) => {
        if (!isGrownUpCancelled(err)) log.error('Todoist close failed:', err);
        setCompletedIds((prev) => {
          if (!prev.has(taskId)) return prev;
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      },
    }));
  }, [runComplete, press, data, tCore]);

  const allowComplete = config.allowComplete === true;
  const onComplete = allowComplete ? handleComplete : undefined;

  const { tasks, filteredAll, totalCount } = useMemo(() => {
    if (!data?.tasks) return { tasks: [] as TodoistData['tasks'], filteredAll: [] as TodoistData['tasks'], totalCount: 0 };
    const visible = completedIds.size === 0
      ? data.tasks
      : data.tasks.filter((t) => !completedIds.has(t.id));
    const filtered = filterTasks(visible, config);
    const sorted = sortTasks(filtered, config.sortBy, timezone);
    const limited = sorted.slice(0, config.maxTasks ?? 30);
    // Focus picks what is due from every task, so it gets them all, in the chosen order.
    return { tasks: limited, filteredAll: sorted, totalCount: filtered.length };
  }, [data, config, completedIds, timezone]);

  const title = config.title || 'Todoist';
  const showTitle = config.showTitle !== false;
  const viewMode = config.viewMode ?? 'list';
  // A minute clock: the same Date between ticks, so memos in the child views
  // hold, and a new one each minute, so Today turns into Yesterday at
  // midnight even when a poll brings the same tasks (and so the same object).
  const now = useRealClock();
  // On a touch wall with taps on, a finger scrolls the List and Focus views
  // past the rows that fit; anywhere else those rows are counted instead.
  const scroll = wallScrollOn(allowComplete, screenId, moduleId);
  const wall = { onComplete, pressedId, timeFormat, timezone };

  const gate = moduleGate({ style, data, error, loadingMessage: t('todoist.loading') });
  if (gate) return gate;

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col h-full">
        <ModuleTitleRow
          title={showTitle ? title : undefined}
          // Stays visible with the title off: it is the only place a
          // truncated fetch is surfaced. A truncated fetch (past the route's
          // 4000-item ceiling) makes totalCount an undercount, so show it as a
          // floor rather than an exact figure. Almost nobody hits this, but a
          // silently short list presented as complete is the worst version of
          // the bug.
          right={data?.truncated
            ? t('todoist.taskCountAtLeast', { count: totalCount })
            : t('todoist.taskCount', { count: totalCount })}
        />

        {viewMode !== 'focus' && (
          <div className="mb-3">
            <div className="w-full h-px" style={{ backgroundColor: DIVIDER.default }} />
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="block" style={{ fontSize: '2em', opacity: TEXT_OPACITY.tertiary }}>
                <Check size="1em" strokeWidth={2.5} aria-hidden="true" style={{ display: 'inline-block' }} />
              </span>
              <p className="mt-1" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.tertiary }}>
                {t('todoist.empty')}
              </p>
            </div>
          </div>
        ) : viewMode === 'board' ? (
          <BoardView tasks={tasks} config={config} now={now} fontPx={style.fontSize} {...wall} />
        ) : viewMode === 'focus' ? (
          <FocusView allTasks={filteredAll} config={config} now={now} fontPx={style.fontSize} scroll={scroll} {...wall} />
        ) : (
          <ListView tasks={tasks} config={config} now={now} fontPx={style.fontSize} scroll={scroll} {...wall} />
        )}
      </div>
    </ModuleWrapper>
  );
}
