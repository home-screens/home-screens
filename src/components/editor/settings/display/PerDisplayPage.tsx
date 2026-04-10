'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, LayoutGrid } from 'lucide-react';
import { useEditorStore, orientDimensions } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { formatClientAddress, collapseReports } from '@/components/editor/settings/DisplaysIndexPage';
import { PER_DISPLAY_SUBTABS, type PerDisplaySubtab } from '@/lib/settings-route';
import OverviewSubtab from './OverviewSubtab';
import DisplaySubtab from './DisplaySubtab';
import SleepSubtab from './SleepSubtab';
import AlertsSubtab from './AlertsSubtab';
import ProfileSubtab from './ProfileSubtab';
import IdentitySubtab from './IdentitySubtab';

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

interface ViewportReport {
  width: number;
  height: number;
  lastSeen: number;
  clientAddress?: string;
}

interface DisplayApiEntry {
  id: string;
  name: string;
  screenCount: number;
  displayWidth?: number;
  displayHeight?: number;
  displayTransform?: 'normal' | '90' | '180' | '270';
  lastSeen: number | null;
  reportedViewport?: { width: number; height: number };
  viewportReports?: ViewportReport[];
  status: { displayState?: string; activeProfile?: string | null } | null;
}

interface DisplaysApiResponse {
  displays: DisplayApiEntry[];
}

function formatLastSeen(lastSeen: number | null): string {
  if (!lastSeen) return '—';
  const diff = Date.now() - lastSeen;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function statusColor(lastSeen: number | null): { bg: string; text: string; dot: string; label: string } {
  if (!lastSeen) {
    return { bg: 'bg-hs-card', text: 'text-hs-text-muted', dot: 'bg-hs-card', label: 'Offline' };
  }
  const diff = Date.now() - lastSeen;
  if (diff < 30_000) {
    return { bg: 'bg-hs-success/10 border-hs-success/30', text: 'text-hs-success', dot: 'bg-hs-success', label: 'Online' };
  }
  if (diff < 300_000) {
    return { bg: 'bg-hs-warning/10 border-hs-warning/30', text: 'text-hs-warning', dot: 'bg-hs-warning', label: 'Idle' };
  }
  return { bg: 'bg-hs-card border-hs-border-strong', text: 'text-hs-text-muted', dot: 'bg-hs-card', label: 'Offline' };
}

export default function PerDisplayPage({ displayId, subtab }: PerDisplayPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { config, setSelectedDisplay } = useEditorStore();
  const [apiData, setApiData] = useState<DisplaysApiResponse | null>(null);

  // Heartbeat poll. The 5s cadence matches DisplaysSection so two open
  // tabs hammer /api/displays at the same rate the route's tiny readConfig
  // cache (1.5s TTL) was sized for. Pauses on hidden tabs so a background
  // editor window doesn't keep polling the hub forever.
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const refresh = async () => {
      try {
        const res = await editorFetch('/api/displays');
        if (res.ok && !cancelled) {
          const data = (await res.json()) as DisplaysApiResponse;
          setApiData(data);
        }
      } catch {
        // Silent — preserve previous snapshot rather than blanking the
        // status pill on transient network blips.
      }
    };

    const start = () => {
      if (intervalId !== null) return;
      refresh();
      intervalId = setInterval(refresh, 5_000);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      start();
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      cancelled = true;
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, []);

  const navigateToSubtab = useCallback(
    (next: PerDisplaySubtab) => {
      // Use Next's router so `useSearchParams` in the parent settings
      // page re-renders the content to match the new subtab. Pushes
      // a history entry so the back button returns to the previous
      // subtab instead of jumping straight out of settings.
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('section', 'display');
      params.set('id', displayId);
      params.set('subtab', next);
      params.delete('tab');
      router.push(`?${params.toString()}`);
    },
    [displayId, router, searchParams],
  );

  if (!config) return null;
  const display = config.displays?.find((d) => d.id === displayId);
  if (!display) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="text-lg font-semibold text-hs-text-body">Display not found</div>
        <p className="text-sm text-hs-text-faint mt-2">
          No display registered with id <code className="text-hs-text-secondary">{displayId}</code>.
        </p>
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
    ? orientDimensions(display.displayWidth, display.displayHeight, display.displayTransform)
    : null;

  // Number of screens this display owns (or pulls from the legacy pool).
  const screenCount = display.screens
    ? display.screens.length
    : display.screenIds
      ? display.screenIds.length
      : 0;

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
              {status.label} · {formatLastSeen(lastSeen)}
            </span>
            {dims && (
              <span className="text-[11px] text-hs-text-muted bg-hs-card border border-hs-border-strong px-2.5 py-1 rounded-full tabular-nums">
                {dims.width}×{dims.height}
              </span>
            )}
            <span className="text-[11px] text-hs-text-muted bg-hs-card border border-hs-border-strong px-2.5 py-1 rounded-full">
              {screenCount} screen{screenCount === 1 ? '' : 's'}
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
            title="Open this display's kiosk URL"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </a>
          <button
            type="button"
            onClick={handleEditScreens}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-hs-card border border-hs-border-strong text-hs-text-secondary hover:text-hs-text-primary hover:bg-hs-hover transition-colors"
            title="Edit this display's screens in the canvas"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Edit screens
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
              {tab}
            </button>
          );
        })}
      </div>

      {/* Active sub-tab body */}
      {subtab === 'overview' && <OverviewSubtab config={config} display={display} heartbeat={heartbeat ?? null} />}
      {subtab === 'display' && <DisplaySubtab config={config} display={display} />}
      {subtab === 'sleep' && <SleepSubtab config={config} display={display} />}
      {subtab === 'alerts' && <AlertsSubtab config={config} display={display} />}
      {subtab === 'profile' && <ProfileSubtab config={config} display={display} />}
      {subtab === 'identity' && <IdentitySubtab display={display} />}
    </div>
  );
}
