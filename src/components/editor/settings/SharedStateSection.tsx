'use client';

import { useMemo } from 'react';
import { useEditorStore, getActiveScreens, getActiveRules } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import { useDisplaySharedState } from '@/hooks/useDisplaySharedState';
import { getModuleDefinition } from '@/lib/module-registry';
import { collectKeyReferences, type StateKeyReference } from '@/lib/state-demand';
import { useTranslate, useFormattingLocale, formatRelativeTime, type TranslateFn } from '@/i18n';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { ModuleType } from '@/types/config';
import type { LoadedPlugin } from '@/types/plugins';

/**
 * Settings → Shared state: the bus inspector. One row per key that the
 * selected display either publishes (from its last heartbeat snapshot) or
 * references (visibility conditions, Text tokens, rule conditions), cross-
 * referenced so the two failure modes are visible at a glance:
 *
 *  - referenced but never published → the module/rule silently follows its
 *    whenUnknown fallback; rendered as a warning with every consumer listed.
 *  - published but unreferenced → after demand-driven providers this should
 *    be an empty set, so it doubles as a regression signal; rendered dimmed.
 *
 * Follows the editor's `selectedDisplayId` exactly like RulesSection: in
 * multi-display mode a picker chooses which display's bus to inspect,
 * single-display installs read the legacy slot with no picker.
 */

type RowStatus = 'missing' | 'active' | 'unreferenced';

interface Row {
  key: string;
  entry: SharedStateEntry | undefined;
  refs: StateKeyReference[];
  status: RowStatus;
}

const STATUS_ORDER: Record<RowStatus, number> = { missing: 0, active: 1, unreferenced: 2 };

/** Exported for tests. */
export function buildRows(
  entries: Record<string, SharedStateEntry>,
  references: ReadonlyMap<string, StateKeyReference[]>,
): Row[] {
  const keys = new Set<string>([...Object.keys(entries), ...references.keys()]);
  const rows: Row[] = [];
  for (const key of keys) {
    const entry = entries[key];
    const refs = references.get(key) ?? [];
    rows.push({
      key,
      entry,
      refs,
      status: !entry ? 'missing' : refs.length === 0 ? 'unreferenced' : 'active',
    });
  }
  return rows.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.key < b.key ? -1 : 1),
  );
}

const PLUGIN_KEY_RE = /^plugin:([^:]+):/;

/** Friendly producer label from a key's namespace prefix. Exported for tests. */
export function producerLabel(key: string, plugins: Map<string, LoadedPlugin>, t: TranslateFn): string {
  const match = PLUGIN_KEY_RE.exec(key);
  if (!match) return t('settings.sharedStatePage.builtInProducer');
  const pluginId = match[1];
  for (const plugin of plugins.values()) {
    if (plugin.manifest.id.toLowerCase() === pluginId) return plugin.manifest.name;
  }
  return pluginId;
}

/** Consumer chip label for a key reference. Exported for tests. */
export function referenceLabel(ref: StateKeyReference, t: TranslateFn): string {
  if (ref.kind === 'rule') {
    return t('settings.sharedStatePage.ruleRefLabel', { name: ref.ruleName });
  }
  const moduleLabel = ref.moduleType.startsWith('plugin:')
    ? getModuleDefinition(ref.moduleType as ModuleType)?.label || ref.moduleType
    : t(`registry.types.${ref.moduleType}`);
  return `${moduleLabel} · ${ref.screenName}`;
}

export default function SharedStateSection() {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const setSelectedDisplay = useEditorStore((s) => s.setSelectedDisplay);
  const plugins = usePluginStore((s) => s.plugins);
  const liveState = useDisplaySharedState(selectedDisplayId);

  const references = useMemo(
    () =>
      config
        ? collectKeyReferences(
            getActiveScreens(config, selectedDisplayId),
            getActiveRules(config, selectedDisplayId),
          )
        : new Map<string, StateKeyReference[]>(),
    [config, selectedDisplayId],
  );

  const rows = useMemo(() => buildRows(liveState.entries, references), [liveState.entries, references]);

  if (!config) return null;

  const allDisplays = config.displays ?? [];
  const isMultiDisplay = allDisplays.length > 0;
  const now = Date.now();

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.sharedStatePage.heading')}
      </h3>
      <p className="text-xs text-hs-text-faint mb-4">
        {t('settings.sharedStatePage.description')}
      </p>

      {isMultiDisplay && (
        <div className="mb-4 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-3 py-2.5">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-hs-accent-hover font-medium">
              {t('settings.sharedStatePage.displayPicker.label')}
            </span>
            <select
              value={selectedDisplayId ?? allDisplays[0]?.id ?? ''}
              onChange={(e) => setSelectedDisplay(e.target.value || null)}
              className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            >
              {allDisplays.map((d) => (
                <option key={d.id} value={d.id}>
                  {t('settings.sharedStatePage.displayPicker.optionLabel', { name: d.name, id: d.id })}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <p className="text-[11px] text-hs-text-faint mb-4">
        {liveState.reportedAt !== null
          ? t('settings.sharedStatePage.lastReportLabel', {
              time: formatRelativeTime(Math.min(liveState.reportedAt, now), now, {
                locale: formattingLocale,
              }),
            })
          : t('settings.sharedStatePage.noReportHint')}
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-hs-text-faint">{t('settings.sharedStatePage.emptyHint')}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              data-state-key={row.key}
              data-state-status={row.status}
              className={`rounded-lg border px-3 py-2.5 ${
                row.status === 'missing'
                  ? 'border-hs-danger/40 bg-hs-danger/[0.06]'
                  : row.status === 'unreferenced'
                    ? 'border-hs-border bg-hs-panel/40 opacity-60'
                    : 'border-hs-border-strong bg-hs-hover'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <code className="font-mono text-xs text-hs-text-body break-all">{row.key}</code>
                {row.entry ? (
                  <span className="text-[11px] text-hs-text-faint shrink-0">
                    <code className="rounded bg-hs-card px-1.5 py-0.5 font-mono text-hs-text-muted">
                      {row.entry.value === '' ? '""' : row.entry.value}
                    </code>
                    {' · '}
                    {formatRelativeTime(Math.min(row.entry.updatedAt, now), now, {
                      locale: formattingLocale,
                    })}
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-hs-danger shrink-0">
                    {t('settings.sharedStatePage.neverPublished')}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-hs-text-faint">
                <span>
                  {t('settings.sharedStatePage.producerLabel', {
                    producer: producerLabel(row.key, plugins, t),
                  })}
                </span>
                {row.refs.length > 0 ? (
                  <>
                    <span>·</span>
                    <span>{t('settings.sharedStatePage.referencedByLabel')}</span>
                    {row.refs.map((ref, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-hs-border-strong bg-hs-card px-2 py-0.5 text-hs-text-muted"
                      >
                        {referenceLabel(ref, t)}
                      </span>
                    ))}
                  </>
                ) : (
                  <>
                    <span>·</span>
                    <span>{t('settings.sharedStatePage.unreferencedLabel')}</span>
                  </>
                )}
              </div>
              {row.status === 'missing' && (
                <p className="mt-1.5 text-[11px] text-hs-text-dim">
                  {t('settings.sharedStatePage.neverPublishedDetail')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
