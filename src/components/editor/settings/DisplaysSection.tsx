'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Trash2, Pencil, Plus, RefreshCw, ExternalLink, X, LayoutGrid } from 'lucide-react';
import { useEditorStore, orientDimensions } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import Button from '@/components/ui/Button';
import { editorFetch } from '@/lib/editor-fetch';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import type { DisplayNode } from '@/types/config';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

interface ReportedViewport {
  width: number;
  height: number;
}

export interface ViewportReport extends ReportedViewport {
  lastSeen: number;
  clientAddress?: string;
}

interface UnadoptedDisplay {
  id: string;
  lastSeen: number | null;
  reportedViewport?: ReportedViewport;
  viewportReports?: ViewportReport[];
}

/**
 * Shape of the per-display entry returned by GET /api/displays. Intentionally
 * does NOT extend `DisplayNode` — the route only returns metadata (id, name,
 * dims, screenCount), not the full `screens` array, to avoid leaking module
 * configs (potentially containing plugin secrets) and to keep the poll
 * payload tiny even for households with many displays.
 */
interface DisplayApiEntry {
  id: string;
  name: string;
  screenCount: number;
  displayWidth?: number;
  displayHeight?: number;
  displayTransform?: 'normal' | '90' | '180' | '270';
  lastSeen: number | null;
  reportedViewport?: ReportedViewport;
  viewportReports?: ViewportReport[];
  status: { displayState?: string; activeProfile?: string | null } | null;
}

interface DisplaysApiResponse {
  displays: DisplayApiEntry[];
  unadopted: UnadoptedDisplay[];
}

/** "5s ago", "3m ago", "2h ago", "—" */
function formatLastSeen(lastSeen: number | null): string {
  if (!lastSeen) return '—';
  const diff = Date.now() - lastSeen;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

/**
 * Humanize the raw client address that `getClientIP` returned from
 * `x-forwarded-for` / `x-real-ip` / the connection peer. IPv6 loopback
 * collapses to "localhost"; IPv4-mapped-IPv6 addresses drop their
 * `::ffff:` prefix so the editor shows plain dotted-quad IPs instead of
 * mixed-form strings; everything else is passed through. Returns null
 * for an empty / missing value so the caller can skip rendering the row.
 */
// Exported for unit tests — these are pure helpers with no React dependencies.
export function formatClientAddress(addr: string | undefined | null): string | null {
  if (!addr) return null;
  const trimmed = addr.trim();
  if (!trimmed) return null;
  if (trimmed === '::1' || trimmed === '127.0.0.1' || trimmed === 'localhost') {
    return 'localhost';
  }
  if (trimmed.toLowerCase().startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export interface CollapsedReport {
  width: number;
  height: number;
  lastSeen: number;
  clientAddress?: string;
  /** How many raw client reports collapsed into this row (usually 1). */
  count: number;
}

/**
 * Group raw per-client viewport reports by (source address, dimensions).
 * Two chromium tabs at the same URL produce two distinct `clientId`s but
 * obviously come from the same machine at the same resolution, so they
 * should display as one row with a "(×2)" badge rather than two
 * identical-looking entries. Dimensions alone isn't enough to collapse —
 * we want to keep "two different devices" distinct when they happen to
 * match resolution, so the source IP is part of the key.
 *
 * The grouping key uses the NORMALIZED address (via `formatClientAddress`)
 * so raw aliases like `::1` and `127.0.0.1` collapse together instead of
 * showing up as two separate "same machine" rows.
 */
export function collapseReports(reports: ViewportReport[]): CollapsedReport[] {
  const grouped = new Map<string, CollapsedReport>();
  for (const r of reports) {
    // Normalize the address the same way the UI does so "::1" and
    // "localhost" collapse into a single row instead of rendering twice.
    const addrKey = formatClientAddress(r.clientAddress) ?? '';
    const key = `${addrKey}|${r.width}x${r.height}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      if (r.lastSeen > existing.lastSeen) existing.lastSeen = r.lastSeen;
    } else {
      grouped.set(key, {
        width: r.width,
        height: r.height,
        lastSeen: r.lastSeen,
        clientAddress: r.clientAddress,
        count: 1,
      });
    }
  }
  return [...grouped.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Online if a heartbeat arrived in the last 30s, idle within 5min, otherwise offline. */
function statusDot(lastSeen: number | null): string {
  if (!lastSeen) return 'bg-neutral-700';
  const diff = Date.now() - lastSeen;
  if (diff < 30_000) return 'bg-green-500';
  if (diff < 300_000) return 'bg-amber-500';
  return 'bg-neutral-600';
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Returns the screen count for a display, transparently handling both owned screens and the legacy screenIds-from-pool model. */
function displayScreenCount(display: DisplayNode): number {
  if (display.screens) return display.screens.length;
  if (display.screenIds) return display.screenIds.length;
  return 0;
}

/* ─── Add / edit form ──────────────────────────────── */

interface DisplayFormProps {
  initial?: DisplayNode;
  prefilledId?: string;
  prefilledViewport?: ReportedViewport;
  onCancel: () => void;
  onSubmit: (display: DisplayNode) => void;
  takenIds: Set<string>;
}

function DisplayForm({ initial, prefilledId, prefilledViewport, onCancel, onSubmit, takenIds }: DisplayFormProps) {
  const { config } = useEditorStore();
  const [name, setName] = useState(initial?.name ?? '');
  const [id, setId] = useState(initial?.id ?? prefilledId ?? '');
  const [idTouched, setIdTouched] = useState(!!initial || !!prefilledId);

  // Default dimensions: existing display value > self-reported viewport > global setting > default.
  // For an existing display we also orient the initial values to match its
  // stored rotation so the form shows the actual canvas shape, not the raw
  // numbers in whatever order they happened to be stored.
  //
  // Note: a polling Pi can legitimately report `window.innerWidth === 0`
  // during initial layout or in a zero-sized popup, so we treat any
  // non-positive viewport value as "missing" rather than letting `??` lock
  // the form at width 0 and rejecting the user on submit.
  const initialTransform: 'normal' | '90' | '180' | '270' =
    initial?.displayTransform ?? 'normal';
  const viewportW =
    prefilledViewport?.width && prefilledViewport.width > 0 ? prefilledViewport.width : undefined;
  const viewportH =
    prefilledViewport?.height && prefilledViewport.height > 0 ? prefilledViewport.height : undefined;
  const initialRawW =
    initial?.displayWidth
    ?? viewportW
    ?? config?.settings.displayWidth
    ?? DEFAULT_DISPLAY_WIDTH;
  const initialRawH =
    initial?.displayHeight
    ?? viewportH
    ?? config?.settings.displayHeight
    ?? DEFAULT_DISPLAY_HEIGHT;
  const initialOriented = (() => {
    const wantPortrait = initialTransform === '90' || initialTransform === '270';
    const long = Math.max(initialRawW, initialRawH);
    const short = Math.min(initialRawW, initialRawH);
    return wantPortrait ? { w: short, h: long } : { w: long, h: short };
  })();
  const [width, setWidth] = useState<number>(initialOriented.w);
  const [height, setHeight] = useState<number>(initialOriented.h);
  const [transform, setTransform] = useState<'normal' | '90' | '180' | '270'>(initialTransform);

  const [error, setError] = useState<string | null>(null);

  /**
   * Change the rotation and auto-swap the dimensions if the new orientation
   * doesn't match. Keeps the form visibly consistent with the rotation label
   * ("Normal (landscape)" always shows a wider-than-tall canvas, etc.).
   */
  const handleTransformChange = (next: 'normal' | '90' | '180' | '270') => {
    setTransform(next);
    const wantPortrait = next === '90' || next === '270';
    const isPortrait = height > width;
    if (wantPortrait !== isPortrait) {
      const w = width;
      setWidth(height);
      setHeight(w);
    }
  };

  // Auto-derive ID from name until the user types into the ID field
  useEffect(() => {
    if (!idTouched && !initial) {
      setId(slugify(name));
    }
  }, [name, idTouched, initial]);

  const handleSubmit = () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    if (!id || !SLUG_RE.test(id)) {
      setError('ID must be lowercase letters, digits, and hyphens (e.g. "kitchen")');
      return;
    }
    if (!initial && takenIds.has(id)) {
      setError(`A display with ID "${id}" already exists`);
      return;
    }
    if (!Number.isInteger(width) || width <= 0 || width > 16384) {
      setError('Width must be a positive integer ≤ 16384');
      return;
    }
    if (!Number.isInteger(height) || height <= 0 || height > 16384) {
      setError('Height must be a positive integer ≤ 16384');
      return;
    }

    // Normalize the stored dimensions so the long edge is on whichever axis
    // the rotation demands. This keeps data consistent even if something
    // upstream (tests, imports, hand-edits) passed a contradictory pair.
    const wantPortrait = transform === '90' || transform === '270';
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    const finalWidth = wantPortrait ? short : long;
    const finalHeight = wantPortrait ? long : short;

    // Edits: preserve the existing screen-ownership shape (either `screens`
    // or legacy `screenIds`) via the `...initial` spread. The explicit
    // followups below nail down the intent — this form doesn't know or
    // care which model the display uses, and we shouldn't quietly drop one
    // on submit just because the form only has inputs for name/dims.
    // Creates: no `initial`, so neither branch fires and the store's
    // `addDisplay` defaults `screens: []` for a fresh owned-screens display.
    onSubmit({
      ...initial,
      id,
      name: trimmedName,
      displayWidth: finalWidth,
      displayHeight: finalHeight,
      displayTransform: transform,
      ...(initial?.screens ? { screens: initial.screens } : {}),
      ...(initial?.screenIds && !initial?.screens
        ? { screenIds: initial.screenIds }
        : {}),
    });
  };

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-neutral-200">
          {initial ? 'Edit Display' : prefilledId ? `Adopt ${prefilledId}` : 'Add Display'}
        </h4>
        <button
          onClick={onCancel}
          className="text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="block">
        <span className="text-xs text-neutral-400">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kitchen Touchscreen"
          className="mt-1 block w-full rounded-md bg-neutral-900 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
        />
      </label>

      <label className="block">
        <span className="text-xs text-neutral-400">
          ID <span className="text-neutral-600">(used in URL: /display/&lt;id&gt;)</span>
        </span>
        <input
          type="text"
          value={id}
          // Lock the ID for both edits and adoptions: editing breaks existing
          // bookmarks, and adopting under a different ID would silently fail
          // because the polling Pi keeps using its original ID.
          disabled={!!initial || !!prefilledId}
          onChange={(e) => {
            setId(e.target.value);
            setIdTouched(true);
          }}
          placeholder="kitchen"
          className="mt-1 block w-full rounded-md bg-neutral-900 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
        />
        {prefilledId && !initial && (
          <p className="text-[11px] text-neutral-500 mt-1">
            ID is locked to match the polling display.
          </p>
        )}
      </label>

      {/* Per-display dimensions */}
      <div>
        <span className="text-xs text-neutral-400 block mb-2">
          Resolution
          {prefilledViewport && (
            <span className="ml-2 text-neutral-600">
              (reported by display: {prefilledViewport.width} × {prefilledViewport.height})
            </span>
          )}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-neutral-500">Width</span>
            <input
              type="number"
              min={1}
              max={16384}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md bg-neutral-900 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500 tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-neutral-500">Height</span>
            <input
              type="number"
              min={1}
              max={16384}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md bg-neutral-900 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500 tabular-nums"
            />
          </label>
        </div>
        <p className="text-[11px] text-neutral-500 mt-2">
          Set this to match the physical display the kiosk is rendering on.
          Modules will be laid out against this canvas size when you edit
          this display&apos;s screens.
        </p>
      </div>

      <label className="block">
        <span className="text-xs text-neutral-400">Rotation</span>
        <select
          value={transform}
          onChange={(e) =>
            handleTransformChange(e.target.value as 'normal' | '90' | '180' | '270')
          }
          className="mt-1 block w-full rounded-md bg-neutral-900 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          <option value="normal">Normal (landscape)</option>
          <option value="90">90° clockwise (portrait)</option>
          <option value="180">180° (inverted)</option>
          <option value="270">270° clockwise (portrait)</option>
        </select>
        <p className="text-[11px] text-neutral-500 mt-1">
          Picks the canvas orientation. The width and height above auto-swap
          so the longer edge matches whichever axis the rotation chose.
        </p>
      </label>

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit}>
          {initial ? 'Save changes' : 'Add display'}
        </Button>
      </div>
    </div>
  );
}

/* ─── Main section ────────────────────────────────── */

export default function DisplaysSection() {
  const router = useRouter();
  const { config, addDisplay, updateDisplay, removeDisplay, saveConfig, setSelectedDisplay } = useEditorStore();

  const [apiData, setApiData] = useState<DisplaysApiResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await editorFetch('/api/displays');
      if (res.ok) {
        const data = (await res.json()) as DisplaysApiResponse;
        setApiData(data);
      }
    } catch {
      // Ignore — keep previous data
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial load + 5s refresh while the tab is open. The route reads config
  // through a tiny per-process cache (~1.5s TTL) so concurrent polls from the
  // editor and unadopted Pis collapse to a single disk read.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!config) return null;

  const displays = config.displays ?? [];
  const takenIds = new Set(displays.map((d) => d.id));
  const unadopted = apiData?.unadopted ?? [];
  const heartbeats = new Map(apiData?.displays.map((d) => [d.id, d]) ?? []);

  /**
   * Run a local mutation and immediately persist it to disk. Display CRUD
   * auto-saves (unlike profiles, which use a separate Save button) because
   * the user's mental model is "I added this display, now it exists" — and
   * anything less means a navigation to `/display/<id>` reads stale config
   * from disk and hits DisplayNotFound even though the UI shows success.
   */
  const mutateAndSave = async (mutate: () => void) => {
    mutate();
    setSaving(true);
    setSaveMessage(null);
    try {
      await saveConfig();
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(null), 2000);
      refresh();
    } catch {
      setSaveMessage('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (display: DisplayNode) => {
    setAdding(false);
    setAdoptingId(null);
    await mutateAndSave(() => addDisplay(display));
  };

  const handleUpdate = async (id: string, display: DisplayNode) => {
    setEditingId(null);
    await mutateAndSave(() => updateDisplay(id, display));
  };

  const handleDelete = async (display: DisplayNode) => {
    if (await useConfirmStore.getState().confirm(`Remove display "${display.name}"?`)) {
      await mutateAndSave(() => removeDisplay(display.id));
    }
  };

  /**
   * "Edit screens" — switch the editor's selected display to this one and
   * navigate back to the canvas. The editor's screen list and dimensions
   * automatically follow the selection.
   */
  const handleEditScreens = (display: DisplayNode) => {
    setSelectedDisplay(display.id);
    router.push(`/editor?display=${encodeURIComponent(display.id)}`);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-neutral-300 uppercase tracking-wider">
          Displays
        </h3>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1 disabled:opacity-50"
          title="Refresh heartbeats"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Run multiple Pis from a single hub. Each display has its own screens,
        designed at its own resolution and orientation, but shares chores,
        meals, calendars and API keys with the rest of your home. Adding the
        first display also creates a <strong>Main</strong> entry for the hub
        Pi so its kiosk keeps showing what it was showing before.
      </p>

      {/* Registered displays */}
      <div className="space-y-2 mb-4">
        {displays.map((display) => {
          const heartbeat = heartbeats.get(display.id);
          const lastSeen = heartbeat?.lastSeen ?? null;
          const editing = editingId === display.id;
          const oriented = display.displayWidth && display.displayHeight
            ? orientDimensions(display.displayWidth, display.displayHeight, display.displayTransform)
            : null;
          const dimensions = oriented ? `${oriented.width}×${oriented.height}` : null;
          const screenCount = displayScreenCount(display);
          // The hub's "main" display has its resolution / orientation /
          // screens driven by the global Display settings tab, so editing
          // those fields here would duplicate the source of truth. Hide
          // the per-display edit form and delete button for main entirely.
          const isMainDisplay = display.id === 'main';

          if (editing && !isMainDisplay) {
            return (
              <DisplayForm
                key={display.id}
                initial={display}
                prefilledViewport={heartbeat?.reportedViewport}
                takenIds={new Set([...takenIds].filter((id) => id !== display.id))}
                onCancel={() => setEditingId(null)}
                onSubmit={(updated) => handleUpdate(display.id, updated)}
              />
            );
          }

          const heartbeatViewports = collapseReports(heartbeat?.viewportReports ?? []);
          const primaryReporter = heartbeatViewports[0];
          // Only warn about "multiple reporters" when they're distinct
          // sources — duplicate tabs from the same IP at the same size
          // collapse into one row so they don't cry wolf.
          const multipleReporters = heartbeatViewports.length > 1;

          return (
            <div
              key={display.id}
              className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 flex items-start gap-3"
            >
              <Monitor className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-200 truncate">
                    {display.name}
                  </span>
                  <code className="text-[10px] text-neutral-500 font-mono">
                    {display.id}
                  </code>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-500 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot(lastSeen)}`} />
                    {formatLastSeen(lastSeen)}
                  </span>
                  {formatClientAddress(primaryReporter?.clientAddress) && (
                    <span className="font-mono text-neutral-600">
                      from {formatClientAddress(primaryReporter?.clientAddress)}
                    </span>
                  )}
                  <span>{screenCount} screen{screenCount === 1 ? '' : 's'}</span>
                  {dimensions && <span className="tabular-nums">{dimensions}</span>}
                  {display.displayTransform && display.displayTransform !== 'normal' && (
                    <span>↻ {display.displayTransform}°</span>
                  )}
                  {heartbeat?.status?.displayState && (
                    <span className="capitalize">{heartbeat.status.displayState}</span>
                  )}
                </div>
                {multipleReporters && (
                  <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-1.5 text-[11px] text-amber-300">
                    <div className="font-medium mb-1">
                      {heartbeatViewports.length} distinct clients reporting for this display
                    </div>
                    <ul className="space-y-0.5 text-neutral-400">
                      {heartbeatViewports.map((v, i) => {
                        const addr = formatClientAddress(v.clientAddress);
                        return (
                          <li key={`${v.clientAddress ?? '?'}-${v.width}x${v.height}-${i}`} className="tabular-nums">
                            {addr && (
                              <span className="font-mono text-amber-300/80">{addr}</span>
                            )}
                            {addr && <span className="text-neutral-600"> · </span>}
                            {v.width}×{v.height}
                            {v.count > 1 && (
                              <span className="text-neutral-600"> · ×{v.count} tabs</span>
                            )}
                            <span className="text-neutral-600"> · {formatLastSeen(v.lastSeen)}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-neutral-500 mt-1">
                      Only one physical display should POST for each ID. Check the
                      source IPs above to find stray reporters (duplicate installs,
                      a hub kiosk pointed at the wrong URL, or stale chromium tabs).
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={() => handleEditScreens(display)}
                className="text-blue-400 hover:text-blue-300 transition-colors shrink-0 flex items-center gap-1 text-xs"
                title="Edit this display's screens in the canvas"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Edit screens
              </button>
              <a
                href={`/display/${display.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
                title="Open display URL"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {!isMainDisplay && (
                <>
                  <button
                    onClick={() => setEditingId(display.id)}
                    className="text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
                    title="Edit name / resolution"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(display)}
                    className="text-neutral-600 hover:text-red-400 transition-colors shrink-0"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {displays.length === 0 && !adding && (
          <div className="rounded-md border border-dashed border-neutral-700 px-3 py-4 text-xs text-neutral-500 text-center">
            No displays registered. Add one below or adopt a Pi that has already connected.
          </div>
        )}
      </div>

      {/* Add form */}
      {adding && !adoptingId && (
        <div className="mb-4">
          <DisplayForm
            takenIds={takenIds}
            onCancel={() => setAdding(false)}
            onSubmit={handleAdd}
          />
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-4"
        >
          <Plus className="w-3.5 h-3.5" />
          Add display
        </button>
      )}

      {/* Unadopted */}
      {unadopted.length > 0 && (
        <div className="border-t border-neutral-700 pt-4 mt-4">
          <h4 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Unadopted Displays
          </h4>
          <p className="text-xs text-neutral-500 mb-3">
            These Pis are connected to the hub but have not been registered yet.
            Click <strong>Adopt</strong> to assign them screens.
          </p>
          <div className="space-y-2">
            {unadopted.map((un) => {
              const isAdopting = adoptingId === un.id;
              if (isAdopting) {
                return (
                  <DisplayForm
                    key={un.id}
                    prefilledId={un.id}
                    prefilledViewport={un.reportedViewport}
                    takenIds={takenIds}
                    onCancel={() => setAdoptingId(null)}
                    onSubmit={handleAdd}
                  />
                );
              }
              const viewports = collapseReports(un.viewportReports ?? []);
              const multipleReporters = viewports.length > 1;
              const soleReporter = viewports.length === 1 ? viewports[0] : null;
              return (
                <div
                  key={un.id}
                  className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3"
                >
                  <Monitor className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono text-amber-200">{un.id}</code>
                    <div className="flex items-center gap-3 text-[11px] text-neutral-500 mt-0.5 flex-wrap">
                      <span>Last seen {formatLastSeen(un.lastSeen)}</span>
                      {soleReporter && (
                        <>
                          <span className="tabular-nums">
                            {soleReporter.width}×{soleReporter.height} reported
                          </span>
                          {formatClientAddress(soleReporter.clientAddress) && (
                            <span className="font-mono text-neutral-600">
                              from {formatClientAddress(soleReporter.clientAddress)}
                            </span>
                          )}
                        </>
                      )}
                      {viewports.length === 0 && un.reportedViewport && (
                        <span className="tabular-nums">
                          {un.reportedViewport.width}×{un.reportedViewport.height} reported
                        </span>
                      )}
                    </div>
                    {multipleReporters && (
                      <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-1.5 text-[11px] text-amber-300">
                        <div className="font-medium mb-1">
                          {viewports.length} clients reporting with this ID
                        </div>
                        <ul className="space-y-0.5 text-neutral-400">
                          {viewports.map((v, i) => {
                            const addr = formatClientAddress(v.clientAddress);
                            return (
                              <li key={`${v.clientAddress ?? '?'}-${v.width}x${v.height}-${i}`} className="tabular-nums">
                                {addr && (
                                  <span className="font-mono text-amber-300/80">{addr}</span>
                                )}
                                {addr && <span className="text-neutral-600"> · </span>}
                                {v.width}×{v.height}
                                <span className="text-neutral-600"> · {formatLastSeen(v.lastSeen)}</span>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="text-neutral-500 mt-1">
                          Two or more clients are POSTing with this display ID.
                          Check the source IPs above to find which device is
                          actually reporting — most often a duplicate
                          <code className="mx-1">--display-id</code> install, a stray
                          chromium tab, or a hub kiosk pointed at the wrong URL.
                        </p>
                      </div>
                    )}
                  </div>
                  <Button variant="secondary" onClick={() => setAdoptingId(un.id)}>
                    Adopt
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-save status toast */}
      {(saving || saveMessage) && (
        <div className="flex items-center gap-2 mt-6 border-t border-neutral-700 pt-4 text-xs">
          {saving && <span className="text-neutral-500">Saving…</span>}
          {!saving && saveMessage && (
            <span className={saveMessage === 'Saved' ? 'text-green-400' : 'text-red-400'}>
              {saveMessage}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
