import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { getConfig, postHeartbeat, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';

/** Two registered displays (main + kitchen), each with one labelled text module. */
function twoDisplayConfig(): ScreenConfiguration {
  return baseConfig({
    displays: [
      {
        id: 'main', name: 'Main',
        screens: [makeScreen('main-screen', 'Main Screen', [textModule('MAIN DISPLAY', { id: 'main-text' })])],
      },
      {
        id: 'kitchen', name: 'Kitchen',
        screens: [makeScreen('kitchen-screen', 'Kitchen Screen', [textModule('KITCHEN DISPLAY', { id: 'kitchen-text' })])],
      },
    ],
  });
}

/** A legacy single-display config (no `displays` registry) with one identifiable module. */
function singleDisplayConfig(): ScreenConfiguration {
  return baseConfig({
    screens: [makeScreen('home', 'Home', [textModule('HELLO WORLD', { id: 'home-text' })])],
  });
}

/** Read `config.displays` (never undefined-typed in these assertions once seeded). */
async function readDisplays(request: APIRequestContext): Promise<DisplayNode[]> {
  const cfg = await getConfig(request);
  return cfg.displays ?? [];
}

/* ─── Canvas / display switcher (pre-seeded multi-display) ────────────────── */

test.describe('display switcher', () => {
  test.beforeEach(async ({ page, request }) => {
    await putConfig(request, twoDisplayConfig());
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
  });

  test('display switcher swaps the canvas to the selected display', async ({ page }) => {
    const switcher = page.locator('#editor-display-switcher');
    await expect(switcher).toBeAttached(); // rendered at opacity 0, so not "visible"
    await expect(page.locator('[data-module-id="main-text"]')).toBeVisible();

    await switcher.selectOption('kitchen');
    await expect(page.locator('[data-module-id="kitchen-text"]')).toBeVisible();
    await expect(page.locator('[data-module-id="main-text"]')).toHaveCount(0);
  });

  test('editing screens on a non-active display persists to that display only', async ({ page, request }) => {
    // Switch the editor to Kitchen, then drop a module onto its canvas.
    const switcher = page.locator('#editor-display-switcher');
    await switcher.selectOption('kitchen');
    await expect(page.locator('[data-module-id="kitchen-text"]')).toBeVisible();

    await page.getByPlaceholder('Search modules…').fill('text');
    const item = page.getByTestId('palette-text');
    await expect(item).toBeVisible();

    const from = (await item.boundingBox())!;
    const to = (await page.getByTestId('editor-canvas').boundingBox())!;
    // dnd-kit's PointerSensor needs >5px of travel before activating, so move in steps.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });

    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
    );
    await page.mouse.up();
    await saved; // autosave fires 800ms after the drop

    // The new module landed in Kitchen's screen; Main's screen is untouched.
    await expect.poll(async () => {
      const displays = await readDisplays(request);
      return displays.find((d) => d.id === 'kitchen')?.screens[0]?.modules.length;
    }).toBe(2);

    const displays = await readDisplays(request);
    const kitchen = displays.find((d) => d.id === 'kitchen')!;
    const main = displays.find((d) => d.id === 'main')!;
    expect(kitchen.screens[0].modules.some((m) => m.type === 'text' && m.id !== 'kitchen-text')).toBe(true);
    expect(main.screens[0].modules).toHaveLength(1);
    expect(main.screens[0].modules[0].id).toBe('main-text');
  });
});

/* ─── Bootstrap: turning multi-display mode on through the UI ─────────────── */

test.describe('multi-display bootstrap', () => {
  test('adding the first non-main display auto-seeds a main sibling from the globals', async ({ page, request }) => {
    await putConfig(request, singleDisplayConfig());
    await page.goto('/editor/settings?section=displays');
    // Empty state — legacy install has no displays registered yet.
    await expect(page.getByRole('heading', { name: 'Run Home Screens on multiple displays' })).toBeVisible();

    await page.getByRole('button', { name: 'Add display' }).click();
    await page.getByPlaceholder('Kitchen Touchscreen').fill('Kitchen');
    // ID auto-derives to "kitchen" from the name; submit the add form.
    await page.getByRole('button', { name: 'Add display' }).click();

    // A `main` sibling is auto-created carrying the legacy global screens, and
    // the freshly-added kitchen starts empty.
    await expect.poll(async () => {
      const displays = await readDisplays(request);
      return displays.map((d) => d.id).sort();
    }).toEqual(['kitchen', 'main']);

    const displays = await readDisplays(request);
    const main = displays.find((d) => d.id === 'main')!;
    const kitchen = displays.find((d) => d.id === 'kitchen')!;
    // Main inherited the pre-multi-display global screen (and its module).
    expect(main.screens.some((s) => s.modules.some((m) => m.id === 'home-text'))).toBe(true);
    // The new non-main display is seeded empty, ready to be laid out fresh.
    expect(kitchen.screens).toEqual([]);
  });

  test('adding main as the first display does not auto-seed a second sibling', async ({ page, request }) => {
    await putConfig(request, singleDisplayConfig());
    await page.goto('/editor/settings?section=displays');
    await expect(page.getByRole('heading', { name: 'Run Home Screens on multiple displays' })).toBeVisible();

    await page.getByRole('button', { name: 'Add display' }).click();
    await page.getByPlaceholder('Kitchen Touchscreen').fill('Main');
    // Name "Main" slugifies to the reserved `main` id, so no sibling is seeded.
    await page.getByRole('button', { name: 'Add display' }).click();

    // Exactly one display exists — the `main` the user added, with no
    // auto-created second display alongside it.
    await expect.poll(async () => {
      const displays = await readDisplays(request);
      return displays.map((d) => d.id);
    }).toEqual(['main']);
  });
});

/* ─── Reserved display ids ────────────────────────────────────────────────── */

/**
 * `all` is the broadcast keyword in the command layer, so a display that
 * claimed it would turn every command aimed at one screen into a whole-house
 * broadcast. `__default__` is the legacy single-display queue key. Both are in
 * RESERVED_DISPLAY_IDS (src/lib/display-filter.ts) and are rejected at two
 * separate layers:
 *
 *  - The add form checks RESERVED_DISPLAY_IDS ahead of `isValidDisplayId` and
 *    shows its own friendly explanation (the boolean check alone would report
 *    the format message for an id whose format is fine).
 *  - `validateDisplays` (PUT /api/config, restore, and the editor store's
 *    pre-save check) produces the API's reserved explanation, for configs
 *    that arrive with a reserved id already in them.
 *
 * Both layers are pinned below so a future refactor can't quietly drop either.
 */
test.describe('reserved display ids', () => {
  const formReservedError = (id: string) =>
    `"${id}" already has a special meaning when sending commands to displays. `
    + 'Please pick a different ID, like "kitchen" or "bedroom-tv"';
  const reservedError = (id: string) =>
    `Display id "${id}" is reserved: it already has a special meaning when sending commands to displays. `
    + 'Please pick a different id, such as "kitchen" or "bedroom-tv"';

  test('the add form refuses a display named "All" and creates nothing', async ({ page, request }) => {
    await putConfig(request, singleDisplayConfig());
    await page.goto('/editor/settings?section=displays');
    await expect(page.getByRole('heading', { name: 'Run Home Screens on multiple displays' })).toBeVisible();

    await page.getByRole('button', { name: 'Add display' }).click();
    // "All" slugifies to the reserved id `all` — the realistic way a user hits
    // this, since the ID field auto-derives from the name.
    await page.getByPlaceholder('Kitchen Touchscreen').fill('All');
    // `exact` matters: the name field's placeholder ("Kitchen Touchscreen")
    // also contains "kitchen".
    await expect(page.getByPlaceholder('kitchen', { exact: true })).toHaveValue('all');
    await page.getByRole('button', { name: 'Add display' }).click();

    await expect(page.getByText(formReservedError('all'))).toBeVisible();
    // The form stays open on the rejected values rather than closing as if saved.
    await expect(page.getByRole('heading', { name: 'Add Display' })).toBeVisible();

    // Nothing was written. Auto-save fires 800ms after a mutation, so wait past
    // that window before concluding the registry is still empty.
    await page.waitForTimeout(1200);
    expect(await readDisplays(request)).toEqual([]);
  });

  test('the add form refuses a hand-typed "__default__" id', async ({ page, request }) => {
    await putConfig(request, singleDisplayConfig());
    await page.goto('/editor/settings?section=displays');
    await expect(page.getByRole('heading', { name: 'Run Home Screens on multiple displays' })).toBeVisible();

    await page.getByRole('button', { name: 'Add display' }).click();
    await page.getByPlaceholder('Kitchen Touchscreen').fill('Default');
    // Typing the id directly is the only way to reach `__default__`: slugify
    // strips the underscores, so the auto-derived id would be the legal "default".
    await page.getByPlaceholder('kitchen', { exact: true }).fill('__default__');
    await page.getByRole('button', { name: 'Add display' }).click();

    // The reserved check runs before the format check, so even this id (which
    // the slug rule would also reject) gets the explanation.
    await expect(page.getByText(formReservedError('__default__'))).toBeVisible();

    await page.waitForTimeout(1200);
    expect(await readDisplays(request)).toEqual([]);
  });

  test('a config carrying a reserved display id is rejected with the friendly explanation', async ({ request }) => {
    for (const id of ['all', '__default__']) {
      const res = await request.put('/api/config', {
        data: baseConfig({ displays: [{ id, name: 'Reserved', screens: [] }] }),
      });
      expect(res.status()).toBe(400);
      // The reserved check runs ahead of the slug rule, so even `__default__`
      // (which the slug rule would also reject) gets the explanation, not
      // "must be lowercase letters…".
      expect((await res.json()).error).toBe(reservedError(id));
    }
  });
});

/* ─── Adopting an unadopted Pi heartbeat from the index page ──────────────── */

test.describe('display adoption', () => {
  test('adopts an unadopted heartbeat into config.displays through the UI', async ({ page, request }) => {
    // A registered `main` plus a Pi polling under a slug that is NOT in config —
    // the hub treats it as unadopted until the editor adopts it.
    const unadoptedId = 'porch-pi';
    await putConfig(request, baseConfig({
      displays: [
        { id: 'main', name: 'Main', screens: [makeScreen('main-screen', 'Main Screen', [textModule('MAIN', { id: 'main-text' })])] },
      ],
    }));
    await postHeartbeat(request, { display: unadoptedId, screenCount: 1 });

    await page.goto('/editor/settings?section=displays');

    // The unadopted Pi surfaces in the waiting list; adopt it. Scope to the
    // porch-pi row: the hub's in-memory unadopted tracking spans the worker's
    // whole server lifetime, so display ids other specs polled under can also
    // sit in the waiting list (2 minute staleness window).
    const adoptRow = page.getByTestId(`unadopted-display-${unadoptedId}`);
    await expect(adoptRow).toBeVisible({ timeout: 15_000 });
    await adoptRow.getByRole('button', { name: 'Adopt', exact: true }).click();

    // The adopt form pre-fills (and locks) the polling Pi's id; only a name is needed.
    // Scope the submit to the form itself — in multi-display mode the sidebar `+`
    // and the index header also expose an "Add display" control.
    const adoptForm = page.locator('div.space-y-4', { hasText: `Adopt ${unadoptedId}` });
    await adoptForm.getByPlaceholder('Kitchen Touchscreen').fill('Porch');
    await adoptForm.getByRole('button', { name: 'Add display' }).click();

    await expect.poll(async () => {
      const displays = await readDisplays(request);
      return displays.map((d) => d.id).sort();
    }).toEqual(['main', unadoptedId].sort());
  });
});

/* ─── Removing a non-main display via the danger zone ─────────────────────── */

test.describe('display removal', () => {
  test('removing a non-main display through the confirm flow deletes it from config', async ({ page, request }) => {
    await putConfig(request, twoDisplayConfig());
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overview');

    const removeButton = page.getByRole('button', { name: 'Remove Kitchen' });
    await expect(removeButton).toBeEnabled();
    await removeButton.click();

    // Confirm dialog copy comes from the confirm store; accept it.
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect.poll(async () => {
      const displays = await readDisplays(request);
      return displays.map((d) => d.id);
    }).toEqual(['main']);
  });
});

/* ─── Orientation change scales module positions ──────────────────────────── */

test.describe('orientation change scaling', () => {
  test('scale-to-fit rescales a persisted module position by the shrink factor', async ({ page, request }) => {
    // Single-display install (canvas controls only render in this mode). One
    // module sits low on the 1080×1920 portrait canvas so flipping to
    // landscape (height 1920→1080) pushes it off-canvas and triggers the modal.
    await putConfig(request, baseConfig({
      screens: [makeScreen('home', 'Home', [
        textModule('SCALE ME', { id: 'scale-target', position: { x: 100, y: 1500 }, size: { w: 800, h: 200 } }),
      ])],
    }));
    await page.goto('/editor/settings?section=defaults&page=screen');

    // Flip portrait → landscape. Height shrinks, so the low module goes
    // off-canvas and the orientation modal appears.
    await page.getByRole('button', { name: 'Landscape' }).click();
    await expect(page.getByText('Modules may be off-screen')).toBeVisible();

    await page.getByRole('button', { name: 'Scale to Fit' }).click();

    // scaleAllModules scales by min(1920/1080, 1080/1920) = 0.5625, so the
    // module's y ≈ 1500 × 0.5625 ≈ 844 (snapped to the 20px grid → 840).
    await expect.poll(async () => {
      const cfg = await getConfig(request);
      return cfg.screens[0].modules.find((m) => m.id === 'scale-target')?.position.y;
    }, { timeout: 10_000 }).toBeLessThan(1500);

    const cfg = await getConfig(request);
    const scaled = cfg.screens[0].modules.find((m) => m.id === 'scale-target')!;
    // Proportional shrink: y landed in the expected ~843 band and x shrank too.
    expect(scaled.position.y).toBeGreaterThan(800);
    expect(scaled.position.y).toBeLessThan(880);
    expect(scaled.position.x).toBeLessThan(100);
    // The module is now fully on the new 1920×1080 canvas.
    expect(scaled.position.y + scaled.size.h).toBeLessThanOrEqual(1080);
    expect(scaled.position.x + scaled.size.w).toBeLessThanOrEqual(1920);
  });
});
