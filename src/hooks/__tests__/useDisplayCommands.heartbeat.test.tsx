// @vitest-environment jsdom

/**
 * The command drain is the wall's one 3 s request to the hub. Its answer's
 * revisions go to the heartbeat readers, after the commands (which exist
 * nowhere else once drained). An editor preview reads the revisions alone,
 * and a refused beat still lets the wall notice a new build.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { subscribeRevisions, type DisplayRevisions } from '@/lib/display-heartbeat';
import type { CommandHandlers } from '../useDisplayCommands';

const REVISIONS: DisplayRevisions = { buildId: 'build-1', plugins: 'p1', config: '"c1"', timer: 't1' };

let beatStatus = 200;
// False plays a hub from before revisions existed, as after a rollback.
let answersRevisions = true;
let commands: unknown[] = [];
const fetched: string[] = [];
// A hub that stopped answering: every beat waits here until the test
// releases it (or, on the wall, until the request times out).
let hubAway = false;
let release: Array<() => void> = [];

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(async (url: string) => {
    fetched.push(url);
    if (hubAway) await new Promise<void>((resolve) => { release.push(resolve); });
    if (url === '/api/system/build-id') return { ok: true, text: async () => 'build-2' };
    return {
      ok: beatStatus === 200,
      status: beatStatus,
      json: async () => (url.startsWith('/api/display/commands')
        ? { commands, sharedStateWatched: false, ...(answersRevisions ? { revisions: REVISIONS } : {}) }
        : { revisions: REVISIONS }),
    };
  }),
}));

import { useDisplayCommands } from '../useDisplayCommands';

const order: string[] = [];
const published: DisplayRevisions[] = [];
let unsubscribe: () => void = () => {};

function handlers(): CommandHandlers {
  return {
    wake: () => order.push('wake'),
    sleep: vi.fn(),
    nextScreen: vi.fn(),
    prevScreen: vi.fn(),
    gotoScreen: vi.fn(),
    sleepOverride: vi.fn(),
    setBrightness: vi.fn(),
    reload: vi.fn(),
    showAlert: vi.fn(),
    showPhoto: vi.fn(),
    showRecipe: vi.fn(),
    hideRecipe: vi.fn(),
  };
}

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  beatStatus = 200;
  hubAway = false;
  release = [];
  answersRevisions = true;
  commands = [];
  fetched.length = 0;
  order.length = 0;
  published.length = 0;
  unsubscribe = subscribeRevisions((revisions) => {
    order.push('revisions');
    published.push(revisions);
  });
});

afterEach(() => {
  unsubscribe();
  cleanup();
  vi.useRealTimers();
});

describe('the display heartbeat', () => {
  it('drains this display, runs its commands, then hands on the revisions, every 3 s', async () => {
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers(), 'kitchen'));
    await flush();

    expect(fetched).toEqual(['/api/display/commands?display=kitchen']);
    expect(order).toEqual(['wake', 'revisions']);
    expect(published).toEqual([REVISIONS]);

    commands = [];
    await flush(3_000);
    expect(fetched).toHaveLength(2);
    expect(published).toHaveLength(2);
  });

  /**
   * While the hub is away a beat takes the whole request timeout to fail.
   * Starting another every 3 s meanwhile would stack them on dead sockets.
   */
  it('starts no new beat while the last one is still out, and beats again once it settles', async () => {
    hubAway = true;
    renderHook(() => useDisplayCommands(handlers(), 'kitchen'));
    await flush(0);
    expect(fetched).toHaveLength(1);

    await flush(15_000);
    expect(fetched).toHaveLength(1);

    hubAway = false;
    await act(async () => { release.forEach((r) => r()); });
    await flush(3_000);
    expect(fetched).toHaveLength(2);
    expect(published).toHaveLength(2);
  });

  it('in a preview, reads the revisions alone and runs no commands', async () => {
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers(), 'kitchen', false));
    await flush();

    expect(fetched).toEqual(['/api/display/revisions']);
    expect(order).toEqual(['revisions']);
  });

  it('after a refused beat, hands on the build id from the public endpoint alone', async () => {
    beatStatus = 403;
    renderHook(() => useDisplayCommands(handlers()));
    await flush();

    expect(fetched).toEqual(['/api/display/commands', '/api/system/build-id']);
    expect(published).toEqual([{ buildId: 'build-2' }]);
  });

  it('reloads once when the hub no longer accepts its key, then at most once a minute', async () => {
    beatStatus = 401;
    const h = handlers();
    renderHook(() => useDisplayCommands(h));
    await flush();
    expect(h.reload).toHaveBeenCalledTimes(1);
    // The reload is what gets the new key, so nothing else is asked for.
    expect(fetched).toEqual(['/api/display/commands']);

    // Still refused (this test's reload is a stand-in): no reload loop.
    await flush(3_000);
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(fetched.at(-1)).toBe('/api/system/build-id');

    await flush(60_000);
    expect(h.reload).toHaveBeenCalledTimes(2);
  });

  it('a preview the hub refuses does not reload', async () => {
    beatStatus = 401;
    const h = handlers();
    renderHook(() => useDisplayCommands(h, 'kitchen', false));
    await flush();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it('on a hub that answers without revisions, runs the commands and still hands on the build id', async () => {
    answersRevisions = false;
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers()));
    await flush();

    expect(fetched).toEqual(['/api/display/commands', '/api/system/build-id']);
    expect(order).toEqual(['wake', 'revisions']);
    expect(published).toEqual([{ buildId: 'build-2' }]);
  });
});

describe('the alert command', () => {
  async function run(...payloads: Array<Record<string, unknown>>) {
    commands = payloads.map((payload) => ({ type: 'alert', payload, timestamp: 1 }));
    const h = handlers();
    renderHook(() => useDisplayCommands(h, 'kitchen'));
    await flush();
    return vi.mocked(h.showAlert);
  }

  it('shows only text: a title or message that is anything else is left out', async () => {
    const showAlert = await run(
      { title: 'Dinner', message: { text: 'is ready' } },
      { title: { text: 'Dinner' }, message: ['now'] },
      { title: 'Storm', message: 'Close the windows' },
    );

    expect(showAlert.mock.calls.map(([alert]) => [alert.title, alert.message])).toEqual([
      ['Dinner', ''],
      ['Storm', 'Close the windows'],
    ]);
  });
});

describe('the show-photo command', () => {
  function photo(file: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { url: `/api/backgrounds/serve?file=${file}`, kind: 'image', durationMs: 60_000, ...extra };
  }

  /** Drain one beat of show-photo commands and hand back the handler they reach. */
  async function run(...payloads: Array<Record<string, unknown> | undefined>) {
    commands = payloads.map((payload) => ({ type: 'show-photo', payload, timestamp: 1 }));
    const h = handlers();
    renderHook(() => useDisplayCommands(h, 'kitchen'));
    await flush();
    return vi.mocked(h.showPhoto);
  }

  it('puts a library picture or video up with just its url, kind and duration', async () => {
    const expiresAt = Date.now() + 60_000;
    const showPhoto = await run(
      photo('lake.jpg', { expiresAt }),
      { url: '/api/backgrounds/serve?file=walk.mp4&mt=tok', kind: 'video', durationMs: 30_000, expiresAt },
    );

    expect(showPhoto.mock.calls).toEqual([
      [{ url: '/api/backgrounds/serve?file=lake.jpg', kind: 'image', durationMs: 60_000 }],
      [{ url: '/api/backgrounds/serve?file=walk.mp4&mt=tok', kind: 'video', durationMs: 30_000 }],
    ]);
  });

  it('passes a picture\'s size along, and ignores a size that is not two positive numbers', async () => {
    const showPhoto = await run(
      photo('sized.jpg', { width: 3000, height: 4000 }),
      photo('half.jpg', { width: 3000 }),
      photo('bad.jpg', { width: 0, height: 'tall' }),
    );

    expect(showPhoto.mock.calls).toEqual([
      [{ url: '/api/backgrounds/serve?file=sized.jpg', kind: 'image', durationMs: 60_000, width: 3000, height: 4000 }],
      [{ url: '/api/backgrounds/serve?file=half.jpg', kind: 'image', durationMs: 60_000 }],
      [{ url: '/api/backgrounds/serve?file=bad.jpg', kind: 'image', durationMs: 60_000 }],
    ]);
  });

  it('skips a photo whose time ran out more than a minute ago', async () => {
    const now = Date.now();
    const showPhoto = await run(
      photo('old.jpg', { expiresAt: now - 60_001 }),
      // Within a minute of the hub's clock still counts as on time.
      photo('recent.jpg', { expiresAt: now - 30_000 }),
    );

    expect(showPhoto).toHaveBeenCalledTimes(1);
    expect(showPhoto).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/backgrounds/serve?file=recent.jpg' }));
  });

  it('skips a url that is not the library serve route', async () => {
    const showPhoto = await run(
      photo('a.jpg', { url: 'https://example.com/api/backgrounds/serve?file=a.jpg' }),
      photo('a.jpg', { url: '/api/backgrounds/serve/a.jpg' }),
      photo('a.jpg', { url: '/api/plugins/proxy/x?file=a.jpg' }),
      photo('a.jpg', { url: 'javascript:alert(1)' }),
      photo('a.jpg', { url: 42 }),
      undefined,
      photo('good.jpg'),
    );

    // The last one proves the loop carried on past the ones it skipped.
    expect(showPhoto).toHaveBeenCalledTimes(1);
    expect(showPhoto).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/backgrounds/serve?file=good.jpg' }));
  });

  it('skips an unknown kind or a duration that is not a positive number', async () => {
    const showPhoto = await run(
      photo('a.jpg', { kind: 'audio' }),
      photo('b.jpg', { kind: undefined }),
      photo('c.jpg', { durationMs: 0 }),
      photo('d.jpg', { durationMs: -5_000 }),
      photo('e.jpg', { durationMs: '60000' }),
      photo('good.jpg'),
    );

    expect(showPhoto).toHaveBeenCalledTimes(1);
    expect(showPhoto).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/backgrounds/serve?file=good.jpg' }));
  });

  it('shows a photo that carries no expiry', async () => {
    const showPhoto = await run(photo('lake.jpg'));

    expect(showPhoto).toHaveBeenCalledWith({ url: '/api/backgrounds/serve?file=lake.jpg', kind: 'image', durationMs: 60_000 });
  });
});

describe('the show-recipe command', () => {
  const chili = {
    id: 'mealie:0f1e2d3c-4b5a-4968-8776-655443322110',
    name: 'Harvest Chili',
    prepTime: 20,
    photoUrl: '/api/mealie/image/0f1e2d3c-4b5a-4968-8776-655443322110',
  };

  /** Drain one beat of show-recipe commands and hand back the handler they reach. */
  async function run(...payloads: Array<Record<string, unknown> | undefined>) {
    commands = payloads.map((payload) => ({ type: 'show-recipe', payload, timestamp: 1 }));
    const h = handlers();
    renderHook(() => useDisplayCommands(h, 'kitchen'));
    await flush();
    return vi.mocked(h.showRecipe);
  }

  it('opens the meal the hub sent, as it sent it', async () => {
    const soup = { id: 'meal-1', name: 'Tomato Soup', ingredients: [{ name: 'Tomatoes' }], notes: 'Simmer.' };
    const showRecipe = await run({ meal: chili, expiresAt: Date.now() + 600_000 }, { meal: soup });

    expect(showRecipe.mock.calls).toEqual([[chili], [soup]]);
  });

  it('skips a recipe whose time ran out more than a minute ago', async () => {
    const now = Date.now();
    const showRecipe = await run(
      { meal: { ...chili, name: 'Old' }, expiresAt: now - 60_001 },
      // Within a minute of the hub's clock still counts as on time.
      { meal: chili, expiresAt: now - 30_000 },
    );

    expect(showRecipe.mock.calls).toEqual([[chili]]);
  });

  it('skips a payload that is not a meal', async () => {
    const showRecipe = await run(
      undefined,
      {},
      { meal: 'mealie:0f1e2d3c' },
      { meal: [chili] },
      { meal: { name: 'No id' } },
      { meal: { id: 'meal-1', name: '   ' } },
      { meal: { id: 'meal-1', name: 'Soup', ingredients: 'tomatoes' } },
      { meal: { id: 'meal-1', name: 'Soup', tags: 'dinner' } },
      { meal: chili },
    );

    // The last one proves the loop carried on past the ones it skipped.
    expect(showRecipe.mock.calls).toEqual([[chili]]);
  });

  it('takes a recipe down in the order the phone asked, naming it when the phone did', async () => {
    commands = [
      { type: 'show-recipe', payload: { meal: chili }, timestamp: 1 },
      { type: 'hide-recipe', payload: { mealId: chili.id }, timestamp: 2 },
      { type: 'hide-recipe', timestamp: 3 },
      { type: 'hide-recipe', payload: { mealId: 42 }, timestamp: 4 },
    ];
    const seen: string[] = [];
    const h = handlers();
    h.showRecipe = (meal) => { seen.push(`show ${meal.id}`); };
    h.hideRecipe = (mealId) => { seen.push(`hide ${mealId ?? 'any'}`); };
    renderHook(() => useDisplayCommands(h, 'kitchen'));
    await flush();

    expect(seen).toEqual([`show ${chili.id}`, `hide ${chili.id}`, 'hide any', 'hide any']);
  });
});
