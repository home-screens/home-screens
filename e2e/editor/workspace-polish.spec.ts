import { test, expect } from '../fixtures';
import { clearSecrets, getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { autosaved, selectModule } from '../helpers/editor';
import type { ScreenConfiguration } from '@/types/config';

/**
 * The editor-workspace items from the usability audit: what the palette can
 * find, what the property panel says a module is and why it is or isn't on the
 * wall, the side panels collapsing on a small laptop, the background picker
 * having something to offer on a fresh install, and a display with no screens
 * having a way forward.
 */

test.describe('module palette: descriptions and search', () => {
  test.beforeEach(async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
  });

  test('search matches the words people type, not just module names', async ({ page }) => {
    // "trash" is nowhere in "Garbage Day" — before keywords, this search
    // returned "No modules found" while the module sat in the Personal group.
    await page.getByPlaceholder('Search modules…').fill('trash');
    await expect(page.getByTestId('palette-garbage-day')).toBeVisible();
    await expect(page.getByText('No modules found')).toHaveCount(0);

    // Descriptions are searched too: "picture" finds the photo modules.
    await page.getByPlaceholder('Search modules…').fill('picture');
    await expect(page.getByTestId('palette-image')).toBeVisible();
    await expect(page.getByTestId('palette-photo-slideshow')).toBeVisible();
  });

  test('a row carries its description as a tooltip without taking a second line', async ({ page }) => {
    await page.getByPlaceholder('Search modules…').fill('garbage');
    const row = page.getByTestId('palette-garbage-day');
    await expect(row).toHaveAttribute('title', 'Which bin goes out, and when');
    // The list stays one line per module: the description is not rendered.
    await expect(row).not.toContainText('Which bin goes out');
  });
});

test.describe('property panel: what a module is, and why it is hidden', () => {
  test('the panel says what the module is for and links to its docs', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('display-control'));

    await expect(page.getByText('Buttons to wake, sleep or change screens by touch')).toBeVisible();
    await expect(page.getByRole('link', { name: 'What is this?' })).toHaveAttribute(
      'href',
      'https://homescreens.dev/docs/module-reference#display-control',
    );
  });

  test('a disabled module says "Hidden" in words, in the panel and on the canvas', async ({ page, request }) => {
    const mod = buildModuleInstance('clock');
    mod.enabled = false;
    await selectModule(page, request, mod);

    // The panel chip carries the reason; the canvas chip carries the label.
    const chips = page.getByTestId('module-status-chips');
    await expect(chips.first()).toContainText('Hidden');
    await expect(page.getByText('Turn it back on under Visibility.')).toBeVisible();
    await expect(page.getByTestId('selection-overlay').getByText('Hidden')).toBeVisible();
  });

  test('a scheduled module prints its window rather than an amber glyph', async ({ page, request }) => {
    const mod = buildModuleInstance('clock');
    mod.schedule = { daysOfWeek: [1, 2, 3, 4, 5], startTime: '07:00', endTime: '09:00' };
    await selectModule(page, request, mod);

    await expect(page.getByTestId('module-status-chips').first())
      .toContainText('Mon to Fri, 7:00 AM to 9:00 AM');
  });

  test('a conditioned module names the state key it is waiting on', async ({ page, request }) => {
    const mod = buildModuleInstance('clock');
    mod.visibility = { conditions: [{ kind: 'state', sourceKey: 'kitchen_motion', equals: 'on' }] };
    await selectModule(page, request, mod);

    await expect(page.getByTestId('module-status-chips').first())
      .toContainText('Waiting for kitchen_motion');
  });
});

test.describe('one title control', () => {
  test('a module cannot be given two titles at once', async ({ page, request }) => {
    // Todo has a heading of its own; picking custom words turns it off, so the
    // wall can never show two stacked titles.
    await selectModule(page, request, buildModuleInstance('todo'));

    // Module settings is open by default; the picker is its first field.
    const picker = page.getByLabel('Title', { exact: true });
    await expect(picker).toHaveValue('own');
    await autosaved(page, async () => {
      await picker.selectOption('custom');
    });

    const mod = (await getConfig(request)).screens[0].modules[0];
    expect(mod.config.showTitle).toBe(false);
    // Seeded with the module's name so the strip appears straight away.
    expect(mod.style.title).toBe('To-Do List');
  });
});

test.describe('schedule editor', () => {
  test('turning it on changes nothing and says so', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('clock'));
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();

    await autosaved(page, async () => {
      await page.getByRole('switch', { name: 'Only show at certain times' }).click();
    });

    // Every day, all day: a no-op the user then narrows, not a silent Mon-Fri.
    expect((await getConfig(request)).screens[0].modules[0].schedule?.daysOfWeek)
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
    // All seven days picked, every row lit end to end.
    const strip = page.getByTestId('schedule-week-strip');
    await expect(strip).toBeVisible();
    for (let day = 0; day < 7; day++) {
      await expect(strip.getByTestId(`schedule-day-${day}`)).toHaveAttribute('aria-checked', 'true');
    }

    // An empty window is explained rather than left as an unfilled time box.
    await expect(page.getByText('Leave both empty to show all day.')).toBeVisible();
    // Nothing to invert yet, so the toggle is off the table until there is.
    await expect(page.getByRole('switch', { name: 'Hide during these hours instead' })).toBeDisabled();
    await expect(page.getByText('Set a From and Until time first.')).toBeVisible();
  });

  test('the strip draws the window that was set', async ({ page, request }) => {
    const mod = buildModuleInstance('clock');
    mod.schedule = { daysOfWeek: [0, 6], startTime: '08:00', endTime: '10:30' };
    await selectModule(page, request, mod);
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();

    const strip = page.getByTestId('schedule-week-strip');
    // Sunday and Saturday picked, and only those two rows lit.
    for (const day of [0, 6]) {
      await expect(strip.getByTestId(`schedule-day-${day}`)).toHaveAttribute('aria-checked', 'true');
      await expect(strip.getByTestId(`schedule-track-${day}`).getByTestId('schedule-band')).toHaveCount(1);
    }
    for (const day of [1, 2, 3, 4, 5]) {
      await expect(strip.getByTestId(`schedule-day-${day}`)).toHaveAttribute('aria-checked', 'false');
      await expect(strip.getByTestId(`schedule-track-${day}`).getByTestId('schedule-band')).toHaveCount(0);
    }
    await expect(page.getByRole('switch', { name: 'Hide during these hours instead' })).toBeEnabled();
  });

  /**
   * The bug this strip was built for. A user wanted a bin reminder from Tuesday
   * 4pm to Wednesday 8am, ticked both Tuesday and Wednesday, and got two
   * overnight stretches running to Thursday morning with no way to see it.
   */
  test('an overnight window is drawn crossing midnight, and a second day doubles it', async ({ page, request }) => {
    const mod = buildModuleInstance('clock');
    mod.schedule = { daysOfWeek: [2], startTime: '16:00', endTime: '08:00' };
    await selectModule(page, request, mod);
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();

    const strip = page.getByTestId('schedule-week-strip');
    const bandsOn = (day: number) =>
      strip.getByTestId(`schedule-track-${day}`).getByTestId('schedule-band');

    // One stretch: Tuesday evening spilling into Wednesday morning, nothing else.
    await expect(bandsOn(2)).toHaveCount(1);
    await expect(bandsOn(3)).toHaveCount(1);
    await expect(bandsOn(4)).toHaveCount(0);
    // Wednesday is lit but was never picked - the point users kept missing.
    await expect(strip.getByTestId('schedule-day-3')).toHaveAttribute('aria-checked', 'false');

    // Ticking Wednesday too makes it two stretches, visibly.
    await autosaved(page, async () => {
      await strip.getByTestId('schedule-day-3').click();
    });
    expect((await getConfig(request)).screens[0].modules[0].schedule?.daysOfWeek).toEqual([2, 3]);
    await expect(bandsOn(3)).toHaveCount(2);
    await expect(bandsOn(4)).toHaveCount(1);
  });
});

test.describe('background picker', () => {
  test('opens on backgrounds that need no key, and locks the ones that do', async ({ page, request }) => {
    // Secrets survive the per-test config reset, so clear the image keys this
    // worker may have seeded earlier.
    await clearSecrets(request, ['unsplash_access_key', 'nasa_api_key', 'immich_api_key', 'immich_url']);
    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    // Empty state = screen selected, no module: the picker lives there.
    await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });

    await expect(page.getByTestId('background-tab-local')).toBeVisible();
    await expect(page.getByTestId('starter-background-midnight')).toBeVisible();
    // No API key seeded, so both keyed tabs advertise that before being clicked.
    await expect(page.getByTestId('background-tab-unsplash')).toHaveAttribute('title', 'Needs a free key');
    await expect(page.getByTestId('background-tab-nasa')).toHaveAttribute('title', 'Needs a free key');
  });

  test('picking a shipped background persists it to the screen', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });

    await autosaved(page, async () => {
      await page.getByTestId('starter-background-dusk').click();
    });
    expect((await getConfig(request)).screens[0].backgroundImage).toBe('/backgrounds/themes/dusk.svg');
  });
});

test.describe('side panels on a small laptop', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('both panels collapse to rails and the zoom reads Fit, not 100%', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();

    // 1.0 is "as big as the window allows", not "actual size".
    await expect(page.getByTestId('canvas-zoom-readout')).toHaveText('Fit');

    await page.getByTestId('module-palette-collapse').click();
    await expect(page.getByTestId('module-palette-rail')).toBeVisible();
    await expect(page.getByPlaceholder('Search modules…')).toHaveCount(0);

    await page.getByTestId('property-panel-collapse').click();
    await expect(page.getByTestId('property-panel-rail')).toBeVisible();

    // Selecting a module brings the settings panel back on its own, so a
    // click can never look like it did nothing.
    await page.reload();
    await expect(page.getByTestId('property-panel-rail')).toBeVisible();
  });
});

test.describe('a display with no screens', () => {
  function emptySecondDisplay(): ScreenConfiguration {
    return baseConfig({
      displays: [
        {
          id: 'main', name: 'Main',
          screens: [makeScreen('main-screen', 'Main Screen', [textModule('MAIN', { id: 'main-text' })])],
        },
        { id: 'playroom', name: 'Playroom', screens: [] },
      ],
    });
  }

  test('offers a blank screen or a copy of another display', async ({ page, request }) => {
    await putConfig(request, emptySecondDisplay());
    await page.goto('/editor?display=playroom');
    await expect(page.getByText('The Playroom display has no screens yet')).toBeVisible();

    await autosaved(page, async () => {
      await page.getByRole('button', { name: 'Copy screens from Main' }).click();
    });

    const displays = (await getConfig(request)).displays!;
    const playroom = displays.find((d) => d.id === 'playroom')!;
    expect(playroom.screens.map((s) => s.name)).toEqual(['Main Screen']);
    // Fresh ids: the two displays must not share a screen or module id.
    expect(playroom.screens[0].id).not.toBe('main-screen');
    expect(playroom.screens[0].modules[0].id).not.toBe('main-text');
  });

  test('names the display in the save pill and the panel', async ({ page, request }) => {
    await putConfig(request, emptySecondDisplay());
    await page.goto('/editor?display=playroom');
    await expect(page.getByTestId('editing-display')).toContainText('Playroom');
    await expect(page.getByTestId('save-status')).toContainText('Saved to Playroom');
  });
});

test.describe('dialogs close the way dialogs close', () => {
  test('Escape and the backdrop both dismiss the template picker', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=data');

    // The Data page has its own "Templates" section heading, so scope to the dialog.
    const dialog = page.getByRole('dialog', { name: 'Templates' });

    await page.getByRole('button', { name: 'Browse Templates' }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await page.getByRole('button', { name: 'Browse Templates' }).click();
    await expect(dialog).toBeVisible();
    await page.getByTestId('modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
  });
});
