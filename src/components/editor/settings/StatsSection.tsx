'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CacheStats } from '@/lib/display-cache';
import type { DisplayStatus } from '@/lib/display-commands';

/* ─── Types ──────────────────────────────────── */

interface DiskInfo {
  total: number;
  used: number;
  free: number;
  dataDir: {
    config: number;
    backups: number;
    backgrounds: number;
    total: number;
  };
}

interface SystemStats {
  disk: DiskInfo;
  os: {
    hostname: string;
    platform: string;
    arch: string;
    uptime: number;
    nodeVersion: string;
  };
  memory: {
    total: number;
    free: number;
    used: number;
  };
  app: {
    screens: number;
    modules: number;
    moduleTypes: Record<string, number>;
    profiles: number;
    configuredSecrets: string[];
    configSize: number;
  };
  telemetry?: {
    installId: string | null;
    lastBeaconAt: string | null;
    enabled: boolean;
  };
}

/* ─── Helpers ────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function formatAge(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}m`;
}

/** Shorten API URL for display: /api/weather?lat=40.7... → /api/weather */
function shortenUrl(url: string): string {
  const qIndex = url.indexOf('?');
  return qIndex >= 0 ? url.slice(0, qIndex) : url;
}

function barColor(percent: number): string {
  if (percent > 90) return 'bg-hs-danger';
  if (percent > 70) return 'bg-hs-warning';
  return 'bg-hs-success';
}

const INTEGRATION_LABELS: Record<string, string> = {
  openweathermap_key: 'OpenWeatherMap',
  weatherapi_key: 'WeatherAPI',
  pirateweather_key: 'Pirate Weather',
  unsplash_access_key: 'Unsplash',
  nasa_api_key: 'NASA',
  todoist_token: 'Todoist',
  google_maps_key: 'Google Maps',
  tomtom_key: 'TomTom',
  google_client_id: 'Google OAuth',
  google_client_secret: 'Google Secret',
};

/* ─── Shared Bar Component ───────────────────── */

function UsageBar({ percent, label, detail }: { percent: number; label: string; detail: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-hs-text-muted">{label}</span>
        <span className="text-hs-text-secondary">{detail}</span>
      </div>
      <div className="h-2.5 bg-hs-card rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(percent)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Component ──────────────────────────────── */

export default function StatsSection() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [displayStatus, setDisplayStatus] = useState<DisplayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCacheDetails, setShowCacheDetails] = useState(false);
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);
  const { config, updateSettings, saveConfig, isSaving, selectedDisplayId, setSelectedDisplay } = useEditorStore();
  const displays = config?.displays ?? [];
  const isMultiDisplay = displays.length > 0;

  // In multi-display mode every display POSTs status with its own displayId,
  // so the hub keyed-by-`__default__` slot stays empty. We have to thread the
  // currently-selected display through the query string — otherwise
  // /api/display/status returns 404 and the page flashes "no display connected"
  // even when displays are actively heartbeating. In legacy single-display
  // mode `selectedDisplayId` is null and we keep the bare URL exactly as before.
  const activeDisplay = selectedDisplayId
    ? config?.displays?.find((d) => d.id === selectedDisplayId) ?? null
    : null;

  const fetchStats = useCallback(async () => {
    try {
      const res = await editorFetch('/api/system/stats');
      if (res.ok) {
        setStats(await res.json());
        setError(null);
      } else {
        setError('Failed to load system stats');
      }
    } catch {
      setError('Failed to reach server');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDisplayStatus = useCallback(async () => {
    try {
      const url = selectedDisplayId
        ? `/api/display/status?display=${encodeURIComponent(selectedDisplayId)}`
        : '/api/display/status';
      const res = await editorFetch(url);
      if (res.ok) {
        setDisplayStatus(await res.json());
      } else {
        setDisplayStatus(null);
      }
    } catch {
      // display may not be connected
    }
  }, [selectedDisplayId]);

  useEffect(() => {
    fetchStats();
    fetchDisplayStatus();
    // Poll display status every 5s — display reports every 30s (and on state changes),
    // so the editor may see the same cached value between reports
    const id = setInterval(fetchDisplayStatus, 5_000);
    return () => clearInterval(id);
  }, [fetchStats, fetchDisplayStatus]);

  // When the user switches displays, drop the previously-cached status so
  // we don't briefly show the wrong display's cache stats / screen index
  // while the first poll for the new display is in flight.
  useEffect(() => {
    setDisplayStatus(null);
  }, [selectedDisplayId]);

  if (loading) {
    return (
      <div className="text-sm text-hs-text-faint py-8 text-center">
        Loading stats...
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-sm text-hs-danger py-8 text-center">
        {error || 'Failed to load stats'}
      </div>
    );
  }

  const diskPercent = stats.disk.total > 0 ? (stats.disk.used / stats.disk.total) * 100 : 0;
  const memPercent = stats.memory.total > 0 ? (stats.memory.used / stats.memory.total) * 100 : 0;
  // Guard against malformed cacheStats from older display clients or bad POSTs
  const rawCache = displayStatus?.cacheStats;
  const cacheStats: CacheStats | undefined = rawCache?.details
    ? rawCache
    : rawCache ? { ...rawCache, details: [] } : undefined;
  const cachePercent = cacheStats ? (cacheStats.entries / cacheStats.maxEntries) * 100 : 0;
  const hitRate = cacheStats && (cacheStats.hits + cacheStats.misses) > 0
    ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100
    : 0;

  const statusAge = displayStatus ? Date.now() - displayStatus.timestamp : null;
  const displayConnected = statusAge !== null && statusAge < 60_000;

  // Deduplicate google_client_id + google_client_secret into a single "Google OAuth" entry
  const secretsForDisplay = stats.app.configuredSecrets.filter(k => k !== 'google_client_secret');
  const allIntegrationKeys = Object.keys(INTEGRATION_LABELS).filter(k => k !== 'google_client_secret');

  return (
    <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      {/* ─── Display Status ──────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3">
          <h3 className="text-sm font-medium text-hs-text-secondary uppercase tracking-wider">
            Display Status
          </h3>
          {isMultiDisplay && (
            // Inline picker so the user can switch which display this panel
            // (and the Data Cache panel below) is reporting on — the editor's
            // toolbar display-switcher pill is absent on the settings route,
            // and forcing a trip to the Displays tab just to swap views here
            // was the friction the user flagged. Wired to the store's
            // `setSelectedDisplay` so switching also updates the URL and the
            // rest of the editor's display context in one gesture.
            <label className="flex items-center gap-2 text-xs text-hs-text-faint shrink-0">
              <span>Display</span>
              <select
                value={selectedDisplayId ?? ''}
                onChange={(e) => setSelectedDisplay(e.target.value || null)}
                className="rounded-md border border-hs-border-strong bg-hs-card px-2 py-1 text-xs text-hs-text-body hover:bg-hs-hover transition-colors cursor-pointer"
                aria-label="Switch display"
              >
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {displayConnected && displayStatus ? (
          <div className="rounded-md bg-hs-hover border border-hs-border-strong p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  displayStatus.displayState === 'active' ? 'bg-hs-success' :
                  displayStatus.displayState === 'dimmed' ? 'bg-hs-warning' : 'bg-hs-text-faint'
                }`} />
                <span className="text-sm text-hs-text-body capitalize">
                  {displayStatus.displayState}
                </span>
              </div>
              <span className="text-xs text-hs-text-faint">
                Last seen {formatAge(statusAge!)} ago
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
              <div className="text-hs-text-faint">Screen</div>
              <div className="text-hs-text-secondary">
                {displayStatus.currentScreen.name}
                <span className="text-hs-text-faint ml-1">
                  ({displayStatus.currentScreen.index + 1}/{displayStatus.screenCount})
                </span>
              </div>
              {displayStatus.activeProfile && (
                <>
                  <div className="text-hs-text-faint">Profile</div>
                  <div className="text-hs-text-secondary">{displayStatus.activeProfile}</div>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-hs-text-faint">
            No display connected
            {activeDisplay ? <> for <span className="text-hs-text-secondary">{activeDisplay.name}</span></> : null}
            . Open{' '}
            <span className="font-mono text-hs-text-muted">
              /display{activeDisplay ? `/${activeDisplay.id}` : ''}
            </span>{' '}
            to start.
          </p>
        )}
      </section>

      {/* ─── Data Cache ──────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-hs-text-secondary uppercase tracking-wider">
            Data Cache
          </h3>
          {cacheStats && cacheStats.details.length > 0 && (
            <button
              onClick={() => setShowCacheDetails(!showCacheDetails)}
              className="text-xs text-hs-accent hover:text-hs-accent-hover"
            >
              {showCacheDetails ? 'Hide Details' : 'Show Details'}
            </button>
          )}
        </div>
        {displayConnected && cacheStats ? (
          <div className="space-y-3">
            <UsageBar
              percent={cachePercent}
              label="Entries"
              detail={`${cacheStats.entries} / ${cacheStats.maxEntries}`}
            />
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Fresh" value={String(cacheStats.fresh)} color="text-hs-success" />
              <Stat label="Stale" value={String(cacheStats.stale)} color={cacheStats.stale > 0 ? 'text-hs-warning' : 'text-hs-text-secondary'} />
              <Stat label="Inflight" value={String(cacheStats.inflight)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Hits" value={cacheStats.hits.toLocaleString()} />
              <Stat label="Misses" value={cacheStats.misses.toLocaleString()} />
              <Stat label="Hit Rate" value={hitRate > 0 ? `${hitRate.toFixed(1)}%` : '—'} color={hitRate >= 90 ? 'text-hs-success' : hitRate >= 70 ? 'text-hs-warning' : 'text-hs-text-secondary'} />
            </div>
            {cacheStats.evictions > 0 && (
              <p className="text-xs text-hs-text-faint">
                {cacheStats.evictions} LRU eviction{cacheStats.evictions !== 1 ? 's' : ''}
              </p>
            )}

            {showCacheDetails && cacheStats.details.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-hs-border-strong">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-hs-text-faint border-b border-hs-border-strong">
                      <th className="text-left px-2 py-1.5 font-medium">URL</th>
                      <th className="text-right px-2 py-1.5 font-medium">Age</th>
                      <th className="text-right px-2 py-1.5 font-medium">TTL</th>
                      <th className="text-right px-2 py-1.5 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hs-border">
                    {cacheStats.details.map((d) => (
                      <tr key={d.url} className="hover:bg-hs-hover">
                        <td className="px-2 py-1.5 text-hs-text-secondary font-mono truncate max-w-[200px]">
                          {shortenUrl(d.url)}
                        </td>
                        <td className="px-2 py-1.5 text-hs-text-muted text-right whitespace-nowrap">
                          {formatAge(d.ageMs)}
                        </td>
                        <td className="px-2 py-1.5 text-hs-text-muted text-right whitespace-nowrap">
                          {formatDuration(d.ttlMs)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            d.stale
                              ? 'bg-hs-warning/20 text-hs-warning'
                              : 'bg-hs-success/20 text-hs-success'
                          }`}>
                            {d.stale ? 'stale' : 'fresh'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-hs-text-faint">
            Cache stats are reported by the display client. No display connected
            {activeDisplay ? <> for <span className="text-hs-text-secondary">{activeDisplay.name}</span></> : null}.
          </p>
        )}
      </section>

      {/* ─── Disk Usage ──────────────────────── */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Disk Usage
        </h3>
        <div className="space-y-3">
          {stats.disk.total > 0 ? (
            <UsageBar
              percent={diskPercent}
              label="Filesystem"
              detail={`${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`}
            />
          ) : (
            <p className="text-xs text-hs-text-faint">Disk stats unavailable</p>
          )}
          {stats.disk.total > 0 && (
            <p className="text-xs text-hs-text-faint">
              {diskPercent.toFixed(1)}% used &middot; {formatBytes(stats.disk.free)} free
            </p>
          )}

          <div className="rounded-md bg-hs-hover border border-hs-border-strong overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-hs-border-strong text-hs-text-faint">
                  <th className="text-left px-3 py-2 font-medium">Home Screens Data</th>
                  <th className="text-right px-3 py-2 font-medium">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hs-border">
                <DataRow label="Backgrounds" size={stats.disk.dataDir.backgrounds} />
                <DataRow label="Config Backups" size={stats.disk.dataDir.backups} />
                <DataRow label="Configuration" size={stats.disk.dataDir.config} />
                <tr className="border-t border-hs-border-strong">
                  <td className="px-3 py-2 text-hs-text-secondary font-medium">Total</td>
                  <td className="px-3 py-2 text-right text-hs-text-body font-medium">
                    {formatBytes(stats.disk.dataDir.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── Configuration ───────────────────── */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Configuration
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Screens" value={String(stats.app.screens)} />
            <Stat label="Modules" value={String(stats.app.modules)} />
            <Stat label="Profiles" value={String(stats.app.profiles)} />
          </div>

          {Object.keys(stats.app.moduleTypes).length > 0 && (
            <div>
              <p className="text-xs text-hs-text-faint mb-1.5">Module breakdown</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(stats.app.moduleTypes)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <span key={type} className="inline-flex items-center gap-1 bg-hs-card rounded px-2 py-0.5 text-xs text-hs-text-secondary">
                      {type}
                      <span className="text-hs-text-faint">&times;{count}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-hs-text-faint mb-1.5">
              Integrations {secretsForDisplay.length}/{allIntegrationKeys.length} configured
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {allIntegrationKeys.map((key) => {
                const configured = secretsForDisplay.includes(key);
                return (
                  <span key={key} className="flex items-center gap-1.5 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-hs-success' : 'bg-hs-card'}`} />
                    <span className={configured ? 'text-hs-text-secondary' : 'text-hs-text-faint'}>
                      {INTEGRATION_LABELS[key] ?? key}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Server ──────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-hs-text-secondary uppercase tracking-wider">
            Server
          </h3>
          <Button variant="secondary" size="sm" onClick={fetchStats}>
            Refresh
          </Button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="text-hs-text-faint">Hostname</div>
            <div className="text-hs-text-secondary font-mono">{stats.os.hostname}</div>
            <div className="text-hs-text-faint">Platform</div>
            <div className="text-hs-text-secondary">{stats.os.platform} / {stats.os.arch}</div>
            <div className="text-hs-text-faint">Node.js</div>
            <div className="text-hs-text-secondary font-mono">{stats.os.nodeVersion}</div>
            <div className="text-hs-text-faint">Uptime</div>
            <div className="text-hs-text-secondary">{formatUptime(stats.os.uptime)}</div>
          </div>

          <UsageBar
            percent={memPercent}
            label="Memory"
            detail={`${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}`}
          />
          <p className="text-xs text-hs-text-faint">
            {memPercent.toFixed(1)}% used &middot; {formatBytes(stats.memory.free)} free
          </p>
        </div>
      </section>

      {/* ─── Anonymous Telemetry ─────────────── */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Anonymous Telemetry
        </h3>
        <div className="space-y-3">
          <p className="text-xs text-hs-text-muted leading-relaxed">
            Home Screens collects anonymous usage statistics to help prioritize features
            and understand how the app is used. No personal data, IP addresses, or content
            is ever collected.
          </p>

          {(() => {
            const telemetryOn = config?.settings.telemetryEnabled !== false;
            return (
              <div className="flex items-center justify-between">
                <label htmlFor="telemetry-toggle" className="text-sm text-hs-text-secondary">
                  Send anonymous usage data
                </label>
                <button
                  id="telemetry-toggle"
                  role="switch"
                  aria-checked={telemetryOn}
                  disabled={isSaving}
                  onClick={async () => {
                    updateSettings({ telemetryEnabled: !telemetryOn });
                    await saveConfig();
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                    telemetryOn ? 'bg-hs-accent' : 'bg-hs-card'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      telemetryOn ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>
              </div>
            );
          })()}

          {stats.telemetry && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {stats.telemetry.installId && (
                <>
                  <div className="text-hs-text-faint">Install ID</div>
                  <div className="text-hs-text-muted font-mono text-[11px] truncate">
                    {stats.telemetry.installId}
                  </div>
                </>
              )}
              <div className="text-hs-text-faint">Last beacon</div>
              <div className="text-hs-text-muted">
                {stats.telemetry.lastBeaconAt
                  ? new Date(stats.telemetry.lastBeaconAt).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          )}

          <button
            onClick={() => setShowTelemetryDetails(!showTelemetryDetails)}
            className="flex items-center gap-1 text-xs text-hs-accent hover:text-hs-accent-hover"
          >
            {showTelemetryDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            What we collect
          </button>

          {showTelemetryDetails && (
            <div className="rounded-md bg-hs-hover border border-hs-border-strong p-3 text-xs text-hs-text-muted space-y-2">
              <p className="text-hs-text-secondary font-medium">Data sent once daily:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Anonymous install ID (random UUID)</li>
                <li>App version and platform (OS, architecture)</li>
                <li>Display resolution and orientation</li>
                <li>Number of screens, modules, and profiles</li>
                <li>Module types in use (e.g. clock, weather)</li>
                <li>Weather provider and transition effect</li>
                <li>Whether sleep, alerts, and auth are enabled</li>
                <li>Whether calendar integrations are configured</li>
                <li>Number of installed plugins</li>
              </ul>
              <p className="text-hs-text-faint mt-2">
                We never collect: IP addresses, location, calendar events, API keys,
                module content, hostnames, or any personally identifiable information. 
                All of the code is Open Source and can be verified.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ─── Small Subcomponents ────────────────────── */

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2">
      <p className="text-[10px] text-hs-text-faint uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold ${color ?? 'text-hs-text-body'}`}>{value}</p>
    </div>
  );
}

function DataRow({ label, size }: { label: string; size: number }) {
  return (
    <tr>
      <td className="px-3 py-2 text-hs-text-muted">{label}</td>
      <td className="px-3 py-2 text-right text-hs-text-secondary">{formatBytes(size)}</td>
    </tr>
  );
}
