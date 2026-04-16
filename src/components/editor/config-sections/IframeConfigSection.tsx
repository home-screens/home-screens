'use client';

import { useMemo } from 'react';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { validateSandbox, validateIframeUrl } from '@/lib/iframe-validation';
import type { ModuleInstance, IframeConfig } from '@/types/config';

export function IframeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<IframeConfig>(mod, screenId);

  const urlError = useMemo(() => validateIframeUrl(c.url), [c.url]);

  const sandboxResult = useMemo(
    () => (c.sandboxEnabled ? validateSandbox(c.sandbox || '') : null),
    [c.sandboxEnabled, c.sandbox],
  );

  return (
    <>
      <LabeledField label="URL">
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
        label="Title (accessibility)"
        value={c.title || ''}
        onChange={(v) => set({ title: v })}
        placeholder="e.g. Home Assistant Dashboard"
      />

      <LabeledInput
        label="Auto-Refresh (seconds, 0 = off)"
        type="number"
        min={0}
        value={Math.round((c.refreshIntervalMs || 0) / 1000)}
        onChange={(v) => set({ refreshIntervalMs: Math.max(0, Number(v)) * 1000 })}
      />

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={c.scrollable ?? false}
          onChange={(e) => set({ scrollable: e.target.checked })}
          className="accent-cyan-500"
        />
        <span className="text-xs text-hs-text-secondary">Allow scrolling</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={c.sandboxEnabled ?? false}
          onChange={(e) => set({ sandboxEnabled: e.target.checked })}
          className="accent-cyan-500"
        />
        <span className="text-xs text-hs-text-secondary">Enable sandbox</span>
      </label>

      {c.sandboxEnabled && (
        <LabeledField label="Sandbox permissions">
          <input
            type="text"
            value={c.sandbox || ''}
            onChange={(e) => set({ sandbox: e.target.value })}
            className={INPUT_CLASS}
            placeholder="allow-scripts allow-forms"
          />
          {sandboxResult?.dangerousCombination && (
            <span className="text-[10px] text-hs-danger mt-0.5">
              Combining allow-same-origin and allow-scripts effectively disables the sandbox.
            </span>
          )}
          {sandboxResult && sandboxResult.unknownTokens.length > 0 && (
            <span className="text-[10px] text-hs-warning mt-0.5">
              Unknown token{sandboxResult.unknownTokens.length > 1 ? 's' : ''}: {sandboxResult.unknownTokens.join(', ')}
            </span>
          )}
          <span className="text-[10px] text-hs-text-faint mt-0.5">
            Space-separated tokens. Leave empty for maximum restriction.
          </span>
        </LabeledField>
      )}
    </>
  );
}
