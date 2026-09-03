'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import type { DisplayStatus } from '@/lib/display-commands';
import { fetchStats, fetchDisplayStatus, generateBundle } from './fetchers';
import type { SemanticColor } from './shared/types';
import type { SystemStats } from '@/lib/system-stats-types';
import { DisplayCard } from './DisplayCard';
import { StorageCard } from './StorageCard';
import { MemoryCard } from './MemoryCard';
import { DisplayHardwareCard } from './DisplayHardwareCard';
import { CacheCard } from './CacheCard';
import { HardwareCard } from './HardwareCard';
import { DataDirCard } from './DataDirCard';
import { ConfigurationCard } from './ConfigurationCard';
import { ServerCard } from './ServerCard';
import { TelemetryCard } from './TelemetryCard';

export default function StatsSection() {
  const t = useTranslate('editor');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [displayStatus, setDisplayStatus] = useState<DisplayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundleState, setBundleState] = useState<'idle' | 'generating' | 'error'>('idle');
  const [bundleError, setBundleError] = useState<string | null>(null);
  const { config, updateSettings, saveConfig, isSaving, selectedDisplayId, setSelectedDisplay } = useEditorStore();
  const displays = config?.displays ?? [];
  const isMultiDisplay = displays.length > 0;

  // In multi-display mode every display POSTs status with its own displayId,
  // so the hub keyed-by-`__default__` slot stays empty. We have to thread the
  // currently-selected display through the query string — otherwise
  // /api/display/status returns 404 and the page flashes "no display connected"
  // even when displays are actively heartbeating.
  const activeDisplay = selectedDisplayId
    ? config?.displays?.find((d) => d.id === selectedDisplayId) ?? null
    : null;

  const loadStats = useCallback(async () => {
    const result = await fetchStats();
    if (result.ok) {
      setStats(result.stats);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const runGenerateBundle = useCallback(async () => {
    setBundleState('generating');
    setBundleError(null);
    try {
      await generateBundle();
      setBundleState('idle');
    } catch (e) {
      setBundleState('error');
      setBundleError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadDisplayStatus = useCallback(async () => {
    try {
      // Non-OK resolves to null (authoritative "offline"); a network exception
      // bubbles out and is swallowed here so transient poll failures don't
      // flash the card offline between successful ticks.
      const status = await fetchDisplayStatus(selectedDisplayId ?? null);
      setDisplayStatus(status);
    } catch {
      // preserve last-known status
    }
  }, [selectedDisplayId]);

  useEffect(() => {
    loadStats();
    loadDisplayStatus();
    const id = setInterval(loadDisplayStatus, 5_000);
    return () => clearInterval(id);
  }, [loadStats, loadDisplayStatus]);

  useEffect(() => {
    setDisplayStatus(null);
  }, [selectedDisplayId]);

  if (loading) {
    return (
      <div className="text-sm text-hs-text-faint py-8 text-center">
        {t('settings.statsSection.loadingStats')}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-sm text-hs-danger py-8 text-center">
        {error || t('settings.statsSection.failedToLoad')}
      </div>
    );
  }

  /* ─── Derived values ──────────────────────── */

  const statusAge = displayStatus ? Date.now() - displayStatus.timestamp : null;
  const displayConnected = statusAge !== null && statusAge < 60_000;
  const displayState = displayStatus?.displayState;
  const stateColor: SemanticColor =
    displayState === 'active' ? 'success' :
    displayState === 'dimmed' ? 'warning' : 'danger';
  const stateLabel = displayState ?? 'off';

  const telemetryOn = config?.settings.telemetryEnabled !== false;
  const advancedMode = config?.settings.advancedMode ?? false;

  /* ─── Render ──────────────────────────────── */

  return (
    <div className="space-y-0">
      {/* ============================================================
          TIER 1 — HERO: "At a Glance"
          Responsive: stacks on small viewports, 2-col on md, 2:1:1 on lg.
          Each card gets `min-w-0 overflow-hidden` so nowrap content can't
          push a grid track wider than its fair share — without this, the
          `col-span-2` Display card (with a long viewport string) bullies
          the two narrow cards next to it past their borders.
          ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <DisplayCard
          displayStatus={displayStatus}
          displayConnected={displayConnected}
          displayState={displayState}
          stateColor={stateColor}
          stateLabel={stateLabel}
          statusAge={statusAge}
          isMultiDisplay={isMultiDisplay}
          displays={displays}
          selectedDisplayId={selectedDisplayId}
          setSelectedDisplay={setSelectedDisplay}
          activeDisplay={activeDisplay}
        />
        <StorageCard stats={stats} />
        <MemoryCard stats={stats} />
      </div>

      {/* ============================================================
          TIER 2 — Detailed sections
          ============================================================ */}
      <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
        {/* Everything below the hero answers "is something wrong with my
            wall?". The cache hit rate, the browser build and the hub's
            hostname/platform/Node version answer a different question, for a
            different person, so they sit behind the advanced toggle that
            already gates developer-facing controls on the System page. */}
        {advancedMode && (
          <DisplayHardwareCard displayStatus={displayStatus} activeDisplay={activeDisplay} />
        )}
        {advancedMode && (
          <CacheCard
            displayStatus={displayStatus}
            displayConnected={displayConnected}
            activeDisplay={activeDisplay}
          />
        )}
        <HardwareCard displayStatus={displayStatus} hubHardware={stats.hardware ?? null} />
        <DataDirCard stats={stats} />
        <ConfigurationCard stats={stats} />
        {advancedMode && (
          <ServerCard
            stats={stats}
            bundleState={bundleState}
            bundleError={bundleError}
            onGenerateBundle={runGenerateBundle}
            onRefresh={loadStats}
          />
        )}
        <TelemetryCard
          stats={stats}
          telemetryOn={telemetryOn}
          isSaving={isSaving}
          onToggle={async () => {
            updateSettings({ telemetryEnabled: !telemetryOn });
            await saveConfig();
          }}
        />
      </div>
    </div>
  );
}
