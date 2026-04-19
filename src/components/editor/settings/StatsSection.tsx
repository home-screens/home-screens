'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { formatAge, formatUptime } from '@/lib/time-format';
import Button from '@/components/ui/Button';
import {
  ChevronDown,
  ChevronRight,
  Monitor,
  HardDrive,
  Cpu,
  Database,
  Thermometer,
  FolderTree,
  SlidersHorizontal,
  Server,
  BarChart3,
  Chrome,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CacheStats } from '@/lib/display-cache';
import type { DisplayStatus } from '@/lib/display-commands';
import type { HardwareStats } from '@/lib/hardware-stats';

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
  /** Hub's own in-process hardware snapshot. Falls back to this when the
   * selected display hasn't reported via the bash reporter. */
  hardware?: HardwareStats | null;
}

/* ─── Helpers ────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Split a byte count into "20.3" and "GB" so we can style the unit separately. */
function splitBytes(bytes: number): { value: string; unit: string } {
  if (bytes <= 0) return { value: '0', unit: 'B' };
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return { value: v < 10 ? v.toFixed(1) : String(Math.round(v)), unit: units[i] };
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

/** Color token names that map to the real CSS variables. We keep them as
 * strings so the component can pass them into inline `style.stroke`. */
type SemanticColor = 'success' | 'warning' | 'danger';
function percentColor(percent: number): SemanticColor {
  if (percent > 90) return 'danger';
  if (percent > 70) return 'warning';
  return 'success';
}
function colorVar(c: SemanticColor): string {
  return `var(--hs-${c})`;
}

/* ─── Integration metadata ──────────────────── */

interface IntegrationMeta {
  label: string;
  initials: string;
}
const INTEGRATION_META: Record<string, IntegrationMeta> = {
  openweathermap_key: { label: 'OpenWeatherMap', initials: 'OW' },
  weatherapi_key:     { label: 'WeatherAPI',     initials: 'WA' },
  pirateweather_key:  { label: 'Pirate Weather', initials: 'PW' },
  metoffice_key:      { label: 'Met Office',     initials: 'MO' },
  unsplash_access_key:{ label: 'Unsplash',       initials: 'UN' },
  nasa_api_key:       { label: 'NASA',           initials: 'NA' },
  todoist_token:      { label: 'Todoist',        initials: 'TD' },
  google_maps_key:    { label: 'Google Maps',    initials: 'GM' },
  tomtom_key:         { label: 'TomTom',         initials: 'TT' },
  google_client_id:   { label: 'Google OAuth',   initials: 'GO' },
};

/* ─── Palette for module-type and data-dir stacked bars ──────
 * Hand-picked hex values so segments are visually distinct while the
 * overall palette stays consistent with the semantic tokens used elsewhere
 * (blue/green/violet/amber lead; then pink, light-blue, teal; "other" is
 * faint gray). Not theme-reactive — these read fine on both dark and
 * light surfaces because saturation is moderate. */
const MODULE_PALETTE = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a78bfa', // violet
  '#f59e0b', // amber
  '#f472b6', // pink
  '#60a5fa', // light blue
  '#10b981', // teal
];
const MODULE_OTHER_COLOR = '#737373';

const DATA_DIR_COLORS = {
  backgrounds: '#3b82f6',
  backups:     '#a78bfa',
  config:      '#22c55e',
};

/* ─── Small reused pieces ────────────────────── */

function SectionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-hs-card border border-hs-border-strong text-hs-text-muted shrink-0">
      <Icon size={14} />
    </span>
  );
}

function SectionHeading({ icon, title, trailing }: {
  icon: LucideIcon;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    // Column on narrow viewports so wide trailing buttons (e.g. the Server
    // section's "Diagnostics bundle" + "Refresh" pair) don't crash into the
    // heading or force their labels to wrap internally. Side-by-side once
    // there's room.
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2 sm:gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <SectionIcon icon={icon} />
        <h3 className="text-[11px] font-medium text-hs-text-secondary uppercase tracking-[0.08em] truncate">
          {title}
        </h3>
      </div>
      {trailing ? <div className="flex items-center gap-2 flex-wrap">{trailing}</div> : null}
    </div>
  );
}

/** Pulsing dot — uses Tailwind's built-in animate-ping and automatically
 * disables itself under prefers-reduced-motion via motion-reduce variant. */
function PulseDot({ color = 'success' }: { color?: SemanticColor }) {
  const bg = color === 'success' ? 'bg-hs-success' : color === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger';
  return (
    <span className="relative inline-flex w-2 h-2">
      <span className={`absolute inset-0 rounded-full ${bg} opacity-60 animate-ping motion-reduce:animate-none`} />
      <span className={`relative rounded-full w-2 h-2 ${bg}`} />
    </span>
  );
}

/** Radial percent ring — SVG, pure CSS transition on dashoffset. */
function RingProgress({
  percent,
  size = 68,
  stroke = 8,
  color,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color: SemanticColor;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const dashoffset = c * (1 - clamped / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none"
                stroke="var(--hs-border-strong)" opacity={0.55} />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none"
                stroke={colorVar(color)} strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={dashoffset}
                style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/** Thin accent bar used for the cache entries fill and inside other places
 * where the hero rings would be overkill. */
function ThinBar({ percent, color }: { percent: number; color: SemanticColor }) {
  const bg = color === 'success' ? 'bg-hs-success' : color === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger';
  return (
    <div className="h-1.5 bg-hs-card rounded-full overflow-hidden border border-hs-border-strong">
      <div className={`h-full rounded-full ${bg} transition-all duration-500`}
           style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
    </div>
  );
}

/** Small numeric summary tile (Screens / Modules / Profiles).
 * `overflow-hidden` + `truncate` on the label defends against narrow
 * grid columns at minimum browser width — the label shortens before
 * anything bleeds past the border. The number row is `whitespace-nowrap`
 * so big counts like "1024" never break mid-digit. */
function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-hs-hover border border-hs-border-strong px-3 py-2.5 min-w-0 overflow-hidden">
      <p className="text-[10px] text-hs-text-faint uppercase tracking-wider truncate">{label}</p>
      <p className="text-xl font-semibold text-hs-text-primary tabular-nums mt-0.5 whitespace-nowrap">
        {value}
      </p>
    </div>
  );
}

/** Mini cache stat tile. Label left, value right, always on one line. The
 * explicit `gap-2` keeps them apart at narrow widths (pre-fix they butted
 * right up against each other) and `truncate` on the label means it loses
 * characters before the value ever wraps. */
function CacheStatTile({ label, value, tone = 'neutral' }: {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'neutral';
}) {
  const valueClass =
    tone === 'success' ? 'text-hs-success' :
    tone === 'warning' ? 'text-hs-warning' : 'text-hs-text-body';
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-2 rounded-md border border-hs-border-strong min-w-0">
      <span className="text-[11px] text-hs-text-faint uppercase tracking-wider truncate">
        {label}
      </span>
      <span className={`text-xs font-mono tabular-nums whitespace-nowrap ${valueClass}`}>
        {value}
      </span>
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

  const generateBundle = useCallback(async () => {
    setBundleState('generating');
    setBundleError(null);
    try {
      const res = await editorFetch('/api/system/diagnostics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `home-screens-diagnostics-${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Safari aborts in-flight downloads if we revoke too early.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBundleState('idle');
    } catch (e) {
      setBundleState('error');
      setBundleError(e instanceof Error ? e.message : String(e));
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
    const id = setInterval(fetchDisplayStatus, 5_000);
    return () => clearInterval(id);
  }, [fetchStats, fetchDisplayStatus]);

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

  /* ─── Derived values ──────────────────────── */

  const diskPercent = stats.disk.total > 0 ? (stats.disk.used / stats.disk.total) * 100 : 0;
  const diskColor = percentColor(diskPercent);
  const memPercent = stats.memory.total > 0 ? (stats.memory.used / stats.memory.total) * 100 : 0;
  const memColor = percentColor(memPercent);

  // Guard against malformed cacheStats from older display clients.
  const rawCache = displayStatus?.cacheStats;
  const cacheStats: CacheStats | undefined = rawCache?.details
    ? rawCache
    : rawCache ? { ...rawCache, details: [] } : undefined;
  const cachePercent = cacheStats ? (cacheStats.entries / cacheStats.maxEntries) * 100 : 0;
  const hitRate = cacheStats && (cacheStats.hits + cacheStats.misses) > 0
    ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100
    : 0;
  const hitRateColor: SemanticColor =
    hitRate >= 90 ? 'success' : hitRate >= 70 ? 'warning' : 'danger';

  const statusAge = displayStatus ? Date.now() - displayStatus.timestamp : null;
  const displayConnected = statusAge !== null && statusAge < 60_000;
  const displayState = displayStatus?.displayState;
  const stateColor: SemanticColor =
    displayState === 'active' ? 'success' :
    displayState === 'dimmed' ? 'warning' : 'danger';
  const stateLabel = displayState ?? 'off';

  // Only count secrets that map to a known integration tile — otherwise an
  // unrelated secret (e.g. a password hash) inflates the numerator past the
  // denominator and we display the nonsense "10 / 9 configured".
  const integrationKeys = Object.keys(INTEGRATION_META).filter(k => k !== 'google_client_secret');
  const configuredIntegrationKeys = stats.app.configuredSecrets.filter(
    k => k !== 'google_client_secret' && k in INTEGRATION_META,
  );

  // Pick best hardware source: reporter > hub fallback.
  const reporterStats = displayStatus?.hwStats ?? null;
  const hubStats = stats.hardware ?? null;
  const hwStats = reporterStats ?? hubStats;
  const hwSource: 'reporter' | 'hub' | null = reporterStats ? 'reporter' : hubStats ? 'hub' : null;

  // Temperature semantic color: ≤60 ok, 60–75 warn, >75 danger.
  let tempColor: SemanticColor = 'success';
  if (hwStats?.cpuTempC != null) {
    if (hwStats.cpuTempC > 75) tempColor = 'danger';
    else if (hwStats.cpuTempC > 60) tempColor = 'warning';
  }

  // Module breakdown: top 7 by count, rest bucketed into "other".
  const moduleEntries = Object.entries(stats.app.moduleTypes)
    .sort(([, a], [, b]) => b - a);
  const topTypes = moduleEntries.slice(0, 7);
  const restTypes = moduleEntries.slice(7);
  const restTotal = restTypes.reduce((sum, [, n]) => sum + n, 0);
  const moduleSegments: Array<{ label: string; count: number; color: string }> = [
    ...topTypes.map(([type, count], i) => ({
      label: type,
      count,
      color: MODULE_PALETTE[i % MODULE_PALETTE.length],
    })),
    ...(restTotal > 0
      ? [{ label: 'other', count: restTotal, color: MODULE_OTHER_COLOR }]
      : []),
  ];
  const moduleTotal = stats.app.modules || moduleSegments.reduce((s, seg) => s + seg.count, 0);
  const moduleTypeCount = Object.keys(stats.app.moduleTypes).length;

  // Home Screens Data stacked bar segments.
  const dataDirTotal = stats.disk.dataDir.total;
  const dataSegments = [
    { label: 'Backgrounds',    size: stats.disk.dataDir.backgrounds, color: DATA_DIR_COLORS.backgrounds },
    { label: 'Config Backups', size: stats.disk.dataDir.backups,     color: DATA_DIR_COLORS.backups },
    { label: 'Configuration',  size: stats.disk.dataDir.config,      color: DATA_DIR_COLORS.config },
  ].filter(s => s.size > 0);

  const telemetryOn = config?.settings.telemetryEnabled !== false;

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

        {/* ─── Display (spans the full row on md, 2 of 4 on lg) ─── */}
        <div className="md:col-span-2 rounded-xl bg-hs-panel border border-hs-border-strong p-4 min-w-0 overflow-hidden">
          {/* flex-wrap so the status pill can drop to its own line instead of
              being overlapped by the display picker at minimum browser width. */}
          <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <SectionIcon icon={Monitor} />
              <span className="text-[10px] uppercase tracking-[0.08em] text-hs-text-faint">
                Display
              </span>
              {displayConnected && displayState ? (
                <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ml-1 capitalize whitespace-nowrap ${
                  stateColor === 'success'
                    ? 'text-hs-success bg-hs-success/15 border-hs-success/30'
                    : stateColor === 'warning'
                      ? 'text-hs-warning bg-hs-warning/15 border-hs-warning/30'
                      : 'text-hs-danger bg-hs-danger/15 border-hs-danger/30'
                }`}>
                  {displayState === 'active' ? <PulseDot /> : (
                    <span className={`w-2 h-2 rounded-full ${stateColor === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger'}`} />
                  )}
                  {stateLabel}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ml-1 text-hs-text-faint bg-hs-card border-hs-border-strong whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-hs-text-faint" />
                  Offline
                </span>
              )}
            </div>
            {isMultiDisplay && (
              <select
                value={selectedDisplayId ?? ''}
                onChange={(e) => setSelectedDisplay(e.target.value || null)}
                className="rounded-md border border-hs-border-strong bg-hs-card px-2 py-1 text-[11px] text-hs-text-body hover:bg-hs-hover transition-colors cursor-pointer shrink-0"
                aria-label="Switch display"
              >
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </div>

          {displayConnected && displayStatus ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-xs">
              <div className="text-hs-text-faint">Screen</div>
              <div className="text-hs-text-body truncate">
                {displayStatus.currentScreen.name}
                <span className="text-hs-text-faint ml-1">
                  {displayStatus.currentScreen.index + 1} of {displayStatus.screenCount}
                </span>
              </div>

              {displayStatus.activeProfile && (
                <>
                  <div className="text-hs-text-faint">Profile</div>
                  <div className="text-hs-text-secondary">{displayStatus.activeProfile}</div>
                </>
              )}

              {displayStatus.browserStats && (
                <>
                  <div className="text-hs-text-faint">Viewport</div>
                  <div className="text-hs-text-secondary font-mono tabular-nums whitespace-nowrap truncate">
                    {displayStatus.browserStats.viewportWidth}×{displayStatus.browserStats.viewportHeight} @ {displayStatus.browserStats.devicePixelRatio}×
                  </div>

                  <div className="text-hs-text-faint">Chromium</div>
                  <div className="text-hs-text-secondary font-mono truncate">
                    {displayStatus.browserStats.chromiumVersion ?? 'Not Chromium'}
                  </div>
                </>
              )}

              <div className="text-hs-text-faint">Last seen</div>
              <div className="text-hs-text-secondary">{formatAge(statusAge!)} ago</div>
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
        </div>

        {/* ─── Storage ─── */}
        <div className="rounded-xl bg-hs-panel border border-hs-border-strong p-4 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <SectionIcon icon={HardDrive} />
            <span className="text-[10px] uppercase tracking-[0.08em] text-hs-text-faint">Storage</span>
          </div>
          {stats.disk.total > 0 ? (
            <div className="flex items-center gap-3">
              <RingProgress percent={diskPercent} color={diskColor}>
                <span className="text-[18px] font-semibold text-hs-text-primary leading-none tabular-nums">
                  {Math.round(diskPercent)}
                  <span className="text-hs-text-faint text-[11px]">%</span>
                </span>
              </RingProgress>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-hs-text-faint uppercase tracking-wider">Used</div>
                {/* Flex-wrap so the unit ("GB") can drop to its own line on very
                    narrow columns instead of overflowing past the card edge.
                    The "value / value" pair stays nowrap to never split. */}
                <div className="text-sm text-hs-text-body font-mono tabular-nums flex flex-wrap items-baseline gap-x-1">
                  <span className="whitespace-nowrap">
                    {splitBytes(stats.disk.used).value} / {splitBytes(stats.disk.total).value}
                  </span>
                  <span className="text-hs-text-faint">{splitBytes(stats.disk.total).unit}</span>
                </div>
                <div className="text-[11px] text-hs-text-faint mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
                  <span className={`w-1 h-1 rounded-full self-center ${
                    diskColor === 'success' ? 'bg-hs-success' :
                    diskColor === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger'
                  }`} />
                  <span className="font-mono tabular-nums text-hs-text-muted whitespace-nowrap">
                    {formatBytes(stats.disk.free)}
                  </span>
                  <span>free</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-hs-text-faint">Disk stats unavailable</p>
          )}
        </div>

        {/* ─── Memory ─── */}
        <div className="rounded-xl bg-hs-panel border border-hs-border-strong p-4 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <SectionIcon icon={Cpu} />
            <span className="text-[10px] uppercase tracking-[0.08em] text-hs-text-faint">Memory</span>
          </div>
          <div className="flex items-center gap-3">
            <RingProgress percent={memPercent} color={memColor}>
              <span className="text-[18px] font-semibold text-hs-text-primary leading-none tabular-nums">
                {Math.round(memPercent)}
                <span className="text-hs-text-faint text-[11px]">%</span>
              </span>
            </RingProgress>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-hs-text-faint uppercase tracking-wider">In use</div>
              <div className="text-sm text-hs-text-body font-mono tabular-nums flex flex-wrap items-baseline gap-x-1">
                <span className="whitespace-nowrap">
                  {splitBytes(stats.memory.used).value} / {splitBytes(stats.memory.total).value}
                </span>
                <span className="text-hs-text-faint">{splitBytes(stats.memory.total).unit}</span>
              </div>
              <div className="text-[11px] text-hs-text-faint mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
                <span className={`w-1 h-1 rounded-full self-center ${
                  memColor === 'success' ? 'bg-hs-success' :
                  memColor === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger'
                }`} />
                <span className="font-mono tabular-nums text-hs-text-muted whitespace-nowrap">
                  {formatBytes(stats.memory.free)}
                </span>
                <span>free</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          TIER 2 — Detailed sections
          ============================================================ */}
      <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">

        {/* ─── Display Hardware (only the fields the hero doesn't cover) ─── */}
        <section>
          <SectionHeading icon={Chrome} title="Display Hardware" />
          {displayStatus?.browserStats ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
                <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">GPU</div>
                <div className="text-xs text-hs-text-secondary mt-0.5 truncate"
                     title={displayStatus.browserStats.webglRenderer ?? 'WebGL unavailable'}>
                  {displayStatus.browserStats.webglRenderer ?? 'WebGL unavailable'}
                </div>
              </div>
              <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
                <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">CPU cores</div>
                <div className="text-xs text-hs-text-secondary mt-0.5 font-mono tabular-nums">
                  {displayStatus.browserStats.hardwareConcurrency ?? 'Unknown'}
                </div>
              </div>
              <div className="rounded-md bg-hs-hover border border-hs-border-strong px-3 py-2.5">
                <div className="text-[10px] text-hs-text-faint uppercase tracking-wider">Device memory</div>
                <div className="text-xs text-hs-text-secondary mt-0.5 font-mono tabular-nums">
                  {displayStatus.browserStats.deviceMemory !== null
                    ? `${displayStatus.browserStats.deviceMemory} GB`
                    : 'Unknown'}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-hs-text-faint">
              Browser info is reported by the display client. No display connected
              {activeDisplay ? <> for <span className="text-hs-text-secondary">{activeDisplay.name}</span></> : null}.
            </p>
          )}
        </section>

        {/* ─── Data Cache ─── */}
        <section>
          <SectionHeading
            icon={Database}
            title="Data Cache"
            trailing={cacheStats && cacheStats.details.length > 0 ? (
              <button
                onClick={() => setShowCacheDetails(!showCacheDetails)}
                className="text-[11px] text-hs-accent hover:text-hs-accent-hover"
              >
                {showCacheDetails ? 'Hide details' : 'Show details'}
              </button>
            ) : null}
          />
          {displayConnected && cacheStats ? (
            <div className="space-y-3">
              {/* Column on narrow viewports (hit-rate above, mini-stats below),
                  row once there's enough room for the 160px card + 2×2 grid. */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 sm:items-center">
                {/* Headline hit rate */}
                <div className="rounded-lg bg-hs-hover border border-hs-border-strong px-5 py-4 w-full sm:w-[160px] text-center shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-hs-text-faint">Hit rate</div>
                  <div className={`text-[34px] font-semibold leading-none mt-1 tabular-nums ${
                    hitRateColor === 'success' ? 'text-hs-success' :
                    hitRateColor === 'warning' ? 'text-hs-warning' : 'text-hs-danger'
                  }`}>
                    {hitRate > 0 ? hitRate.toFixed(1) : '—'}
                    {hitRate > 0 && <span className="text-hs-text-faint text-lg">%</span>}
                  </div>
                  <div className="text-[11px] text-hs-text-faint mt-1.5 font-mono tabular-nums">
                    {cacheStats.hits.toLocaleString()} / {(cacheStats.hits + cacheStats.misses).toLocaleString()}
                  </div>
                </div>
                {/* Mini stats — 1 col on phones, 2 cols once there's room. gap-x-2
                    between label and value so they never butt up against each
                    other, and both pieces are `whitespace-nowrap` + `min-w-0` so
                    long compound values like "25 / 100" can't wrap onto their
                    own lines the way they did before. */}
                <div className="grid grid-cols-2 gap-2 flex-1 min-w-0 self-stretch sm:self-start">
                  <CacheStatTile label="Entries"  value={`${cacheStats.entries} / ${cacheStats.maxEntries}`} />
                  <CacheStatTile label="Fresh"    value={String(cacheStats.fresh)}    tone="success" />
                  <CacheStatTile label="Stale"    value={String(cacheStats.stale)}    tone={cacheStats.stale > 0 ? 'warning' : 'neutral'} />
                  <CacheStatTile label="Inflight" value={String(cacheStats.inflight)} />
                </div>
              </div>
              {/* Entries fill bar */}
              <div>
                <div className="flex flex-wrap items-center justify-between text-[11px] mb-1 gap-x-3 gap-y-0.5">
                  <span className="text-hs-text-faint">Entries fill</span>
                  <span className="text-hs-text-secondary font-mono tabular-nums whitespace-nowrap">
                    {cacheStats.entries} / {cacheStats.maxEntries}
                  </span>
                </div>
                <ThinBar percent={cachePercent} color={percentColor(cachePercent)} />
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

        {/* ─── CPU & Thermal ─── */}
        <section>
          <SectionHeading
            icon={Thermometer}
            title="CPU & Thermal"
            trailing={hwSource ? (
              <span className="text-[10px] text-hs-text-faint uppercase tracking-wider">
                {hwSource === 'reporter' ? 'Reporter' : 'Hub (local)'}
              </span>
            ) : null}
          />
          {hwStats ? (
            <div className="rounded-lg bg-hs-hover border border-hs-border-strong p-3.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 text-xs items-center">
                <div className="text-hs-text-faint">Pi model</div>
                <div className="text-hs-text-secondary text-right truncate">
                  {hwStats.piModel ?? 'Unavailable'}
                </div>

                <div className="text-hs-text-faint">CPU</div>
                <div className="text-hs-text-secondary text-right truncate">
                  {hwStats.cpuModel ?? 'Unknown'} · {hwStats.cpuCores} cores
                </div>

                <div className="text-hs-text-faint">Load (1/5/15m)</div>
                <div className="text-hs-text-secondary text-right font-mono tabular-nums">
                  {hwStats.load1.toFixed(2)} / {hwStats.load5.toFixed(2)} / {hwStats.load15.toFixed(2)}
                </div>

                <div className="text-hs-text-faint">Throttling</div>
                <div className="text-right">
                  {hwStats.throttled ? (
                    hwStats.throttled.active ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-hs-danger bg-hs-danger/15 px-2 py-0.5 rounded-full border border-hs-danger/30">
                        <span className="w-1 h-1 rounded-full bg-hs-danger" />
                        Active ({hwStats.throttled.raw})
                      </span>
                    ) : hwStats.throttled.previouslyThrottled ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-hs-warning bg-hs-warning/15 px-2 py-0.5 rounded-full border border-hs-warning/30">
                        <span className="w-1 h-1 rounded-full bg-hs-warning" />
                        Previously throttled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-hs-success bg-hs-success/15 px-2 py-0.5 rounded-full border border-hs-success/30">
                        <span className="w-1 h-1 rounded-full bg-hs-success" />
                        OK
                      </span>
                    )
                  ) : (
                    <span className="text-hs-text-faint">Unavailable</span>
                  )}
                </div>

                <div className="text-hs-text-faint">Temperature</div>
                <div className="text-right">
                  {hwStats.cpuTempC !== null ? (
                    <span className={`inline-flex items-baseline gap-1 text-sm font-semibold px-2.5 py-1 rounded-md border tabular-nums ${
                      tempColor === 'danger'
                        ? 'text-hs-danger bg-hs-danger/12 border-hs-danger/25'
                        : tempColor === 'warning'
                          ? 'text-hs-warning bg-hs-warning/12 border-hs-warning/25'
                          : 'text-hs-success bg-hs-success/12 border-hs-success/25'
                    }`}>
                      <span>{hwStats.cpuTempC.toFixed(1)}</span>
                      <span className="text-[11px] font-normal">°C</span>
                    </span>
                  ) : (
                    <span className="text-hs-text-faint">Unavailable</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-hs-text-faint">
              No hardware stats reported yet for this display. Install home-screens-reporter.timer on its Pi.
            </p>
          )}
        </section>

        {/* ─── Home Screens Data ─── */}
        <section>
          <SectionHeading icon={FolderTree} title="Home Screens Data" />
          {dataDirTotal > 0 ? (
            <div>
              <div className="flex flex-wrap items-center justify-between text-[11px] mb-1.5 gap-x-3 gap-y-0.5">
                <span className="text-hs-text-faint">Total app data</span>
                <span className="text-hs-text-secondary font-mono tabular-nums whitespace-nowrap">
                  {formatBytes(dataDirTotal)}
                </span>
              </div>
              <div className="flex h-2.5 rounded-md overflow-hidden bg-hs-card border border-hs-border-strong">
                {dataSegments.map((seg) => (
                  <span
                    key={seg.label}
                    title={`${seg.label} ${formatBytes(seg.size)}`}
                    style={{ background: seg.color, width: `${(seg.size / dataDirTotal) * 100}%` }}
                    className="transition-[filter] hover:brightness-125"
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
                {dataSegments.map((seg) => (
                  <span key={seg.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: seg.color }} />
                    <span className="text-hs-text-muted">{seg.label}</span>
                    <span className="text-hs-text-faint font-mono tabular-nums">
                      {formatBytes(seg.size)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-hs-text-faint">No app data yet.</p>
          )}
        </section>

        {/* ─── Configuration ─── */}
        <section>
          <SectionHeading icon={SlidersHorizontal} title="Configuration" />

          <div className="grid grid-cols-3 gap-3">
            <CountTile label="Screens"  value={stats.app.screens} />
            <CountTile label="Modules"  value={stats.app.modules} />
            <CountTile label="Profiles" value={stats.app.profiles} />
          </div>

          {moduleSegments.length > 0 && moduleTotal > 0 && (
            <div className="mt-4">
              {/* gap-x + flex-wrap means the summary wraps to two lines
                  cleanly when the viewport's too narrow, instead of the
                  mid-dot breaking "· 37 types" mid-phrase. */}
              <div className="flex flex-wrap items-center justify-between text-[11px] mb-1.5 gap-x-3 gap-y-0.5">
                <span className="text-hs-text-faint">Module breakdown</span>
                <span className="text-hs-text-faint font-mono tabular-nums whitespace-nowrap">
                  {moduleTotal} modules · {moduleTypeCount} types
                </span>
              </div>
              <div className="flex h-2.5 rounded-md overflow-hidden bg-hs-card border border-hs-border-strong">
                {moduleSegments.map((seg) => (
                  <span
                    key={seg.label}
                    title={`${seg.label} ×${seg.count}`}
                    style={{ background: seg.color, width: `${(seg.count / moduleTotal) * 100}%` }}
                    className="transition-[filter] hover:brightness-125"
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 text-[11px]">
                {moduleSegments.map((seg) => (
                  <span key={seg.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: seg.color }} />
                    <span className="text-hs-text-muted">{seg.label}</span>
                    <span className="text-hs-text-faint tabular-nums">{seg.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between text-[11px] mb-2 gap-x-3 gap-y-0.5">
              <span className="text-hs-text-faint">Integrations</span>
              <span className="text-hs-text-faint font-mono tabular-nums whitespace-nowrap">
                {configuredIntegrationKeys.length} / {integrationKeys.length} configured
              </span>
            </div>
            {/* 2 cols on narrow, 3 on sm+. `min-w-0` on each row + `truncate`
                on the label prevents a long single-word name like
                "OpenWeatherMap" from bleeding into the next column (it has no
                space to break on, so without truncate it just overflows). */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
              {integrationKeys.map((key) => {
                const meta = INTEGRATION_META[key];
                const configured = configuredIntegrationKeys.includes(key);
                return (
                  <div key={key} className="flex items-center gap-2 text-xs min-w-0">
                    <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-md text-[10px] font-semibold font-mono border shrink-0 ${
                      configured
                        ? 'bg-hs-success/20 text-hs-success border-hs-success/35'
                        : 'bg-hs-card text-hs-text-muted border-hs-border-strong'
                    }`}>
                      {meta.initials}
                    </span>
                    <span
                      title={meta.label}
                      className={`truncate ${configured ? 'text-hs-text-secondary' : 'text-hs-text-faint'}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Server ─── */}
        <section>
          <SectionHeading
            icon={Server}
            title="Server"
            trailing={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={generateBundle}
                  disabled={bundleState === 'generating'}
                >
                  {bundleState === 'generating' ? 'Generating…' : 'Diagnostics bundle'}
                </Button>
                <Button variant="secondary" size="sm" onClick={fetchStats}>
                  Refresh
                </Button>
              </>
            }
          />
          {bundleState === 'error' && bundleError && (
            <p className="text-xs text-hs-danger mb-2">
              Bundle generation failed: {bundleError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <div className="text-hs-text-faint">Hostname</div>
            <div className="text-hs-text-secondary font-mono">{stats.os.hostname}</div>
            <div className="text-hs-text-faint">Platform</div>
            <div className="text-hs-text-secondary">{stats.os.platform} / {stats.os.arch}</div>
            <div className="text-hs-text-faint">Node.js</div>
            <div className="text-hs-text-secondary font-mono">{stats.os.nodeVersion}</div>
            <div className="text-hs-text-faint">Uptime</div>
            <div className="text-hs-text-secondary">{formatUptime(stats.os.uptime)}</div>
          </div>
        </section>

        {/* ─── Anonymous Telemetry ─── */}
        <section>
          <SectionHeading icon={BarChart3} title="Anonymous Telemetry" />
          <div className="space-y-3">
            <p className="text-xs text-hs-text-muted leading-relaxed">
              Home Screens collects anonymous usage statistics to help prioritize features
              and understand how the app is used. No personal data, IP addresses, or content
              is ever collected.
            </p>

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
              className="flex items-center gap-1 text-[11px] text-hs-accent hover:text-hs-accent-hover"
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
    </div>
  );
}
