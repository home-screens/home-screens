'use client';

import { useEditorStore } from '@/stores/editor-store';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import LabeledField from '@/components/ui/LabeledField';
import Toggle from '@/components/ui/Toggle';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, DisplayControlConfig } from '@/types/config';

export function DisplayControlConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<DisplayControlConfig>(mod, screenId);
  const displays = useEditorStore((s) => s.config?.displays ?? []);

  const legacy = displays.length === 0;

  const LAYOUT_LABELS: Record<'bar' | 'pad' | 'panel', string> = {
    bar: t('configSections.display-control.layoutBar'),
    pad: t('configSections.display-control.layoutPad'),
    panel: t('configSections.display-control.layoutPanel'),
  };

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs text-hs-text-muted uppercase tracking-wider">{t('configSections.display-control.layout')}</span>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {(['bar', 'pad', 'panel'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => set({ layout: opt })}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                c.layout === opt
                  ? 'border-hs-accent bg-hs-accent-soft text-hs-accent-hover'
                  : 'border-hs-border-strong bg-hs-card text-hs-text-muted hover:text-hs-text-secondary'
              }`}
            >
              {LAYOUT_LABELS[opt]}
            </button>
          ))}
        </div>
      </div>

      <LabeledField label={t('configSections.display-control.defaultTarget')}>
        <select
          value={c.defaultTarget}
          onChange={(e) => set({ defaultTarget: e.target.value })}
          disabled={legacy}
          className={INPUT_CLASS}
        >
          <option value="self">{t('configSections.display-control.targetSelf')}</option>
          {!legacy && <option value="all">{t('configSections.display-control.targetAll')}</option>}
          {displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {legacy && (
          <p className="text-[11px] text-hs-text-faint mt-0.5">
            {t('configSections.display-control.legacyHint')}
          </p>
        )}
      </LabeledField>

      <Toggle
        label={t('configSections.display-control.allowRetargeting')}
        checked={!legacy && (c.allowRetargeting ?? false)}
        disabled={legacy}
        onChange={(v) => set({ allowRetargeting: v })}
      />
    </div>
  );
}
