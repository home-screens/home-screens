'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TodoistConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { MetadataText } from './shared/MetadataText';
import { todoistUrl } from '@/lib/fetch-keys';
import { displayFetch } from '@/lib/display-fetch';
import { displayCache } from '@/lib/display-cache';
import type { TodoistData } from './todoist/todoist-utils';
import { filterTasks, sortTasks } from './todoist/todoist-utils';
import ListView from './todoist/ListView';
import BoardView from './todoist/BoardView';
import FocusView from './todoist/FocusView';
import { useTranslate } from '@/i18n';

interface TodoistModuleProps {
  config: TodoistConfig;
  style: ModuleStyle;
}

export default function TodoistModule({ config, style }: TodoistModuleProps) {
  const t = useTranslate('modules');
  const [data, error] = useFetchData<TodoistData>(todoistUrl(), config.refreshIntervalMs ?? 300000);

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

  const handleComplete = useCallback((taskId: string) => {
    setCompletedIds((prev) => {
      if (prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
    void displayFetch('/api/todoist/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Bust the client-side cache so screen rotations within the 5-minute
        // refresh window don't re-show the closed task from a stale mount.
        // The server cache is already cleared by the POST handler.
        displayCache.invalidate(todoistUrl());
      })
      .catch((err) => {
        console.error('Todoist close failed:', err);
        setCompletedIds((prev) => {
          if (!prev.has(taskId)) return prev;
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      });
  }, []);

  const allowComplete = config.allowComplete === true;
  const onComplete = allowComplete ? handleComplete : undefined;

  const { tasks, filteredAll, totalCount } = useMemo(() => {
    if (!data?.tasks) return { tasks: [] as TodoistData['tasks'], filteredAll: [] as TodoistData['tasks'], totalCount: 0 };
    const visible = completedIds.size === 0
      ? data.tasks
      : data.tasks.filter((t) => !completedIds.has(t.id));
    const filtered = filterTasks(visible, config);
    const sorted = sortTasks(filtered, config.sortBy);
    const limited = sorted.slice(0, config.maxTasks ?? 30);
    return { tasks: limited, filteredAll: filtered, totalCount: filtered.length };
  }, [data, config, completedIds]);

  const title = config.title || 'Todoist';
  const viewMode = config.viewMode ?? 'list';
  // Stabilize `now` so useMemo deps in child views don't bust on every render.
  // Recompute only when fresh data arrives from the API.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed to data, not time; re-snapshot `now` only when fresh API data arrives
  const now = useMemo(() => new Date(), [data]);

  if (!data) {
    return <ModuleLoadingState style={style} message={t('todoist.loading')} error={error} />;
  }

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold" style={{ fontSize: '1.1em' }}>
            {title}
          </h2>
          <MetadataText size="xs">
            {t('todoist.taskCount', { count: totalCount })}
          </MetadataText>
        </div>

        {/* Subtle divider under header */}
        {viewMode !== 'focus' && (
          <div className="mb-3">
            <div className="w-full h-px" style={{ backgroundColor: DIVIDER.default }} />
          </div>
        )}

        {/* Content */}
        {tasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="block" style={{ fontSize: '2em', opacity: TEXT_OPACITY.tertiary }}>
                ✓
              </span>
              <p className="mt-1" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.tertiary }}>
                {t('todoist.empty')}
              </p>
            </div>
          </div>
        ) : viewMode === 'board' ? (
          <BoardView tasks={tasks} config={config} now={now} onComplete={onComplete} />
        ) : viewMode === 'focus' ? (
          <FocusView allTasks={filteredAll} config={config} now={now} onComplete={onComplete} />
        ) : (
          <ListView tasks={tasks} config={config} now={now} onComplete={onComplete} />
        )}
      </div>
    </ModuleWrapper>
  );
}
