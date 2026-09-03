'use client';

import { useMemo } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import Toggle from '@/components/ui/Toggle';
import PropertyGroup from './PropertyGroup';
import ConditionTreeEditor from './ConditionTreeEditor';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate, useFormattingLocale, formatRelativeTime, type TranslateFn } from '@/i18n';
import { useEditorSharedState, type SharedStateSource } from '@/hooks/useEditorSharedState';
import { useConditionClock } from '@/hooks/useConditionClock';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { pluginHasStateKeySearch } from '@/lib/state-key-search';
import { validateModuleVisibility } from '@/lib/display-filter';
import { explainVisibility } from '@/lib/condition-verdicts';
import { unhealthyNoteForKeys } from '@/lib/provider-health-hint';
import type { ProviderHealthEntry } from '@/lib/provider-health-store';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { LoadedPlugin } from '@/types/plugins';
import type { ModuleInstance, ModuleVisibility, VisibilityCondition } from '@/types/config';

/** Stable empty map so an absent `plugins` prop doesn't re-create one. */
const EMPTY_PLUGINS: Map<string, LoadedPlugin> = new Map();

/**
 * The header-level answer to "why is this module shown/hidden right now?".
 * States the display's current decision, and when the whenUnknown gate
 * decided it (a key referenced anywhere in the tree is unpublished), says so
 * explicitly with the missing keys — that gate short-circuits before the
 * tree and is the least intuitive behavior in the system. Renders a neutral
 * "no live data" line when the display hasn't reported recently, never a
 * stale verdict. Exported for tests.
 */
export function VisibilityOutcomeLine({
  visibility,
  states,
  reportedAt,
  source,
  providerHealth,
  plugins,
  now,
  t,
}: {
  visibility: ModuleVisibility;
  states: ReadonlyMap<string, SharedStateEntry> | null;
  /** When the display last reported — distinguishes "went offline" (say
   *  since when) from "never reported at all" in the neutral line. */
  reportedAt?: number | null;
  /** Where the live values came from — when 'editor' the values are real but
   *  no display is showing them, so the copy drops the "on the display" claim. */
  source?: SharedStateSource | null;
  /** Unhealthy providers keyed by plugin id, to explain a missing key as an
   *  outage instead of a bare "waiting". */
  providerHealth?: Record<string, ProviderHealthEntry>;
  /** Loaded plugins, for naming the unhealthy provider. */
  plugins?: Map<string, LoadedPlugin>;
  /** Wall clock for `time` conditions; defaults to now for time-free trees. */
  now?: Date;
  t: TranslateFn;
}) {
  const formattingLocale = useFormattingLocale();
  if (!states) {
    const now = Date.now();
    return (
      <p className="text-[10px] text-hs-text-dim" data-visibility-outcome="offline">
        {typeof reportedAt === 'number'
          ? t('visibilityConditions.outcome.offlineSince', {
              time: formatRelativeTime(now, Math.min(reportedAt, now), { locale: formattingLocale }),
            })
          : t('visibilityConditions.outcome.noLiveData')}
      </p>
    );
  }
  const { visible, unknownKeys } = explainVisibility(visibility, states, now ?? new Date());
  // '' is a condition still being authored (no key picked yet) — call that
  // out as its own cause instead of rendering an empty key name.
  const missing = unknownKeys.filter((k) => k !== '');
  const outcome = source === 'editor'
    ? t(visible
        ? 'visibilityConditions.outcome.shownNowEditor'
        : 'visibilityConditions.outcome.hiddenNowEditor')
    : t(visible
        ? 'visibilityConditions.outcome.shownNow'
        : 'visibilityConditions.outcome.hiddenNow');
  let cause: string | null = null;
  if (unknownKeys.length > 0) {
    // A missing key can coexist with an unpicked one; the named keys are the
    // actionable half, so they win the single-cause slot.
    if (missing.length > 0) {
      cause = t('visibilityConditions.outcome.waitingForKeys', { keys: missing.join(', ') });
      // If a missing key's plugin is down, that's the real reason it's waiting;
      // otherwise point the user at the inspector to see every live value.
      const note = unhealthyNoteForKeys(missing, providerHealth ?? {}, plugins ?? EMPTY_PLUGINS);
      cause += ' · ' + (note
        ? t('visibilityConditions.providerHealthNote', { plugin: note.pluginName, message: note.message })
        : t('visibilityConditions.outcome.seeLiveValues'));
    } else {
      cause = t('visibilityConditions.outcome.keyNotPicked');
    }
  } else if (!visible) {
    cause = t('visibilityConditions.outcome.conditionsNotMet');
  }
  return (
    <p
      className={`text-[10px] ${visible ? 'text-hs-success' : 'text-hs-warning'}`}
      data-visibility-outcome={visible ? 'shown' : 'hidden'}
    >
      {outcome}
      {cause && <span className="text-hs-text-dim"> · {cause}</span>}
    </p>
  );
}

export default function VisibilityConditionsSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const updateModule = useEditorStore((s) => s.updateModule);

  const visibility = mod.visibility;
  const enabled = !!visibility;

  // Live values from the selected display's last heartbeat, for the
  // current-value hint and case-mismatch warning on condition inputs.
  //
  // Gated like every other consumer added this cycle (EditorCanvas on
  // anyConditionGated, RulesSection on rules.length, TextConfigSection on
  // referencedKeys.length). Ungated, merely opening this accordion on a module
  // with no conditions started a 5s poll whose GET marks display interest and
  // arms the display's fast re-report path — taking that display's full status
  // POST from 2/min to as much as 12/min while nothing here renders a value.
  const liveState = useEditorSharedState(
    selectedDisplayId,
    (visibility?.conditions.length ?? 0) > 0,
  );
  // States map for the outcome line; null when the display hasn't reported
  // recently, which renders neutral copy instead of a stale verdict.
  const outcomeStates = liveState.states;

  // Plugins exporting searchStateKeys make keys discoverable even with zero
  // static providers configured, so the "no providers" hint would mislead.
  const plugins = usePluginStore((s) => s.plugins);

  const providedKeys = useMemo(
    () => (config
      ? collectProvidedStateKeys(getActiveScreens(config, selectedDisplayId), { t, calendar: config.settings.calendar })
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plugins triggers the recompute; collectProvidedStateKeys reads the registry, not the map. Matches SharedStateSection.
    [config, selectedDisplayId, plugins, t],
  );

  const searchAvailable = useMemo(
    () => Array.from(plugins.values()).some(pluginHasStateKeySearch),
    [plugins],
  );

  // Ticking wall clock (display timezone) so a `time` condition's verdict and
  // outcome line stay live; only ticks when the tree has a time condition.
  const now = useConditionClock(visibility?.conditions ?? [], config?.settings.timezone);

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
              {visibility.conditions.length > 0 && (
                <VisibilityOutcomeLine
                  visibility={visibility}
                  states={outcomeStates}
                  reportedAt={liveState.reportedAt}
                  source={liveState.source}
                  providerHealth={liveState.providerHealth}
                  plugins={plugins}
                  now={now}
                  t={t}
                />
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
                plugins={plugins}
                now={now}
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
