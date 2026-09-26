import { createHash } from 'crypto';
import { createJsonStore } from './json-store';
import type { Routine, TimerSession } from '@/types/timers';

/**
 * Stores for the visual timer feature.
 *
 * Two files, deliberately separate:
 * - `data/routines.json` — authored routine definitions (family data, edited
 *   from /remote). Backed up like the other data stores.
 * - `data/timer-session.json` — the single active session. Hot runtime state:
 *   kept out of routines.json so a running timer's writes can't contend with
 *   someone editing routines, and out of config.json for the usual
 *   editor-write-contention reason (see meal-data.ts).
 *
 * There is intentionally ONE active session at a time — this is a family
 * display, and "starting a timer" replacing the previous one is the behavior
 * a parent expects. Countdown math derives entirely from epoch timestamps,
 * so a hub restart resumes the session exactly (no server-side ticking).
 */

interface RoutinesFile {
  routines: Routine[];
}

interface SessionFile {
  session: TimerSession | null;
}

const routinesStore = createJsonStore<RoutinesFile>({
  path: 'data/routines.json',
  defaultValue: { routines: [] },
  backup: true,
  errorHandling: 'throw-corrupt',
});

// A corrupt session file just loses the running timer — never worth throwing.
const sessionStore = createJsonStore<SessionFile>({
  path: 'data/timer-session.json',
  defaultValue: { session: null },
  transient: true,
});

export const readRoutinesFile = routinesStore.read;
export const updateRoutinesAtomic = routinesStore.updateAtomic;
/** Whole-file writer for the backup restore path only — everything else goes through updateRoutinesAtomic. */
export const writeRoutinesFile = routinesStore.write;
export const readSessionFile = sessionStore.read;

// Every display's 3s heartbeat reads the session revision forever, including
// houses with no timer running — a short read cache turns that steady state
// into one file read per second instead of one per display per beat (same
// idea as /api/displays' readConfig cache). Keyed to cwd because unit tests
// repoint process.cwd() per test while mocking Date.now to a constant,
// which would otherwise keep a stale entry "fresh" across tests.
const SESSION_READ_TTL_MS = 1_000;
let sessionCache: { at: number; cwd: string; data: SessionFile } | null = null;

export async function readSessionCached(): Promise<SessionFile> {
  const cwd = process.cwd();
  if (sessionCache && sessionCache.cwd === cwd && Date.now() - sessionCache.at < SESSION_READ_TTL_MS) {
    return sessionCache.data;
  }
  const data = await sessionStore.read();
  sessionCache = { at: Date.now(), cwd, data };
  return data;
}

const sessionRevisions = new WeakMap<SessionFile, string>();

/**
 * A revision of the stored session for the wall's heartbeat: a display reads
 * the session GET again only when this moves. Countdowns, auto-steps and
 * expiry are derived from the session's timestamps on the display, so only a
 * write (start, pause, skip, cancel, ...) changes what a display needs.
 */
export async function readSessionRevision(): Promise<string> {
  const file = await readSessionCached();
  let revision = sessionRevisions.get(file);
  if (!revision) {
    revision = createHash('sha256').update(JSON.stringify(file.session)).digest('hex').slice(0, 16);
    sessionRevisions.set(file, revision);
  }
  return revision;
}

/** Atomic session mutation; invalidates the read cache so controls surface immediately. */
export async function updateSessionAtomic(
  mutator: (current: SessionFile) => SessionFile | Promise<SessionFile>,
): Promise<SessionFile> {
  const result = await sessionStore.updateAtomic(mutator);
  sessionCache = null;
  return result;
}


// Pure session math lives in timer-logic.ts (client-safe, no fs); re-exported
// here so server callers have a single import surface.
export * from './timer-logic';
