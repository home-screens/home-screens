'use client';

import { Fragment, useMemo, useState } from 'react';
import { Info, ChevronDown, TriangleAlert } from 'lucide-react';
import { useEditorStore, getActiveScreens, getActiveRules } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import { useEditorSharedState } from '@/hooks/useEditorSharedState';
import { useStateKeySearch } from '@/hooks/useStateKeySearch';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { BROWSE_SEARCH_LIMIT } from '@/lib/state-key-search';
import {
  buildSuggestions,
  producerLabel,
  buildAvailableGroups,
  buildPreviewRuns,
} from '@/lib/state-key-suggestions';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { resolveModuleLabel } from '@/lib/module-registry';
import { collectKeyReferences, type StateKeyReference } from '@/lib/state-demand';
import { pluginDisplayName, pluginIdFromStateKey } from '@/lib/provider-health-hint';
import { useTranslate, useFormattingLocale, formatRelativeTime, type TranslateFn } from '@/i18n';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { ModuleType } from '@/types/config';

/**
 * Settings → Shared state: the bus inspector, split into two sub-tabs both
 * scoped to the selected display.
 *
 *  - "Watching" (default): one row per key this display actually publishes
 *    (from its last heartbeat) or references (visibility conditions, Text
 *    tokens, rule conditions), cross-referenced so the two failure modes are
 *    visible at a glance — referenced-but-never-published (warning) and
 *    published-but-unreferenced (dimmed).
 *  - "Available": the full catalogue of keys this display's plugins CAN
 *    provide, whether or not anything uses them yet — the same static +
 *    cross-plugin-search sources the visibility-condition picker draws from.
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

/** Consumer chip label for a key reference. Exported for tests. */
export function referenceLabel(ref: StateKeyReference, t: TranslateFn): string {
  if (ref.kind === 'rule') {
    return t('settings.sharedStatePage.ruleRefLabel', { name: ref.ruleName });
  }
  const moduleLabel = resolveModuleLabel(ref.moduleType as ModuleType, t);
  return `${moduleLabel} · ${ref.screenName}`;
}

/**
 * "Watching" tab — the live inspector. Owns the shared-state poll so switching
 * away to "Available" tears it down (and stops arming the display's fast
 * re-reporting), mirroring how the condition combobox only searches while open.
 */
function WatchingTab({ selectedDisplayId }: { selectedDisplayId: string | null }) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const config = useEditorStore((s) => s.config);
  const plugins = usePluginStore((s) => s.plugins);
  const liveState = useEditorSharedState(selectedDisplayId);

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

  const now = Date.now();
  // Unhealthy providers reported by the current source — surfaced as a banner
  // so a service outage reads as such instead of a wall of missing keys.
  const unhealthy = Object.entries(liveState.providerHealth ?? {});

  return (
    <div>
      <p className="text-xs text-hs-text-faint mb-4">
        {t('settings.sharedStatePage.description')}
      </p>

      {/* Four states, most-alive first: values from the editor's own bus; a
          fresh display report; a display that reported once but went quiet
          (rows keep its last values, so say since when); never reported. */}
      <p className="text-[11px] text-hs-text-faint mb-4" data-state-source={liveState.source ?? 'none'}>
        {liveState.source === 'editor'
          ? t('settings.sharedStatePage.editorValuesHint')
          : liveState.source === 'display' && liveState.reportedAt !== null
            ? t('settings.sharedStatePage.lastReportLabel', {
                time: formatRelativeTime(Math.min(liveState.reportedAt, now), now, {
                  locale: formattingLocale,
                }),
              })
            : liveState.reportedAt !== null
              ? t('settings.sharedStatePage.offlineSinceHint', {
                  time: formatRelativeTime(Math.min(liveState.reportedAt, now), now, {
                    locale: formattingLocale,
                  }),
                })
              : t('settings.sharedStatePage.noReportHint')}
      </p>

      {unhealthy.length > 0 && (
        <div className="mb-4 space-y-2" data-testid="provider-health-banner">
          {unhealthy.map(([pluginId, entry]) => (
            <div
              key={pluginId}
              data-provider-health={pluginId}
              className="rounded-lg border border-amber-600/40 bg-amber-600/[0.08] px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-xs font-medium text-amber-500">
                  {pluginDisplayName(pluginId, plugins)}
                </span>
                <span className="text-[11px] text-hs-text-faint shrink-0">
                  {t('settings.sharedStatePage.providerHealthSince', {
                    time: formatRelativeTime(Math.min(entry.since, now), now, { locale: formattingLocale }),
                  })}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-hs-text-muted">{entry.message}</p>
            </div>
          ))}
        </div>
      )}

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
                    {/* This page exists to answer "is this value still
                        arriving?", so a cleared key riding out its grace window
                        must not read as live. The condition editor badges the
                        same state; without this the two surfaces contradict
                        each other about the same key. */}
                    {row.entry.staleAt !== undefined && (
                      <>
                        {' · '}
                        <span className="text-hs-warning">
                          {t('visibilityConditions.liveValueStale')}
                        </span>
                      </>
                    )}
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
              {row.status === 'missing' && (() => {
                const pid = pluginIdFromStateKey(row.key);
                const health = pid ? liveState.providerHealth?.[pid] : undefined;
                return (
                  <p className="mt-1.5 text-[11px] text-hs-text-dim">
                    {t('settings.sharedStatePage.neverPublishedDetail')}
                    {health && (
                      <>
                        {' · '}
                        {t('visibilityConditions.providerHealthNote', {
                          plugin: pluginDisplayName(pid!, plugins),
                          message: health.message,
                        })}
                      </>
                    )}
                  </p>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Available" tab — a read-only browse list of every state key this display's
 * plugins can provide, merged from the static catalogue
 * (`collectProvidedStateKeys`) and the cross-plugin friendly-name search
 * (`useStateKeySearch`), exactly the two sources the visibility-condition
 * picker draws from (via the shared `buildSuggestions` merge). Discovery only:
 * no picker semantics, so rows aren't clickable and `known` is always false.
 */
function AvailableTab({ selectedDisplayId }: { selectedDisplayId: string | null }) {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  // Subscribe to the registry so the static catalogue recomputes once plugin
  // loading finishes — landing straight on this page can render before the
  // provider modules' definitions are registered.
  const plugins = usePluginStore((s) => s.plugins);
  const [query, setQuery] = useState('');
  // Producer group names the user has collapsed. Empty by default: every group
  // starts expanded, since upfront discoverability is the whole point here.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Sub-head run keys the user has expanded past the preview cap. Empty by
  // default: a long category previews its first rows until asked for more.
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  const options = useMemo(
    () => (config
      ? collectProvidedStateKeys(getActiveScreens(config, selectedDisplayId), { t, calendar: config.settings.calendar })
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plugins triggers the recompute; collectProvidedStateKeys reads the registry, not the map.
    [config, selectedDisplayId, plugins, t],
  );

  // Search is gated on this tab being mounted (it only renders while active),
  // so passing `true` mirrors the combobox's "search only while open". Unlike
  // the combobox, this tab browses the whole catalogue, so it asks for the
  // larger BROWSE_SEARCH_LIMIT pool and previews each category client-side.
  const { results: searched, searching, searchable } = useStateKeySearch(query, true, {
    limit: BROWSE_SEARCH_LIMIT,
  });

  const suggestions = useMemo(
    () => buildSuggestions(searched, options, query, false),
    [searched, options, query],
  );

  const groups = useMemo(
    () => buildAvailableGroups(suggestions, searched, plugins, t, BROWSE_SEARCH_LIMIT),
    [suggestions, searched, plugins, t],
  );

  // Preview runs re-split a group's full row set (up to BROWSE_SEARCH_LIMIT
  // rows), so compute them per groups/expansion change, not per render — an
  // expand/collapse click re-renders everything and would otherwise re-walk
  // every group's rows inline in JSX.
  const previewRuns = useMemo(
    () => new Map(groups.map((g) => [g.producer, buildPreviewRuns(g.producer, g.rows, expandedRuns)])),
    [groups, expandedRuns],
  );

  // No providers of any kind: no background-provider module advertises keys AND
  // no plugin implements search. Same test the condition picker's no-providers
  // hint uses; read as a soft warning, not a broken list.
  const noProviders = options.length === 0 && !searchable;
  // Providers exist but nothing matched — an unconfigured/misbehaving plugin
  // returns [] just like a genuine miss, so say "no matches" rather than
  // falling back to the broken-feature-looking empty box.
  const noMatches = !noProviders && !searching && groups.length === 0;

  const toggleGroup = (producer: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(producer)) next.delete(producer);
      else next.add(producer);
      return next;
    });

  const toggleRun = (runKey: string) =>
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runKey)) next.delete(runKey);
      else next.add(runKey);
      return next;
    });

  return (
    <div>
      <p className="text-xs text-hs-text-faint mb-3">
        {t('settings.sharedStatePage.available.description')}
      </p>

      {groups.length > 0 && (
        <p
          className="mb-2 text-xs text-hs-text-secondary"
          data-testid="shared-state-available-summary"
        >
          {t('settings.sharedStatePage.available.summary', { count: suggestions.length })}
        </p>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('settings.sharedStatePage.available.searchPlaceholder')}
        aria-label={t('settings.sharedStatePage.available.searchPlaceholder')}
        className={`${INPUT_CLASS} w-full mb-4`}
        data-testid="shared-state-available-search"
      />

      {noProviders ? (
        <p className="text-xs text-hs-warning">{t('settings.sharedStatePage.available.noProviders')}</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-hs-text-faint" data-testid="shared-state-available-empty">
          {searching
            ? t('visibilityConditions.searchingHint')
            : noMatches
              ? t('settings.sharedStatePage.available.noMatches')
              : ''}
        </p>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.producer);
            return (
              <div
                key={g.producer}
                data-testid="shared-state-available-group"
                data-group-producer={g.producer}
                className="rounded-lg border border-hs-border overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(g.producer)}
                  aria-expanded={!isCollapsed}
                  aria-label={t(
                    isCollapsed
                      ? 'settings.sharedStatePage.available.expandGroup'
                      : 'settings.sharedStatePage.available.collapseGroup',
                    { producer: g.producer },
                  )}
                  data-testid="shared-state-available-group-toggle"
                  className="flex w-full items-center justify-between gap-2 bg-hs-card px-3.5 py-2.5 text-left hover:bg-hs-hover transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-hs-text-faint transition-transform ${
                        isCollapsed ? '-rotate-90' : ''
                      }`}
                    />
                    <span className="text-[13px] font-medium text-hs-text-primary">{g.producer}</span>
                  </span>
                  <span className="rounded-full bg-hs-active px-2 py-0.5 text-[10px] text-hs-text-faint">
                    {g.rows.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="px-3.5 pb-3.5 pt-2.5">
                    {g.truncated && (
                      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] text-amber-500">
                        <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                        {t('settings.sharedStatePage.available.truncationNote', {
                          count: BROWSE_SEARCH_LIMIT,
                        })}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {(previewRuns.get(g.producer) ?? []).map((run) => (
                        <Fragment key={run.runKey}>
                          {run.subhead && (
                            <p className="pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-hs-text-faint">
                              {run.subhead}
                            </p>
                          )}
                          {run.visible.map((row) => (
                            <div
                              key={row.key}
                              data-available-key={row.key}
                              className="rounded-lg border border-hs-border-strong bg-hs-hover px-3 py-2.5"
                            >
                              <div className="text-xs text-hs-text-body">{row.primary}</div>
                              <code className="mt-0.5 block font-mono text-[11px] text-hs-text-dim break-all">
                                {row.secondary}
                              </code>
                            </div>
                          ))}
                          {run.collapsible && (
                            <button
                              type="button"
                              onClick={() => toggleRun(run.runKey)}
                              aria-expanded={run.hiddenCount === 0}
                              data-testid="shared-state-available-run-toggle"
                              className="w-full rounded-lg border border-dashed border-hs-border-strong px-3 py-1.5 text-[11px] text-hs-text-secondary hover:bg-hs-hover transition-colors"
                            >
                              {run.hiddenCount > 0
                                ? t('settings.sharedStatePage.available.showMore', {
                                    count: run.hiddenCount,
                                  })
                                : t('settings.sharedStatePage.available.showLess')}
                            </button>
                          )}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {searching && groups.length > 0 && (
        <p className="mt-2 text-[11px] text-hs-text-dim">{t('visibilityConditions.searchingHint')}</p>
      )}
    </div>
  );
}

const SUB_TABS = ['watching', 'available'] as const;
type SubTab = (typeof SUB_TABS)[number];

interface SharedStateSectionProps {
  /** When rendered as an Automation-page tab, the parent owns the shared
   *  display picker and the active tab already names the section — suppress
   *  this section's own picker and heading (the explainer still renders). */
  embedded?: boolean;
}

export default function SharedStateSection({ embedded = false }: SharedStateSectionProps) {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const setSelectedDisplay = useEditorStore((s) => s.setSelectedDisplay);
  // Local, not URL-driven: the outer `?panel=live` is the deep-linkable unit;
  // Watching is the default so the inspector spec lands on it unchanged.
  const [tab, setTab] = useState<SubTab>('watching');

  if (!config) return null;

  const allDisplays = config.displays ?? [];
  const isMultiDisplay = allDisplays.length > 0;

  return (
    <section>
      {!embedded && (
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.sharedStatePage.heading')}
        </h3>
      )}
      {/* Plain-language explainer — this is the most jargon-prone surface in
          settings, so lead with what shared state IS before the two tabs. */}
      <div className="mb-4 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-hs-accent-hover shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed space-y-1.5">
          <p className="font-medium text-hs-text-primary">
            {t('settings.sharedStatePage.intro.heading')}
          </p>
          <p className="text-hs-accent-hover">{t('settings.sharedStatePage.intro.body1')}</p>
          <p className="text-hs-accent-hover">{t('settings.sharedStatePage.intro.body2')}</p>
        </div>
      </div>

      {isMultiDisplay && !embedded && (
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

      {/* Nested sub-tab control, visually one step down from the outer
          Profiles/Rules/Shared-state tab bar (a segmented pill, not the
          underline treatment the outer level uses). */}
      <div className="mb-4 inline-flex rounded-lg border border-hs-border bg-hs-card p-0.5">
        {SUB_TABS.map((tk) => (
          <button
            key={tk}
            type="button"
            data-testid={`shared-state-tab-${tk}`}
            onClick={() => setTab(tk)}
            aria-pressed={tab === tk}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${
              tab === tk
                ? 'bg-hs-hover text-hs-text-primary'
                : 'text-hs-text-faint hover:text-hs-text-secondary'
            }`}
          >
            {t(`settings.sharedStatePage.tabs.${tk}`)}
          </button>
        ))}
      </div>

      {tab === 'watching' ? (
        <WatchingTab selectedDisplayId={selectedDisplayId} />
      ) : (
        <AvailableTab selectedDisplayId={selectedDisplayId} />
      )}
    </section>
  );
}
