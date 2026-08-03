'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';
import { logger } from '@/lib/logger';
import { settingsPath } from '@/lib/settings-route';

const log = logger('todoist');

function TodoistTokenStatus() {
  const t = useTranslate('editor');
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
        log.debug('Failed to check Todoist token status:', err);
      }
    }
    check();
  }, []);

  return (
    <div className="space-y-1">
      <span className="text-xs text-hs-text-muted">{t('configSections.todoist.apiToken')}</span>
      {configured === null ? (
        <p className="text-[10px] text-hs-text-faint">{t('configSections.todoist.checking')}</p>
      ) : configured ? (
        <span className="flex items-center gap-1.5 text-[10px] text-hs-success">
          <span className="w-1.5 h-1.5 rounded-full bg-hs-success inline-block" />
          {t('configSections.todoist.connected')}
        </span>
      ) : (
        <p className="text-[10px] text-hs-text-faint">
          {t('configSections.todoist.notConfigured')}{' '}
          <a
            href={settingsPath({ kind: 'defaults', page: 'integrations' })}
            className="text-hs-accent hover:text-hs-accent-hover underline"
          >
            {t('configSections.todoist.settingsIntegrationsLink')}
          </a>
        </p>
      )}
    </div>
  );
}

export function TodoistConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');

  const VIEW_MODES = [
    { value: 'list', label: t('configSections.todoist.viewModes.list') },
    { value: 'board', label: t('configSections.todoist.viewModes.board') },
    { value: 'focus', label: t('configSections.todoist.viewModes.focus') },
  ] as const;

  const GROUP_BY = [
    { value: 'none', label: t('configSections.todoist.groupBy.none') },
    { value: 'project', label: t('configSections.todoist.groupBy.project') },
    { value: 'priority', label: t('configSections.todoist.groupBy.priority') },
    { value: 'date', label: t('configSections.todoist.groupBy.date') },
    { value: 'label', label: t('configSections.todoist.groupBy.label') },
  ] as const;

  const SORT_BY = [
    { value: 'default', label: t('configSections.todoist.sortBy.default') },
    { value: 'priority', label: t('configSections.todoist.sortBy.priority') },
    { value: 'due_date', label: t('configSections.todoist.sortBy.due_date') },
    { value: 'alphabetical', label: t('configSections.todoist.sortBy.alphabetical') },
  ] as const;
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
        label={t('configSections.todoist.title')}
        value={c.title ?? 'Todoist'}
        onChange={(v) => set({ title: v })}
      />
      <LabeledSelect
        label={t('configSections.todoist.viewMode')}
        value={viewMode}
        onChange={(v) => set({ viewMode: v })}
        options={VIEW_MODES}
      />
      {viewMode !== 'focus' && (
        <LabeledSelect
          label={t('configSections.todoist.groupByLabel')}
          value={c.groupBy ?? 'date'}
          onChange={(v) => set({ groupBy: v })}
          options={GROUP_BY}
        />
      )}
      <LabeledSelect
        label={t('configSections.todoist.sortByLabel')}
        value={c.sortBy ?? 'default'}
        onChange={(v) => set({ sortBy: v })}
        options={SORT_BY}
      />
      <LabeledInput
        label={t('configSections.todoist.filterProjects')}
        value={c.projectFilter ?? ''}
        onChange={(v) => set({ projectFilter: v })}
        placeholder={t('configSections.todoist.filterProjectsPlaceholder')}
      />
      <LabeledInput
        label={t('configSections.todoist.filterLabels')}
        value={c.labelFilter ?? ''}
        onChange={(v) => set({ labelFilter: v })}
        placeholder={t('configSections.todoist.filterLabelsPlaceholder')}
      />
      <Toggle label={t('configSections.todoist.showSubtasks')} checked={c.showSubtasks !== false} onChange={(v) => set({ showSubtasks: v })} />
      <Toggle label={t('configSections.todoist.showLabels')} checked={c.showLabels !== false} onChange={(v) => set({ showLabels: v })} />
      <Toggle label={t('configSections.todoist.showProject')} checked={c.showProject !== false} onChange={(v) => set({ showProject: v })} />
      <Toggle label={t('common.showDescription')} checked={!!c.showDescription} onChange={(v) => set({ showDescription: v })} />
      <Toggle label={t('configSections.todoist.showNoDueDate')} checked={c.showNoDueDate !== false} onChange={(v) => set({ showNoDueDate: v })} />
      <Toggle
        label={t('configSections.todoist.tapToComplete')}
        checked={!!c.allowComplete}
        onChange={(v) => set({ allowComplete: v })}
      />
      <LabeledInput
        label={t('configSections.todoist.maxTasks')}
        type="number"
        min={1}
        max={100}
        value={c.maxTasks ?? 30}
        onChange={(v) => set({ maxTasks: Number(v) })}
      />
      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey="todoist"
        fallbackMs={60_000}
        unit="minutes"
        min={1}
        max={30}
      />
    </div>
  );
}
