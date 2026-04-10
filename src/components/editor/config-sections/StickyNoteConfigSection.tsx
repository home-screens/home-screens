'use client';

import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance } from '@/types/config';

export function StickyNoteConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ content?: string; noteColor?: string }>(mod, screenId);

  return (
    <>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Content</span>
        <textarea
          value={(c.content as string) || ''}
          onChange={(e) => set({ content: e.target.value })}
          rows={4}
          className={`${INPUT_CLASS} resize-none`}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Note Color</span>
        <input
          type="color"
          value={(c.noteColor as string) || '#fef08a'}
          onChange={(e) => set({ noteColor: e.target.value })}
          className="w-full h-8 rounded bg-hs-card border border-hs-border-strong cursor-pointer"
        />
      </label>
    </>
  );
}
