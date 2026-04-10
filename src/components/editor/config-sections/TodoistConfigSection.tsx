'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance } from '@/types/config';

function TodoistTokenStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res = await editorFetch('/api/secrets');
        if (res.ok) {
          const data: Record<string, boolean> = await res.json();
          setConfigured(!!data.todoist_token);
        }
      } catch (err) {
        console.debug('Failed to check Todoist token status:', err);
      }
    }
    check();
  }, []);

  return (
    <div className="space-y-1">
      <span className="text-xs text-hs-text-muted">API Token</span>
      {configured === null ? (
        <p className="text-[10px] text-hs-text-faint">Checking...</p>
      ) : configured ? (
        <span className="flex items-center gap-1.5 text-[10px] text-hs-success">
          <span className="w-1.5 h-1.5 rounded-full bg-hs-success inline-block" />
          Connected
        </span>
      ) : (
        <p className="text-[10px] text-hs-text-faint">
          Not configured.{' '}
          <a
            href="/editor/settings?tab=integrations"
            className="text-hs-accent hover:text-hs-accent-hover underline"
          >
            Settings &rarr; Integrations
          </a>
        </p>
      )}
    </div>
  );
}

export function TodoistConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{
    title?: string;
    viewMode?: string;
    groupBy?: string;
    sortBy?: string;
    projectFilter?: string;
    labelFilter?: string;
    showNoDueDate?: boolean;
    showSubtasks?: boolean;
    showLabels?: boolean;
    showProject?: boolean;
    showDescription?: boolean;
    maxTasks?: number;
    refreshIntervalMs?: number;
  }>(mod, screenId);
  const viewMode = c.viewMode ?? 'list';

  return (
    <div className="space-y-3">
      <TodoistTokenStatus />
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Title</span>
        <input
          type="text"
          value={(c.title as string) || 'Todoist'}
          onChange={(e) => set({ title: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">View Mode</span>
        <select
          value={viewMode}
          onChange={(e) => set({ viewMode: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="list">List</option>
          <option value="board">Board</option>
          <option value="focus">Focus (Today)</option>
        </select>
      </label>
      {viewMode !== 'focus' && (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">Group By</span>
          <select
            value={(c.groupBy as string) || 'date'}
            onChange={(e) => set({ groupBy: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="none">None</option>
            <option value="project">Project</option>
            <option value="priority">Priority</option>
            <option value="date">Due Date</option>
            <option value="label">Label</option>
          </select>
        </label>
      )}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Sort By</span>
        <select
          value={(c.sortBy as string) || 'default'}
          onChange={(e) => set({ sortBy: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="default">Default Order</option>
          <option value="priority">Priority</option>
          <option value="due_date">Due Date</option>
          <option value="alphabetical">Alphabetical</option>
        </select>
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Filter Projects (comma-separated)</span>
        <input
          type="text"
          value={(c.projectFilter as string) || ''}
          onChange={(e) => set({ projectFilter: e.target.value })}
          placeholder="e.g. Work, Personal"
          className={INPUT_CLASS}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Filter Labels (comma-separated)</span>
        <input
          type="text"
          value={(c.labelFilter as string) || ''}
          onChange={(e) => set({ labelFilter: e.target.value })}
          placeholder="e.g. urgent, home"
          className={INPUT_CLASS}
        />
      </label>
      <Toggle label="Show Subtasks" checked={c.showSubtasks !== false} onChange={(v) => set({ showSubtasks: v })} />
      <Toggle label="Show Labels" checked={c.showLabels !== false} onChange={(v) => set({ showLabels: v })} />
      <Toggle label="Show Project" checked={c.showProject !== false} onChange={(v) => set({ showProject: v })} />
      <Toggle label="Show Description" checked={!!c.showDescription} onChange={(v) => set({ showDescription: v })} />
      <Toggle label="Show No-Date Tasks" checked={c.showNoDueDate !== false} onChange={(v) => set({ showNoDueDate: v })} />
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Max Tasks</span>
        <input
          type="number"
          min={1}
          max={100}
          value={c.maxTasks ?? 30}
          onChange={(e) => set({ maxTasks: Number(e.target.value) })}
          className={INPUT_CLASS}
        />
      </label>
      <Slider
        label="Refresh (minutes)"
        value={(c.refreshIntervalMs ?? 300000) / 60000}
        min={5}
        max={30}
        onChange={(v) => set({ refreshIntervalMs: v * 60000 })}
      />
    </div>
  );
}
