'use client';

import { useRefetchOnClose } from '@/hooks/useRefetchOnClose';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Toggle from '@/components/ui/Toggle';
import ViewSelect from '@/components/editor/ViewSelect';
import TodoListModal from '@/components/editor/TodoListModal';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorData } from '@/hooks/useEditorData';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { HubUnreachableError, refusalText } from '@/lib/hub-request';
import { todoListsUrl } from '@/lib/fetch-keys';
import { createListRequest, sendTodoWrite } from '@/lib/todo-client';
import { useTranslate } from '@/i18n';
import { TODO_LIMITS, type TodoList } from '@/types/todos';
import type { ModuleInstance, TodoConfig, TodoView, TodoCompletedPlacement } from '@/types/config';

const DEFAULT_ACCENT = '#3b82f6';

// Which views read which switch (see TodoModule). The panel offers only the
// controls the chosen view honours.
const READS_ROW_DETAILS: ReadonlySet<TodoView> = new Set(['list', 'board']);
const READS_INTERACTIVE: ReadonlySet<TodoView> = new Set(['list', 'board', 'compact']);

export function TodoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Partial<TodoConfig>>(mod, screenId);
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { data, error: listsError, refetch } = useEditorData<{ lists: TodoList[] }>(todoListsUrl());
  const lists = data?.lists ?? [];
  const selected = lists.find((l) => l.id === c.listId);
  const view = c.view ?? 'list';

  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const VIEWS: { value: TodoView; label: string }[] = [
    { value: 'list', label: t('configSections.todo.viewList') },
    { value: 'focus', label: t('configSections.todo.viewFocus') },
    { value: 'progress', label: t('configSections.todo.viewProgress') },
    { value: 'board', label: t('configSections.todo.viewBoard') },
    { value: 'compact', label: t('configSections.todo.viewCompact') },
  ];

  const PLACEMENTS: { value: TodoCompletedPlacement; label: string }[] = [
    { value: 'bottom', label: t('configSections.todo.completedBottom') },
    { value: 'inline', label: t('configSections.todo.completedInline') },
    { value: 'hidden', label: t('configSections.todo.completedHidden') },
  ];

  // The modal writes to the store directly, so the picker's names and the
  // "which list is selected" lookup are refreshed once it closes. The hook
  // already loads on mount; skipping the first run keeps mount at one request.
  useRefetchOnClose(showModal, refetch);

  const createList = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setCreateError(null);
    try {
      // The route names the list it made. Diffing the lists instead would
      // pick up one a phone created meanwhile.
      const { created } = await sendTodoWrite(editorFetch, createListRequest(name), t('common.saveError'));
      refetch();
      if (created) set({ listId: created.id });
      setNewName('');
      setCreating(false);
    } catch (e) {
      if (isSessionExpired(e)) return;
      setCreateError(e instanceof HubUnreachableError ? t('common.hubUnreachable') : refusalText(e, tCore, 'refusals.lists.failed'));
    } finally {
      setBusy(false);
    }
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName('');
    setCreateError(null);
  };

  return (
    <div className="space-y-2">
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* The board shows every list, so there is nothing to pick there. */}
      {view !== 'board' && (
        <LabeledSelect
          label={t('configSections.todo.list')}
          value={selected ? selected.id : ''}
          onChange={(v) => set({ listId: v || undefined })}
          options={[
            { value: '', label: t('configSections.todo.pickAList') },
            ...lists.map((l) => ({ value: l.id, label: l.name })),
          ]}
        />
      )}
      {listsError && (
        <p role="alert" className="text-xs text-hs-danger">{t('configSections.todo.listsUnavailable')}</p>
      )}

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="primary"
          className="flex-1"
          disabled={!selected}
          onClick={() => setShowModal(true)}
        >
          {t('configSections.todo.editItems')}
        </Button>
        <Button size="sm" className="flex-1" disabled={creating} onClick={() => setCreating(true)}>
          {t('configSections.todo.newList')}
        </Button>
      </div>

      {creating && (
        <div className="space-y-1.5 rounded-md border border-hs-border-strong bg-hs-card/60 p-2">
          <input
            type="text"
            value={newName}
            maxLength={TODO_LIMITS.maxListNameLength}
            placeholder={t('configSections.todo.newListPlaceholder')}
            aria-label={t('configSections.todo.newListName')}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void createList(); }
              if (e.key === 'Escape') cancelCreate();
            }}
            className={INPUT_CLASS}
            autoFocus
          />
          {createError && (
            <p role="alert" className="text-xs text-hs-danger">{createError}</p>
          )}
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="primary" className="flex-1" disabled={!newName.trim() || busy} onClick={() => void createList()}>
              {t('configSections.todo.create')}
            </Button>
            <Button size="sm" className="flex-1" onClick={cancelCreate}>
              {tCore('actions.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Whether the heading shows is the Title picker's choice at the top of
          the panel; this box only names it. The board is headed by its lists. */}
      {view !== 'board' && c.showTitle !== false && !mod.style.title?.trim() && (
        <LabeledInput
          label={t('configSections.todo.title')}
          value={c.title ?? ''}
          placeholder={selected?.name ?? t('configSections.todo.defaultTitle')}
          onChange={(v) => set({ title: v })}
        />
      )}
      <AccentColorPicker
        value={c.accentColor ?? DEFAULT_ACCENT}
        onChange={(v) => set({ accentColor: v })}
      />
      <LabeledSelect
        label={t('configSections.todo.completedPlacement')}
        value={c.completedPlacement ?? 'bottom'}
        onChange={(v) => set({ completedPlacement: v })}
        options={PLACEMENTS}
      />
      {/* Only the views that draw rows with a box show a due date or who it is for. */}
      {READS_ROW_DETAILS.has(view) && (
        <>
          <Toggle
            label={t('configSections.todo.showDueDates')}
            checked={c.showDueDates ?? true}
            onChange={(v) => set({ showDueDates: v })}
          />
          <Toggle
            label={t('configSections.todo.showAssignees')}
            checked={c.showAssignees ?? true}
            onChange={(v) => set({ showAssignees: v })}
          />
        </>
      )}
      {/* List and Board take ticks; Compact scrolls under a finger. */}
      {READS_INTERACTIVE.has(view) && (
        <Toggle
          label={t('configSections.todo.interactive')}
          checked={!!c.interactive}
          onChange={(v) => set({ interactive: v })}
        />
      )}

      {/* Lists are family data: items get typed and ticked on /remote too. */}
      <PhoneSurfaceLinks context="lists" />

      {showModal && selected && (
        <TodoListModal listId={selected.id} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
