'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Plus, RefreshCw, X } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import Button from '@/components/ui/Button';
import { editorFetch } from '@/lib/editor-fetch';
import {
  isMainDisplay,
  isValidDisplayId,
  MAX_DISPLAY_DIMENSION,
  orientDimensions,
} from '@/lib/display-filter';
import { formatLastSeen } from '@/lib/time-format';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import type { DisplayNode } from '@/types/config';

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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Returns the screen count for a display. */
function displayScreenCount(display: DisplayNode): number {
  return display.screens.length;
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
    if (!isValidDisplayId(id)) {
      setError('ID must be lowercase letters, digits, and hyphens (e.g. "kitchen")');
      return;
    }
    if (!initial && takenIds.has(id)) {
      setError(`A display with ID "${id}" already exists`);
      return;
    }
    if (!Number.isInteger(width) || width <= 0 || width > MAX_DISPLAY_DIMENSION) {
      setError(`Width must be a positive integer ≤ ${MAX_DISPLAY_DIMENSION}`);
      return;
    }
    if (!Number.isInteger(height) || height <= 0 || height > MAX_DISPLAY_DIMENSION) {
      setError(`Height must be a positive integer ≤ ${MAX_DISPLAY_DIMENSION}`);
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

    // Edits: preserve the existing screens list via the `...initial` spread.
    // Creates: no `initial`, so the store's `addDisplay` defaults
    // `screens: []` for a fresh display.
    onSubmit({
      ...(initial ?? { screens: [] }),
      id,
      name: trimmedName,
      displayWidth: finalWidth,
      displayHeight: finalHeight,
      displayTransform: transform,
    });
  };

  return (
    <div className="rounded-lg border border-hs-border-strong bg-hs-hover p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-hs-text-body">
          {initial ? 'Edit Display' : prefilledId ? `Adopt ${prefilledId}` : 'Add Display'}
        </h4>
        <button
          onClick={onCancel}
          className="text-hs-text-faint hover:text-hs-text-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="block">
        <span className="text-xs text-hs-text-muted">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kitchen Touchscreen"
          className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
        />
      </label>

      <label className="block">
        <span className="text-xs text-hs-text-muted">
          ID <span className="text-hs-text-faint">(used in URL: /display/&lt;id&gt;)</span>
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
          className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent font-mono disabled:opacity-50"
        />
        {prefilledId && !initial && (
          <p className="text-[11px] text-hs-text-faint mt-1">
            ID is locked to match the polling display.
          </p>
        )}
      </label>

      {/* Per-display dimensions */}
      <div>
        <span className="text-xs text-hs-text-muted block mb-2">
          Resolution
          {prefilledViewport && (
            <span className="ml-2 text-hs-text-faint">
              (reported by display: {prefilledViewport.width} × {prefilledViewport.height})
            </span>
          )}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-hs-text-faint">Width</span>
            <input
              type="number"
              min={1}
              max={MAX_DISPLAY_DIMENSION}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-hs-text-faint">Height</span>
            <input
              type="number"
              min={1}
              max={MAX_DISPLAY_DIMENSION}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
            />
          </label>
        </div>
        <p className="text-[11px] text-hs-text-faint mt-2">
          Set this to match the physical display the kiosk is rendering on.
          Modules will be laid out against this canvas size when you edit
          this display&apos;s screens.
        </p>
      </div>

      <label className="block">
        <span className="text-xs text-hs-text-muted">Rotation</span>
        <select
          value={transform}
          onChange={(e) =>
            handleTransformChange(e.target.value as 'normal' | '90' | '180' | '270')
          }
          className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
        >
          <option value="normal">Normal (landscape)</option>
          <option value="90">90° clockwise (portrait)</option>
          <option value="180">180° (inverted)</option>
          <option value="270">270° clockwise (portrait)</option>
        </select>
        <p className="text-[11px] text-hs-text-faint mt-1">
          Picks the canvas orientation. The width and height above auto-swap
          so the longer edge matches whichever axis the rotation chose.
        </p>
      </label>

      {error && (
        <div className="rounded-md bg-hs-danger/10 border border-hs-danger/30 px-3 py-2 text-xs text-hs-danger">
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

/**
 * Formerly `DisplaysSection`. This is the "All displays" landing page
 * reachable from the sidebar's `Per display → All displays` entry.
 *
 * Rebuilt as a 2-column card grid matching the mockup — each card is
 * clickable and navigates to the per-display drill-down
 * page (`?section=display&id=<id>&subtab=overview`) where editing,
 * renaming, deleting, and screen layout now live. The inline per-card
 * pencil / trash / edit-screens affordances were removed because their
 * canonical home is now `PerDisplayPage`'s Identity / Display / Header
 * subtabs, and keeping them here was just building two sources of
 * truth for the same mutation.
 *
 * The Add / Adopt paths stay inline because `PerDisplayPage` doesn't
 * have an entry point for creating or adopting displays — that flow
 * only makes sense on an index page. The unadopted section and the
 * multi-reporter warning are also preserved since they're the primary
 * reason this page still has any mutating affordances at all.
 */
export default function DisplaysIndexPage() {
  const router = useRouter();
  const { config, addDisplay, saveConfig } = useEditorStore();

  const [apiData, setApiData] = useState<DisplaysApiResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  /**
   * Open a display's per-display detail page. Single source of truth for
   * editing name / resolution / rotation / screens — all the affordances
   * that used to live as inline buttons on each row.
   */
  const openDisplay = (id: string) => {
    router.push(`?section=display&id=${encodeURIComponent(id)}&subtab=overview`);
  };

  // First-visit copy vs. the concise header existing multi-display installs
  // already understand. The empty-state version has to answer three questions
  // a new user will ask the moment they land here: "what is this?", "why would
  // I want it?", and "is it safe to click Add?". The populated version assumes
  // the user already knows the answers and gets out of the way.
  const isEmpty = displays.length === 0;

  return (
    <section>
      <div className="flex items-start justify-between mb-5">
        <div className="max-w-2xl">
          <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">Displays</div>
          <h1 className="text-xl font-semibold text-hs-text-primary">
            {isEmpty
              ? 'Run Home Screens on multiple displays'
              : `${displays.length} ${displays.length === 1 ? 'display' : 'displays'} in this home`}
          </h1>
          {isEmpty ? (
            <p className="text-sm text-hs-text-faint mt-1 leading-relaxed">
              Drive more than one screen from this Pi — a kitchen touchscreen, a
              bedroom monitor, a living-room TV — each with its own layout,
              resolution, and rotation. This Pi becomes the hub and serves all of
              them; secondary displays can be cheap Pi Zeros running{' '}
              <code className="text-[12px] px-1 py-0.5 rounded bg-hs-card text-hs-text-secondary">
                install.sh --display-only
              </code>
              .
            </p>
          ) : (
            <p className="text-sm text-hs-text-faint mt-1">
              Click a display to edit its own settings. Everything else uses the shared{' '}
              <a
                href="?section=defaults&page=display"
                onClick={(e) => {
                  e.preventDefault();
                  router.push('?section=defaults&page=display');
                }}
                className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
              >
                Defaults
              </a>
              .
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-xs text-hs-text-faint hover:text-hs-text-secondary flex items-center gap-1 disabled:opacity-50"
            title="Refresh heartbeats"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-hs-card border border-hs-border-strong text-hs-text-secondary hover:text-hs-text-primary hover:bg-hs-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              Add display
            </button>
          )}
        </div>
      </div>

      {/* Registered displays — 2-column card grid, or first-visit explainer */}
      {displays.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          {displays.map((display) => (
            <DisplayCard
              key={display.id}
              display={display}
              heartbeat={heartbeats.get(display.id) ?? null}
              onOpen={() => openDisplay(display.id)}
            />
          ))}
        </div>
      ) : (
        !adding && (
          // First-visit explainer. We deliberately keep this card visually
          // heavier than the old one-liner — a new user lands here with no
          // context, and the opt-in step (Add display → auto-bootstrap of
          // "Main") is irreversible enough that it deserves a paragraph of
          // reassurance rather than a single neutral-500 line.
          <div className="rounded-lg border border-hs-border bg-hs-panel/40 px-5 py-5 mb-5">
            <div className="text-sm font-medium text-hs-text-body mb-1.5">
              This install is running in single-display mode
            </div>
            <p className="text-[13px] text-hs-text-muted leading-relaxed mb-3">
              Your current setup counts as one display but isn&apos;t registered here
              yet — multi-display support is opt-in so existing installs stay
              unchanged until you explicitly add a second screen. The moment you
              add your first display, this Pi&apos;s current layout becomes a display
              called <span className="text-hs-text-body font-medium">Main</span> and
              keeps running exactly as it does today.
            </p>
            <ul className="text-[13px] text-hs-text-muted space-y-1.5 mb-1">
              <li className="flex gap-2">
                <span className="text-hs-text-faint shrink-0">→</span>
                <span>
                  Click <span className="text-hs-text-body font-medium">Add display</span> above
                  to register a new screen — give it a name, resolution, and rotation,
                  then design its own layout in the editor.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-hs-text-faint shrink-0">→</span>
                <span>
                  Or flash another Pi with{' '}
                  <code className="text-[12px] px-1 py-0.5 rounded bg-hs-card text-hs-text-secondary">
                    install.sh --display-only --backend http://&lt;this-pi&gt;:3000
                  </code>
                  . Once it boots, it will appear below as an{' '}
                  <span className="text-hs-warning">unadopted display</span> waiting
                  to be adopted with one click.
                </span>
              </li>
            </ul>
          </div>
        )
      )}

      {/* Add form */}
      {adding && !adoptingId && (
        <div className="mb-5">
          <DisplayForm
            takenIds={takenIds}
            onCancel={() => setAdding(false)}
            onSubmit={handleAdd}
          />
        </div>
      )}

      {/* Unadopted — unchanged from the mockup, which renders this block
          identically to the current implementation. */}
      {unadopted.length > 0 && (
        <div className="rounded-lg border border-hs-warning/20 bg-hs-warning/[0.04] px-4 py-3.5">
          <div className="flex items-center gap-2 mb-1">
            <Monitor className="w-4 h-4 text-hs-warning" />
            <span className="text-sm font-medium text-hs-warning">
              {unadopted.length} unadopted display{unadopted.length === 1 ? '' : 's'} waiting
            </span>
          </div>
          <p className="text-xs text-hs-text-faint mb-3 pl-6">
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
                  className="rounded-md border border-hs-warning/20 bg-hs-warning/[0.03] px-3 py-2.5 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <code className="text-xs font-mono text-hs-warning">{un.id}</code>
                    <div className="flex items-center gap-3 text-[11px] text-hs-text-faint mt-0.5 flex-wrap">
                      <span>Last seen {formatLastSeen(un.lastSeen)}</span>
                      {soleReporter && (
                        <>
                          <span className="tabular-nums">
                            {soleReporter.width}×{soleReporter.height} reported
                          </span>
                          {formatClientAddress(soleReporter.clientAddress) && (
                            <span className="font-mono text-hs-text-faint">
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
                      <div className="mt-2 rounded-md border border-hs-warning/30 bg-hs-warning/[0.07] px-2.5 py-1.5 text-[11px] text-hs-warning">
                        <div className="font-medium mb-1">
                          {viewports.length} clients reporting with this ID
                        </div>
                        <ul className="space-y-0.5 text-hs-text-muted">
                          {viewports.map((v, i) => {
                            const addr = formatClientAddress(v.clientAddress);
                            return (
                              <li key={`${v.clientAddress ?? '?'}-${v.width}x${v.height}-${i}`} className="tabular-nums">
                                {addr && (
                                  <span className="font-mono text-hs-warning/80">{addr}</span>
                                )}
                                {addr && <span className="text-hs-text-faint"> · </span>}
                                {v.width}×{v.height}
                                <span className="text-hs-text-faint"> · {formatLastSeen(v.lastSeen)}</span>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="text-hs-text-faint mt-1">
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
        <div className="flex items-center gap-2 mt-6 border-t border-hs-border pt-4 text-xs">
          {saving && <span className="text-hs-text-faint">Saving…</span>}
          {!saving && saveMessage && (
            <span className={saveMessage === 'Saved' ? 'text-hs-success' : 'text-hs-danger'}>
              {saveMessage}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/* ─── Display card (2-column grid) ────────────────── */

/**
 * One card in the displays grid. Mockup structure:
 *
 *   +------------------------------------------------+
 *   | [thumb]  Name               | [status pill]   |
 *   |          code                                  |
 *   +------------------------------------------------+
 *   | 1920×1080 · normal · 4 screens · 192.168.…    |
 *   +------------------------------------------------+
 *
 * The entire card is a button — clicking it navigates to
 * `?section=display&id=<id>&subtab=overview`. Main gets a subtle blue
 * ring so the user can pick it out at a glance. Multi-reporter cards
 * get a warning strip below the metadata row.
 */
function DisplayCard({
  display,
  heartbeat,
  onOpen,
}: {
  display: DisplayNode;
  heartbeat: DisplayApiEntry | null;
  onOpen: () => void;
}) {
  const lastSeen = heartbeat?.lastSeen ?? null;
  const oriented = display.displayWidth && display.displayHeight
    ? orientDimensions(display.displayWidth, display.displayHeight, display.displayTransform)
    : null;
  const dimensions = oriented ? `${oriented.width}×${oriented.height}` : null;
  const screenCount = displayScreenCount(display);
  const isMain = isMainDisplay(display.id);

  const reports = collapseReports(heartbeat?.viewportReports ?? []);
  const primaryReporter = reports[0];
  const reporterIp = formatClientAddress(primaryReporter?.clientAddress);
  const multipleReporters = reports.length > 1;

  const status = (() => {
    if (!lastSeen) {
      return {
        className: 'bg-hs-card border-hs-border-strong text-hs-text-muted',
        dot: 'bg-hs-card',
        label: '—',
      };
    }
    const diff = Date.now() - lastSeen;
    if (diff < 30_000) {
      return {
        className: 'bg-hs-success/10 border-hs-success/30 text-hs-success',
        dot: 'bg-hs-success',
        label: `Online · ${formatLastSeen(lastSeen)}`,
      };
    }
    if (diff < 300_000) {
      return {
        className: 'bg-hs-warning/10 border-hs-warning/30 text-hs-warning',
        dot: 'bg-hs-warning',
        label: `Idle · ${formatLastSeen(lastSeen)}`,
      };
    }
    return {
      className: 'bg-hs-card border-hs-border-strong text-hs-text-muted',
      dot: 'bg-hs-card',
      label: `Offline · ${formatLastSeen(lastSeen)}`,
    };
  })();

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`text-left rounded-xl border px-5 py-4 transition-colors ${
        isMain
          ? 'border-hs-accent/30 bg-hs-panel/50 hover:border-hs-accent/50 hover:bg-hs-card/60'
          : 'border-hs-border bg-hs-panel/40 hover:border-hs-border-strong hover:bg-hs-card/60'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-hs-text-primary truncate">{display.name}</div>
          <code className="text-[10px] text-hs-text-faint font-mono">{display.id}</code>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 ${status.className}`}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-hs-text-faint flex-wrap">
        {dimensions && <span className="tabular-nums">{dimensions}</span>}
        <span>
          {display.displayTransform && display.displayTransform !== 'normal'
            ? `${display.displayTransform}° rotation`
            : 'normal'}
        </span>
        <span>
          {screenCount} screen{screenCount === 1 ? '' : 's'}
        </span>
        {reporterIp ? (
          <span className="font-mono text-hs-text-faint">{reporterIp}</span>
        ) : (
          <span className="font-mono text-hs-text-faint">—</span>
        )}
      </div>
      {multipleReporters && (
        <div className="mt-3 rounded-md border border-hs-warning/30 bg-hs-warning/[0.07] px-2.5 py-1.5 text-[11px] text-hs-warning">
          <div className="font-medium mb-1">
            {reports.length} distinct clients reporting for this display
          </div>
          <ul className="space-y-0.5 text-hs-text-muted">
            {reports.map((v, i) => {
              const addr = formatClientAddress(v.clientAddress);
              return (
                <li
                  key={`${v.clientAddress ?? '?'}-${v.width}x${v.height}-${i}`}
                  className="tabular-nums"
                >
                  {addr && <span className="font-mono text-hs-warning/80">{addr}</span>}
                  {addr && <span className="text-hs-text-faint"> · </span>}
                  {v.width}×{v.height}
                  {v.count > 1 && <span className="text-hs-text-faint"> · ×{v.count} tabs</span>}
                  <span className="text-hs-text-faint"> · {formatLastSeen(v.lastSeen)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </button>
  );
}
