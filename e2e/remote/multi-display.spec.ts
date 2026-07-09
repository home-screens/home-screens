import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { postHeartbeat, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

function multiDisplayConfig() {
  return baseConfig({
    displays: [
      { id: 'main', name: 'Main', screens: [
        makeScreen('m1', 'M1', [textModule('MAIN A')]),
        makeScreen('m2', 'M2', [textModule('MAIN B')]),
      ] },
      { id: 'kitchen', name: 'Kitchen', screens: [
        makeScreen('k1', 'K1', [textModule('KIT A')]),
        makeScreen('k2', 'K2', [textModule('KIT B')]),
        makeScreen('k3', 'K3', [textModule('KIT C')]),
      ] },
    ],
  });
}

async function drainTypes(request: APIRequestContext, display?: string): Promise<string[]> {
  const url = display ? `/api/display/commands?display=${display}` : '/api/display/commands';
  const res = await request.get(url);
  return ((await res.json()).commands as Array<{ type: string }>).map((c) => c.type);
}

/** Drain a display's queue and return the full envelope (including `sharedStateWatched`). */
async function drainEnvelope(
  request: APIRequestContext,
  display: string,
): Promise<{ commands: Array<{ type: string }>; sharedStateWatched: boolean }> {
  const res = await request.get(`/api/display/commands?display=${display}`);
  return res.json();
}

test('the display picker lists every registered display plus All', async ({ page, request }) => {
  await putConfig(request, multiDisplayConfig());
  await page.goto('/remote');

  await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Main', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kitchen', exact: true })).toBeVisible();
});

test('selecting a display scopes commands to only that display queue', async ({ page, request }) => {
  await putConfig(request, multiDisplayConfig());
  await page.goto('/remote');
  // Clear any leftover queue from a prior test in this worker.
  await drainTypes(request, 'kitchen');
  await drainTypes(request, 'main');

  await page.getByRole('button', { name: 'Kitchen', exact: true }).click();
  await page.getByRole('button', { name: 'Sleep Display' }).click();

  await expect.poll(() => drainTypes(request, 'kitchen'), { timeout: 5000 }).toContain('sleep');
  // main never received it (the poll above already drained kitchen).
  expect(await drainTypes(request, 'main')).not.toContain('sleep');
});

test('broadcasting with All fans a command out to every display', async ({ page, request }) => {
  await putConfig(request, multiDisplayConfig());
  await page.goto('/remote');
  await drainTypes(request, 'kitchen');
  await drainTypes(request, 'main');

  // 'All' is the default target when displays exist; click it to be explicit.
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Sleep Display' }).click();

  await expect.poll(() => drainTypes(request, 'main'), { timeout: 5000 }).toContain('sleep');
  await expect.poll(() => drainTypes(request, 'kitchen'), { timeout: 5000 }).toContain('sleep');
  // A broadcast ('all') also enqueues to the legacy __default__ queue
  // (enqueueCommand fans out to every known display PLUS __default__). Drain it
  // so the sleep doesn't linger for a later same-worker test whose real kiosk
  // polls __default__, consumes the stale sleep, and heartbeats back asleep.
  await drainTypes(request);
});

test('screen nav reflects the targeted display heartbeat and dispatches to it', async ({ page, request }) => {
  await putConfig(request, multiDisplayConfig());
  // Kitchen has 3 screens; seed its heartbeat so screen-nav enables for it.
  await postHeartbeat(request, { display: 'kitchen', screenCount: 3, currentIndex: 1 });
  await page.goto('/remote');
  await drainTypes(request, 'kitchen');

  // Screen-nav only shows for a specific display (hidden while broadcasting).
  await page.getByRole('button', { name: 'Kitchen', exact: true }).click();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  const next = page.getByRole('button', { name: 'Next screen' });
  await expect(next).toBeEnabled(); // waits out the status poll
  await next.click();

  await expect.poll(() => drainTypes(request, 'kitchen'), { timeout: 5000 }).toContain('next-screen');
});

test('the commands drain reports sharedStateWatched=false until an editor polls shared-state', async ({ request }) => {
  await putConfig(request, multiDisplayConfig());
  // A dedicated slug so an earlier test's editor-interest marker can't leak in.
  const slug = 'watched-a';

  // Before any editor interest, the drain envelope carries the flag as false.
  expect((await drainEnvelope(request, slug)).sharedStateWatched).toBe(false);

  // The editor polling a display's shared-state marks interest (15s TTL).
  const poll = await request.get(`/api/display/shared-state?display=${slug}`);
  expect(poll.ok()).toBe(true);

  // The very next command drain now advertises that an editor is watching, so
  // the display arms its fast bus-change re-reporting.
  await expect
    .poll(async () => (await drainEnvelope(request, slug)).sharedStateWatched, { timeout: 5000 })
    .toBe(true);
});

test('shared-state interest is scoped to the polled display, not its siblings', async ({ request }) => {
  await putConfig(request, multiDisplayConfig());
  const watched = 'watched-b';
  const other = 'watched-c';

  await request.get(`/api/display/shared-state?display=${watched}`);

  await expect
    .poll(async () => (await drainEnvelope(request, watched)).sharedStateWatched, { timeout: 5000 })
    .toBe(true);
  // A different display the editor never polled stays unwatched.
  expect((await drainEnvelope(request, other)).sharedStateWatched).toBe(false);
});
