'use client';

import { useMemo } from 'react';
import type { TodoistConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { MetadataText } from './shared/MetadataText';
import { todoistUrl } from '@/lib/fetch-keys';
import type { TodoistData } from './todoist/todoist-utils';
import { filterTasks, sortTasks } from './todoist/todoist-utils';
import ListView from './todoist/ListView';
import BoardView from './todoist/BoardView';
import FocusView from './todoist/FocusView';

interface TodoistModuleProps {
  config: TodoistConfig;
  style: ModuleStyle;
}

export default function TodoistModule({ config, style }: TodoistModuleProps) {
  const [data, error] = useFetchData<TodoistData>(todoistUrl(), config.refreshIntervalMs ?? 300000);

  const { tasks, filteredAll, totalCount } = useMemo(() => {
    if (!data?.tasks) return { tasks: [] as TodoistData['tasks'], filteredAll: [] as TodoistData['tasks'], totalCount: 0 };
    const filtered = filterTasks(data.tasks, config);
    const sorted = sortTasks(filtered, config.sortBy);
    const limited = sorted.slice(0, config.maxTasks ?? 30);
    return { tasks: limited, filteredAll: filtered, totalCount: filtered.length };
  }, [data, config]);

  const title = config.title || 'Todoist';
  const viewMode = config.viewMode ?? 'list';
  // Stabilize `now` so useMemo deps in child views don't bust on every render.
  // Recompute only when fresh data arrives from the API.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed to data, not time; re-snapshot `now` only when fresh API data arrives
  const now = useMemo(() => new Date(), [data]);

  if (!data) {
    return <ModuleLoadingState style={style} message="Loading tasks…" error={error} />;
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
            {totalCount} task{totalCount !== 1 ? 's' : ''}
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
                No tasks to show
              </p>
            </div>
          </div>
        ) : viewMode === 'board' ? (
          <BoardView tasks={tasks} config={config} now={now} />
        ) : viewMode === 'focus' ? (
          <FocusView allTasks={filteredAll} config={config} now={now} />
        ) : (
          <ListView tasks={tasks} config={config} now={now} />
        )}
      </div>
    </ModuleWrapper>
  );
}
