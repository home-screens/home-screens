import { readFile } from 'node:fs/promises';
import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { dragPaletteToCanvas } from '../helpers/editor';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
}

/** Poll the persisted config until `read` satisfies the matcher. */
async function pollConfig<T>(request: APIRequestContext, read: (c: Awaited<ReturnType<typeof getConfig>>) => T) {
  return expect.poll(async () => read(await getConfig(request)));
}

/**
 * Grab a canvas module by its center and drag it by a raw screen-pixel delta,
 * waiting for the autosave PUT that follows the drop. Mirrors the resize test's
 * mouse-driven pattern; dnd-kit's PointerSensor needs >5px of travel, so the
 * final move is stepped rather than a single jump.
 */
async function dragModuleBy(page: Page, moduleId: string, dxPx: number, dyPx: number): Promise<void> {
  const box = (await page.locator(`[data-module-id="${moduleId}"]`).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dxPx, cy + dyPx, { steps: 15 });
  const saved = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
  await page.mouse.up();
  await saved;
}

/** Rendered scale of the canvas: its on-screen width over the 1080px display width. */
async function canvasScale(page: Page): Promise<number> {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return box.width / 1080;
}

/**
 * Dispatch `count` discrete ctrl+wheel notches on the canvas. The 35ms pause
 * between notches keeps each one above the hook's stream-gap window (25ms), so
 * every notch is a distinct click that must step the ladder — never throttled.
 * setTimeout can only overshoot, so the gap cannot collapse on slow CI.
 * Fine-grained stream timing (throttle, momentum decay) is unit-tested in
 * src/hooks/__tests__/useCanvasZoom.test.ts where the clock is fake.
 */
async function wheelNotch(page: Page, deltaY: number, count = 1): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.evaluate((d) => {
      document.querySelector('[data-testid="editor-canvas"]')!.dispatchEvent(
        new WheelEvent('wheel', { deltaY: d, ctrlKey: true, bubbles: true, cancelable: true }),
      );
    }, deltaY);
    await page.waitForTimeout(35);
  }
}

test.describe('module lifecycle', () => {
  test('resize handle enlarges the module and autosaves', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('RESIZE ME', { id: 'rz', size: { w: 400, h: 200 } })])],
    }));
    await openEditor(page);

    await page.locator('[data-module-id="rz"]').click();
    // The resize handle lives in the canvas-level selection overlay, not the
    // module wrapper (it must stay reachable when the module is stacked low).
    const handle = page.locator('[data-testid="selection-overlay"] .cursor-se-resize');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120, { steps: 15 });
    const saved = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
    await page.mouse.up();
    await saved;

    // The resize gesture ends with the browser dispatching a trailing click
    // (on the handle or the canvas, whichever the release point makes the
    // target). It must not read as a background click: the module stays
    // selected with its handle still grabbable.
    await expect(page.locator('[data-testid="selection-overlay"]')).toBeVisible();

    await pollConfig(request, (c) => c.screens[0].modules[0].size.w).then((p) => p.toBeGreaterThan(400));
    await pollConfig(request, (c) => c.screens[0].modules[0].size.h).then((p) => p.toBeGreaterThan(200));
  });

  /**
   * The canvas clips at its border and the resize handle sits at the module's
   * far corner, so a resize allowed past the edge takes the handle with it and
   * the module can no longer be resized or (the drag clamp assumes it fits)
   * moved. The store stops the size at the edge instead, from wherever the
   * module sits, and the handle stays inside the canvas.
   */
  test('resizing past the canvas edge stops at the edge and keeps the handle reachable', async ({ page, request }) => {
    // 80px of canvas to the right, 120px below: any real drag overshoots both.
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('EDGE', { id: 'edge', position: { x: 600, y: 1600 }, size: { w: 400, h: 200 } })])],
    }));
    await openEditor(page);

    await page.locator('[data-module-id="edge"]').click();
    const handle = page.locator('[data-testid="selection-overlay"] .cursor-se-resize');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 300, { steps: 15 });
    const saved = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
    await page.mouse.up();
    await saved;

    await pollConfig(request, (c) => c.screens[0].modules[0].size).then((p) => p.toEqual({ w: 480, h: 320 }));

    const canvas = (await page.getByTestId('editor-canvas').boundingBox())!;
    const after = (await handle.boundingBox())!;
    expect(after.x + after.width, 'handle should stay inside the canvas').toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(after.y + after.height, 'handle should stay inside the canvas').toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  });

  test('a module saved past the canvas edge can still be grabbed and pulled back', async ({ page, request }) => {
    // An older save, a hand-edited file, or a display whose dimensions shrank.
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('BIG', { id: 'big', position: { x: 0, y: 0 }, size: { w: 1400, h: 2200 } })])],
    }));
    await openEditor(page);

    await page.locator('[data-module-id="big"]').click();
    const handle = page.locator('[data-testid="selection-overlay"] .cursor-se-resize');
    await expect(handle).toBeVisible();
    const canvas = (await page.getByTestId('editor-canvas').boundingBox())!;
    const box = (await handle.boundingBox())!;
    // The ring covers the visible part of the module, so the handle is at the
    // canvas corner rather than 320x280 canvas-px beyond it.
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y - 60, { steps: 15 });
    const saved = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
    await page.mouse.up();
    await saved;

    // Back inside the canvas after one drag of the handle.
    await pollConfig(request, (c) => c.screens[0].modules[0].size.w).then((p) => p.toBeLessThanOrEqual(1080));
    await pollConfig(request, (c) => c.screens[0].modules[0].size.h).then((p) => p.toBeLessThanOrEqual(1920));
  });

  test('deleting a module removes it from config and the canvas', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('DELETE ME', { id: 'del' })])],
    }));
    await openEditor(page);

    await page.locator('[data-module-id="del"]').click();
    await page.getByRole('button', { name: 'Delete Module' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(0));
    await expect(page.locator('[data-module-id="del"]')).toBeHidden();
  });

  test('undo restores a deleted module and redo removes it again', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('UNDO ME', { id: 'u1' })])],
    }));
    await openEditor(page);

    await page.locator('[data-module-id="u1"]').click();
    await page.getByRole('button', { name: 'Delete Module' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(0));

    // Blur the delete button so the undo shortcut isn't swallowed by a control.
    await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(1));
    await expect(page.locator('[data-module-id="u1"]')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(0));
  });
});

test.describe('screen management', () => {
  test('adding a blank screen appends to config', async ({ page, request }) => {
    await putConfig(request, baseConfig({ screens: [makeScreen('a', 'Screen 1', [])] }));
    await openEditor(page);

    await page.getByRole('button', { name: 'Add screen' }).click();
    await page.getByRole('button', { name: 'Blank Screen' }).click();

    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(2));
  });

  test('renaming a screen persists the new name', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('a', 'Screen 1', []), makeScreen('b', 'Screen 2', [])],
    }));
    await openEditor(page);

    // Scope to the tab's name span — the active screen name also renders in the panel.
    await page.locator('span.max-w-32', { hasText: 'Screen 1' }).dblclick();
    const input = page.locator('input.w-28');
    await input.fill('Kitchen');
    await input.press('Enter');

    await pollConfig(request, (c) => c.screens.find((s) => s.id === 'a')!.name).then((p) => p.toBe('Kitchen'));
  });

  test('reordering moves a screen via the context menu', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('a', 'Alpha', []), makeScreen('b', 'Bravo', [])],
    }));
    await openEditor(page);

    await page.locator('span.max-w-32', { hasText: 'Alpha' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Move Right' }).click();

    await pollConfig(request, (c) => c.screens.map((s) => s.id)).then((p) => p.toEqual(['b', 'a']));
  });

  test('deleting a screen removes it from config', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('a', 'Screen 1', []), makeScreen('b', 'Screen 2', [])],
    }));
    await openEditor(page);

    await page.locator('span.max-w-32', { hasText: 'Screen 2' }).click({ button: 'right' });
    // Context menu "Delete" opens a confirm dialog whose primary button reads "Delete".
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await pollConfig(request, (c) => c.screens.map((s) => s.id)).then((p) => p.toEqual(['a']));
  });

  test('a template chosen while on an empty screen replaces it and persists', async ({ page, request }) => {
    await putConfig(request, baseConfig({ screens: [makeScreen('a', 'Screen 1', [])] }));
    await openEditor(page);

    await page.getByRole('button', { name: 'Add screen' }).click();
    await page.getByRole('button', { name: /From Template/ }).click();

    // Template picker → pick the single-clock template → import modal → Import.
    await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
    await page.getByRole('button', { name: /Minimal Clock/ }).click();
    await expect(page.getByRole('heading', { name: 'Import layout' })).toBeVisible();
    await page.getByRole('button', { name: 'Add these screens', exact: true }).click();

    // The blank "Screen 1" the user was looking at is replaced, not kept
    // beside the imported screen (the same rule every template entry point
    // follows), and the imported screen carries the template's clock module.
    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(1));
    await pollConfig(
      request,
      (c) => c.screens.some((s) => s.modules.some((m) => m.type === 'clock')),
    ).then((p) => p.toBe(true));
  });

  test('adding a template-seeded screen beside a screen with content appends it', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await openEditor(page);

    await page.getByRole('button', { name: 'Add screen' }).click();
    await page.getByRole('button', { name: /From Template/ }).click();
    await page.getByRole('button', { name: /Minimal Clock/ }).click();
    await page.getByRole('button', { name: 'Add these screens', exact: true }).click();

    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(2));
  });
});

test.describe('canvas toolbar', () => {
  test('snap toggle drives the grid overlay and where a drag lands', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [textModule('SNAP ME', { id: 'sm', position: { x: 100, y: 100 }, size: { w: 200, h: 200 } })])],
    }));
    await openEditor(page);

    // Snap is on by default: the toolbar button reports pressed and the grid
    // overlay pattern is mounted.
    const snapOn = page.getByRole('button', { name: 'Snap to grid (on)' });
    await expect(snapOn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('pattern#editor-grid')).toBeAttached();

    // With snap on, a drag lands on the 20px grid (both axes divisible by 20).
    await dragModuleBy(page, 'sm', 60, 60);
    await pollConfig(request, (c) => c.screens[0].modules[0].position.x % 20).then((p) => p.toBe(0));
    await pollConfig(request, (c) => c.screens[0].modules[0].position.y % 20).then((p) => p.toBe(0));

    // Toggle snap off: button flips to unpressed and the grid overlay unmounts.
    await snapOn.click();
    const snapOff = page.getByRole('button', { name: 'Snap to grid (off)' });
    await expect(snapOff).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('pattern#editor-grid')).toHaveCount(0);

    // With snap off the drop is free: choose screen-pixel deltas that map to a
    // non-grid display offset (131 / 173 display px, both far from a multiple
    // of 20) so the landing position cannot coincidentally align.
    const scale = await canvasScale(page);
    await dragModuleBy(page, 'sm', Math.round(131 * scale), Math.round(173 * scale));
    await pollConfig(request, (c) => c.screens[0].modules[0].position.x % 20).then((p) => p.not.toBe(0));
  });

  test('zoom in / out / fit change the zoom level', async ({ page }) => {
    await openEditor(page);

    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('Fit');
    const startWidth = (await page.getByTestId('editor-canvas').boundingBox())!.width;

    // Steps walk the fixed zoom ladder: 100 → 125 → 150.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('125%');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('150%');

    // The canvas actually grew with the zoom, not just the label.
    await expect
      .poll(async () => (await page.getByTestId('editor-canvas').boundingBox())!.width)
      .toBeGreaterThan(startWidth);

    // Fit (reset) only appears once the zoom leaves the fit scale.
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('Fit');

    // Zoom out steps down the ladder: 100 → 75.
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('75%');
  });

  test('ctrl+wheel steps the zoom ladder by sign', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('Fit');

    // Wheel away from you (negative deltaY) zooms in one stop per notch.
    await wheelNotch(page, -100);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('125%');
    await wheelNotch(page, -100);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('150%');

    // Positive deltaY zooms back out.
    await wheelNotch(page, 120);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('125%');

    // deltaY of exactly 0 (some devices emit these with ctrl held) is ignored.
    await wheelNotch(page, 0);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('125%');

    // A wheel without ctrl scrolls; it must not step the zoom.
    await page.evaluate(() => {
      document.querySelector('[data-testid="editor-canvas"]')!.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      );
    });
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('125%');
  });

  test('a fast flick of wheel notches advances one stop per notch', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('Fit');

    // Three quick notches — spaced above the stream window but far faster
    // than the stream throttle. Every notch must land: 100 → 125 → 150 → 200.
    await wheelNotch(page, -100, 3);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('200%');
  });

  test('wheel zoom clamps at both ladder ends and disables the matching button', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('Fit');

    // Walk to the bottom of the ladder (100 → 20 is 6 stops) with extra
    // notches beyond it — the clamp must hold at 20%.
    await wheelNotch(page, 100, 8);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('20%');
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeEnabled();

    // Reversing direction after no-op notches at the clamp steps immediately.
    // (The stream-throttle variant of this — suppressed steps must not arm
    // the throttle — is unit-tested with a fake clock.)
    await wheelNotch(page, -100);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('25%');

    // Walk to the top (25 → 400 is 10 stops) with extra notches beyond it.
    await wheelNotch(page, -100, 12);
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('400%');
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeEnabled();
  });
});

test.describe('screen context menu', () => {
  test('disabling then enabling a screen persists and toggles the dimmed indicator', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('a', 'Screen 1', []), makeScreen('b', 'Screen 2', [])],
    }));
    await openEditor(page);

    // Switch off the non-active screen via its context menu.
    await page.locator('span.max-w-32', { hasText: 'Screen 2' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Switch off', exact: true }).click();

    await pollConfig(request, (c) => c.screens.find((s) => s.id === 'b')!.enabled).then((p) => p.toBe(false));
    await expect(page.getByLabel('Disabled', { exact: true })).toBeVisible();

    // Re-open the menu, which now offers Switch on, and clear the switched-off state.
    await page.locator('span.max-w-32', { hasText: 'Screen 2' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Switch on', exact: true }).click();

    await pollConfig(request, (c) => c.screens.find((s) => s.id === 'b')!.enabled).then((p) => p.toBeUndefined());
    await expect(page.getByLabel('Disabled', { exact: true })).toBeHidden();
  });

  test('export this screen downloads a layout file', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('k', 'Kitchen', [textModule('HELLO', { id: 't1' })])],
    }));
    await openEditor(page);

    await page.locator('span.max-w-32', { hasText: 'Kitchen' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Export This Screen' }).click();

    // The export modal is pre-scoped to this screen; its Export button triggers
    // the browser download.
    await expect(page.getByRole('heading', { name: 'Export Layout' })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('home-screens-kitchen.json');

    const path = await download.path();
    const layout = JSON.parse(await readFile(path, 'utf-8'));
    expect(layout._type).toBe('home-screens-layout');
    expect(layout.screens).toHaveLength(1);
    expect(layout.screens[0].name).toBe('Kitchen');
    expect(layout.screens[0].modules).toHaveLength(1);
  });
});

test.describe('per-screen rotation duration', () => {
  test('override with seconds and sticky mode persist and badge the tab', async ({ page, request }) => {
    await putConfig(request, baseConfig({ screens: [makeScreen('a', 'Screen 1', [])] }));
    await openEditor(page);

    // With a screen (and no module) selected, the property panel shows the
    // Screen settings section defaulting to "inherits the global default".
    await page.getByRole('button', { name: 'Use a different time', exact: true }).click();

    // Enter a concrete duration → persists as milliseconds; the tab badges it.
    const seconds = page.locator('#screen-rotation-duration');
    await seconds.fill('45');
    await pollConfig(request, (c) => c.screens[0].rotationDurationMs).then((p) => p.toBe(45000));
    await expect(page.getByText('45s', { exact: true })).toBeVisible();

    // A short duration is a warning, not a floor: 5s persists as typed and the
    // note under the field says the screen may change before its data loads.
    await seconds.fill('5');
    await pollConfig(request, (c) => c.screens[0].rotationDurationMs).then((p) => p.toBe(5000));
    await expect(page.getByTestId('screen-duration-short-warning')).toBeVisible();
    await seconds.fill('45');
    await expect(page.getByTestId('screen-duration-short-warning')).toBeHidden();

    // Zero = sticky (manual advance only): the panel shows a Sticky badge and
    // the tab badge switches to "Stays" (not "0s", which read as a broken
    // duration in warning colour).
    await seconds.fill('0');
    await pollConfig(request, (c) => c.screens[0].rotationDurationMs).then((p) => p.toBe(0));
    await expect(page.getByText('Sticky', { exact: true })).toBeVisible();
    await expect(page.getByText('Stays', { exact: true })).toBeVisible();

    // Reset clears the override back to inheriting the default.
    await page.getByRole('button', { name: 'Back to the usual', exact: true }).click();
    await pollConfig(request, (c) => c.screens[0].rotationDurationMs).then((p) => p.toBeUndefined());
    await expect(page.getByText('Stays', { exact: true })).toBeHidden();
  });
});

test.describe('open button and screens that show only when opened', () => {
  test('the screen rotation choice persists and badges the tab', async ({ page, request }) => {
    await putConfig(request, baseConfig({ screens: [makeScreen('a', 'Recipe Book', [])] }));
    await openEditor(page);

    await page.getByRole('radio', { name: 'Shows only when opened' }).check();
    await pollConfig(request, (c) => c.screens[0].rotation).then((p) => p.toBe('opened'));
    // Nothing opens it yet, and both the tab and the panel say so.
    await expect(page.getByTestId('screen-tab-orphaned')).toHaveText('Nothing opens it');
    await expect(page.getByTestId('screen-rotation-opened-help')).toContainText('Nothing opens this screen, so it never shows');
    // The duration override has no place on a screen with no turn.
    await expect(page.getByRole('button', { name: 'Use a different time', exact: true })).toBeHidden();

    // The quiet time is the screen's: whole or half minutes, a day at most,
    // and the field says when it put a typed value right.
    const minutes = page.locator('#screen-go-back-after');
    await expect(minutes).toHaveValue('2');
    await minutes.fill('1.5');
    await pollConfig(request, (c) => c.screens[0].goBackAfterMs).then((p) => p.toBe(90_000));
    // A value that has to be put right says what it will become, and is
    // saved adjusted when the field is left.
    await minutes.fill('99999');
    await expect(page.getByTestId('go-back-after-note')).toHaveText('Will be saved as 1440 minutes, a whole day.');
    await minutes.press('Tab');
    await pollConfig(request, (c) => c.screens[0].goBackAfterMs).then((p) => p.toBe(86_400_000));
    await expect(page.getByTestId('go-back-after-note')).toHaveText('Changed 99999 to 1440 minutes, a whole day.');
    await minutes.fill('1,5');
    await pollConfig(request, (c) => c.screens[0].goBackAfterMs).then((p) => p.toBe(90_000));
    await minutes.fill('2.3');
    await minutes.press('Tab');
    await pollConfig(request, (c) => c.screens[0].goBackAfterMs).then((p) => p.toBe(150_000));
    await expect(page.getByTestId('go-back-after-note')).toHaveText('Changed 2.3 to 2.5: whole or half minutes.');
    // A blank or a minus never saves: the field goes back and says so.
    await minutes.fill('');
    await minutes.press('Tab');
    await expect(minutes).toHaveValue('2.5');
    await expect(page.getByTestId('go-back-after-note')).toHaveText('That is not a number of minutes, so it stays at 2.5.');
    await minutes.fill('-3');
    await minutes.press('Tab');
    await pollConfig(request, (c) => c.screens[0].goBackAfterMs).then((p) => p.toBe(150_000));
    await minutes.fill('0');
    await pollConfig(request, (c) => c.screens[0].goBackAfterMs).then((p) => p.toBe(0));
    await expect(page.getByTestId('go-back-after-note')).toBeHidden();

    await page.getByRole('radio', { name: 'Takes its turn with the other screens' }).check();
    await pollConfig(request, (c) => c.screens[0].rotation).then((p) => p.toBeUndefined());
    await expect(page.getByTestId('screen-tab-orphaned')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Use a different time', exact: true })).toBeVisible();
  });

  test('the open button lists only screens it can open, edits the target\'s quiet time in place, and the canvas draws it', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [
        makeScreen('kitchen', 'Kitchen', [textModule('KITCHEN', { id: 'kitchen-text', position: { x: 100, y: 100 }, size: { w: 600, h: 300 } })]),
        makeScreen('recipes', 'Recipe Book', [textModule('BOOK', { position: { x: 0, y: 0 } })], { rotation: 'opened' }),
        makeScreen('night', 'Night', [], { enabled: false }),
        makeScreen('evening', 'Evening', [textModule('EVENING', { position: { x: 0, y: 0 } })]),
      ],
    }));
    await openEditor(page);
    await page.locator('[data-module-id="kitchen-text"]').click();
    await page.getByRole('button', { name: 'Open button' }).click();

    const select = page.locator('#module-open-button-kitchen-text');
    await expect(select).toHaveValue('');
    // Never the module's own screen, never a switched-off one: nothing greyed.
    // Screens are grouped by how they show.
    await expect(select.locator('option')).toHaveText(['Nothing', 'Recipe Book', 'Evening']);
    await expect(select.locator('optgroup')).toHaveCount(2);
    await expect(select.locator('optgroup').first()).toHaveAttribute('label', 'Shows only when opened');
    await expect(select.locator('optgroup').last()).toHaveAttribute('label', 'In the rotation');

    await select.selectOption('recipes');
    await pollConfig(request, (c) => c.screens[0].modules[0].openButtonScreen).then((p) => p.toBe('recipes'));
    await expect(page.getByTestId('open-button-target-holds')).toHaveText('Shows Text');
    const pill = page.locator('[data-module-id="kitchen-text"] [data-testid="open-screen-button"]');
    await expect(pill).toHaveAttribute('aria-label', 'Open Recipe Book');

    // The target screen's quiet time, edited from here: one number, the screen's.
    const minutes = page.locator('#module-open-button-go-back-kitchen-text');
    await expect(minutes).toHaveValue('2');
    await minutes.fill('5');
    await pollConfig(request, (c) => c.screens[1].goBackAfterMs).then((p) => p.toBe(300_000));
    await minutes.fill('0');
    await pollConfig(request, (c) => c.screens[1].goBackAfterMs).then((p) => p.toBe(0));
    await expect(page.getByTestId('open-button-in-rotation-hint')).toBeHidden();

    // A screen that takes its turn has no quiet time, and the section says why.
    await putConfig(request, await getConfig(request).then((c) => ({ ...c, screens: c.screens.map((s) => (s.id === 'recipes' ? { ...s, rotation: undefined } : s)) })));
    await page.reload();
    // A module with a button opens on its Open button section.
    await page.locator('[data-module-id="kitchen-text"]').click();
    await expect(page.getByTestId('open-button-in-rotation-hint')).toContainText('Recipe Book takes its turn');
    await expect(minutes).toBeHidden();
    // Both targets are in the rotation now: one list, no group headings.
    await expect(select.locator('optgroup')).toHaveCount(0);
    // The screen's rotation can be fixed from here, without a trip to its settings.
    await page.getByRole('switch', { name: 'Shows only when opened' }).click();
    await pollConfig(request, (c) => c.screens[1].rotation).then((p) => p.toBe('opened'));
    await expect(minutes).toBeVisible();
    await page.getByRole('switch', { name: 'Shows only when opened' }).click();
    await pollConfig(request, (c) => c.screens[1].rotation).then((p) => p.toBeUndefined());
    // The way to that screen's settings is one click, and it lands on Rotation.
    await page.getByRole('button', { name: 'Open its screen settings' }).click();
    const turnRadio = page.getByRole('radio', { name: 'Takes its turn with the other screens' });
    await expect(turnRadio).toBeChecked();
    await expect(turnRadio).toBeInViewport();
    await expect(page.getByTestId('screen-rotation-openers')).toContainText('Text on Kitchen opens this screen');

    await page.getByText('Kitchen', { exact: true }).first().click();
    await page.locator('[data-module-id="kitchen-text"]').click();
    await select.selectOption('');
    await pollConfig(request, (c) => c.screens[0].modules[0].openButtonScreen).then((p) => p.toBeUndefined());
    await expect(pill).toBeHidden();
  });

  test('a module with a full-screen twin makes its target screen in one click', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('kitchen', 'Kitchen', [{ ...buildModuleInstance('meal-planner'), id: 'meals', position: { x: 100, y: 100 }, size: { w: 800, h: 600 } }])],
    }));
    await openEditor(page);
    await page.locator('[data-module-id="meals"]').click();
    await page.getByRole('button', { name: 'Open button' }).click();

    await page.getByRole('button', { name: 'Add a Recipe Book screen' }).click();
    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(2));
    const config = await getConfig(request);
    const added = config.screens[1];
    // Named after what it shows, which is what the wall's button then says.
    expect(added.name).toBe('Recipe Book');
    expect(added.rotation).toBe('opened');
    expect(added.modules.map((m) => m.type)).toEqual(['fullscreen-meal-planner']);
    expect(added.modules[0].config.view).toBe('recipes');
    expect(config.screens[0].modules[0].openButtonScreen).toBe(added.id);

    // The section now shows the target, its quiet time, and no shortcut; the
    // selection stayed on the planner.
    await expect(page.locator('#module-open-button-meals')).toHaveValue(added.id);
    await expect(page.locator('#module-open-button-go-back-meals')).toHaveValue('2');
    await expect(page.getByTestId('open-button-add-twin')).toBeHidden();
    await expect(page.getByTestId('open-button-twin-added')).toContainText('Added Recipe Book');
    await expect(page.getByTestId('open-button-target-theme')).toContainText('Linen');
    const pill = page.locator('[data-module-id="meals"] [data-testid="open-screen-button"]');
    await expect(pill).toHaveAttribute('aria-label', 'Open Recipe Book');
    await expect(page.getByTestId('screen-tab-opens-only')).toHaveText('When opened');

    // With Tap on the Wall off the button has no business on the wall, and the section says why.
    await page.getByRole('switch', { name: 'Tap on the Wall' }).click();
    await expect(pill).toBeHidden();
    await expect(page.getByTestId('open-button-tap-off')).toBeVisible();
    await page.getByRole('switch', { name: 'Tap on the Wall' }).click();
    await expect(pill).toBeVisible();

    // Picking Nothing strands the screen: the section and the tab both say so.
    await page.locator('#module-open-button-meals').selectOption('');
    await expect(page.getByTestId('open-button-orphaned')).toContainText('Recipe Book now has nothing that opens it');
    await expect(page.getByTestId('screen-tab-orphaned')).toHaveText('Nothing opens it');
    // The warning offers the way out.
    await page.getByRole('button', { name: 'Pick it again' }).click();
    await expect(page.locator('#module-open-button-meals')).toHaveValue(added.id);
    await expect(page.getByTestId('screen-tab-opens-only')).toHaveText('When opened');

    // A click on the pill on the canvas opens the Open button section.
    await pill.click();
    await expect(page.locator('[data-panel-section="open-button"]')).toHaveAttribute('data-revealed', '');

    // Outside the screen's hours the canvas pill is dimmed and the section says when it shows.
    const book = (await getConfig(request)).screens[1];
    await putConfig(request, await getConfig(request).then((c) => ({
      ...c, screens: c.screens.map((s) => (s.id === book.id ? { ...s, schedule: { startTime: '03:00', endTime: '03:01' } } : s)),
    })));
    await page.reload();
    await page.locator('[data-module-id="meals"]').click();
    await expect(page.getByTestId('open-button-gated')).toContainText('The button only shows');
    await expect(pill).toHaveAttribute('data-unavailable', '');

    // Deleting the screen offers Undo, which brings it and the button back.
    await page.getByText('Recipe Book', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Delete Recipe Book', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('deleted-screen-toast')).toContainText('Recipe Book deleted');
    await page.getByTestId('deleted-screen-toast').getByRole('button', { name: 'Undo' }).click();
    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(2));
    await pollConfig(request, (c) => c.screens[0].modules[0].openButtonScreen).then((p) => p.toBe(book.id));
  });

  test('deleting the target screen removes the button', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [
        makeScreen('kitchen', 'Kitchen', [textModule('KITCHEN', { id: 'kitchen-text', position: { x: 100, y: 100 }, size: { w: 600, h: 300 }, openButtonScreen: 'recipes' })]),
        makeScreen('recipes', 'Recipe Book', [textModule('BOOK', { position: { x: 0, y: 0 } })], { rotation: 'opened' }),
      ],
    }));
    await openEditor(page);
    await expect(page.locator('[data-module-id="kitchen-text"] [data-testid="open-screen-button"]')).toBeVisible();

    // The tab itself is a button whose name includes its controls' names, so
    // the X needs an exact match. The confirm names the button that goes.
    await page.getByText('Recipe Book', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Delete Recipe Book', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Text on Kitchen has a button that opens this screen');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(1));
    await pollConfig(request, (c) => c.screens[0].modules[0].openButtonScreen).then((p) => p.toBeUndefined());
    await expect(page.locator('[data-module-id="kitchen-text"] [data-testid="open-screen-button"]')).toBeHidden();

    // Undone another way, the toast goes with it: its Undo would take back
    // the restore and delete the screen again.
    await expect(page.getByTestId('deleted-screen-toast')).toBeVisible();
    await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(2));
    await expect(page.getByTestId('deleted-screen-toast')).toBeHidden();
    await pollConfig(request, (c) => c.screens[0].modules[0].openButtonScreen).then((p) => p.toBe('recipes'));
  });
});

test.describe('drop layering', () => {
  test('dropping a module onto a larger one raises it above instead of hiding it', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [
        textModule('SMALL', { id: 'small', position: { x: 0, y: 0 }, size: { w: 200, h: 200 }, zIndex: 1 }),
        textModule('BIG', { id: 'big', position: { x: 400, y: 600 }, size: { w: 600, h: 600 }, zIndex: 2 }),
      ])],
    }));
    await openEditor(page);

    const scale = await canvasScale(page);
    await dragModuleBy(page, 'small', Math.round(500 * scale), Math.round(700 * scale));

    await pollConfig(request, (c) => {
      const mods = c.screens[0].modules;
      return mods.find((m) => m.id === 'small')!.zIndex > mods.find((m) => m.id === 'big')!.zIndex;
    }).then((p) => p.toBe(true));
  });

  test('alignment guides appear mid-drag when an edge lines up with a neighbour, and the drop matches', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [
        textModule('SMALL', { id: 'small', position: { x: 0, y: 0 }, size: { w: 200, h: 200 }, zIndex: 1 }),
        textModule('BIG', { id: 'big', position: { x: 400, y: 600 }, size: { w: 600, h: 600 }, zIndex: 2 }),
      ])],
    }));
    await openEditor(page);

    const scale = await canvasScale(page);
    const box = (await page.locator('[data-module-id="small"]').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Drag so the module's left edge lands ~4 canvas px from BIG's left edge
    // (x=400) — inside the 8px alignment threshold, but clear of BIG's rows
    // vertically so only the x guide can fire.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 396 * scale, cy + 100 * scale, { steps: 15 });

    // The pink guide line renders while the drag is aligned.
    await expect(page.locator('[data-testid="editor-canvas"] .bg-pink-500')).toBeVisible();

    const saved = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
    await page.mouse.up();
    await saved;

    // The drop snapped to the aligned edge, not the 20px grid.
    await pollConfig(request, (c) => c.screens[0].modules.find((m) => m.id === 'small')!.position.x).then((p) => p.toBe(400));
  });
});

test.describe('canvas keyboard shortcuts', () => {
  async function seedOneModule(request: APIRequestContext) {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [
        textModule('KEYED', { id: 'keyed', position: { x: 100, y: 100 }, size: { w: 200, h: 200 } }),
      ])],
    }));
  }

  test('arrow keys nudge by 1px, Shift-arrow by one grid step', async ({ page, request }) => {
    await seedOneModule(request);
    await openEditor(page);
    await page.locator('[data-module-id="keyed"]').click();

    await page.keyboard.press('ArrowRight');
    await pollConfig(request, (c) => c.screens[0].modules[0].position.x).then((p) => p.toBe(101));

    await page.keyboard.press('Shift+ArrowDown');
    await pollConfig(request, (c) => c.screens[0].modules[0].position.y).then((p) => p.toBe(120));
  });

  test('Delete asks for confirmation, then removes the selected module', async ({ page, request }) => {
    await seedOneModule(request);
    await openEditor(page);
    await page.locator('[data-module-id="keyed"]').click();

    await page.keyboard.press('Delete');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(0));
  });

  test('Escape clears the selection', async ({ page, request }) => {
    await seedOneModule(request);
    await openEditor(page);
    await page.locator('[data-module-id="keyed"]').click();
    await expect(page.locator('[data-testid="selection-overlay"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="selection-overlay"]')).toHaveCount(0);
  });

  test('Cmd/Ctrl+D duplicates the selected module one grid step away', async ({ page, request }) => {
    await seedOneModule(request);
    await openEditor(page);
    await page.locator('[data-module-id="keyed"]').click();

    await page.keyboard.press('ControlOrMeta+d');

    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(2));
    const config = await getConfig(request);
    const copy = config.screens[0].modules[1];
    expect(copy.position).toEqual({ x: 120, y: 120 });
    expect(copy.id).not.toBe('keyed');
  });
});

test.describe('duplicate actions', () => {
  test('the property panel Duplicate button clones the module', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'S1', [
        textModule('CLONE ME', { id: 'orig', position: { x: 100, y: 100 }, size: { w: 300, h: 150 } }),
      ])],
    }));
    await openEditor(page);
    await page.locator('[data-module-id="orig"]').click();

    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();

    await pollConfig(request, (c) => c.screens[0].modules.length).then((p) => p.toBe(2));
    await expect(page.locator('[data-module-type="text"]')).toHaveCount(2);
  });

  test('the screen tab context menu duplicates the screen with fresh ids', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('a', 'Kitchen', [textModule('ON KITCHEN', { id: 'mod-a' })])],
    }));
    await openEditor(page);

    await page.locator('span.max-w-32', { hasText: 'Kitchen' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();

    await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(2));
    const config = await getConfig(request);
    expect(config.screens[1].name).toBe('Kitchen copy');
    expect(config.screens[1].id).not.toBe('a');
    expect(config.screens[1].modules[0].id).not.toBe('mod-a');
    expect(config.screens[1].modules[0].config.content).toBe('ON KITCHEN');
  });
});

test('a full-screen module can be added straight onto a busy screen', async ({ page, request }) => {
  // It covers what is already there on the wall, which is what "full-screen"
  // means; the editor does not ask first.
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'S1', [textModule('BUSY')])],
  }));
  await openEditor(page);

  await page.getByPlaceholder('Search modules…').fill('Full-Screen Photo');
  await dragPaletteToCanvas(page, 'fullscreen-photo');

  await pollConfig(request, (c) => c.screens[0].modules.map((m) => m.type))
    .then((p) => p.toEqual(['text', 'fullscreen-photo']));
  await pollConfig(request, (c) => c.screens.length).then((p) => p.toBe(1));
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
