/**
 * The walls this hub has let in: `data/display-walls.json`.
 *
 * A wall is one browser. It proves itself with the `hs-display` cookie, a
 * random id plus a secret; the hub keeps only a SHA-256 of the secret. The
 * cookie names the browser, not a display: the display it last showed is
 * recorded so the editor can list it, and nothing else depends on it, so
 * renaming or deleting a display can never strand a wall.
 *
 * Kept apart from `auth.json` because the request gate re-reads that file
 * whenever it changes, and this one changes far more often.
 *
 * Memory is the working copy. The file is read again only when something
 * else replaced it (a restored backup), and a write that fails leaves the
 * wall working from memory: a wall is never turned away because the card
 * was full. Every read-change-write runs one at a time (`locked`), so two
 * walls arriving together can never each load their own copy and lose the
 * other's entry.
 *
 * A file that is there but cannot be read fails closed: no wall is known,
 * no changeover window is open, and nothing is written over it.
 */
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createJsonStore } from './json-store';
import { getDataRoot } from './data-root';
import { safeEqual } from './signed-payload';
import { statSignature } from './stat-signature';
import { WINDOW_WALLS_PER_DISPLAY, type WallAdmission } from './display-admission';

export const WALL_COOKIE = 'hs-display';
/** Browsers cap a cookie's life at 400 days. */
const WALL_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
/** The heartbeat sets the cookie again once it is this old, so it never runs out on a wall in use. */
export const WALL_COOKIE_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * On a hub with no password every browser that opens `/display` gets an
 * entry, so one that has not been seen for this long is dropped. Nothing is
 * lost: it is simply given another on its next visit.
 */
export const OPEN_DOOR_FORGET_MS = 10 * 60 * 1000;
/** A waiting wall that stopped asking is dropped after this long. */
export const WAITING_FORGET_MS = 10 * 60 * 1000;
export const MAX_WAITING_WALLS = 20;
/** Two Pis behind one repeater share an address, so a few may wait from one. */
export const MAX_WAITING_PER_ADDRESS = 3;
export const MAX_OPEN_DOOR_WALLS = 200;
/**
 * Identical browsers behind one address (two kiosks behind a repeater) each
 * get an entry of their own, up to this many. Past it nothing more is made
 * for that address and browser until one is forgotten, which is what bounds
 * a browser that never keeps its cookie.
 */
export const MAX_OPEN_DOOR_PER_BROWSER = 4;
/** How many removed walls are remembered, so a removed one cannot let itself back in. */
const MAX_REMOVED_REMEMBERED = 200;
/** Last-seen times reach the file at most this often. */
const LAST_SEEN_FLUSH_MS = 10 * 60 * 1000;

const WALLS_FILE = 'data/display-walls.json';

export interface WallEntry {
  id: string;
  /** SHA-256 of the cookie's secret, hex. */
  secretHash: string;
  /** `waiting` holds a cookie but may not show anything yet. */
  status: 'in' | 'waiting';
  admittedBy?: WallAdmission;
  /** The display this browser last showed or asked for. Null on a hub with one display. */
  displayId: string | null;
  /** It first asked under a display name the hub did not know. Adding that display lets it in. */
  askedAsNew?: boolean;
  address: string;
  userAgent: string;
  viewport?: { width: number; height: number };
  /**
   * Last seen as the hub's own screen, however it was first let in. Such a
   * browser comes straight back after a Remove, so the editor says so.
   */
  hubScreen?: boolean;
  createdAt: number;
  lastSeenAt: number;
  cookieIssuedAt: number;
}

export interface WallsFile {
  version: 1;
  /**
   * When the changeover window began: the first time a hub that already had
   * a password ran a version with walls, or a restore that gave a hub with
   * none its first password. Written once and never moved. Null on a hub
   * that had nothing to move over.
   */
  windowStartedAt: number | null;
  /**
   * How many walls the window has let in per display. Counted, not derived
   * from the entries, so removing a wall does not reopen the door it came
   * through.
   */
  windowAdmissions: Record<string, number>;
  walls: WallEntry[];
  /**
   * Ids of walls a grown-up removed. A removed browser still holds its old
   * cookie; this is what keeps the changeover window from letting it
   * straight back in.
   */
  removed?: string[];
}

/** The key the window counts a display under; a hub with one display has only this one. */
export const SINGLE_DISPLAY_KEY = 'main';

function emptyFile(windowStartedAt: number | null): WallsFile {
  return { version: 1, windowStartedAt, windowAdmissions: {}, walls: [] };
}

const store = createJsonStore<WallsFile | null>({
  path: WALLS_FILE,
  defaultValue: null,
  chmod: 0o600,
  // A missing file reads as null; one that is there but unreadable throws,
  // so it is never mistaken for a new install.
  errorHandling: 'throw-corrupt',
});

let memory: WallsFile | null = null;
let memorySignature = '';
/** Memory holds something the file does not. The file is not read again until a write lands. */
let dirty = false;
/** The file exists but could not be read. Nothing is written until it changes. */
let unreadable = false;
let lastFlushAt = 0;

/** One read-change-write at a time. */
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => {});
  return run;
}

async function fileSignature(): Promise<string> {
  try {
    return statSignature(await fs.stat(path.join(getDataRoot(), WALLS_FILE)));
  } catch {
    return 'missing';
  }
}

function normalize(raw: unknown): WallsFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = raw as Partial<WallsFile>;
  return {
    version: 1,
    windowStartedAt: typeof file.windowStartedAt === 'number' ? file.windowStartedAt : null,
    windowAdmissions:
      file.windowAdmissions && typeof file.windowAdmissions === 'object' && !Array.isArray(file.windowAdmissions)
        ? { ...file.windowAdmissions }
        : {},
    walls: Array.isArray(file.walls)
      ? file.walls.filter((w): w is WallEntry => !!w && typeof w === 'object' && typeof w.id === 'string' && typeof w.secretHash === 'string')
      : [],
    removed: Array.isArray(file.removed) ? file.removed.filter((id): id is string => typeof id === 'string') : [],
  };
}

/**
 * The walls, creating the file's first contents when there are none. Only
 * ever called inside `locked`.
 *
 * `passwordSet` decides whether a changeover window starts: a hub that
 * already has a password has walls to move over, a hub without one does
 * not. `initWalls` calls this at boot, so the window starts when the new
 * version first runs and not whenever a wall first turns up.
 */
async function load(passwordSet: boolean): Promise<WallsFile> {
  const signature = dirty ? memorySignature : await fileSignature();
  if (memory && signature === memorySignature) return memory;
  let onDisk: WallsFile | null;
  try {
    onDisk = normalize(await store.read());
  } catch (error) {
    // There is a file and it cannot be read. Fail closed: know no walls,
    // open no window, and leave the file alone for someone to look at.
    console.error('[display-walls] the walls file could not be read; no wall is let in until it can', error);
    memory = emptyFile(null);
    memorySignature = signature;
    unreadable = true;
    return memory;
  }
  unreadable = false;
  if (onDisk) {
    memory = onDisk;
    memorySignature = signature;
    return memory;
  }
  memory = emptyFile(passwordSet ? Date.now() : null);
  await persist();
  return memory;
}

/**
 * Write memory to the file. False when it could not be saved: memory stays
 * the working copy, which is right for letting a wall in and not enough for
 * taking one away (`removeWall`).
 */
async function persist(): Promise<boolean> {
  if (!memory) return true;
  if (unreadable) return false;
  try {
    await store.write(memory);
    dirty = false;
    lastFlushAt = Date.now();
    memorySignature = await fileSignature();
    return true;
  } catch (error) {
    dirty = true;
    console.error('[display-walls] could not save the walls file; carrying on from memory', error);
    return false;
  }
}

/**
 * Called once when the server boots. On a hub that already has a password
 * and no walls file, this is the moment the changeover window starts.
 */
export function initWalls(passwordSet: boolean): Promise<void> {
  return locked(async () => {
    await load(passwordSet);
  });
}

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function parseCookieValue(cookieHeader: string): { id: string; secret: string } | null {
  const value = cookieHeader.match(/(?:^|;\s*)hs-display=([^;]+)/)?.[1];
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) return null;
  return { id: value.slice(0, dot), secret: value.slice(dot + 1) };
}

/** The `Set-Cookie` value that gives a browser its wall cookie. */
export function buildWallCookie(value: string, request: Request): string {
  const parts = [`${WALL_COOKIE}=${value}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${WALL_COOKIE_MAX_AGE}`];
  if (request.url.startsWith('https://')) parts.push('Secure');
  return parts.join('; ');
}

/** The raw cookie value a request carries, for setting the same cookie again with a fresh life. */
export function wallCookieValue(cookieHeader: string): string | null {
  const parsed = parseCookieValue(cookieHeader);
  return parsed ? `${parsed.id}.${parsed.secret}` : null;
}

/**
 * The wall a request's cookie belongs to, let in or still waiting, or null
 * for no cookie, a made-up one, or one whose wall was removed.
 */
export function findWall(cookieHeader: string, passwordSet: boolean): Promise<WallEntry | null> {
  const parsed = parseCookieValue(cookieHeader);
  if (!parsed) return Promise.resolve(null);
  return locked(async () => {
    const file = await load(passwordSet);
    const entry = file.walls.find((w) => w.id === parsed.id);
    if (!entry) return null;
    return safeEqual(hashSecret(parsed.secret), entry.secretHash) ? entry : null;
  });
}

/**
 * Whether the cookie a request carries names a wall a grown-up removed.
 * Such a browser has to be let in by hand again; the changeover window does
 * not take it back.
 */
export function cookieNamesRemovedWall(cookieHeader: string, passwordSet: boolean): Promise<boolean> {
  const parsed = parseCookieValue(cookieHeader);
  if (!parsed) return Promise.resolve(false);
  return locked(async () => (await load(passwordSet)).removed?.includes(parsed.id) ?? false);
}

export interface WallSighting {
  displayId?: string | null;
  address?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  /** Whether this request came from the hub's own screen; omitted when the caller cannot tell. */
  hubScreen?: boolean;
}

/**
 * Note that a wall was just seen, in memory. The file catches up at most
 * every ten minutes, or at once when something worth keeping changed (the
 * display it shows, its address).
 *
 * A waiting wall's display never changes here. What it asked for, and
 * whether the hub knew that name at the time, is what "added" later lets in,
 * so it may only be changed by asking again (`askAgainAs`).
 */
export function touchWall(entry: WallEntry, seen: WallSighting = {}): Promise<void> {
  return locked(async () => {
    const now = Date.now();
    let changed = false;
    if (entry.status === 'in' && seen.displayId !== undefined && seen.displayId !== entry.displayId) {
      entry.displayId = seen.displayId;
      changed = true;
    }
    if (seen.address && seen.address !== entry.address) {
      entry.address = seen.address;
      changed = true;
    }
    if (seen.userAgent && seen.userAgent.slice(0, 300) !== entry.userAgent) {
      entry.userAgent = seen.userAgent.slice(0, 300);
      changed = true;
    }
    if (seen.viewport) entry.viewport = seen.viewport;
    if (seen.hubScreen !== undefined && seen.hubScreen !== (entry.hubScreen === true)) {
      if (seen.hubScreen) entry.hubScreen = true;
      else delete entry.hubScreen;
      changed = true;
    }
    entry.lastSeenAt = now;
    if (changed || now - lastFlushAt > LAST_SEEN_FLUSH_MS) await persist();
  });
}

/**
 * A waiting wall asks for a different display than before. The name it
 * waits under and whether that name was new to the hub are set together,
 * from what is true now: a browser that first asked under a made-up name
 * and then asks for a real display is waiting for that real display, and
 * adding displays will never let it in.
 */
export function askAgainAs(entry: WallEntry, displayId: string | null, askedAsNew: boolean): Promise<void> {
  return locked(async () => {
    if (entry.status !== 'waiting') return;
    entry.displayId = displayId;
    if (askedAsNew) entry.askedAsNew = true;
    else delete entry.askedAsNew;
    entry.lastSeenAt = Date.now();
    await persist();
  });
}

/** Mark the cookie as set again just now. */
export function noteCookieRefreshed(entry: WallEntry): Promise<void> {
  return locked(async () => {
    entry.cookieIssuedAt = Date.now();
    await persist();
  });
}

export interface NewWall {
  status: 'in' | 'waiting';
  admittedBy?: WallAdmission;
  displayId: string | null;
  askedAsNew?: boolean;
  address: string;
  userAgent: string;
  viewport?: { width: number; height: number };
  hubScreen?: boolean;
  passwordSet: boolean;
}

/** Drop walls that only an open door let in and that have stopped showing. Only while no password is set. */
function forgetIdleOpenDoorWalls(file: WallsFile, now: number): void {
  file.walls = file.walls.filter(
    (w) => !(w.status === 'in' && w.admittedBy === 'no-password' && now - w.lastSeenAt > OPEN_DOOR_FORGET_MS),
  );
}

function forgetIdleWaitingWalls(file: WallsFile, now: number): void {
  file.walls = file.walls.filter((w) => !(w.status === 'waiting' && now - w.lastSeenAt > WAITING_FORGET_MS));
}

/** Take one of a display's window places, or answer false when they are all gone. */
function takeWindowPlace(file: WallsFile, displayId: string | null): boolean {
  const key = displayId ?? SINGLE_DISPLAY_KEY;
  const used = file.windowAdmissions[key] ?? 0;
  if (used >= WINDOW_WALLS_PER_DISPLAY) return false;
  file.windowAdmissions[key] = used + 1;
  return true;
}

/**
 * Make a wall and the cookie value that proves it, or null when none may be
 * made:
 *
 * - On a hub with no password, when this address and browser already has
 *   its few entries. A browser that never keeps its cookie would otherwise
 *   cost an entry, and a write to the card, on every heartbeat. An entry is
 *   never handed to a second browser: two identical kiosks behind one
 *   address each keep their own.
 * - For a window wall, when that display's places are all taken. The count
 *   is checked and taken here, in the same step, so two walls arriving
 *   together cannot both have the last one.
 *
 * A few walls may wait from one address, and when the waiting list is full
 * the one that asked least recently goes: a new wall is never silently
 * refused.
 */
export function createWall(input: NewWall): Promise<{ entry: WallEntry; cookieValue: string } | null> {
  return locked(async () => {
    const file = await load(input.passwordSet);
    const now = Date.now();
    if (!input.passwordSet) forgetIdleOpenDoorWalls(file, now);
    forgetIdleWaitingWalls(file, now);

    const userAgent = input.userAgent.slice(0, 300);
    if (input.admittedBy === 'no-password') {
      const sameBrowser = file.walls.filter((w) => w.admittedBy === 'no-password' && w.address === input.address && w.userAgent === userAgent);
      if (sameBrowser.length >= MAX_OPEN_DOOR_PER_BROWSER) return null;
      const open = file.walls.filter((w) => w.admittedBy === 'no-password');
      if (open.length >= MAX_OPEN_DOOR_WALLS) {
        const oldest = open.reduce((a, b) => (a.lastSeenAt <= b.lastSeenAt ? a : b));
        file.walls = file.walls.filter((w) => w !== oldest);
      }
    }
    if (input.status === 'waiting') {
      const sameAddress = file.walls.filter((w) => w.status === 'waiting' && w.address === input.address);
      if (sameAddress.length >= MAX_WAITING_PER_ADDRESS) {
        const oldest = sameAddress.reduce((a, b) => (a.lastSeenAt <= b.lastSeenAt ? a : b));
        file.walls = file.walls.filter((w) => w !== oldest);
      }
      const waiting = file.walls.filter((w) => w.status === 'waiting');
      if (waiting.length >= MAX_WAITING_WALLS) {
        const oldest = waiting.reduce((a, b) => (a.lastSeenAt <= b.lastSeenAt ? a : b));
        file.walls = file.walls.filter((w) => w !== oldest);
      }
    }
    if (input.status === 'in' && input.admittedBy === 'window' && !takeWindowPlace(file, input.displayId)) return null;

    const secret = crypto.randomBytes(32).toString('hex');
    const entry: WallEntry = {
      id: crypto.randomBytes(12).toString('hex'),
      secretHash: hashSecret(secret),
      status: input.status,
      ...(input.admittedBy ? { admittedBy: input.admittedBy } : {}),
      displayId: input.displayId,
      ...(input.askedAsNew ? { askedAsNew: true } : {}),
      address: input.address,
      userAgent,
      ...(input.viewport ? { viewport: input.viewport } : {}),
      ...(input.hubScreen ? { hubScreen: true } : {}),
      createdAt: now,
      lastSeenAt: now,
      cookieIssuedAt: now,
    };
    file.walls.push(entry);
    await persist();
    return { entry, cookieValue: `${entry.id}.${secret}` };
  });
}

/**
 * Let a waiting wall in. False when there is no such wall, or when it is a
 * window wall and that display's places are all taken.
 *
 * `displayId`, when given, is the display it is being let in for; a window
 * place is taken from that display, the one the caller checked.
 */
export function letWallIn(id: string, admittedBy: WallAdmission, opts: { passwordSet?: boolean; displayId?: string | null } = {}): Promise<boolean> {
  return locked(async () => {
    const file = await load(opts.passwordSet ?? true);
    const entry = file.walls.find((w) => w.id === id);
    if (!entry) return false;
    if (entry.status === 'in') return true;
    const displayId = opts.displayId !== undefined ? opts.displayId : entry.displayId;
    if (admittedBy === 'window' && !takeWindowPlace(file, displayId)) return false;
    entry.status = 'in';
    entry.admittedBy = admittedBy;
    entry.displayId = displayId;
    delete entry.askedAsNew;
    await persist();
    return true;
  });
}

/** The removal was made in memory but could not be saved. */
export class WallRemovalNotSavedError extends Error {
  constructor() {
    super('The wall was removed for now, but Home Screens could not save that. Check the card is not full, then remove it again.');
    this.name = 'WallRemovalNotSavedError';
  }
}

/**
 * Remove a wall. Its cookie stops working on the next request, and it is
 * remembered as removed so the changeover window does not take it back.
 *
 * False when there is no such wall. Throws `WallRemovalNotSavedError` when
 * the removal could not be written: the wall stays out while the hub runs,
 * but a restart would bring it back, so the caller must not report success.
 */
export function removeWall(id: string, passwordSet = true): Promise<boolean> {
  return locked(async () => {
    const file = await load(passwordSet);
    const before = file.walls.length;
    file.walls = file.walls.filter((w) => w.id !== id);
    if (file.walls.length === before) return false;
    file.removed = [...(file.removed ?? []), id].slice(-MAX_REMOVED_REMEMBERED);
    if (!(await persist())) throw new WallRemovalNotSavedError();
    return true;
  });
}

export interface WallsSnapshot {
  windowStartedAt: number | null;
  windowAdmissions: Record<string, number>;
  walls: WallEntry[];
}

/** Every wall, with idle waiting ones dropped first. A copy: callers cannot change the store through it. */
export function readWalls(passwordSet: boolean): Promise<WallsSnapshot> {
  return locked(async () => {
    const file = await load(passwordSet);
    const now = Date.now();
    const before = file.walls.length;
    forgetIdleWaitingWalls(file, now);
    if (!passwordSet) forgetIdleOpenDoorWalls(file, now);
    if (file.walls.length !== before) await persist();
    return structuredClone({
      windowStartedAt: file.windowStartedAt,
      windowAdmissions: file.windowAdmissions,
      walls: file.walls,
    });
  });
}

/**
 * A password is being set for the first time. The walls showing right now
 * stay let in from here on; ones that stopped showing are dropped, so a
 * phone that opened the wall once last month does not keep its place.
 * Returns the walls that stay.
 */
export function keepShowingWallsOnFirstPassword(): Promise<WallEntry[]> {
  return locked(async () => {
    const file = await load(false);
    forgetIdleOpenDoorWalls(file, Date.now());
    await persist();
    return structuredClone(file.walls.filter((w) => w.status === 'in'));
  });
}

/**
 * A restore just gave this hub its first password: a rebuilt hub getting its
 * backup back. The walls showing right now stay let in, as when a password
 * is set by hand, and the changeover window starts here, as it did on the
 * update's first boot, so the household's displays that were off come back
 * by themselves. A window that ever started is never started again, and an
 * unreadable file is left alone. True when the window started.
 */
export function startWindowAfterRestoredPassword(): Promise<boolean> {
  return locked(async () => {
    const file = await load(false);
    if (unreadable) return false;
    forgetIdleOpenDoorWalls(file, Date.now());
    const starts = file.windowStartedAt === null;
    if (starts) file.windowStartedAt = Date.now();
    await persist();
    return starts;
  });
}

/** @internal Forget the working copy so the next read comes from the file. */
export function __resetWallsForTests(): void {
  memory = null;
  memorySignature = '';
  dirty = false;
  unreadable = false;
  lastFlushAt = 0;
  queue = Promise.resolve();
}
