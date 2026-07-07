'use client';

import { useMemo } from 'react';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import Toggle from '@/components/ui/Toggle';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { validateSandbox, validateIframeUrl } from '@/lib/iframe-validation';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, IframeConfig } from '@/types/config';

export function IframeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<IframeConfig>(mod, screenId);

  const urlError = useMemo(() => validateIframeUrl(c.url), [c.url]);

  const sandboxResult = useMemo(
    () => (c.sandboxEnabled ? validateSandbox(c.sandbox || '') : null),
    [c.sandboxEnabled, c.sandbox],
  );

  return (
    <>
      <LabeledField label={t('configSections.iframe.url')}>
        <input
          type="url"
          value={c.url || ''}
          onChange={(e) => set({ url: e.target.value })}
          className={INPUT_CLASS}
          placeholder="https://example.com"
        />
        {urlError && (
          <span className="text-[10px] text-hs-danger mt-0.5">{urlError}</span>
        )}
      </LabeledField>

      <LabeledInput
        label={t('configSections.iframe.titleAccessibility')}
        value={c.title || ''}
        onChange={(v) => set({ title: v })}
        placeholder={t('configSections.iframe.titlePlaceholder')}
      />

      <LabeledInput
        label={t('configSections.iframe.autoRefreshSeconds')}
        type="number"
        min={0}
        value={Math.round((c.refreshIntervalMs || 0) / 1000)}
        onChange={(v) => set({ refreshIntervalMs: Math.max(0, Number(v)) * 1000 })}
      />

      <Toggle
        label={t('configSections.iframe.allowScrolling')}
        checked={c.scrollable ?? false}
        onChange={(v) => set({ scrollable: v })}
      />

      <Toggle
        label={t('configSections.iframe.enableSandbox')}
        checked={c.sandboxEnabled ?? false}
        onChange={(v) => set({ sandboxEnabled: v })}
      />

      {c.sandboxEnabled && (
        <LabeledField label={t('configSections.iframe.sandboxPermissions')}>
          <input
            type="text"
            value={c.sandbox || ''}
            onChange={(e) => set({ sandbox: e.target.value })}
            className={INPUT_CLASS}
            placeholder="allow-scripts allow-forms"
          />
          {sandboxResult?.dangerousCombination && (
            <span className="text-[10px] text-hs-danger mt-0.5">
              {t('configSections.iframe.sandboxDangerous')}
            </span>
          )}
          {sandboxResult && sandboxResult.unknownTokens.length > 0 && (
            <span className="text-[10px] text-hs-warning mt-0.5">
              {sandboxResult.unknownTokens.length > 1
                ? t('configSections.iframe.unknownTokensPlural', { tokens: sandboxResult.unknownTokens.join(', ') })
                : t('configSections.iframe.unknownTokensSingular', { tokens: sandboxResult.unknownTokens.join(', ') })}
            </span>
          )}
          <span className="text-[10px] text-hs-text-faint mt-0.5">
            {t('configSections.iframe.sandboxHelp')}
          </span>
        </LabeledField>
      )}
    </>
  );
}
