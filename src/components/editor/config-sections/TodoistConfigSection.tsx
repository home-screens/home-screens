'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
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

const VIEW_MODES = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
  { value: 'focus', label: 'Focus (Today)' },
] as const;

const GROUP_BY = [
  { value: 'none', label: 'None' },
  { value: 'project', label: 'Project' },
  { value: 'priority', label: 'Priority' },
  { value: 'date', label: 'Due Date' },
  { value: 'label', label: 'Label' },
] as const;

const SORT_BY = [
  { value: 'default', label: 'Default Order' },
  { value: 'priority', label: 'Priority' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'alphabetical', label: 'Alphabetical' },
] as const;

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
    allowComplete?: boolean;
  }>(mod, screenId);
  const viewMode = c.viewMode ?? 'list';

  return (
    <div className="space-y-3">
      <TodoistTokenStatus />
      <LabeledInput
        label="Title"
        value={c.title ?? 'Todoist'}
        onChange={(v) => set({ title: v })}
      />
      <LabeledSelect
        label="View Mode"
        value={viewMode}
        onChange={(v) => set({ viewMode: v })}
        options={VIEW_MODES}
      />
      {viewMode !== 'focus' && (
        <LabeledSelect
          label="Group By"
          value={c.groupBy ?? 'date'}
          onChange={(v) => set({ groupBy: v })}
          options={GROUP_BY}
        />
      )}
      <LabeledSelect
        label="Sort By"
        value={c.sortBy ?? 'default'}
        onChange={(v) => set({ sortBy: v })}
        options={SORT_BY}
      />
      <LabeledInput
        label="Filter Projects (comma-separated)"
        value={c.projectFilter ?? ''}
        onChange={(v) => set({ projectFilter: v })}
        placeholder="e.g. Work, Personal"
      />
      <LabeledInput
        label="Filter Labels (comma-separated)"
        value={c.labelFilter ?? ''}
        onChange={(v) => set({ labelFilter: v })}
        placeholder="e.g. urgent, home"
      />
      <Toggle label="Show Subtasks" checked={c.showSubtasks !== false} onChange={(v) => set({ showSubtasks: v })} />
      <Toggle label="Show Labels" checked={c.showLabels !== false} onChange={(v) => set({ showLabels: v })} />
      <Toggle label="Show Project" checked={c.showProject !== false} onChange={(v) => set({ showProject: v })} />
      <Toggle label="Show Description" checked={!!c.showDescription} onChange={(v) => set({ showDescription: v })} />
      <Toggle label="Show No-Date Tasks" checked={c.showNoDueDate !== false} onChange={(v) => set({ showNoDueDate: v })} />
      <Toggle
        label="Tap to Complete (touchscreen)"
        checked={!!c.allowComplete}
        onChange={(v) => set({ allowComplete: v })}
      />
      <LabeledInput
        label="Max Tasks"
        type="number"
        min={1}
        max={100}
        value={c.maxTasks ?? 30}
        onChange={(v) => set({ maxTasks: Number(v) })}
      />
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
