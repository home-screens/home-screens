/**
 * In-memory command queue and status store for display remote control.
 *
 * Commands are enqueued by external API calls (phone, Home Assistant, scripts)
 * and drained by the display client on its 3s poll cycle.
 *
 * ## Multi-display
 *
 * Each registered display gets its own queue (keyed by display ID). The
 * special key `__default__` holds commands for the legacy single-display
 * setup — when a display polls without an explicit `displayId`, it drains
 * `__default__`. This keeps single-display installs working with zero
 * config: no `displays` array, no display IDs in URLs, exactly today's
 * behavior.
 *
 * Broadcast targets (`displayId === 'all'`) fan out to every queue that
 * has been seen via `drainCommands` plus `__default__`. We do not read
 * config to enumerate displays — discovery is purely runtime, driven by
 * which displays actually polled.
 *
 * Heartbeat (`lastSeen`) lives in `statusMap` and is updated by
 * `drainCommands`. It is **not** persisted to `config.json` to avoid
 * write contention with config saves (the profile-change handler does a
 * read-modify-write that would race against frequent heartbeat writes).
 * On hub restart all displays reconnect on their next poll cycle (~3s),
 * so the in-memory loss is negligible.
 */

import type { CacheStats } from './display-cache';
import { isValidDisplayId } from './display-filter';

export type DisplayCommandType =
  | 'wake'
  | 'sleep'
  | 'next-screen'
  | 'prev-screen'
  | 'brightness'
  | 'reload'
  | 'alert'
  | 'clear-alerts';

export interface DisplayCommand {
  type: DisplayCommandType;
  payload?: Record<string, unknown>;
  timestamp: number;
}

export interface DisplayStatus {
  currentScreen: {
    index: number;
    id: string;
    name: string;
  };
  screenCount: number;
  activeProfile: string | null;
  displayState: 'active' | 'dimmed' | 'asleep';
  timestamp: number;
  cacheStats?: CacheStats;
  /** Server-side heartbeat: when this display was last seen polling. */
  lastSeen?: number;
  /**
   * Viewport dimensions self-reported by the display's browser. Captured
   * from `window.innerWidth`/`innerHeight` on each status POST — these are
   * post-rotation, so a wlr-randr --transform 90 on a 1920×1080 screen
   * reports as 1080×1920 directly. The editor's adoption form pre-fills
   * `displayWidth`/`displayHeight` from this when the user clicks "Adopt".
   */
  reportedViewport?: { width: number; height: number };
}

/** Sentinel queue key for displays that poll without an explicit `displayId`. */
const DEFAULT_DISPLAY_KEY = '__default__';

/**
 * Hard cap on the number of displays the hub will track in memory. Far
 * larger than any plausible household — present only as a backstop in
 * case validation is bypassed by some future caller. The slug-shape gate
 * is shared with the config validator via `isValidDisplayId` (imported
 * above) so any ID rejected by one is rejected by both — without that
 * gate, an attacker passing `?display=<random>` to the drain endpoint
 * could grow `knownDisplays`/`statusMap` indefinitely.
 */
const MAX_KNOWN_DISPLAYS = 64;

/**
 * An unadopted display that stops heartbeating for this long is evicted
 * from `knownDisplays` / `statusMap` / `viewportReports` / `commandQueues`
 * so it disappears from the editor's Unadopted section. Adopted displays
 * (those listed in `config.displays`) are NOT subject to this eviction —
 * they always appear in the registered list regardless of heartbeat age,
 * which is the right behavior: a powered-off kitchen Pi should still show
 * up in the editor with an "offline" badge, not vanish entirely.
 *
 * The current heartbeat cadence is 3s, so ~2 minutes is long enough to
 * ride out brief network hiccups while still feeling responsive when a
 * mistakenly-configured Pi is taken off the LAN.
 */
const UNADOPTED_STALENESS_MS = 2 * 60 * 1000;

const commandQueues = new Map<string, DisplayCommand[]>();
const statusMap = new Map<string, DisplayStatus>();
/** Set of displays that have polled at least once — used for broadcast fan-out. */
const knownDisplays = new Set<string>();

/** Per-tab viewport reports keyed by displayId → clientId. */
export interface ViewportReport {
  width: number;
  height: number;
  /** When this client last reported (ms since epoch) */
  lastSeen: number;
  /**
   * Source IP the report arrived from (from `x-forwarded-for` /
   * `x-real-ip` / the connection peer, via `getClientIP`). Lets the
   * editor surface "which device on the LAN is actually posting this"
   * so a phantom reporter (stale tab, stray curl loop, duplicate install)
   * can be traced back to a specific box instead of a mystery.
   */
  clientAddress?: string;
}
const VIEWPORT_REPORT_TTL_MS = 60_000;
const MAX_CLIENTS_PER_DISPLAY = 16;
const viewportReports = new Map<string, Map<string, ViewportReport>>();

function pruneStaleClients(perClient: Map<string, ViewportReport>): void {
  const cutoff = Date.now() - VIEWPORT_REPORT_TTL_MS;
  for (const [clientId, report] of perClient) {
    if (report.lastSeen < cutoff) perClient.delete(clientId);
  }
}

/**
 * Record a viewport report from a specific browser tab. Tracking per-client
 * (not per-display) lets the editor surface "multiple things are reporting
 * with the same display ID" rather than silently flapping between two values.
 *
 * Stale clients are pruned every write so abandoned tabs don't pollute the
 * reported list forever, and a hard cap stops a malicious caller from
 * spawning unbounded clients.
 */
export function recordViewportReport(
  displayId: string,
  clientId: string,
  width: number,
  height: number,
  clientAddress?: string,
): void {
  if (!isValidDisplayId(displayId)) return;
  if (!clientId || clientId.length > 64 || clientId.length < 1) return;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

  let perClient = viewportReports.get(displayId);
  if (!perClient) {
    perClient = new Map();
    viewportReports.set(displayId, perClient);
  }
  pruneStaleClients(perClient);

  // Refuse new clients past the cap, but always accept updates from
  // clients we already know about.
  if (perClient.size >= MAX_CLIENTS_PER_DISPLAY && !perClient.has(clientId)) return;

  perClient.set(clientId, {
    width,
    height,
    lastSeen: Date.now(),
    ...(clientAddress ? { clientAddress } : {}),
  });
}

/**
 * Returns all live viewport reports for a display, sorted most-recent-first.
 *
 * Entries are NOT de-duplicated by `(width, height)` here: if two clients
 * from different IPs both report the same 1440×2560 viewport, we want the
 * editor to see them as two distinct rows so the user can tell them apart
 * by source address. Stale entries (>60s) are pruned before returning.
 */
export function getViewportReports(displayId: string): ViewportReport[] {
  const perClient = viewportReports.get(displayId);
  if (!perClient) return [];
  pruneStaleClients(perClient);
  return [...perClient.values()]
    .map((r) => ({ ...r }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

function pushTo(queueId: string, command: DisplayCommand): void {
  const queue = commandQueues.get(queueId);
  if (queue) {
    queue.push(command);
  } else {
    commandQueues.set(queueId, [command]);
  }
}

/**
 * Enqueue a command for one display, all displays, or the legacy default queue.
 *
 * - `displayId` undefined → enqueue to `__default__` (single-display mode)
 * - `displayId === 'all'`  → broadcast to every known display + `__default__`
 * - `displayId === <slug>` → enqueue to that display's queue (must pass `isValidDisplayId`)
 *
 * Invalid slugs are silently dropped to keep the in-memory maps clean — the
 * route layer is responsible for surfacing 400s to the user before this is
 * called, but defense-in-depth lives here too.
 */
export function enqueueCommand(
  displayId: string | undefined,
  type: DisplayCommandType,
  payload?: Record<string, unknown>,
): void {
  const command: DisplayCommand = { type, payload, timestamp: Date.now() };

  if (displayId === 'all') {
    for (const id of knownDisplays) {
      pushTo(id, command);
    }
    pushTo(DEFAULT_DISPLAY_KEY, command);
    return;
  }

  if (displayId !== undefined && !isValidDisplayId(displayId)) return;
  pushTo(displayId ?? DEFAULT_DISPLAY_KEY, command);
}

/**
 * Drain and return all pending commands for a display.
 *
 * Side effect: tracks `displayId` in `knownDisplays` (so future broadcasts
 * fan out to it) and updates the heartbeat in `statusMap`.
 *
 * Invalid slugs (anything that fails `isValidDisplayId`, including the
 * literal `'all'` which is only valid in the broadcast meaning of
 * `enqueueCommand`) drain the legacy default queue and do **not** pollute
 * `knownDisplays`. This stops a probe loop like
 * `?display=probe-$i for i in 1..1M` from growing the in-memory maps.
 */
export function drainCommands(displayId?: string): DisplayCommand[] {
  if (displayId !== undefined && !isValidDisplayId(displayId)) {
    return [];
  }

  const id = displayId ?? DEFAULT_DISPLAY_KEY;

  if (displayId) {
    if (knownDisplays.size < MAX_KNOWN_DISPLAYS || knownDisplays.has(displayId)) {
      knownDisplays.add(displayId);
      const existing = statusMap.get(displayId);
      statusMap.set(displayId, {
        ...(existing ?? makeEmptyStatus()),
        lastSeen: Date.now(),
      });
    }
    // If we've hit the cap and this is a new ID, we still drain (no harm
    // returning their commands) but skip the heartbeat write so the map
    // can't grow further.
  }

  const queue = commandQueues.get(id);
  if (!queue || queue.length === 0) return [];
  commandQueues.delete(id);
  return queue;
}

function makeEmptyStatus(): DisplayStatus {
  return {
    currentScreen: { index: 0, id: '', name: '' },
    screenCount: 0,
    activeProfile: null,
    displayState: 'active',
    timestamp: 0,
  };
}

/**
 * Store a status report from a display. When `displayId` is provided the
 * report is keyed by that display; when omitted the report goes into the
 * legacy `__default__` slot for backward compatibility.
 *
 * Invalid slugs are silently dropped — same defense-in-depth posture as
 * `drainCommands`. The literal `'all'` is rejected because it has no
 * meaning here (broadcast is an enqueue-only concept).
 */
/**
 * A "stub heartbeat" is a status POST whose only real payload is the
 * heartbeat itself — sent by `DisplayNotFound` on unadopted Pis so the hub
 * registers the display ID without pretending to know what screen is
 * showing. We detect these by the empty `currentScreen.id` + `screenCount
 * === 0` signature and avoid clobbering a previously-stored real status,
 * which could otherwise flash blank in the editor's Displays tab if an
 * adopted display transiently falls back to DisplayNotFound.
 */
function isStubHeartbeat(status: DisplayStatus): boolean {
  return status.currentScreen?.id === '' && status.screenCount === 0;
}

/**
 * Returns the viewport only if it's a sane, positive, finite pair. A
 * polling Pi can legitimately POST `{width: 0, height: 0}` during initial
 * layout, and we don't want that noise to pollute the editor's adoption
 * form pre-fill.
 */
function sanitizeViewport(
  v: { width: number; height: number } | undefined,
): { width: number; height: number } | undefined {
  if (!v) return undefined;
  if (!Number.isFinite(v.width) || !Number.isFinite(v.height)) return undefined;
  if (v.width <= 0 || v.height <= 0) return undefined;
  return v;
}

export function setDisplayStatus(status: DisplayStatus, displayId?: string): void {
  if (displayId !== undefined && !isValidDisplayId(displayId)) return;

  const id = displayId ?? DEFAULT_DISPLAY_KEY;
  if (displayId) {
    if (knownDisplays.size >= MAX_KNOWN_DISPLAYS && !knownDisplays.has(displayId)) {
      // Cap reached — refuse to register a brand-new display, but accept
      // updates for displays we already know about.
      return;
    }
    knownDisplays.add(displayId);
  }
  const existing = statusMap.get(id);
  const incomingViewport = sanitizeViewport(status.reportedViewport);

  // Stub heartbeat + we already have a real status → only refresh the
  // liveness fields (lastSeen + reportedViewport) and preserve the real
  // currentScreen/screenCount/activeProfile that the rotator reported.
  if (existing && !isStubHeartbeat(existing) && isStubHeartbeat(status)) {
    statusMap.set(id, {
      ...existing,
      reportedViewport: incomingViewport ?? existing.reportedViewport,
      lastSeen: Date.now(),
    });
    return;
  }

  // Preserve reportedViewport across updates when the new status doesn't
  // carry one — the display reports it on every POST in practice, but we
  // don't want to drop the value if a single report happens to omit it.
  statusMap.set(id, {
    ...status,
    reportedViewport: incomingViewport ?? existing?.reportedViewport,
    // Heartbeat is "now" — when the report arrives. Math.max with the
    // previous lastSeen would be redundant since Date.now() is monotonic.
    lastSeen: Date.now(),
  });
}

/**
 * Read the most recent status for a display.
 *
 * - `getDisplayStatus()` returns the legacy default status (single-display mode)
 * - `getDisplayStatus(id)` returns that display's status, or `null` if unknown
 */
export function getDisplayStatus(displayId?: string): DisplayStatus | null {
  if (displayId !== undefined && !isValidDisplayId(displayId)) return null;
  return statusMap.get(displayId ?? DEFAULT_DISPLAY_KEY) ?? null;
}

/** Map of every status the hub has seen, keyed by display ID. */
export function getAllDisplayStatuses(): Map<string, DisplayStatus> {
  return new Map(statusMap);
}

/**
 * Returns the IDs of displays that are actively polling the hub but are
 * not yet registered in the config — i.e. waiting to be adopted in the
 * editor's Displays tab.
 */
export function getUnadoptedDisplays(configDisplayIds: string[]): string[] {
  const configured = new Set(configDisplayIds);
  const now = Date.now();
  const stillFresh: string[] = [];
  const stale: string[] = [];

  for (const id of knownDisplays) {
    if (configured.has(id)) continue; // adopted — not an unadopted concern
    const lastSeen = statusMap.get(id)?.lastSeen ?? 0;
    if (lastSeen && now - lastSeen <= UNADOPTED_STALENESS_MS) {
      stillFresh.push(id);
    } else {
      stale.push(id);
    }
  }

  // Evict stale unadopted displays from every tracking structure so they
  // disappear from the editor and don't leak memory for abandoned Pis.
  for (const id of stale) {
    knownDisplays.delete(id);
    statusMap.delete(id);
    viewportReports.delete(id);
    commandQueues.delete(id);
  }

  return stillFresh;
}

/**
 * Test-only helper to fully reset module-level state. Production code never
 * calls this — the in-memory queues are global by design.
 */
export function __resetForTests(): void {
  commandQueues.clear();
  statusMap.clear();
  knownDisplays.clear();
  viewportReports.clear();
}
