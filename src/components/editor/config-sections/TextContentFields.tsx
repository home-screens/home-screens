'use client';

import { useMemo } from 'react';
import LabeledTextarea from '@/components/ui/LabeledTextarea';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { extractSharedStateKeys, resolveSharedStateTokens } from '@/lib/shared-state-template';
import { useEditorSharedState } from '@/hooks/useEditorSharedState';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig } from '@/types/config';

export function TextContentFields({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');

  // Shared-state token support ({plugin:ha:sensor.temp} in the content).
  // Same known-keys source as the visibility-condition picker so the two
  // features never disagree about which keys exist on this display.
  const editorConfig = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const providedKeys = useMemo(
    () => (editorConfig
      ? collectProvidedStateKeys(getActiveScreens(editorConfig, selectedDisplayId), { t, calendar: editorConfig.settings.calendar })
      : []),
    [editorConfig, selectedDisplayId, t],
  );
  const content = (c.content as string) || '';
  const referencedKeys = useMemo(() => extractSharedStateKeys(content), [content]);
  const unknownKeys = useMemo(() => {
    const known = new Set(providedKeys.map((k) => k.key));
    return referencedKeys.filter((k) => !known.has(k));
  }, [providedKeys, referencedKeys]);

  // Live token preview: the display's reported bus snapshot run through the
  // same resolver the Text module uses, so the editor shows real values
  // (with filters applied) instead of placeholders. Polling is gated on the
  // content actually referencing tokens; `states` is null while the display
  // is offline or the snapshot is stale, and the preview hides with it.
  const liveState = useEditorSharedState(selectedDisplayId, referencedKeys.length > 0);
  const formattingLocale = useFormattingLocale();
  const livePreview = useMemo(() => {
    if (referencedKeys.length === 0 || !liveState.states) return null;
    return resolveSharedStateTokens(content, liveState.states, { locale: formattingLocale });
  }, [referencedKeys, liveState.states, content, formattingLocale]);

  const rotationOn = !!c.rotationEnabled;

  return (
    <>
      <LabeledTextarea
        label={t('configSections.text.content')}
        value={(c.content as string) || ''}
        onChange={(v) => set({ content: v })}
        rows={4}
        placeholder={rotationOn ? t('configSections.text.contentRotationPlaceholder') : t('configSections.text.contentPlaceholder')}
      />

      {/* Live-value token helper: only shown when this display has state
          producers (or the content already references tokens), so the
          default Text UI stays uncluttered. */}
      {(providedKeys.length > 0 || referencedKeys.length > 0) && (
        <div className="space-y-1">
          <p className="text-[10px] text-hs-text-dim">
            {t('configSections.text.stateTokensHint', { example: `{${providedKeys[0]?.key ?? 'plugin:id:key'}}` })}
          </p>
          {referencedKeys.length > 0 && (
            <p className="text-[10px] text-hs-text-faint">
              {t('configSections.text.stateTokenFiltersHint')}
            </p>
          )}
          {providedKeys.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {providedKeys.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  title={k.label}
                  onClick={() => set({ content: `${content}{${k.key}}` })}
                  className="rounded bg-hs-hover px-1 py-0.5 font-mono text-[10px] text-hs-text-muted hover:text-hs-accent"
                >
                  {`{${k.key}}`}
                </button>
              ))}
            </div>
          )}
          {unknownKeys.length > 0 && (
            <p className="text-[10px] text-hs-warning">
              {t('configSections.text.stateTokenUnknown', { keys: unknownKeys.join(', ') })}
            </p>
          )}
          {livePreview !== null && (
            <p className="text-[10px] text-hs-text-dim" data-testid="text-token-preview">
              <span className="text-hs-text-faint">{t('configSections.text.stateTokenPreview')}: </span>
              <span className="line-clamp-3 inline whitespace-pre-wrap break-words">{livePreview}</span>
            </p>
          )}
        </div>
      )}
    </>
  );
}
