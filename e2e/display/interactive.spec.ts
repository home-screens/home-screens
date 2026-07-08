import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import type { ModuleInstance } from '@/types/config';

test('interactive todo: tapping an item toggles and persists it', async ({ page, request }) => {
  const todo = buildModuleInstance('todo', {
    title: 'Tasks',
    interactive: true,
    items: [{ id: 'i1', text: 'TAP ME', completed: false }],
  });
  const display = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [todo])],
  }));

  const item = display.module('todo').getByText('TAP ME');
  const toggled = page.waitForResponse(
    (r) => r.url().includes('/api/todo/toggle') && r.request().method() === 'POST' && r.ok(),
  );
  await item.click();
  await toggled;

  // Persisted in data/todo-state.json (created on first toggle).
  await expect
    .poll(async () => {
      const res = await request.get('/api/todo/state');
      return (await res.json()).completed as Record<string, boolean>;
    })
    .toMatchObject({ i1: true });

  // Optimistic + server-confirmed: the row reports itself pressed.
  await expect(display.module('todo').getByRole('button', { name: /TAP ME/ })).toHaveAttribute('aria-pressed', 'true');
});

test('display-control: tapping Next enqueues a next-screen command', async ({ page, request }) => {
  const control = buildModuleInstance('display-control');
  await renderOnDisplay(page, request, baseConfig({
    screens: [
      makeScreen('a', 'A', [control]),
      makeScreen('b', 'B', [textModule('SCREEN B')]),
    ],
    settings: { rotationIntervalMs: 3_600_000 },
  }));

  // Drain any leftover queue from a prior test in this worker.
  await request.get('/api/display/commands');
  await page.getByRole('button', { name: 'Next screen' }).click();

  // Legacy target 'self' → no ?display= → the __default__ queue the kiosk polls.
  await expect
    .poll(async () => {
      const res = await request.get('/api/display/commands');
      return ((await res.json()).commands as Array<{ type: string }>).map((c) => c.type);
    }, { timeout: 6000 })
    .toContain('next-screen');
});

/**
 * Shared-state conditional visibility gate. The display filters modules through
 * `evaluateVisibility` (ScreenRenderer), and with no producer publishing the
 * referenced key the `whenUnknown` fallback governs: 'hide' removes the module,
 * 'show' keeps it. (The full producer → consumer flip, where a published value
 * changes the outcome at runtime, is exercised with a fixture plugin in the
 * plugin spec.)
 */
function conditioned(id: string, content: string, whenUnknown: 'hide' | 'show'): ModuleInstance {
  return textModule(content, {
    id,
    visibility: { conditions: [{ kind: 'state', sourceKey: 'demo.flag', equals: 'on' }], whenUnknown },
  });
}

test('a module whose visibility key is unknown is hidden when whenUnknown=hide', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [
      conditioned('gated', 'CONDITIONED CONTENT', 'hide'),
      textModule('ALWAYS VISIBLE', { id: 'always' }),
    ])],
  }));

  await expect(page.getByText('ALWAYS VISIBLE')).toBeVisible();
  await expect(page.locator('[data-module-id="gated"]')).toHaveCount(0);
});

test('the same module renders when whenUnknown=show', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [conditioned('gated', 'CONDITIONED CONTENT', 'show')])],
  }));

  await expect(page.getByText('CONDITIONED CONTENT')).toBeVisible();
});
