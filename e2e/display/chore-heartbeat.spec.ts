import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedHouseholdChores } from '../helpers/api';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * A chore wall reads the chores and the rewards when they change, not on a
 * timer: the heartbeat names both lists' revisions, and the wall fetches one
 * only when its revision moves. The reads themselves answer an unchanged list
 * with a bodiless 304, which is what the phone and the kids' page (no
 * heartbeat there) live on.
 */
const ADA = 'hb-ada';
const DISHES = 'hb-dishes';
const BED = 'hb-bed';

async function setUp(request: APIRequestContext, sandboxDir: string) {
  await seedHouseholdChores(request, sandboxDir, {
    members: [{ id: ADA, name: 'Ada', emoji: '', color: '#f59e0b' }],
    chores: [DISHES, BED].map((id) => ({
      id, name: id === DISHES ? 'Load the dishwasher' : 'Make the bed', emoji: '', points: 2,
      frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
      assigneeIds: [ADA], rotation: 'fixed',
    })),
  });
  // Nothing done yet, whatever an earlier test in this worker ticked.
  const { today, completions } = await (await request.get('/api/chores')).json() as { today: string; completions: Array<{ choreId: string; memberId: string; date: string }> };
  for (const c of completions.filter((entry) => entry.memberId === ADA && entry.date === today)) {
    await request.post('/api/chores', { data: { choreId: c.choreId, memberId: ADA, date: today, direction: 'uncomplete' } });
  }
  const chart = buildModuleInstance('chore-chart', { view: 'board', allowDisplayComplete: true, showPoints: true });
  chart.id = 'chart';
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [chart])], settings: matrixSettings() }));
  return today;
}

/** Every GET the wall makes to one of `paths`, by URL. */
function watchReads(page: Page, paths = ['/api/chores', '/api/rewards']): string[] {
  const reads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && paths.includes(url.pathname)) reads.push(url.pathname + url.search);
  });
  return reads;
}

/** Resolves after `count` more heartbeats have been answered. */
async function beats(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.waitForResponse((r) => new URL(r.url()).pathname === '/api/display/commands', { timeout: 10_000 });
  }
}

test.describe('a chore wall follows the heartbeat', () => {
  // Each test watches a dozen 3 s beats go by.
  test.describe.configure({ timeout: 60_000 });

  test('reads the recent chore history and the rewards once at start, then nothing while nothing changes', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    const reads = watchReads(page);
    const configReads = watchReads(page, ['/api/config']);

    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    await expect(chart.getByRole('button', { name: /Load the dishwasher/ })).toHaveAttribute('aria-pressed', 'false');

    // Six beats (18 s). The chart read both lists as it mounted, before any
    // beat, and the answers' ETags are what the beats name, so the beats find
    // them current. The page was rendered from the config the beats name, so
    // the config is not fetched again either (a fetch would also have emptied
    // the data cache and cost another read of each list). The old wall read
    // both lists every 5 s.
    await beats(page, 6);
    expect([...reads].sort()).toEqual(['/api/chores?days=31', '/api/rewards']);
    expect(configReads).toEqual([]);
  });

  test('shows a tick made on another screen within a beat, by reading the chores once', async ({ page, request, sandboxDir }) => {
    const today = await setUp(request, sandboxDir);
    const reads = watchReads(page);
    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    const dishes = chart.getByRole('button', { name: /Load the dishwasher/ });
    await expect(dishes).toHaveAttribute('aria-pressed', 'false');
    await beats(page, 1);
    const start = reads.length;

    const reread = page.waitForResponse((r) => r.url().includes('/api/chores?days=31') && r.request().method() === 'GET' && r.status() === 200);
    expect((await request.post('/api/chores', { data: { choreId: DISHES, memberId: ADA, date: today, direction: 'complete' } })).ok()).toBe(true);
    await reread;

    await expect(dishes).toHaveAttribute('aria-pressed', 'true', { timeout: 8_000 });
    await expect(chart.getByRole('button', { name: /Make the bed/ })).toHaveAttribute('aria-pressed', 'false');
    // The tick moved points too, so both lists were read, once each.
    await beats(page, 2);
    expect([...reads.slice(start)].sort()).toEqual(['/api/chores?days=31', '/api/rewards']);
  });

  test('a tick on the wall itself shows at once and is not undone by the reads after it', async ({ page, request, sandboxDir }) => {
    const today = await setUp(request, sandboxDir);
    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    const dishes = chart.getByRole('button', { name: /Load the dishwasher/ });
    await expect(dishes).toHaveAttribute('aria-pressed', 'false');

    const posted = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/chores' && r.request().method() === 'POST' && r.ok());
    await dishes.click();
    await posted;
    await expect(dishes).toHaveAttribute('aria-pressed', 'true');

    // The heartbeat names the new revisions and the wall reads both lists
    // again; the tick must survive them.
    await beats(page, 3);
    await expect(dishes).toHaveAttribute('aria-pressed', 'true');
    const saved = await (await request.get('/api/chores')).json() as { completions: Array<{ choreId: string; date: string }> };
    expect(saved.completions).toContainEqual(expect.objectContaining({ choreId: DISHES, date: today }));
  });

  /* The wall keeps the bytes of its last chores read so an unchanged answer
   * changes nothing on screen. Its own tick shows the POST's answer instead;
   * if another screen undoes that tick before the wall reads again, the next
   * answer is byte for byte the one it read before the tick, and must still
   * take the tick back off. */
  test('a tick undone elsewhere before the wall reads again comes off, though the answer matches the one before it', async ({ page, request, sandboxDir }) => {
    const today = await setUp(request, sandboxDir);
    const reads = watchReads(page);
    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    const dishes = chart.getByRole('button', { name: /Load the dishwasher/ });
    await expect(dishes).toHaveAttribute('aria-pressed', 'false');
    // A beat on, so the wall holds the bytes of its only read.
    await beats(page, 1);
    expect(reads).toHaveLength(2);
    const before = await (await request.get('/api/chores?days=31')).text();

    // Hold the wall's next chores read until the other screen has undone it.
    let release!: () => void;
    const undone = new Promise<void>((resolve) => { release = resolve; });
    await page.route((url) => url.pathname === '/api/chores' && url.search === '?days=31', async (route) => {
      await undone;
      await route.continue();
    });
    const posted = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/chores' && r.request().method() === 'POST' && r.ok());
    await dishes.click();
    await posted;
    await expect(dishes).toHaveAttribute('aria-pressed', 'true');

    await request.post('/api/chores', { data: { choreId: DISHES, memberId: ADA, date: today, direction: 'uncomplete' } });
    expect(await (await request.get('/api/chores?days=31')).text()).toBe(before);
    const reread = page.waitForResponse((r) => r.url().endsWith('/api/chores?days=31') && r.request().method() === 'GET');
    release();
    await reread;

    await expect(dishes).toHaveAttribute('aria-pressed', 'false', { timeout: 8_000 });
  });
});

test.describe('the chores and rewards reads revalidate', () => {
  test('an unchanged list is a 304, a changed one is sent again, and the heartbeat names the same ETags', async ({ request, sandboxDir }) => {
    const today = await setUp(request, sandboxDir);

    for (const url of ['/api/chores?days=31', '/api/chores', '/api/rewards']) {
      const first = await request.get(url);
      expect(first.status()).toBe(200);
      expect(first.headers()['cache-control']).toBe('no-cache');
      const etag = first.headers()['etag'];
      expect(etag).toMatch(/^"[0-9a-f]{24}"$/);
      const again = await request.get(url, { headers: { 'If-None-Match': etag } });
      expect(again.status()).toBe(304);
      expect(await again.body()).toHaveLength(0);
    }

    const chores = (await request.get('/api/chores?days=31')).headers()['etag'];
    const rewards = (await request.get('/api/rewards')).headers()['etag'];
    const { revisions } = await (await request.get('/api/display/revisions')).json() as { revisions: { chores: string; rewards: string } };
    expect(revisions).toMatchObject({ chores, rewards });

    await request.post('/api/chores', { data: { choreId: DISHES, memberId: ADA, date: today, direction: 'complete' } });
    const changed = await request.get('/api/chores?days=31', { headers: { 'If-None-Match': chores } });
    expect(changed.status()).toBe(200);
    expect(changed.headers()['etag']).not.toBe(chores);
    // The tick paid two tickets, so the rewards moved as well.
    expect((await request.get('/api/rewards', { headers: { 'If-None-Match': rewards } })).status()).toBe(200);
  });

  test('the kids\' page asks for the recent history and the browser revalidates it', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    const first = page.waitForResponse((r) => r.url().endsWith('/api/chores?days=31') && r.request().method() === 'GET');
    await page.goto('/chores');
    const answered = await first;
    const etag = await answered.headerValue('etag');
    expect(etag).toMatch(/^"[0-9a-f]{24}"$/);
    expect((await answered.request().sizes()).responseBodySize).toBeGreaterThan(0);

    // The next read sends the ETag back on its own and gets nothing new.
    const next = page.waitForRequest((r) => r.url().endsWith('/api/chores?days=31') && r.method() === 'GET');
    await page.reload();
    const request2 = await next;
    expect((await request2.allHeaders())['if-none-match']).toBe(etag);
    // The page is handed the kept answer as a 200; the hub sent no body.
    await request2.response();
    expect((await request2.sizes()).responseBodySize).toBe(0);
  });
});
