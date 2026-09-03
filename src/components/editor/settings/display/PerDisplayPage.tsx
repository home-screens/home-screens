'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, LayoutGrid } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { declaredCanvasDimensions } from '@/lib/display-filter';
import { formatLastSeen } from '@/lib/time-format';
import { useDisplayHeartbeats } from '@/hooks/useDisplayHeartbeats';
import { formatClientAddress, collapseReports } from '@/components/editor/settings/DisplaysIndexPage';
import { PER_DISPLAY_SUBTABS, settingsHref, type PerDisplaySubtab } from '@/lib/settings-route';
import { useTranslate, type TranslateFn } from '@/i18n';
import Button from '@/components/ui/Button';
import OverviewSubtab from './OverviewSubtab';
import OverridesSubtab from './OverridesSubtab';

/**
 * Top-level "drill-down" page for one display.
 *
 * Built around the mockup's three-row layout: a header with the display
 * thumbnail / name / status / action buttons; a sub-tab bar; and a
 * sub-tab body that swaps based on the URL `subtab` param.
 *
 * Owns one piece of state — the polled `/api/displays` heartbeat snapshot
 * for THIS display — so the header can render an "Online · 3s ago" status
 * pill and the OverviewSubtab can show the live IP / reported viewport.
 * Form mutations skip local state entirely and write straight to the
 * Zustand store via `updateDisplay` / `updateDisplaySettings`; the
 * parent settings page's existing top-level Save button flushes
 * everything to disk in one go. Skipping the local form layer means
 * undo/redo and per-keystroke validation come for free.
 */
/**
 * Re-export the canonical subtab list from `lib/settings-route` so external
 * callers that already imported it from this file keep working. The const
 * itself moved to the lib so the route parser can validate `?subtab=X`
 * without dragging a client component into the test path.
 */
export { PER_DISPLAY_SUBTABS, type PerDisplaySubtab };

interface PerDisplayPageProps {
  displayId: string;
  subtab: PerDisplaySubtab;
}

// The status pill drives styling AND copy off `kind` rather than sniffing the
// English label so de-DE / future locales never break the CSS branching.
type StatusKind = 'online' | 'idle' | 'offline';
interface StatusInfo {
  bg: string;
  text: string;
  dot: string;
  kind: StatusKind;
}

function statusColor(lastSeen: number | null): StatusInfo {
  if (!lastSeen) {
    return { bg: 'bg-hs-card', text: 'text-hs-text-muted', dot: 'bg-hs-card', kind: 'offline' };
  }
  const diff = Date.now() - lastSeen;
  if (diff < 30_000) {
    return { bg: 'bg-hs-success/10 border-hs-success/30', text: 'text-hs-success', dot: 'bg-hs-success', kind: 'online' };
  }
  if (diff < 300_000) {
    return { bg: 'bg-hs-warning/10 border-hs-warning/30', text: 'text-hs-warning', dot: 'bg-hs-warning', kind: 'idle' };
  }
  return { bg: 'bg-hs-card border-hs-border-strong', text: 'text-hs-text-muted', dot: 'bg-hs-card', kind: 'offline' };
}

function statusLabel(kind: StatusKind, t: TranslateFn): string {
  switch (kind) {
    case 'online':
      return t('settings.perDisplayPage.header.statusOnline');
    case 'idle':
      return t('settings.perDisplayPage.header.statusIdle');
    case 'offline':
      return t('settings.perDisplayPage.header.statusOffline');
  }
}

// Subtab nav labels resolved through t(); the display order remains
// PER_DISPLAY_SUBTABS so URL parsing stays in lockstep with the renderer.
function subtabLabel(tab: PerDisplaySubtab, t: TranslateFn): string {
  return t(`settings.perDisplayPage.header.subtabs.${tab}`);
}

export default function PerDisplayPage({ displayId, subtab }: PerDisplayPageProps) {
  const t = useTranslate('editor');
  const router = useRouter();
  const { config, setSelectedDisplay } = useEditorStore();
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  // Heartbeat poll for the header status pill and the Overview subtab's
  // live IP / reported viewport. Pauses on hidden tabs; see
  // useDisplayHeartbeats for the cadence/caching contract.
  const { data: apiData } = useDisplayHeartbeats();

  // Keep the store's notion of "current display" in step with the URL's.
  //
  // Per-display settings pages route by `?section=display&id=`, while
  // Automation (profiles, rules, shared state) and the canvas read the store's
  // `selectedDisplayId`. This used to sync only from the "Edit screens" button,
  // so drilling into Kitchen and then clicking Automation showed main's rules.
  //
  // Guarded on inequality because setSelectedDisplay also resets
  // selectedScreenId / selectedModuleId and rewrites the canvas URL — running
  // it on every render would fight the user's canvas selection.
  //
  // Also guarded on the display still existing: during deletion,
  // removeDisplay re-points the store at `main` while this page is still
  // mounted on the dead ?id= (IdentitySubtab awaits saveConfig before
  // navigating away). Without the existence check this effect would
  // re-select the just-deleted id, leaving every screen mutation silently
  // targeting the legacy global pool until a reload.
  const displayExists = !!config?.displays?.some((d) => d.id === displayId);
  useEffect(() => {
    if (displayId && displayExists && displayId !== selectedDisplayId) {
      setSelectedDisplay(displayId);
    }
  }, [displayId, displayExists, selectedDisplayId, setSelectedDisplay]);

  const navigateToSubtab = useCallback(
    (next: PerDisplaySubtab) => {
      // Use Next's router so `useSearchParams` in the parent settings
      // page re-renders the content to match the new subtab. Pushes
      // a history entry so the back button returns to the previous
      // subtab instead of jumping straight out of settings. `from:
      // window.location.search` preserves the params this route doesn't
      // own — see `SettingsHrefOptions.from` for why not `useSearchParams`.
      router.push(
        settingsHref(
          { kind: 'display', displayId, subtab: next },
          { from: window.location.search },
        ),
      );
    },
    [displayId, router],
  );

  if (!config) return null;
  const display = config.displays?.find((d) => d.id === displayId);
  if (!display) {
    // A stale bookmark or a removed display lands here. The old version said
    // "Display not found" and stopped, leaving the bad id in the URL and no
    // way onward but the browser's back button.
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="text-lg font-semibold text-hs-text-body">
          {t('settings.perDisplayPage.header.notFound', { id: displayId })}
        </div>
        <p className="text-sm text-hs-text-faint mt-2">
          {t('settings.perDisplayPage.header.notFoundDesc')}
        </p>
        <Button
          className="mt-4"
          onClick={() => router.push(settingsHref({ kind: 'displays' }))}
        >
          {t('settings.perDisplayPage.header.notFoundAction')}
        </Button>
      </div>
    );
  }

  const heartbeat = apiData?.displays.find((d) => d.id === displayId);
  const lastSeen = heartbeat?.lastSeen ?? null;
  const status = statusColor(lastSeen);
  const reports = collapseReports(heartbeat?.viewportReports ?? []);
  const primaryReporter = reports[0];
  const reporterIp = formatClientAddress(primaryReporter?.clientAddress);

  // Display dimensions: prefer the per-display field (normalization
  // ensures main has the same shape), then orient against the rotation
  // so the long edge always lines up with the rotation label.
  const dims = display.displayWidth && display.displayHeight
    ? declaredCanvasDimensions(display.displayWidth, display.displayHeight, display.displayTransform)
    : null;

  // Number of screens this display owns.
  const screenCount = display.screens.length;

  const handleEditScreens = () => {
    setSelectedDisplay(display.id);
    router.push(`/editor?display=${encodeURIComponent(display.id)}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-1 py-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-hs-text-primary">{display.name}</h1>
            <code className="text-[11px] text-hs-text-faint font-mono">{display.id}</code>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${status.bg} ${status.text}`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {/*
                `formatLastSeen` is intentionally English-only per the helper's
                contract — see follow-up note in src/lib/time-format.ts. The
                "Online" / "Idle" / "Offline" prefix IS localized via t().
              */}
              {statusLabel(status.kind, t)} · {formatLastSeen(lastSeen)}
            </span>
            {dims && (
              <span className="text-[11px] text-hs-text-muted bg-hs-card border border-hs-border-strong px-2.5 py-1 rounded-full tabular-nums">
                {dims.width}×{dims.height}
              </span>
            )}
            <span className="text-[11px] text-hs-text-muted bg-hs-card border border-hs-border-strong px-2.5 py-1 rounded-full">
              {screenCount === 1
                ? t('settings.perDisplayPage.header.screenCountSingular')
                : t('settings.perDisplayPage.header.screenCountPlural', { count: screenCount })}
            </span>
            {reporterIp && (
              <span className="text-[11px] text-hs-text-muted bg-hs-card border border-hs-border-strong px-2.5 py-1 rounded-full font-mono">
                {reporterIp}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/display/${display.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-hs-card border border-hs-border-strong text-hs-text-secondary hover:text-hs-text-primary hover:bg-hs-hover transition-colors"
            title={t('settings.perDisplayPage.header.openTitle')}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('settings.perDisplayPage.header.openLabel')}
          </a>
          <button
            type="button"
            onClick={handleEditScreens}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-hs-card border border-hs-border-strong text-hs-text-secondary hover:text-hs-text-primary hover:bg-hs-hover transition-colors"
            title={t('settings.perDisplayPage.header.editScreensTitle')}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {t('settings.perDisplayPage.header.editScreensLabel')}
          </button>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex items-center border-b border-hs-border mb-5">
        {PER_DISPLAY_SUBTABS.map((tab) => {
          const isActive = subtab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => navigateToSubtab(tab)}
              className={`px-1 py-2.5 mr-6 text-sm capitalize transition-colors border-b-2 ${
                isActive
                  ? 'text-hs-text-primary border-hs-accent'
                  : 'text-hs-text-faint border-transparent hover:text-hs-text-secondary'
              }`}
            >
              {subtabLabel(tab, t)}
            </button>
          );
        })}
      </div>

      {/* Active sub-tab body */}
      {subtab === 'overview' && (
        <OverviewSubtab
          config={config}
          display={display}
          heartbeat={heartbeat ?? null}
          hubVersion={apiData?.hubVersion}
          reporterIp={reporterIp}
        />
      )}
      {subtab === 'overrides' && <OverridesSubtab config={config} display={display} />}
    </div>
  );
}
