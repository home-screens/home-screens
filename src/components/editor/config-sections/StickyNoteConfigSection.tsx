'use client';

import { useModuleConfig } from '@/hooks/useModuleConfig';
import LabeledField from '@/components/ui/LabeledField';
import LabeledTextarea from '@/components/ui/LabeledTextarea';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';

export function StickyNoteConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ content?: string; noteColor?: string }>(mod, screenId);
  const t = useTranslate('editor');

  return (
    <>
      <LabeledTextarea
        label={t('configSections.sticky-note.content')}
        value={c.content ?? ''}
        onChange={(v) => set({ content: v })}
        rows={4}
      />
      <LabeledField label={t('configSections.sticky-note.noteColor')}>
        <input
          type="color"
          value={c.noteColor ?? '#fef08a'}
          onChange={(e) => set({ noteColor: e.target.value })}
          className="w-full h-8 rounded bg-hs-card border border-hs-border-strong cursor-pointer"
        />
      </LabeledField>
    </>
  );
}
