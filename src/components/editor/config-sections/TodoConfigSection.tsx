'use client';

import Button from '@/components/ui/Button';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useListEditor } from '@/hooks/useListEditor';
import { INPUT_CLASS, NESTED_INPUT_CLASS } from '@/components/editor/PropertyPanel';
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
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Title</span>
        <input
          type="text"
          value={(c.title as string) || 'To Do'}
          onChange={(e) => set({ title: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">Items</span>
        <Button size="sm" onClick={addItem}>Add</Button>
      </div>
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-1 p-1 bg-neutral-800 rounded">
          <input
            type="checkbox"
            checked={it.completed}
            onChange={(e) => updateItem(it.id, { completed: e.target.checked })}
            className="rounded border-neutral-600 bg-neutral-700 text-blue-500"
          />
          <input
            type="text"
            value={it.text}
            onChange={(e) => updateItem(it.id, { text: e.target.value })}
            className={`flex-1 ${NESTED_INPUT_CLASS}`}
          />
          <button onClick={() => removeItem(it.id)} className="text-red-400 text-xs px-1">x</button>
        </div>
      ))}
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </div>
  );
}
