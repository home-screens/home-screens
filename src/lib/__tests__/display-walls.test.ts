import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { WINDOW_WALLS_PER_DISPLAY } from '../display-admission';
import {
  MAX_OPEN_DOOR_PER_BROWSER,
  MAX_OPEN_DOOR_WALLS,
  MAX_WAITING_PER_ADDRESS,
  MAX_WAITING_WALLS,
  OPEN_DOOR_FORGET_MS,
  WAITING_FORGET_MS,
  WallRemovalNotSavedError,
  __resetWallsForTests,
  askAgainAs,
  buildWallCookie,
  cookieNamesRemovedWall,
  initWalls,
  createWall,
  findWall,
  keepShowingWallsOnFirstPassword,
  letWallIn,
  readWalls,
  removeWall,
  touchWall,
  type NewWall,
} from '../display-walls';

const origCwd = process.cwd();
let tmpCwd: string;

beforeEach(async () => {
  tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-walls-cwd-'));
  await fs.mkdir(path.join(tmpCwd, 'data'), { recursive: true });
  process.chdir(tmpCwd);
  __resetWallsForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.chdir(origCwd);
  await fs.rm(tmpCwd, { recursive: true, force: true });
});

const wall = (over: Partial<NewWall> = {}): NewWall => ({
  status: 'in',
  admittedBy: 'let-in',
  displayId: 'kitchen',
  address: '192.168.1.50',
  userAgent: 'Chromium on a Pi',
  passwordSet: true,
  ...over,
});

const cookie = (value: string) => `other=1; hs-display=${value}`;

async function fileOnDisk() {
  return JSON.parse(await fs.readFile(path.join(tmpCwd, 'data', 'display-walls.json'), 'utf8'));
}

describe('wall cookies', () => {
  it('finds a wall by the cookie it was given', async () => {
    const made = (await createWall(wall()))!;
    const found = await findWall(cookie(made.cookieValue), true);
    expect(found?.id).toBe(made.entry.id);
    expect(found?.status).toBe('in');
  });

  it('keeps only a hash of the secret', async () => {
    const made = (await createWall(wall()))!;
    const secret = made.cookieValue.split('.')[1];
    const raw = await fs.readFile(path.join(tmpCwd, 'data', 'display-walls.json'), 'utf8');
    expect(raw).not.toContain(secret);
    expect(made.entry.secretHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a made-up cookie, a wrong secret and a missing one', async () => {
    const made = (await createWall(wall()))!;
    expect(await findWall(cookie('garbage'), true)).toBeNull();
    expect(await findWall(cookie(`${made.entry.id}.wrong`), true)).toBeNull();
    expect(await findWall(cookie(`${made.entry.id}.`), true)).toBeNull();
    expect(await findWall('hs-session=abc', true)).toBeNull();
  });

  it('refuses a removed wall on the very next look', async () => {
    const made = (await createWall(wall()))!;
    expect(await removeWall(made.entry.id)).toBe(true);
    expect(await findWall(cookie(made.cookieValue), true)).toBeNull();
    expect(await removeWall(made.entry.id)).toBe(false);
  });

  it('builds a cookie page code cannot read, that stays on this host', () => {
    const header = buildWallCookie('id.secret', new Request('http://hub.local:3000/api/display/commands'));
    expect(header).toContain('hs-display=id.secret');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).not.toMatch(/Domain=/i);
    expect(header).not.toContain('Secure');
    expect(buildWallCookie('id.secret', new Request('https://hub.example/api/display/commands'))).toContain('Secure');
  });
});

describe('waiting walls', () => {
  it('holds a cookie that is found but is not let in', async () => {
    const made = (await createWall(wall({ status: 'waiting', admittedBy: undefined })))!;
    expect((await findWall(cookie(made.cookieValue), true))?.status).toBe('waiting');
  });

  it('lets in exactly the wall that was picked, not another waiting for the same display', async () => {
    const pi = (await createWall(wall({ status: 'waiting', admittedBy: undefined, address: '192.168.1.50' })))!;
    const guest = (await createWall(wall({ status: 'waiting', admittedBy: undefined, address: '192.168.1.77' })))!;
    expect(await letWallIn(pi.entry.id, 'let-in')).toBe(true);
    expect((await findWall(cookie(pi.cookieValue), true))?.status).toBe('in');
    expect((await findWall(cookie(guest.cookieValue), true))?.status).toBe('waiting');
  });

  it('answers false for a wall that is no longer there', async () => {
    expect(await letWallIn('nope', 'let-in')).toBe(false);
  });

  it('allows a few from one address and drops that address\'s oldest beyond that', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1) });
    const made = [];
    for (let i = 0; i < MAX_WAITING_PER_ADDRESS + 1; i++) {
      made.push((await createWall(wall({ status: 'waiting', admittedBy: undefined })))!);
      vi.advanceTimersByTime(1000);
    }
    const waiting = (await readWalls(true)).walls;
    expect(waiting).toHaveLength(MAX_WAITING_PER_ADDRESS);
    expect(waiting.map((w) => w.id)).not.toContain(made[0].entry.id);
  });

  it('never refuses a new wall when the list is full: the one that asked least recently goes', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1) });
    const first = (await createWall(wall({ status: 'waiting', admittedBy: undefined, address: '10.0.0.0' })))!;
    for (let i = 1; i < MAX_WAITING_WALLS; i++) {
      vi.advanceTimersByTime(1000);
      await createWall(wall({ status: 'waiting', admittedBy: undefined, address: `10.0.0.${i}` }));
    }
    vi.advanceTimersByTime(1000);
    const late = (await createWall(wall({ status: 'waiting', admittedBy: undefined, address: '10.0.1.1' })))!;
    const ids = (await readWalls(true)).walls.map((w) => w.id);
    expect(ids).toHaveLength(MAX_WAITING_WALLS);
    expect(ids).toContain(late.entry.id);
    expect(ids).not.toContain(first.entry.id);
  });

  it('drops a waiting wall ten minutes after it stops asking', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1) });
    const made = (await createWall(wall({ status: 'waiting', admittedBy: undefined })))!;
    vi.advanceTimersByTime(WAITING_FORGET_MS + 1);
    expect((await readWalls(true)).walls).toHaveLength(0);
    expect(await findWall(cookie(made.cookieValue), true)).toBeNull();
  });
});

describe('walls on a hub with no password', () => {
  const open = (over: Partial<NewWall> = {}) => wall({ admittedBy: 'no-password', passwordSet: false, ...over });

  it('starts no changeover window: there is nothing to move over', async () => {
    await createWall(open());
    expect((await readWalls(false)).windowStartedAt).toBeNull();
  });

  it('forgets a wall ten minutes after it stops showing', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1) });
    await createWall(open());
    vi.advanceTimersByTime(OPEN_DOOR_FORGET_MS + 1);
    expect((await readWalls(false)).walls).toHaveLength(0);
  });

  it('stops making entries for a browser that keeps coming back without its cookie', async () => {
    // A browser that does not keep cookies must not cost a write per heartbeat.
    for (let i = 0; i < MAX_OPEN_DOOR_PER_BROWSER; i++) expect(await createWall(open())).not.toBeNull();
    expect(await createWall(open())).toBeNull();
    expect((await readWalls(false)).walls).toHaveLength(MAX_OPEN_DOOR_PER_BROWSER);
  });

  it('gives two identical browsers behind one address a cookie each, and never hands one\'s entry to the other', async () => {
    // Two kiosks behind a repeater: same address, same browser. Both must
    // still be let in when a password is set later.
    const first = (await createWall(open()))!;
    const second = (await createWall(open()))!;
    expect(second.entry.id).not.toBe(first.entry.id);
    await keepShowingWallsOnFirstPassword();
    expect((await findWall(cookie(first.cookieValue), true))?.status).toBe('in');
    expect((await findWall(cookie(second.cookieValue), true))?.status).toBe('in');
  });

  it('stays bounded however many browsers pass through', async () => {
    for (let i = 0; i < MAX_OPEN_DOOR_WALLS + 25; i++) {
      await createWall(open({ address: `10.1.${Math.floor(i / 250)}.${i % 250}` }));
    }
    expect((await readWalls(false)).walls).toHaveLength(MAX_OPEN_DOOR_WALLS);
  }, 30_000);

  it('keeps the walls that are showing when a password is first set, and drops the rest', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1) });
    const guest = (await createWall(open({ address: '192.168.1.77', userAgent: 'A phone' })))!;
    vi.advanceTimersByTime(OPEN_DOOR_FORGET_MS + 60_000);
    const kitchen = (await createWall(open()))!;

    const kept = await keepShowingWallsOnFirstPassword();
    expect(kept.map((w) => w.id)).toEqual([kitchen.entry.id]);
    expect(await findWall(cookie(guest.cookieValue), true)).toBeNull();

    // From here on there is a password, and a kept wall is never forgotten
    // for being switched off: the door that let it in has closed behind it.
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    expect((await readWalls(true)).walls.map((w) => w.id)).toEqual([kitchen.entry.id]);
    expect((await findWall(cookie(kitchen.cookieValue), true))?.status).toBe('in');
  });
});

describe('a waiting wall and the display it asked for', () => {
  const waitingFor = (displayId: string | null, askedAsNew: boolean) =>
    createWall(wall({ status: 'waiting', admittedBy: undefined, displayId, askedAsNew }));

  it('does not change the display it waits for just by being seen', async () => {
    const made = (await waitingFor('made-up-name', true))!;
    const found = (await findWall(cookie(made.cookieValue), true))!;
    await touchWall(found, { displayId: null, address: '192.168.1.77' });
    expect(found.displayId).toBe('made-up-name');
    expect(found.askedAsNew).toBe(true);
  });

  it('loses "asked under a new name" when it asks again for a display the hub already has', async () => {
    // The hole this closes: ask under a made-up name, then ask as `main`,
    // and be let in as though a grown-up had just added `main`.
    const made = (await waitingFor('made-up-name', true))!;
    const found = (await findWall(cookie(made.cookieValue), true))!;
    await askAgainAs(found, null, false);
    expect(found.displayId).toBeNull();
    expect(found.askedAsNew).toBeUndefined();
    expect(found.status).toBe('waiting');
  });

  it('does not let a wall that is already in be moved by asking again', async () => {
    const made = (await createWall(wall()))!;
    await askAgainAs(made.entry, 'elsewhere', true);
    expect(made.entry.displayId).toBe('kitchen');
    expect(made.entry.askedAsNew).toBeUndefined();
  });
});

describe('removing a wall', () => {
  it('remembers the wall as removed, so the window does not take it back', async () => {
    const made = (await createWall(wall()))!;
    expect(await cookieNamesRemovedWall(cookie(made.cookieValue), true)).toBe(false);
    await removeWall(made.entry.id);
    expect(await cookieNamesRemovedWall(cookie(made.cookieValue), true)).toBe(true);
    expect(await cookieNamesRemovedWall(cookie('someone.else'), true)).toBe(false);
    expect(await cookieNamesRemovedWall('hs-session=abc', true)).toBe(false);
  });

  it('does not report success when the removal could not be saved', async () => {
    const made = (await createWall(wall()))!;
    await fs.chmod(path.join(tmpCwd, 'data'), 0o500);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(removeWall(made.entry.id)).rejects.toBeInstanceOf(WallRemovalNotSavedError);
    await fs.chmod(path.join(tmpCwd, 'data'), 0o700);
    // Out while the hub runs, all the same.
    expect(await findWall(cookie(made.cookieValue), true)).toBeNull();
  });
});

describe('many walls arriving at once', () => {
  it('keeps every one of them, from a cold start', async () => {
    const made = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createWall(wall({ address: `192.168.1.${100 + i}` }))),
    );
    expect(made.every(Boolean)).toBe(true);
    const onDisk = (await fileOnDisk()).walls.map((w: { id: string }) => w.id).sort();
    expect(onDisk).toEqual(made.map((m) => m!.entry.id).sort());
    __resetWallsForTests(); // a restart
    for (const m of made) expect((await findWall(cookie(m!.cookieValue), true))?.status).toBe('in');
  });

  it('never gives out more window places than a display has, however they arrive', async () => {
    const made = await Promise.all(
      Array.from({ length: WINDOW_WALLS_PER_DISPLAY + 3 }, (_, i) => createWall(wall({ admittedBy: 'window', address: `192.168.1.${100 + i}` }))),
    );
    expect(made.filter(Boolean)).toHaveLength(WINDOW_WALLS_PER_DISPLAY);
    expect((await readWalls(true)).windowAdmissions).toEqual({ kitchen: WINDOW_WALLS_PER_DISPLAY });
  });

  it('takes a waiting wall\'s window place from the display it is let in for', async () => {
    const made = (await createWall(wall({ status: 'waiting', admittedBy: undefined, displayId: 'made-up' })))!;
    expect(await letWallIn(made.entry.id, 'window', { displayId: 'kitchen' })).toBe(true);
    expect((await readWalls(true)).windowAdmissions).toEqual({ kitchen: 1 });
    expect(made.entry.displayId).toBe('kitchen');
  });

  it('refuses a window let-in once the places are gone, and leaves the wall waiting', async () => {
    for (let i = 0; i < WINDOW_WALLS_PER_DISPLAY; i++) await createWall(wall({ admittedBy: 'window', address: `192.168.1.${100 + i}` }));
    const late = (await createWall(wall({ status: 'waiting', admittedBy: undefined })))!;
    expect(await letWallIn(late.entry.id, 'window', { displayId: 'kitchen' })).toBe(false);
    expect((await findWall(cookie(late.cookieValue), true))?.status).toBe('waiting');
  });
});

describe('the changeover window', () => {
  it('starts the first time a hub that already has a password loads its walls, and never moves', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1) });
    const first = (await readWalls(true)).windowStartedAt;
    expect(first).toBe(Date.UTC(2026, 10, 1));
    vi.advanceTimersByTime(5 * 24 * 60 * 60 * 1000);
    __resetWallsForTests(); // a restart, a new build
    expect((await readWalls(true)).windowStartedAt).toBe(first);
  });

  it('starts at boot on a hub with a password, not whenever a wall first turns up', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1) });
    await initWalls(true);
    vi.advanceTimersByTime(90 * 24 * 60 * 60 * 1000);
    expect((await readWalls(true)).windowStartedAt).toBe(Date.UTC(2026, 10, 1));
  });

  it('starts none at boot on a hub with no password', async () => {
    await initWalls(false);
    expect((await readWalls(true)).windowStartedAt).toBeNull();
  });

  it('counts window walls per display, and removing one does not hand its place back', async () => {
    const one = (await createWall(wall({ admittedBy: 'window' })))!;
    await createWall(wall({ admittedBy: 'window', address: '192.168.1.51' }));
    await createWall(wall({ admittedBy: 'window', displayId: null, address: '192.168.1.52' }));
    expect((await readWalls(true)).windowAdmissions).toEqual({ kitchen: 2, main: 1 });
    await removeWall(one.entry.id);
    expect((await readWalls(true)).windowAdmissions).toEqual({ kitchen: 2, main: 1 });
  });

  it('does not count walls let in any other way', async () => {
    await createWall(wall({ admittedBy: 'hub-screen' }));
    await createWall(wall({ admittedBy: 'old-key', address: '192.168.1.51' }));
    expect((await readWalls(true)).windowAdmissions).toEqual({});
  });
});

describe('the file', () => {
  it('is read again after something else replaces it, such as a restored backup', async () => {
    const made = (await createWall(wall()))!;
    const saved = await fileOnDisk();
    await removeWall(made.entry.id);
    expect(await findWall(cookie(made.cookieValue), true)).toBeNull();
    await fs.writeFile(path.join(tmpCwd, 'data', 'display-walls.json'), JSON.stringify({ ...saved, restored: true }, null, 2));
    expect((await findWall(cookie(made.cookieValue), true))?.id).toBe(made.entry.id);
  });

  it('fails closed on a file that is there but cannot be read: no walls, no window, and the file is left alone', async () => {
    const made = (await createWall(wall()))!;
    const file = path.join(tmpCwd, 'data', 'display-walls.json');
    await fs.writeFile(file, '{ this is not json');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    __resetWallsForTests();

    expect(await findWall(cookie(made.cookieValue), true)).toBeNull();
    const snapshot = await readWalls(true);
    expect(snapshot.windowStartedAt).toBeNull();
    expect(snapshot.walls).toEqual([]);
    // A wall made meanwhile works from memory, but nothing overwrites the file.
    await createWall(wall({ address: '192.168.1.61' }));
    expect(await fs.readFile(file, 'utf8')).toBe('{ this is not json');
  });

  it('records the display a wall last showed, and where it is', async () => {
    const made = (await createWall(wall()))!;
    const found = (await findWall(cookie(made.cookieValue), true))!;
    await touchWall(found, { displayId: 'hallway', address: '192.168.1.99' });
    const saved = (await fileOnDisk()).walls[0];
    expect(saved.displayId).toBe('hallway');
    expect(saved.address).toBe('192.168.1.99');
  });

  it('goes on working from memory when the file cannot be written', async () => {
    const made = (await createWall(wall()))!;
    // A card that has gone read-only: nothing new can be written beside the file.
    await fs.chmod(path.join(tmpCwd, 'data'), 0o500);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = await createWall(wall({ address: '192.168.1.60' }));
    await fs.chmod(path.join(tmpCwd, 'data'), 0o700);
    expect(second).not.toBeNull();
    expect(spy).toHaveBeenCalled();
    expect((await findWall(cookie(made.cookieValue), true))?.status).toBe('in');
    expect((await findWall(cookie(second!.cookieValue), true))?.status).toBe('in');
  });
});
