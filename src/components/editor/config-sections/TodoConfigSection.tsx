'use client';

import Button from '@/components/ui/Button';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import Toggle from '@/components/ui/Toggle';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useListEditor } from '@/hooks/useListEditor';
import { NESTED_INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, TodoConfig, TodoItem } from '@/types/config';

export function TodoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Partial<TodoConfig>>(mod, screenId);
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const items = c.items ?? [];

  const { add: addItem, remove: removeItem, update: updateItem } = useListEditor<TodoItem>(
    items,
    'items',
    set,
    { text: t('configSections.todo.newItemText'), completed: false }
  );

  return (
    <div className="space-y-2">
      <LabeledInput
        label={t('configSections.todo.title')}
        value={(c.title as string) || t('configSections.todo.defaultTitle')}
        onChange={(v) => set({ title: v })}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">{t('configSections.todo.items')}</span>
        <Button size="sm" onClick={addItem}>{tCore('actions.add')}</Button>
      </div>
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-1 p-1 bg-hs-card rounded">
          <input
            type="checkbox"
            checked={it.completed}
            onChange={(e) => updateItem(it.id, { completed: e.target.checked })}
            className="rounded border-hs-border-strong bg-hs-card text-hs-accent"
          />
          <input
            type="text"
            value={it.text}
            onChange={(e) => updateItem(it.id, { text: e.target.value })}
            className={`flex-1 ${NESTED_INPUT_CLASS}`}
          />
          <button onClick={() => removeItem(it.id)} className="text-hs-danger text-xs px-1">x</button>
        </div>
      ))}
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
      <Toggle
        label={t('configSections.todo.interactive')}
        checked={!!c.interactive}
        onChange={(v) => set({ interactive: v })}
      />
    </div>
  );
}
