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
}

/** Sentinel queue key for displays that poll without an explicit `displayId`. */
const DEFAULT_DISPLAY_KEY = '__default__';

/**
 * URL-safe slug rule. Mirrored from `display-filter.ts` so the in-memory
 * maps reject any ID that the config validator would reject. Without this
 * gate, an attacker passing `?display=<random>` to the drain endpoint could
 * grow `knownDisplays`/`statusMap` indefinitely and inflate every broadcast.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Hard cap on the number of displays the hub will track in memory. Far
 * larger than any plausible household — present only as a backstop in
 * case validation is bypassed by some future caller.
 */
const MAX_KNOWN_DISPLAYS = 64;

/** True for any ID safe to use as a queue/status/heartbeat key. */
function isValidDisplayId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && SLUG_RE.test(id);
}

const commandQueues = new Map<string, DisplayCommand[]>();
const statusMap = new Map<string, DisplayStatus>();
/** Set of displays that have polled at least once — used for broadcast fan-out. */
const knownDisplays = new Set<string>();

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
 * - `displayId === <slug>` → enqueue to that display's queue (must match SLUG_RE)
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
 * Invalid slugs (anything that doesn't match `SLUG_RE`, including the
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
  statusMap.set(id, {
    ...status,
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
  return [...knownDisplays].filter((id) => !configured.has(id));
}

/**
 * Test-only helper to fully reset module-level state. Production code never
 * calls this — the in-memory queues are global by design.
 */
export function __resetForTests(): void {
  commandQueues.clear();
  statusMap.clear();
  knownDisplays.clear();
}
