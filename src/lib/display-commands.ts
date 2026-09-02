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
import { SHARED_STATE_INTEREST_TTL_MS } from './constants';
import { SHARED_STATE_KEY_RE, type SharedStateEntry } from './shared-state-types';
import type { ProviderHealthEntry } from './provider-health-store';
import type { HardwareStats, BrowserStats, ConsoleLogEntry } from './hardware-stats';

export type DisplayCommandType =
  | 'wake'
  | 'sleep'
  | 'next-screen'
  | 'prev-screen'
  | 'goto-screen'
  | 'sleep-override'
  | 'brightness'
  | 'reload'
  | 'alert'
  | 'clear-alerts'
  | 'dump-console-log'
  /** Poke one module type on the display, e.g. `{ module: 'news', action: 'next' }`. */
  | 'module-command';

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
  /** Per-Pi hardware snapshot posted by the systemd-timer reporter. */
  hwStats?: HardwareStats;
  /** Per-display browser info posted on the standard heartbeat. */
  browserStats?: BrowserStats;
  /**
   * Effective brightness the display is showing right now (0-100): a remote
   * override, the dim level, 0 while asleep, 100 while fully active. The
   * remote seeds its slider from this instead of guessing 100%.
   */
  brightness?: number;
  /**
   * Id of the timer session this display is currently showing full-screen,
   * or null when none. Lets the remote say "Showing on Kitchen" instead of
   * naming the target and hoping.
   */
  timerSessionId?: string | null;
  /** Alerts currently on screen, so the remote can offer to clear them. */
  activeAlerts?: number;
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
   * Source IP the report arrived from (the TCP peer address, via
   * `getClientIP` reading the server-stamped `x-hs-client-ip` header). Lets the
   * editor surface "which device on the LAN is actually posting this"
   * so a phantom reporter (stale tab, stray curl loop, duplicate install)
   * can be traced back to a specific box instead of a mystery.
   */
  clientAddress?: string;
}
const VIEWPORT_REPORT_TTL_MS = 60_000;
const MAX_CLIENTS_PER_DISPLAY = 16;
const viewportReports = new Map<string, Map<string, ViewportReport>>();

/**
 * Per-display Chromium console ring buffer, uploaded on demand when the
 * bundle endpoint broadcasts `dump-console-log`. TTL-evicted alongside
 * status entries — a display that hasn't responded in 5 minutes loses its
 * buffer on the next read.
 */
const CONSOLE_LOG_TTL_MS = 5 * 60 * 1000;
/**
 * Hard cap on the number of per-display console buffers retained in memory.
 * Each buffer is already capped at MAX_ENTRIES (500) by the upload route,
 * so this ceiling bounds the total entries at 64 × 500 = 32 000 — comfortable
 * even for a noisy install, and matches MAX_KNOWN_DISPLAYS above so a hub
 * that's at the display cap can't also hit an orthogonal console cap.
 */
const MAX_CONSOLE_LOG_BUFFERS = 64;
interface ConsoleLogRecord {
  entries: ConsoleLogEntry[];
  uploadedAt: number;
}
/**
 * Map iteration order is insertion order, so the first entry is always the
 * oldest — used below for FIFO eviction when we hit the buffer cap.
 */
const consoleLogMap = new Map<string, ConsoleLogRecord>();

export function setConsoleLog(displayId: string, entries: ConsoleLogEntry[]): void {
  if (!isValidDisplayId(displayId)) return;
  // Delete-then-insert so a re-uploading display moves to the tail of the
  // insertion-order queue and survives the next FIFO eviction.
  consoleLogMap.delete(displayId);
  if (consoleLogMap.size >= MAX_CONSOLE_LOG_BUFFERS) {
    const oldest = consoleLogMap.keys().next().value;
    if (oldest !== undefined) consoleLogMap.delete(oldest);
  }
  consoleLogMap.set(displayId, { entries, uploadedAt: Date.now() });
}

export function getConsoleLog(displayId: string): ConsoleLogEntry[] | null {
  const rec = consoleLogMap.get(displayId);
  if (!rec) return null;
  if (Date.now() - rec.uploadedAt > CONSOLE_LOG_TTL_MS) {
    consoleLogMap.delete(displayId);
    return null;
  }
  return rec.entries;
}

/**
 * Evict a cached console log. Called by the diagnostics endpoint just
 * before broadcasting `dump-console-log` so the subsequent poll-and-wait
 * loop doesn't return a previous bundle's stale entries instantly.
 */
export function clearConsoleLog(displayId: string): void {
  consoleLogMap.delete(displayId);
}

/**
 * Latest shared-state bus snapshot per display, posted alongside the status
 * heartbeat. In-memory only (like statusMap) — this exists so the editor can
 * show "what value does this key have right now on the display" next to
 * visibility-condition inputs; losing it on hub restart just means the hint
 * reappears on the next heartbeat.
 */
export interface SharedStateReport {
  entries: Record<string, SharedStateEntry>;
  /** Server clock when the report arrived — display clocks may be skewed. */
  reportedAt: number;
}
/** Mirror the client bus caps (shared-state-store.ts) so a malicious poster
 *  can't store more than a real display could ever publish. */
const MAX_SHARED_STATE_KEYS = 256;
const MAX_SHARED_STATE_VALUE_LENGTH = 1024;
/** A report older than this is dropped on read — the display stopped posting. */
const SHARED_STATE_REPORT_TTL_MS = 5 * 60 * 1000;
const sharedStateReports = new Map<string, SharedStateReport>();

/**
 * Store a shared-state snapshot posted with a display heartbeat. Unknown
 * shapes and out-of-charset keys are skipped silently — the snapshot is a
 * best-effort editor hint, never authoritative state.
 */
export function recordSharedStateReport(displayId: string | undefined, raw: unknown): void {
  if (displayId !== undefined && !isValidDisplayId(displayId)) return;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  if (
    displayId
    && knownDisplays.size >= MAX_KNOWN_DISPLAYS
    && !knownDisplays.has(displayId)
  ) {
    // Same cap posture as setDisplayStatus: never let an unknown ID grow
    // the in-memory maps past the display ceiling.
    return;
  }

  // A real display can never exceed the bus key cap (the client store
  // enforces it), so an oversized payload is a malicious or broken poster —
  // reject it outright instead of materializing entries up to the cap.
  if (Object.keys(raw).length > MAX_SHARED_STATE_KEYS) return;

  const entries: Record<string, SharedStateEntry> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!SHARED_STATE_KEY_RE.test(key)) continue;
    if (!val || typeof val !== 'object') continue;
    const { value, updatedAt, staleAt } = val as {
      value?: unknown; updatedAt?: unknown; staleAt?: unknown;
    };
    if (typeof value !== 'string' || value.length > MAX_SHARED_STATE_VALUE_LENGTH) continue;
    if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) continue;
    // `staleAt` marks a tombstoned key — still held by the display through its
    // 15s grace window, so it must survive the round trip. Dropping tombstones
    // made the editor's verdict disagree with the display for that whole window
    // (the editor showed "hidden, waiting for <key>" while the kiosk still
    // rendered the module). Same validation posture as updatedAt.
    const staleValid = typeof staleAt === 'number' && Number.isFinite(staleAt);
    entries[key] = staleValid
      ? { value, updatedAt, staleAt: staleAt as number }
      : { value, updatedAt };
  }
  sharedStateReports.set(displayId ?? DEFAULT_DISPLAY_KEY, {
    entries,
    reportedAt: Date.now(),
  });
}

/**
 * Editor interest in a display's shared-state snapshot. Marked every time
 * the editor polls GET /api/display/shared-state (5s cadence while a
 * condition panel is open) and surfaced to the display client on its
 * commands drain as `sharedStateWatched`. The display only arms its fast
 * bus-change re-reporting while watched — otherwise the snapshot rides the
 * normal 30s heartbeat, so idle displays never pay the fast full-payload
 * cadence for data nobody is reading.
 *
 * The TTL covers two missed editor polls; the display's 3s command poll
 * picks up a watch-state change within one cycle either way. It is derived
 * from the editor's poll cadence in `constants.ts` rather than restated here,
 * so changing that cadence cannot silently strand the flag.
 */
const sharedStateInterest = new Map<string, number>();

export function markSharedStateInterest(displayId?: string): void {
  if (displayId !== undefined && !isValidDisplayId(displayId)) return;
  const key = displayId ?? DEFAULT_DISPLAY_KEY;
  // Same cap posture as the other per-display maps: never let unknown IDs
  // grow the map past the display ceiling.
  if (sharedStateInterest.size >= MAX_KNOWN_DISPLAYS && !sharedStateInterest.has(key)) return;
  sharedStateInterest.set(key, Date.now());
}

/** True while an editor has polled this display's shared-state recently. */
export function hasSharedStateInterest(displayId?: string): boolean {
  if (displayId !== undefined && !isValidDisplayId(displayId)) return false;
  const key = displayId ?? DEFAULT_DISPLAY_KEY;
  const markedAt = sharedStateInterest.get(key);
  if (markedAt === undefined) return false;
  if (Date.now() - markedAt > SHARED_STATE_INTEREST_TTL_MS) {
    sharedStateInterest.delete(key);
    return false;
  }
  return true;
}

/**
 * Latest provider-health snapshot per display, posted alongside the status
 * heartbeat (its own field, so a resolved outage clears even when the
 * shared-state snapshot itself did not change). In-memory only, same as the
 * shared-state report. Keyed by lowercased plugin id.
 */
interface ProviderHealthReport {
  health: Record<string, ProviderHealthEntry>;
  reportedAt: number;
}
/** Mirror the client store's caps (provider-health-store.ts). */
const MAX_PROVIDER_HEALTH_ENTRIES = 64;
const MAX_PROVIDER_HEALTH_MESSAGE_LENGTH = 200;
/** Same charset as the client store / PLUGIN_ID_PATTERN. */
const PLUGIN_ID_RE = /^[a-z0-9_-]+$/i;
const providerHealthReports = new Map<string, ProviderHealthReport>();

/**
 * Store the provider-health snapshot posted with a display heartbeat. Unknown
 * shapes, out-of-charset plugin ids, and malformed entries are skipped; an
 * empty object is stored as-is (the display sends exactly one empty report
 * after the last outage clears, mirroring the shared-state convention).
 */
export function recordProviderHealthReport(displayId: string | undefined, raw: unknown): void {
  if (displayId !== undefined && !isValidDisplayId(displayId)) return;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  if (
    displayId
    && knownDisplays.size >= MAX_KNOWN_DISPLAYS
    && !knownDisplays.has(displayId)
  ) {
    return;
  }
  // A real display can never exceed the entry cap (its client store enforces
  // it), so an oversized payload is malicious/broken — reject outright.
  if (Object.keys(raw).length > MAX_PROVIDER_HEALTH_ENTRIES) return;

  const health: Record<string, ProviderHealthEntry> = {};
  for (const [pluginId, val] of Object.entries(raw)) {
    if (!PLUGIN_ID_RE.test(pluginId)) continue;
    if (!val || typeof val !== 'object') continue;
    const { message, since } = val as { message?: unknown; since?: unknown };
    if (typeof message !== 'string' || message.length > MAX_PROVIDER_HEALTH_MESSAGE_LENGTH) continue;
    if (typeof since !== 'number' || !Number.isFinite(since)) continue;
    health[pluginId.toLowerCase()] = { message, since };
  }
  providerHealthReports.set(displayId ?? DEFAULT_DISPLAY_KEY, {
    health,
    reportedAt: Date.now(),
  });
}

/** Latest provider-health snapshot for a display, or null if none/stale. */
export function getProviderHealthReport(displayId?: string): ProviderHealthReport | null {
  if (displayId !== undefined && !isValidDisplayId(displayId)) return null;
  const id = displayId ?? DEFAULT_DISPLAY_KEY;
  const report = providerHealthReports.get(id);
  if (!report) return null;
  if (Date.now() - report.reportedAt > SHARED_STATE_REPORT_TTL_MS) {
    providerHealthReports.delete(id);
    return null;
  }
  return report;
}

/** Latest shared-state snapshot for a display, or null if none/stale. */
export function getSharedStateReport(displayId?: string): SharedStateReport | null {
  if (displayId !== undefined && !isValidDisplayId(displayId)) return null;
  const id = displayId ?? DEFAULT_DISPLAY_KEY;
  const report = sharedStateReports.get(id);
  if (!report) return null;
  if (Date.now() - report.reportedAt > SHARED_STATE_REPORT_TTL_MS) {
    sharedStateReports.delete(id);
    return null;
  }
  return report;
}

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

/**
 * Hard cap on commands buffered per queue. A live display drains its queue
 * on a 3s poll cycle, so anything beyond a handful means the target is
 * offline or never polls — keep only the newest commands (oldest dropped)
 * so repeated enqueues to an unreachable target can't grow the buffer
 * forever. Newest-wins is also the right semantic: a display coming back
 * online should act on the latest brightness/sleep intent, not replay an
 * hour of stale taps.
 */
const MAX_QUEUE_COMMANDS = 32;

function pushTo(queueId: string, command: DisplayCommand): void {
  const queue = commandQueues.get(queueId);
  if (queue) {
    queue.push(command);
    if (queue.length > MAX_QUEUE_COMMANDS) {
      queue.splice(0, queue.length - MAX_QUEUE_COMMANDS);
    }
    return;
  }
  // Creating a queue for a target that has never polled: bound the total
  // map size so enqueues fanned across distinct never-polling slugs can't
  // grow it forever. Displays in `knownDisplays` are exempt — that set is
  // already capped at MAX_KNOWN_DISPLAYS — and the default queue always
  // exists conceptually.
  if (
    queueId !== DEFAULT_DISPLAY_KEY
    && !knownDisplays.has(queueId)
    && commandQueues.size >= MAX_KNOWN_DISPLAYS
  ) {
    return;
  }
  commandQueues.set(queueId, [command]);
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
 * `enqueueCommand`) return no commands and do **not** pollute
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

  // Stub heartbeat handling — the reporter's systemd timer posts every 30s
  // with `currentScreen: {id:'',name:''}, screenCount: 0`. We must never let
  // that shape promote into the authoritative status for a display, or the
  // editor's Stats page shows "screen (empty)" until the display client
  // posts its first real heartbeat.
  if (isStubHeartbeat(status)) {
    if (existing && !isStubHeartbeat(existing)) {
      // Existing real status → only refresh liveness + hw/browser extras.
      statusMap.set(id, {
        ...existing,
        reportedViewport: incomingViewport ?? existing.reportedViewport,
        hwStats: status.hwStats ?? existing.hwStats,
        browserStats: status.browserStats ?? existing.browserStats,
        lastSeen: Date.now(),
      });
      return;
    }
    // No prior real status yet. Store only the liveness fields (+ any
    // hw/browser extras) — leave currentScreen/screenCount empty so
    // getDisplayStatus callers can tell "not yet reported" from "reported
    // an empty screen".
    statusMap.set(id, {
      ...(existing ?? makeEmptyStatus()),
      hwStats: status.hwStats ?? existing?.hwStats,
      browserStats: status.browserStats ?? existing?.browserStats,
      reportedViewport: incomingViewport ?? existing?.reportedViewport,
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
    hwStats: status.hwStats ?? existing?.hwStats,
    browserStats: status.browserStats ?? existing?.browserStats,
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
    sharedStateReports.delete(id);
    providerHealthReports.delete(id);
    sharedStateInterest.delete(id);
  }

  // Also evict queues enqueued for slugs that have never polled at all —
  // they never enter `knownDisplays`, so the loop above can't reach them.
  // The newest command's timestamp stands in for a heartbeat: once it ages
  // past the staleness window with no display ever draining it, the target
  // is a typo or a permanently-offline slug and the buffer is dropped.
  // Adopted displays keep their queues (same posture as statusMap).
  for (const [queueId, queue] of commandQueues) {
    if (queueId === DEFAULT_DISPLAY_KEY) continue;
    if (configured.has(queueId) || knownDisplays.has(queueId)) continue;
    const newest = queue[queue.length - 1]?.timestamp ?? 0;
    if (now - newest > UNADOPTED_STALENESS_MS) commandQueues.delete(queueId);
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
  consoleLogMap.clear();
  sharedStateReports.clear();
  providerHealthReports.clear();
  sharedStateInterest.clear();
}
