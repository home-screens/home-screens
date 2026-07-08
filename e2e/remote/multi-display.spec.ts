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
