'use client';

import Button from '@/components/ui/Button';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useListEditor } from '@/hooks/useListEditor';
import { NESTED_INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, TodoItem } from '@/types/config';

export function TodoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ title?: string; items?: TodoItem[]; accentColor?: string }>(mod, screenId);
  const items = c.items ?? [];

  const { add: addItem, remove: removeItem, update: updateItem } = useListEditor<TodoItem>(
    items,
    'items',
    set,
    { text: 'New item', completed: false }
  );

  return (
    <div className="space-y-2">
      <LabeledInput
        label="Title"
        value={(c.title as string) || 'To Do'}
        onChange={(v) => set({ title: v })}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">Items</span>
        <Button size="sm" onClick={addItem}>Add</Button>
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
    </div>
  );
}
