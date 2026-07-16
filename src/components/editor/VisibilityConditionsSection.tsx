'use client';

import { useMemo } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import Toggle from '@/components/ui/Toggle';
import PropertyGroup from './PropertyGroup';
import ConditionTreeEditor from './ConditionTreeEditor';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';
import { useDisplaySharedState } from '@/hooks/useDisplaySharedState';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { pluginHasStateKeySearch } from '@/lib/state-key-search';
import { validateModuleVisibility } from '@/lib/display-filter';
import type { ModuleInstance, ModuleVisibility, VisibilityCondition } from '@/types/config';

export default function VisibilityConditionsSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const updateModule = useEditorStore((s) => s.updateModule);
  // Live values from the selected display's last heartbeat, for the
  // current-value hint and case-mismatch warning on condition inputs.
  const liveState = useDisplaySharedState(selectedDisplayId);

  const providedKeys = useMemo(
    () => collectProvidedStateKeys(config ? getActiveScreens(config, selectedDisplayId) : []),
    [config, selectedDisplayId],
  );

  // Plugins exporting searchStateKeys make keys discoverable even with zero
  // static providers configured, so the "no providers" hint would mislead.
  const plugins = usePluginStore((s) => s.plugins);
  const searchAvailable = useMemo(
    () => Array.from(plugins.values()).some(pluginHasStateKeySearch),
    [plugins],
  );

  const visibility = mod.visibility;
  const enabled = !!visibility;

  // Mirrors exactly what the config write gate will reject — a safety net on
  // top of the per-field checks, so nothing unsaveable goes unexplained.
  const validationError = useMemo(
    () => validateModuleVisibility(visibility, 'visibility'),
    [visibility],
  );

  const setVisibility = (next: ModuleVisibility | undefined) =>
    updateModule(screenId, mod.id, { visibility: next });

  const setConditions = (conditions: VisibilityCondition[]) =>
    setVisibility({ ...(visibility ?? {}), conditions });

  return (
    <div className="space-y-3">
      <PropertyGroup title={t('visibilityConditions.statusTitle')} accent={1}>
        <Toggle
          label={t('visibilityConditions.enableLabel')}
          checked={enabled}
          onChange={(on) =>
            // Empty conditions = always visible; a valid, saveable starting point.
            setVisibility(on ? { conditions: [] } : undefined)
          }
        />
        <p className="text-xs text-hs-text-dim mt-1">{t('visibilityConditions.enableHelp')}</p>
      </PropertyGroup>

      {enabled && visibility && (
        <>
          <PropertyGroup title={t('visibilityConditions.conditionsTitle')} accent={2}>
            <div className="space-y-2">
              {providedKeys.length === 0 && !searchAvailable && (
                <p className="text-xs text-hs-warning">{t('visibilityConditions.noProvidersHint')}</p>
              )}
              {visibility.conditions.length === 0 && (
                <p className="text-xs text-hs-text-dim">{t('visibilityConditions.noConditionsHint')}</p>
              )}
              {validationError && (
                <div className="rounded border border-hs-danger/40 bg-hs-danger/10 p-2 space-y-1">
                  <p className="text-xs text-hs-danger">{t('visibilityConditions.invalidHint')}</p>
                  <p className="text-[10px] text-hs-text-dim">{validationError}</p>
                </div>
              )}
              <ConditionTreeEditor
                conditions={visibility.conditions}
                onChange={setConditions}
                options={providedKeys}
                liveState={liveState}
                t={t}
              />
              {visibility.conditions.length > 1 && (
                <p className="text-[10px] text-hs-text-dim">{t('visibilityConditions.allMustMatchHint')}</p>
              )}
            </div>
          </PropertyGroup>

          <PropertyGroup title={t('visibilityConditions.whenUnknownTitle')} accent={3}>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{t('visibilityConditions.whenUnknownLabel')}</span>
              <select
                value={visibility.whenUnknown ?? 'hide'}
                onChange={(e) =>
                  setVisibility({
                    ...visibility,
                    whenUnknown: e.target.value === 'show' ? 'show' : undefined,
                  })
                }
                className={INPUT_CLASS}
              >
                <option value="hide">{t('visibilityConditions.whenUnknownHide')}</option>
                <option value="show">{t('visibilityConditions.whenUnknownShow')}</option>
              </select>
            </label>
          </PropertyGroup>
        </>
      )}
    </div>
  );
}
