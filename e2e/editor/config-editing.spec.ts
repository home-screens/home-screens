import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { getConfig, putConfig, seedDisplaySharedState } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { autosaved, moduleConfig, selectModule } from '../helpers/editor';
import { seedFixturePlugin, FIXTURE_PLUGIN_TYPE } from '../helpers/fixture-plugin';
import { DEFAULT_MODULE_STYLE, type ModuleInstance } from '@/types/config';

/**
 * PropertyPanel config editing. Config-section fields use the Labeled* UI
 * primitives, which nest their control inside a `<label>` (implicit
 * association), so Playwright's getByLabel / getByRole reach them without new
 * test hooks. Each test edits one field, waits out the debounced autosave
 * (PUT /api/config), then asserts both the persisted config and — where the
 * field maps to visible output — the editor preview re-rendered.
 *
 * selectModule / autosaved / moduleConfig live in ../helpers/editor so the
 * settings specs can reuse them.
 */

test('text: editing Content persists and re-renders the preview', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('text', { content: 'ORIGINAL' }));

  await autosaved(page, async () => {
    await page.getByLabel('Content').fill('EDITED VIA PANEL');
  });

  expect((await moduleConfig(request, 'text')).content).toBe('EDITED VIA PANEL');
  await expect(page.locator('[data-module-id="text-1"]').getByText('EDITED VIA PANEL')).toBeVisible();
});

test('greeting: editing Name persists and re-renders the preview', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('greeting', { name: 'ORIGINAL' }));

  await autosaved(page, async () => {
    await page.getByLabel('Name').fill('PANELNAME');
  });

  expect((await moduleConfig(request, 'greeting')).name).toBe('PANELNAME');
  await expect(page.locator('[data-module-id="greeting-1"]')).toContainText('PANELNAME');
});

// ViewSelect renders <label><span>View</span><select/></label>. Its span text
// is exactly "View", which also prefixes "View Mode" elsewhere — so match the
// label whose span is exactly "View" and drill to its <select>.
function viewSelect(page: Page) {
  return page
    .locator('label')
    .filter({ has: page.getByText('View', { exact: true }) })
    .locator('select');
}

test('clock: switching View persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock'));

  await autosaved(page, async () => {
    await viewSelect(page).selectOption('digital');
  });

  expect((await moduleConfig(request, 'clock')).view).toBe('digital');
});

test('clock: picking an Hour format persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock'));
  const picker = page.getByRole('combobox', { name: 'Hour format' });
  // A new clock follows the display setting.
  await expect(picker).toHaveValue('inherit');

  await autosaved(page, async () => {
    await picker.selectOption('24h');
  });

  expect((await moduleConfig(request, 'clock')).hourFormat).toBe('24h');
});

test('clock: a clock from before Hour format existed shows the choice its own toggle made', async ({ page, request }) => {
  // No `hourFormat` key at all, the on-disk shape of every older clock; the
  // picker reads the legacy toggle so the panel says what the wall shows.
  await selectModule(page, request, buildModuleInstance('clock', { format24h: true, hourFormat: undefined }));
  await expect(page.getByRole('combobox', { name: 'Hour format' })).toHaveValue('24h');
});

test('date: switching View persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('date'));

  await autosaved(page, async () => {
    await viewSelect(page).selectOption('banner');
  });

  expect((await moduleConfig(request, 'date')).view).toBe('banner');
});

test('clock: picking a Timezone persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock'));

  await autosaved(page, async () => {
    const tz = page.getByRole('combobox', { name: 'Timezone' });
    await tz.click();               // opens with the full list
    await tz.fill('kiri');          // filters to the pinned row + Pacific/Kiritimati
    await tz.press('ArrowDown');    // highlight 0: the pinned default row
    await tz.press('ArrowDown');    // highlight 1: Pacific/Kiritimati
    await tz.press('Enter');
  });

  expect((await moduleConfig(request, 'clock')).timezone).toBe('Pacific/Kiritimati');
});

test('clock: resetting to the display setting persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock', { timezone: 'Asia/Tokyo' }));

  await autosaved(page, async () => {
    const tz = page.getByRole('combobox', { name: 'Timezone' });
    await tz.click();
    await tz.press('ArrowDown');    // highlight 0: the pinned default row
    await tz.press('Enter');
  });

  // Module config keeps the explicit empty string; the settings page drops the key entirely (undefined).
  expect((await moduleConfig(request, 'clock')).timezone).toBe('');
});

test('date: picking a Timezone persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('date'));

  await autosaved(page, async () => {
    const tz = page.getByRole('combobox', { name: 'Timezone' });
    await tz.click();
    await tz.fill('kiri');
    await tz.press('ArrowDown');
    await tz.press('ArrowDown');
    await tz.press('Enter');
  });

  expect((await moduleConfig(request, 'date')).timezone).toBe('Pacific/Kiritimati');
});

test('clock: picking a Timezone with the mouse persists and closes the list', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock'));

  await autosaved(page, async () => {
    const tz = page.getByRole('combobox', { name: 'Timezone' });
    await tz.click();
    // Mouse pick, not keyboard: guards against the wrapping-label bug where
    // the trailing click reopens the list right after the pick.
    await page.getByRole('option', { name: /Kiritimati/ }).click();
    await expect(tz).toHaveAttribute('aria-expanded', 'false');
  });

  expect((await moduleConfig(request, 'clock')).timezone).toBe('Pacific/Kiritimati');
});

test('clock: typing an exact zone and pressing Enter persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock'));

  await autosaved(page, async () => {
    const tz = page.getByRole('combobox', { name: 'Timezone' });
    await tz.click();
    await tz.fill('Asia/Kolkata');
    await tz.press('Enter');
  });

  expect((await moduleConfig(request, 'clock')).timezone).toBe('Asia/Kolkata');
});

test('clock: Tab commits an arrow-highlighted timezone before focus moves on', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock'));

  await autosaved(page, async () => {
    const tz = page.getByRole('combobox', { name: 'Timezone' });
    await tz.click();
    await tz.fill('kiri');
    await tz.press('ArrowDown');    // highlight 0: the pinned default row
    await tz.press('ArrowDown');    // highlight 1: Pacific/Kiritimati
    await tz.press('Tab');          // must commit the highlighted row, not discard it
  });

  expect((await moduleConfig(request, 'clock')).timezone).toBe('Pacific/Kiritimati');
});

test('clock: a zero-match timezone query shows the empty state and commits nothing', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock', { timezone: 'Asia/Tokyo' }));

  const tz = page.getByRole('combobox', { name: 'Timezone' });
  await tz.click();
  await tz.fill('tokoy'); // typo — matches nothing, and the pinned row must NOT survive alone
  const list = page.getByRole('listbox', { name: 'Timezone' });
  await expect(list).toContainText('No matches');
  await expect(list.getByRole('option')).toHaveCount(0);
  await tz.press('ArrowDown');
  await tz.press('Enter'); // nothing to pick — must not silently clear the override
  await tz.press('Escape');

  expect((await moduleConfig(request, 'clock')).timezone).toBe('Asia/Tokyo');
});

test('calendar: switching View Mode persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('calendar'));

  await autosaved(page, async () => {
    await page.getByLabel('View Mode').selectOption('month');
  });

  expect((await moduleConfig(request, 'calendar')).viewMode).toBe('month');
});

test('calendar: switching Event Style persists', async ({ page, request }) => {
  // The Event style select only renders in the grid views, and the month /
  // multi-week grids show it only under the banner theme (the modern themes
  // own their pill styling), so the theme is pinned explicitly.
  await selectModule(page, request, buildModuleInstance('calendar', { viewMode: 'multi-week', gridTheme: 'banner' }));

  // gridEventStyle defaults 'classic'; switch to 'colored'.
  await autosaved(page, async () => {
    await page.getByLabel('Event style').selectOption('colored');
  });

  expect((await moduleConfig(request, 'calendar')).gridEventStyle).toBe('colored');
  // The timed-event background toggle only appears in Colored mode; one click flips it on.
  const pill = page.getByRole('switch', { name: 'Background behind timed events' });
  await expect(pill).toBeVisible();
  await autosaved(page, async () => {
    await pill.click();
  });

  expect((await moduleConfig(request, 'calendar')).gridEventPillBackground).toBe(true);
});

test('calendar: adding a title filter term persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('calendar'));

  const termInput = page.getByPlaceholder('Type a word, press Enter');
  await autosaved(page, async () => {
    await termInput.fill('Lunch');
    await termInput.press('Enter');
  });

  expect((await moduleConfig(request, 'calendar')).titleFilter).toEqual({ mode: 'exclude', terms: ['Lunch'] });

  await autosaved(page, async () => {
    await page.getByLabel('Show events').selectOption('include');
  });

  expect((await moduleConfig(request, 'calendar')).titleFilter).toEqual({ mode: 'include', terms: ['Lunch'] });
});

test('calendar: picking a title filter mode before any term survives adding the first term', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('calendar'));

  // Picking 'include' with zero terms must not silently revert to the
  // 'exclude' default — it has to stick until (and through) the first term.
  await autosaved(page, async () => {
    await page.getByLabel('Show events').selectOption('include');
  });

  const termInput = page.getByPlaceholder('Type a word, press Enter');
  await autosaved(page, async () => {
    await termInput.fill('Soccer');
    await termInput.press('Enter');
  });

  expect((await moduleConfig(request, 'calendar')).titleFilter).toEqual({ mode: 'include', terms: ['Soccer'] });
});

test('calendar: adding an event rule and a day rule persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('calendar'));

  // The rule lists live behind the collapsed "Advanced looks" group.
  await page.getByRole('button', { name: /Advanced looks/i }).click();

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add an event rule' }).click();
  });
  const eventCard = page.locator('[data-rules-list="events"] [data-rule-card]').first();
  await autosaved(page, async () => {
    await eventCard.getByLabel('Words').fill('Lunch');
  });
  await autosaved(page, async () => {
    await eventCard.getByLabel('Hide it').click();
  });

  const eventRules = (await moduleConfig(request, 'calendar')).eventRules as Array<Record<string, unknown>>;
  expect(eventRules).toHaveLength(1);
  expect(eventRules[0].match).toEqual({ text: 'Lunch' });
  expect(eventRules[0].hide).toBe(true);

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add a day rule' }).click();
  });
  const dayCard = page.locator('[data-rules-list="days"] [data-rule-card]').first();
  await autosaved(page, async () => {
    await dayCard.getByLabel('Which days').selectOption('today');
  });
  await autosaved(page, async () => {
    await dayCard.getByLabel('Add a badge').click();
  });

  const dayRules = (await moduleConfig(request, 'calendar')).dayRules as Array<Record<string, unknown>>;
  expect(dayRules).toHaveLength(1);
  expect(dayRules[0].match).toEqual({ when: 'today' });
  expect(dayRules[0].badgeIcon).toBe('⭐');

  // Removing the only rule clears the list back to undefined, not [].
  await autosaved(page, async () => {
    await dayCard.getByRole('button', { name: 'Remove rule' }).click();
  });
  expect((await moduleConfig(request, 'calendar')).dayRules).toBeUndefined();
});

test('fullscreen-calendar: adding an event rule persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-calendar'));

  await page.getByRole('button', { name: /Advanced looks/i }).click();

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add an event rule' }).click();
  });
  const eventCard = page.locator('[data-rules-list="events"] [data-rule-card]').first();

  // The icon field is a picker, not a text box: emoji and Font Awesome are
  // two tabs over one search box, and each stores a different shape of value.
  await eventCard.getByLabel('Icon', { exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose an icon' });
  await autosaved(page, async () => {
    await picker.getByRole('button', { name: 'soccer ball', exact: true }).click();
  });

  const eventRules = (await moduleConfig(request, 'fullscreen-calendar')).eventRules as Array<Record<string, unknown>>;
  expect(eventRules).toHaveLength(1);
  expect(eventRules[0].icon).toBe('⚽');

  // A Font Awesome pick persists as a token, not a glyph.
  await eventCard.getByLabel('Icon', { exact: true }).click();
  await picker.getByRole('tab', { name: /Font Awesome/ }).click();
  await picker.getByPlaceholder(/Search icons/).fill('futbol');
  await autosaved(page, async () => {
    await picker.getByTitle('futbol', { exact: true }).click();
  });
  expect(((await moduleConfig(request, 'fullscreen-calendar')).eventRules as Array<Record<string, unknown>>)[0].icon)
    .toBe('fa:solid:futbol');

  // Clearing from the field removes the key rather than storing an empty string.
  await autosaved(page, async () => {
    await eventCard.getByRole('button', { name: 'Remove icon' }).click();
  });
  expect(((await moduleConfig(request, 'fullscreen-calendar')).eventRules as Array<Record<string, unknown>>)[0].icon)
    .toBeUndefined();
});

test('weather: toggling Feels Like persists', async ({ page, request }) => {
  // Registry default has showFeelsLike: true — one click flips it off.
  await selectModule(page, request, buildModuleInstance('weather'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Feels Like' }).click();
  });

  expect((await moduleConfig(request, 'weather')).showFeelsLike).toBe(false);
});

test('shared: the Show-on-display toggle disables a module and dims the preview', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('text', { content: 'DIM ME' }));

  // The enabled toggle lives in the collapsed Visibility accordion.
  await page.getByRole('button', { name: 'Visibility' }).click();
  const toggle = page.getByLabel('Show on display');
  await expect(toggle).toBeVisible();

  await autosaved(page, async () => {
    await toggle.uncheck();
  });

  const config = await getConfig(request);
  expect(config.screens[0].modules[0].enabled).toBe(false);
  // Disabled modules render dimmed + grayscaled in the editor (DraggableModule).
  await expect(page.locator('[data-module-id="text-1"] .grayscale')).toBeVisible();
});

test('shared: Send to Back reorders overlapping modules and persists zIndex', async ({ page, request }) => {
  // Two overlapping text modules, both at the legacy zIndex 1 — the later
  // array entry ("above") paints on top via DOM order.
  const below = { ...buildModuleInstance('text', { content: 'BELOW' }), id: 'text-below' };
  const above = { ...buildModuleInstance('text', { content: 'ABOVE' }), id: 'text-above', position: { x: 40, y: 40 } };
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'Screen 1', [below, above])],
    settings: matrixSettings(),
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator('[data-module-id="text-above"]').click();

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Send to Back' }).click();
  });

  // Persisted: renormalized 1..n with the target at the bottom.
  const config = await getConfig(request);
  const zById = Object.fromEntries(config.screens[0].modules.map((m) => [m.id, m.zIndex]));
  expect(zById['text-above']).toBe(1);
  expect(zById['text-below']).toBe(2);

  // The editor canvas applies the new stacking immediately — including for
  // the still-selected module, so Send to Back is visibly instant. Selection
  // chrome renders in a separate overlay and must not lift the module.
  await expect(page.locator('[data-module-id="text-above"]')).toHaveCSS('z-index', '1');
  await expect(page.locator('[data-module-id="text-below"]')).toHaveCSS('z-index', '2');

  // At the back now: Send to Back disables, Bring to Front stays available.
  await expect(page.getByRole('button', { name: 'Send to Back' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Bring to Front' })).toBeEnabled();
});

test('shared: Alt+click on an overlap cycles selection to buried modules; a plain click never does', async ({ page, request }) => {
  // "above" fully covers "below" where they overlap; a plain DOM click can
  // only ever reach "above", so Alt+click cycles geometrically. A plain
  // repeated click keeps the selection (clicking a selected module used to
  // jump to whatever was behind it).
  const below = { ...buildModuleInstance('text', { content: 'BELOW' }), id: 'text-below' };
  const above = { ...buildModuleInstance('text', { content: 'ABOVE' }), id: 'text-above', position: { x: 40, y: 40 } };
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'Screen 1', [below, above])],
    settings: matrixSettings(),
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // Click inside the overlap region (top-left corner of "above" sits inside
  // "below"): first click selects the topmost module.
  const aboveEl = page.locator('[data-module-id="text-above"]');
  const overlay = page.locator('[data-testid="selection-overlay"]');
  await aboveEl.click({ position: { x: 5, y: 5 } });
  await expect(overlay).toHaveAttribute('data-selected-module', 'text-above');

  // Same spot again: still "above".
  await aboveEl.click({ position: { x: 5, y: 5 } });
  await expect(overlay).toHaveAttribute('data-selected-module', 'text-above');

  // Alt+click cycles to the covered module underneath.
  await aboveEl.click({ position: { x: 5, y: 5 }, modifiers: ['Alt'] });
  await expect(overlay).toHaveAttribute('data-selected-module', 'text-below');
});

// ── Task 1: Time & Date + Weather & Environment ────────────────────────────
// Covers countdown, year-progress, multi-month, moon-phase, sunrise-sunset,
// air-quality, rain-map (clock/date/calendar/weather covered above).

test('countdown: toggling Repeat yearly on an event persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('countdown', {
    events: [{ id: 'e1', name: 'E2E LAUNCH', date: '2099-12-31' }],
  }));

  // Repeat-yearly is a per-event toggle that sets ev.recurring='yearly' — there
  // is no top-level `repeatYearly` config field (plan snippet was wrong).
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Repeat yearly' }).click();
  });

  const events = (await moduleConfig(request, 'countdown')).events as { recurring?: string }[];
  expect(events[0].recurring).toBe('yearly');
});

test('year-progress: toggling Show Percentage persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('year-progress'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Percentage' }).click();
  });

  expect((await moduleConfig(request, 'year-progress')).showPercentage).toBe(false);
});

test('multi-month: adjusting Months to Show persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('multi-month'));

  // "Months to Show" is a Slider bound to `monthCount` (not a number field
  // named `monthsToShow`). Default 3, one step right → 4.
  await autosaved(page, async () => {
    const slider = page.getByRole('slider', { name: 'Months to Show' });
    await slider.focus();
    await slider.press('ArrowRight');
  });

  expect((await moduleConfig(request, 'multi-month')).monthCount).toBe(4);
});

test('moon-phase: toggling Show Illumination persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('moon-phase'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Illumination %' }).click();
  });

  expect((await moduleConfig(request, 'moon-phase')).showIllumination).toBe(false);
});

test('sunrise-sunset: toggling Show Golden Hour persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('sunrise-sunset'));

  // Registry default showGoldenHour is false → one click flips it ON (plan
  // snippet asserted false, which was wrong for this default).
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Golden Hour' }).click();
  });

  expect((await moduleConfig(request, 'sunrise-sunset')).showGoldenHour).toBe(true);
});

test('air-quality: toggling Show AQI persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('air-quality'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show AQI' }).click();
  });

  expect((await moduleConfig(request, 'air-quality')).showAQI).toBe(false);
});

test('rain-map: adjusting Zoom persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('rain-map'));

  // Zoom is a Slider (default 6). One step right → 7.
  await autosaved(page, async () => {
    const slider = page.getByRole('slider', { name: 'Zoom' });
    await slider.focus();
    await slider.press('ArrowRight');
  });

  expect((await moduleConfig(request, 'rain-map')).zoom).toBe(7);
});

// ── Task 2: News & Finance + Travel ────────────────────────────────────────
// Covers news, stock-ticker, crypto, sports, standings, traffic.

test('news: adjusting Max Items persists', async ({ page, request }) => {
  // "Max Items" is a Slider only rendered for non-headline views — seed `list`
  // so it shows (registry default view is `headline`, which hides it).
  await selectModule(page, request, buildModuleInstance('news', { view: 'list' }));

  await autosaved(page, async () => {
    const slider = page.getByRole('slider', { name: 'Max Items' });
    await slider.focus();
    await slider.press('ArrowRight');
  });

  expect((await moduleConfig(request, 'news')).maxItems).toBe(11);
});

test('news: the preset picker moves on after each add', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('news', { view: 'list', feeds: [] }));
  const picker = page.locator('select').filter({ has: page.locator('optgroup') });
  const add = picker.locator('xpath=../../..').getByRole('button', { name: 'Add', exact: true });

  const first = await picker.inputValue();
  await add.click();
  await expect(page.getByText('1 / 12')).toBeVisible();

  // The preset just added is now a disabled option: parking on it would leave
  // Add disabled and force a manual re-pick before every subsequent add.
  expect(await picker.inputValue()).not.toBe(first);
  await expect(add).toBeEnabled();

  await autosaved(page, async () => { await add.click(); });
  expect((await moduleConfig(request, 'news')).feeds).toHaveLength(2);
});

test('news: Check asks for home-network access for a feed that is not saved yet', async ({ page, request }) => {
  const LAN = 'http://192.168.1.50:8080/rss';
  await selectModule(page, request, buildModuleInstance('news', {
    view: 'list', feeds: [{ id: 'lan', url: LAN, label: 'Home reader' }],
  }));

  const checks: string[] = [];
  await page.route('**/api/news*', async (route) => {
    checks.push(route.request().url());
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ feeds: [{ url: LAN, ok: true, title: 'Reader', format: 'rss', items: [], fetchedAt: Date.now() }] }),
    });
  });

  await page.getByRole('button', { name: 'Edit Home reader' }).click();
  await page.getByLabel('Home network').check();
  await page.getByRole('button', { name: 'Check', exact: true }).click();

  // Without the consent riding along, the route would fall back to the
  // external-only guard and answer blocked-url for a perfectly good address.
  await expect.poll(() => checks.some((u) => u.includes(`lan=${encodeURIComponent(LAN)}`))).toBe(true);
  await expect(page.getByText("That link can't be used. Check it and try again.")).toHaveCount(0);
});

test('stock-ticker: editing Symbols persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('stock-ticker'));

  await autosaved(page, async () => {
    await page.getByLabel('Symbols (comma-separated)').fill('AAPL,TSLA');
  });

  expect((await moduleConfig(request, 'stock-ticker')).symbols).toBe('AAPL,TSLA');
});

test('crypto: editing Coin IDs persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('crypto'));

  // Crypto's symbols field is `ids`, not `coinIds` (FinancialConfigSection
  // passes symbolsField="ids").
  await autosaved(page, async () => {
    await page.getByLabel('Coin IDs (comma-separated, CoinGecko)').fill('bitcoin,solana');
  });

  expect((await moduleConfig(request, 'crypto')).ids).toBe('bitcoin,solana');
});

test('sports: adjusting Ticker Speed persists', async ({ page, request }) => {
  // Ticker Speed is a Slider only shown in the `ticker` view (default is
  // `scoreboard`). Seed `ticker` so it renders; default 4 → 5.
  await selectModule(page, request, buildModuleInstance('sports', { view: 'ticker' }));

  await autosaved(page, async () => {
    const slider = page.getByRole('slider', { name: 'Ticker Speed (sec/game)' });
    await slider.focus();
    await slider.press('ArrowRight');
  });

  expect((await moduleConfig(request, 'sports')).tickerSpeed).toBe(5);
});

test('standings: adjusting Teams to Show persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('standings'));

  // "Teams to Show (0 = all)" is a Slider bound to `teamsToShow`; default 0 → 1.
  await autosaved(page, async () => {
    const slider = page.getByRole('slider', { name: 'Teams to Show (0 = all)' });
    await slider.focus();
    await slider.press('ArrowRight');
  });

  expect((await moduleConfig(request, 'standings')).teamsToShow).toBe(1);
});

test('traffic: adding a route persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('traffic', { routes: [] }));

  // The list editor fires several debounced autosaves (add + each field). Poll
  // the persisted config until the final state lands rather than racing a
  // single PUT.
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByPlaceholder('Origin address').fill('123 Home St');
  await page.getByPlaceholder('Destination address').fill('456 Work Ave');
  await page.getByPlaceholder('Destination address').blur();

  await expect.poll(async () => {
    const routes = (await moduleConfig(request, 'traffic')).routes as { origin: string; destination: string }[];
    return routes[0];
  }).toMatchObject({ origin: '123 Home St', destination: '456 Work Ave' });
});

// ── Task 3: Knowledge & Fun ────────────────────────────────────────────────
// Covers dad-joke, word-of-day, history, quote.

test('dad-joke: toggling Show Dividers persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('dad-joke'));

  // showDividers defaults on (checked = value !== false) → one click flips off.
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Dividers' }).click();
  });

  expect((await moduleConfig(request, 'dad-joke')).showDividers).toBe(false);
});

test('word-of-day: toggling Show Dividers persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('word-of-day'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Dividers' }).click();
  });

  expect((await moduleConfig(request, 'word-of-day')).showDividers).toBe(false);
});

test('history: toggling Show Dividers persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('history'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Dividers' }).click();
  });

  expect((await moduleConfig(request, 'history')).showDividers).toBe(false);
});

test('quote: picking an accent color preset persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('quote'));

  // AccentColorPicker is a <select> of preset swatches (label "Accent Color"),
  // not a row of named buttons — pick the Blue preset by its value.
  await autosaved(page, async () => {
    await page.getByLabel('Accent Color').selectOption('#3b82f6');
  });

  expect((await moduleConfig(request, 'quote')).accentColor).toBe('#3b82f6');
});

// ── Task 4: Personal ───────────────────────────────────────────────────────
// Covers todo, sticky-note, todoist, garbage-day, affirmations, meal-planner,
// chore-chart.

test('todo: editing the list name persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('todo', {
    items: [{ id: 't1', text: 'E2E TASK', completed: false }],
  }));

  await autosaved(page, async () => {
    await page.getByLabel('List name', { exact: true }).fill('MY TODOS');
  });

  expect((await moduleConfig(request, 'todo')).title).toBe('MY TODOS');
});

test('sticky-note: editing Content persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('sticky-note', { content: 'ORIGINAL' }));

  await autosaved(page, async () => {
    await page.getByLabel('Content').fill('EDITED STICKY');
  });

  expect((await moduleConfig(request, 'sticky-note')).content).toBe('EDITED STICKY');
});

test('todoist: switching View Mode persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('todoist'));

  // View modes: list (default) / board / focus — index 1 is board.
  await autosaved(page, async () => {
    await page.getByLabel('View Mode').selectOption({ index: 1 });
  });

  expect((await moduleConfig(request, 'todoist')).viewMode).toBe('board');
});

test('garbage-day: editing Custom Category Name persists', async ({ page, request }) => {
  // The Custom Category Name field only renders once the custom day is enabled
  // (customDay >= 0); seed a real day so it shows. It writes `customLabel`, not
  // `customCategoryName`.
  await selectModule(page, request, buildModuleInstance('garbage-day', { customDay: 3 }));

  await autosaved(page, async () => {
    await page.getByLabel('Custom Category Name').fill('Compost');
  });

  expect((await moduleConfig(request, 'garbage-day')).customLabel).toBe('Compost');
});

test('affirmations: toggling Weather-Aware Content persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('affirmations'));

  // weatherAware defaults on → one click flips it off (plan asserted true).
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Weather-Aware Content' }).click();
  });

  expect((await moduleConfig(request, 'affirmations')).weatherAware).toBe(false);
});

test('meal-planner: toggling Show Emoji persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('meal-planner'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Emoji' }).click();
  });

  expect((await moduleConfig(request, 'meal-planner')).showEmoji).toBe(false);
});

test('chore-chart: toggling Show Streaks persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('chore-chart'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Streaks' }).click();
  });

  expect((await moduleConfig(request, 'chore-chart')).showStreaks).toBe(false);
});

// ── Task 5: Media & Display ────────────────────────────────────────────────
// Covers image, photo-slideshow, qr-code, iframe, icon, shape, display-control.

test('image: editing Alt Text persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('image', {
    src: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
  }));

  await autosaved(page, async () => {
    await page.getByLabel('Alt Text').fill('E2E alt text');
  });

  expect((await moduleConfig(request, 'image')).alt).toBe('E2E alt text');
});

test('video: toggling Play on repeat persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('video'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Play on repeat' }).click();
  });

  expect((await moduleConfig(request, 'video')).loop).toBe(false);
});

test('photo-slideshow: switching Transition persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('photo-slideshow'));

  // Transitions: fade (default) / none — index 1 is none.
  await autosaved(page, async () => {
    await page.getByLabel('Transition').selectOption({ index: 1 });
  });

  expect((await moduleConfig(request, 'photo-slideshow')).transition).toBe('none');
});

test('photo-slideshow: the Google Photos import panel opens and reports setup state', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('photo-slideshow'));

  // The local source shows an import entry point; the sandbox has no Google
  // web client secrets, so opening it lands on the setup hint.
  await page.getByRole('button', { name: 'Import from Google Photos' }).click();
  await expect(page.getByText('add a Google Photos import Client ID')).toBeVisible();
});

test('photo-slideshow: OneDrive source offers sign-in and persists the choice', async ({ page, request }) => {
  // The source option only exists once the Application ID secret is set;
  // seed it before the editor loads (selectModule is a full page load, so
  // useSecretStatus starts fresh).
  await request.put('/api/secrets', { data: { key: 'microsoft_client_id', value: 'e2e-client-id' } });
  await selectModule(page, request, buildModuleInstance('photo-slideshow'));

  await autosaved(page, async () => {
    await page.getByLabel('Photo Source').selectOption('onedrive');
  });

  expect((await moduleConfig(request, 'photo-slideshow')).source).toBe('onedrive');
  // No stored grant in the sandbox, so the panel offers device-code sign-in.
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
});

test('qr-code: switching Mode persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('qr-code', {
    mode: 'custom', data: 'https://example.com/e2e', label: 'E2E QR',
  }));

  await autosaved(page, async () => {
    await page.getByLabel('Mode').selectOption('wifi');
  });

  expect((await moduleConfig(request, 'qr-code')).mode).toBe('wifi');
});

test('iframe: editing URL persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('iframe', { url: '/login', title: 'E2E EMBED' }));

  await autosaved(page, async () => {
    await page.getByLabel('URL').fill('/remote');
  });

  expect((await moduleConfig(request, 'iframe')).url).toBe('/remote');
});

test('icon: switching Rotation persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('icon'));

  // The Style select is filtered to the icon's supported FA styles, so the
  // default `star` may expose only one option. Rotation always has four
  // (0/90/180/270); index 1 is 90.
  await autosaved(page, async () => {
    await page.getByLabel('Rotation').selectOption({ index: 1 });
  });

  expect((await moduleConfig(request, 'icon')).rotation).toBe(90);
});

test('shape: switching Shape persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('shape'));

  // Shape is bound to `view` (default divider); index 1 is double-line.
  await autosaved(page, async () => {
    await page.getByLabel('Shape').selectOption({ index: 1 });
  });

  expect((await moduleConfig(request, 'shape')).view).toBe('double-line');
});

test('display-control: selecting a layout persists (regression: no crash in legacy mode)', async ({ page, request }) => {
  // Regression guard for the DisplayControlConfigSection selector fix: selecting
  // this module in pure legacy mode (config.displays undefined) used to infinite-
  // loop React (#185) via an unstable `?? []` selector. selectModule seeds no
  // displays registry, so reaching the PropertyPanel here exercises that exact
  // path. In legacy mode the target select + "Allow retargeting" toggle are
  // disabled by design, so drive the always-enabled layout buttons (panel → bar).
  await selectModule(page, request, buildModuleInstance('display-control'));

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Bar', exact: true }).click();
  });

  expect((await moduleConfig(request, 'display-control')).layout).toBe('bar');
});

// ── Task 6: Full Screen ────────────────────────────────────────────────────
// Covers fullscreen-calendar, fullscreen-chore-chart, fullscreen-meal-planner,
// fullscreen-photo. These are fillsCanvas modules (no Position/Style test).

test('fullscreen-calendar: switching Today highlight persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-calendar'));

  // "Today highlight" is a <select> bound to `todayHighlightStyle` (full /
  // subtle / minimal / off), not a switch. Default full → off.
  await autosaved(page, async () => {
    await page.getByLabel('Today highlight').selectOption('off');
  });

  expect((await moduleConfig(request, 'fullscreen-calendar')).todayHighlightStyle).toBe('off');
});

test('fullscreen-calendar: picking a theme tile persists and the caption does not reset it', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-calendar'));

  // The theme picker is a grid of pressable tiles named "<Theme> <group>".
  await autosaved(page, async () => {
    await page.getByRole('button', { name: /^Aurora/ }).click();
  });
  expect((await moduleConfig(request, 'fullscreen-calendar')).theme).toBe('aurora');
  await expect(page.getByRole('button', { name: /^Aurora/ })).toHaveAttribute('aria-pressed', 'true');

  // The grid sits under a plain caption, not a wrapping <label>: clicking the
  // caption must not forward to the first tile and reset the theme.
  await page.locator('label:text-is("Theme")').click();
  await page.waitForTimeout(300);
  expect((await moduleConfig(request, 'fullscreen-calendar')).theme).toBe('aurora');
});

test('fullscreen-chore-chart: toggling Show Rewards Button persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-chore-chart'));

  // Default showRewardsButton is false → one click turns it on (plan asserted
  // false).
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Rewards Button' }).click();
  });

  expect((await moduleConfig(request, 'fullscreen-chore-chart')).showRewardsButton).toBe(true);
});

test('fullscreen-meal-planner: toggling Show Emoji persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-meal-planner'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Emoji' }).click();
  });

  expect((await moduleConfig(request, 'fullscreen-meal-planner')).showEmoji).toBe(false);
});

test('fullscreen-weather: switching Background tint persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-weather'));

  // Default skyLayer is 'auto'; choosing the plain-theme option persists 'off'.
  await autosaved(page, async () => {
    await page.getByLabel('Background tint').selectOption('off');
  });

  expect((await moduleConfig(request, 'fullscreen-weather')).skyLayer).toBe('off');
});

test('fullscreen-photo: switching Mode persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-photo'));

  // There is no `mode` config field: the Mode select toggles slideshow vs
  // single by (un)setting `file`. Selecting Single Photo persists file: ''.
  await autosaved(page, async () => {
    await page.getByLabel('Mode').selectOption('single');
  });

  expect((await moduleConfig(request, 'fullscreen-photo')).file).toBe('');
});

test('fullscreen-news: switching View persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-news'));

  // getByLabel matches substrings, and this module renders real headlines —
  // any story with "view" in it makes `getByLabel('View')` ambiguous. Target
  // the select by an option only it carries, as the standings tests do.
  const viewSelect = page
    .locator('select')
    .filter({ has: page.getByRole('option', { name: 'Front page', exact: true }) });
  await autosaved(page, async () => {
    await viewSelect.selectOption('front-page');
  });

  expect((await moduleConfig(request, 'fullscreen-news')).view).toBe('front-page');
});

// ── Task 13: Deep per-module config — high-complexity modules ───────────────
// The ratchet baseline above covers one field per module. These add breadth on
// the six highest-surface-area modules (weather, text, chore-chart,
// meal-planner, standings, sports), prioritizing branchy controls: enums,
// toggles, multi-part gradient fields, and per-league selection.

// ColorPicker nests a color input AND a text input inside one <label>, so
// getByLabel is ambiguous. The text input commits on blur; drill to it by the
// label whose span text is exactly `label`.
function colorText(page: Page, label: string) {
  return page
    .locator('label')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input[type="text"]');
}

// ---- weather ----

test('weather: swapping the weather source persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('weather'));

  // The weather source select only renders once /api/secrets resolves (it always
  // lists the no-key providers: noaa, open-meteo, yr, smhi, envcanada).
  await autosaved(page, async () => {
    await page.getByLabel('Weather source').selectOption('noaa');
  });

  expect((await moduleConfig(request, 'weather')).provider).toBe('noaa');
});

test('weather: switching the Icon Style persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('weather'));

  // iconSet defaults to 'color'; switch to 'outline'.
  await autosaved(page, async () => {
    await page.getByLabel('Icon Style').selectOption('outline');
  });

  expect((await moduleConfig(request, 'weather')).iconSet).toBe('outline');
});

test('weather: toggling Humidity on persists', async ({ page, request }) => {
  // showHumidity defaults off → one click flips it on.
  await selectModule(page, request, buildModuleInstance('weather'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Humidity' }).click();
  });

  expect((await moduleConfig(request, 'weather')).showHumidity).toBe(true);
});

test('weather: toggling Wind Speed on persists', async ({ page, request }) => {
  // showWind defaults off → one click flips it on.
  await selectModule(page, request, buildModuleInstance('weather'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Wind Speed' }).click();
  });

  expect((await moduleConfig(request, 'weather')).showWind).toBe(true);
});

test('weather: editing Days to Show (daily view) persists', async ({ page, request }) => {
  // "Days to Show" only renders for day-bearing views; seed `daily`.
  await selectModule(page, request, buildModuleInstance('weather', { view: 'daily' }));

  await autosaved(page, async () => {
    await page.getByLabel('Days to Show').fill('7');
  });

  expect((await moduleConfig(request, 'weather')).daysToShow).toBe(7);
});

test('weather: toggling Hide When No Alerts on the alerts view persists', async ({ page, request }) => {
  // The alerts view + its "Hide When No Alerts" toggle only appear when the
  // effective provider advertises alert support. noaa does (and needs no key),
  // so seed provider+view to reach that branch.
  await selectModule(page, request, buildModuleInstance('weather', { provider: 'noaa', view: 'alerts' }));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Hide When No Alerts' }).click();
  });

  expect((await moduleConfig(request, 'weather')).hideWhenNoAlerts).toBe(true);
});

// ---- text ----

test('text: editing the gradient From color persists', async ({ page, request }) => {
  // Gradient From/To/Angle only render once gradientEnabled is on.
  await selectModule(page, request, buildModuleInstance('text', { content: 'GRAD', gradientEnabled: true }));

  await autosaved(page, async () => {
    await colorText(page, 'From').fill('#123456');
    await colorText(page, 'From').blur();
  });

  expect((await moduleConfig(request, 'text')).gradientFrom).toBe('#123456');
});

test('text: adjusting the gradient Angle persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('text', { content: 'GRAD', gradientEnabled: true }));

  // Angle is a Slider (default 90, step 15). One step right → 105.
  await autosaved(page, async () => {
    const slider = page.getByRole('slider', { name: 'Angle' });
    await slider.focus();
    await slider.press('ArrowRight');
  });

  expect((await moduleConfig(request, 'text')).gradientAngle).toBe(105);
});

test('text: enabling the scrolling marquee persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('text', { content: 'SCROLL ME' }));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Scrolling Marquee' }).click();
  });

  expect((await moduleConfig(request, 'text')).marquee).toBe(true);
});

test('text: choosing a text Effect persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('text', { content: 'GLOWY' }));

  await autosaved(page, async () => {
    await page.getByLabel('Effect').selectOption('glow');
  });

  expect((await moduleConfig(request, 'text')).effect).toBe('glow');
});

test('text: switching Text Transform persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('text', { content: 'shout' }));

  await autosaved(page, async () => {
    await page.getByLabel('Text Transform').selectOption('uppercase');
  });

  expect((await moduleConfig(request, 'text')).textTransform).toBe('uppercase');
});

test('text: a {state} token with no producer warns and persists the content', async ({ page, request }) => {
  // The token helper renders when the content references any {key}; an unknown
  // key (nothing on this display publishes it) surfaces the warning copy.
  await selectModule(page, request, buildModuleInstance('text', { content: 'start' }));

  await autosaved(page, async () => {
    await page.getByLabel('Content').fill('{plugin:foo:bar}');
  });

  expect((await moduleConfig(request, 'text')).content).toBe('{plugin:foo:bar}');
  await expect(page.getByText('Nothing on this display publishes')).toBeVisible();
});

test('text: the token live preview resolves values (with filters) from the display snapshot', async ({ page, request }) => {
  // The preview runs the display's reported bus snapshot through the same
  // resolver as the Text module: round applies to the live value, default
  // fills unpublished keys. The filter hint appears once tokens exist.
  // Seeds a per-purpose display slot: the hub's in-memory shared-state slots
  // have no reset seam, so seeding the legacy default slot would leak into
  // later specs on this worker's shared server.
  const DISPLAY = 'ce-token-preview';
  const mod = buildModuleInstance('text', {
    content: '{plugin:foo:temp|round:1} · {plugin:foo:gone|default:n/a}',
  });
  const config = baseConfig({ screens: [] });
  config.displays = [{ id: DISPLAY, name: 'Preview', screens: [makeScreen('s1', 'S1', [mod])] }];
  await putConfig(request, config);
  await seedDisplaySharedState(request, { 'plugin:foo:temp': '72.53333' }, DISPLAY);

  await page.goto(`/editor?display=${DISPLAY}`);
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${mod.id}"]`).click();

  await expect(page.getByText('Add |round:1 to round numbers')).toBeVisible();
  await expect(page.getByTestId('text-token-preview')).toContainText('72.5 · n/a', { timeout: 10_000 });
});

// ---- chore-chart ----

test('chore-chart: switching Week Starts On persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('chore-chart'));

  // weekStartDay defaults 'monday'; switch to 'sunday'.
  await autosaved(page, async () => {
    await page.getByLabel('Week Starts On').selectOption('sunday');
  });

  expect((await moduleConfig(request, 'chore-chart')).weekStartDay).toBe('sunday');
});

test('chore-chart: toggling Show Tickets off persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('chore-chart'));

  // showPoints defaults on (?? true) → one click flips it off.
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Tickets' }).click();
  });

  expect((await moduleConfig(request, 'chore-chart')).showPoints).toBe(false);
});

test('chore-chart: toggling Show Time of Day off persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('chore-chart'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Time of Day' }).click();
  });

  expect((await moduleConfig(request, 'chore-chart')).showTimeOfDay).toBe(false);
});

test('chore-chart: toggling Tap to Complete off persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('chore-chart'));

  // allowDisplayComplete defaults on (?? true) → one click flips it off.
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Tap to Complete (Display)' }).click();
  });

  expect((await moduleConfig(request, 'chore-chart')).allowDisplayComplete).toBe(false);
});

test('chore-chart: editing the Accent Color persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('chore-chart'));

  await autosaved(page, async () => {
    await colorText(page, 'Accent Color').fill('#ff8800');
    await colorText(page, 'Accent Color').blur();
  });

  expect((await moduleConfig(request, 'chore-chart')).accentColor).toBe('#ff8800');
});

// ---- meal-planner ----

test('meal-planner: switching the View persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('meal-planner'));

  // View defaults 'week'; switch to 'today' via the ViewSelect.
  await autosaved(page, async () => {
    await viewSelect(page).selectOption('today');
  });

  expect((await moduleConfig(request, 'meal-planner')).view).toBe('today');
});

test('meal-planner: toggling Show Prep Time off persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('meal-planner'));

  // showPrepTime defaults on (?? true) → one click flips it off.
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Prep Time' }).click();
  });

  expect((await moduleConfig(request, 'meal-planner')).showPrepTime).toBe(false);
});

test('meal-planner: toggling Show Tags off persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('meal-planner'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show Tags' }).click();
  });

  expect((await moduleConfig(request, 'meal-planner')).showTags).toBe(false);
});

test('meal-planner: switching the tap-to-open recipe action persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('meal-planner'));

  // tapRecipeAction defaults 'off'; switch to 'qr'.
  await autosaved(page, async () => {
    await page.getByLabel('Tap Meal to Open Recipe').selectOption('qr');
  });

  expect((await moduleConfig(request, 'meal-planner')).tapRecipeAction).toBe('qr');
});

// ---- standings ----

// The League and Grouping controls are bare <select>s (span label sibling, not
// a wrapping <label>), so getByLabel can't reach them. Target each by an option
// unique to it.
function standingsSelectByOption(page: Page, optionName: string) {
  return page.locator('select').filter({ has: page.getByRole('option', { name: optionName, exact: true }) });
}

for (const { name, value } of [
  { name: 'Premier League', value: 'epl' },
  { name: 'MLB', value: 'mlb' },
  { name: 'Bundesliga', value: 'bundesliga' },
  { name: 'Liga MX', value: 'liga_mx' },
]) {
  test(`standings: selecting the ${name} league persists`, async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('standings'));

    await autosaved(page, async () => {
      await standingsSelectByOption(page, 'Premier League').selectOption(value);
    });

    expect((await moduleConfig(request, 'standings')).league).toBe(value);
  });
}

test('standings: switching the Grouping persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('standings'));

  // grouping defaults 'conference'; switch to 'league' (option "Full League").
  await autosaved(page, async () => {
    await standingsSelectByOption(page, 'Full League').selectOption('league');
  });

  expect((await moduleConfig(request, 'standings')).grouping).toBe('league');
});

test('standings: toggling the Playoff Cutoff Line off persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('standings'));

  // showPlayoffLine defaults on (!== false) → one click flips it off.
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Playoff Cutoff Line' }).click();
  });

  expect((await moduleConfig(request, 'standings')).showPlayoffLine).toBe(false);
});

// ---- sports ----

test('sports: enabling an additional league persists', async ({ page, request }) => {
  // leagues defaults ['nba','nfl']; seed it explicitly for a deterministic base.
  await selectModule(page, request, buildModuleInstance('sports', { leagues: ['nba', 'nfl'] }));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'MLB' }).click();
  });

  expect((await moduleConfig(request, 'sports')).leagues).toEqual(['nba', 'nfl', 'mlb']);
});

test('sports: disabling a default league persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('sports', { leagues: ['nba', 'nfl'] }));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'NBA' }).click();
  });

  expect((await moduleConfig(request, 'sports')).leagues).toEqual(['nfl']);
});

test('sports: switching the View persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('sports'));

  // view defaults 'scoreboard'; switch to 'list' via the ViewSelect.
  await autosaved(page, async () => {
    await viewSelect(page).selectOption('list');
  });

  expect((await moduleConfig(request, 'sports')).view).toBe('list');
});

// ── Task 14: Position & Size, Style, and Defaults › Display ─────────────────
// These target the PropertyPanel's structural sections (PositionSection,
// StyleSection) rather than per-module config, plus one real field edit at the
// Defaults level. Position/size/style live directly on the ModuleInstance
// (mod.position / mod.size / mod.style), NOT in mod.config, so we read the whole
// instance rather than via moduleConfig().

/** Read back the full persisted first-screen module instance (position/size/style). */
async function moduleInstance(request: APIRequestContext) {
  const config = await getConfig(request);
  // ModuleStyle has no index signature, so it doesn't structurally overlap
  // Record<string, unknown>; route through unknown to read style fields freely.
  return config.screens[0].modules[0] as unknown as {
    position: { x: number; y: number };
    size: { w: number; h: number };
    style: Record<string, unknown>;
    config: Record<string, unknown>;
  };
}

test.describe('PropertyPanel Position & Size', () => {
  // PositionSection lives in a collapsed "Position & Size" accordion; open it
  // before driving the X/Y/W/H number inputs. Each input is a <label> wrapping
  // <span>X</span><input type=number>, so getByLabel reaches it by the span text.
  // These four fields set exact values with no grid snapping (moveModule /
  // resizeModule store the number as typed, stopped only at the canvas
  // edge), complementing the mouse-drag/resize coverage in interactions.spec.ts.

  test('typing exact X/Y moves the module on canvas and persists', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('text', { content: 'MOVE ME' }));
    const canvasModule = page.locator('[data-module-id="text-1"]');
    const startBox = (await canvasModule.boundingBox())!;

    await page.getByRole('button', { name: 'Position & Size', exact: true }).click();

    await autosaved(page, async () => {
      await page.getByLabel('X', { exact: true }).fill('300');
    });
    await autosaved(page, async () => {
      await page.getByLabel('Y', { exact: true }).fill('200');
    });

    // Persisted exactly, and the canvas wrapper (positioned at x*scale / y*scale)
    // has visibly moved down-right from its origin.
    await expect.poll(async () => (await moduleInstance(request)).position).toEqual({ x: 300, y: 200 });
    await expect.poll(async () => (await canvasModule.boundingBox())!.x).toBeGreaterThan(startBox.x);
    await expect.poll(async () => (await canvasModule.boundingBox())!.y).toBeGreaterThan(startBox.y);
  });

  test('typing exact W/H resizes the module on canvas and persists', async ({ page, request }) => {
    // Seed a known small footprint so the typed 480×360 is unambiguously larger.
    const mod = buildModuleInstance('text', { content: 'SIZE ME' });
    mod.size = { w: 200, h: 160 };
    await selectModule(page, request, mod);
    const canvasModule = page.locator('[data-module-id="text-1"]');
    const startBox = (await canvasModule.boundingBox())!;

    await page.getByRole('button', { name: 'Position & Size', exact: true }).click();

    await autosaved(page, async () => {
      await page.getByLabel('W', { exact: true }).fill('480');
    });
    await autosaved(page, async () => {
      await page.getByLabel('H', { exact: true }).fill('360');
    });

    await expect.poll(async () => (await moduleInstance(request)).size).toEqual({ w: 480, h: 360 });
    await expect.poll(async () => (await canvasModule.boundingBox())!.width).toBeGreaterThan(startBox.width);
    await expect.poll(async () => (await canvasModule.boundingBox())!.height).toBeGreaterThan(startBox.height);
  });

  test('a typed W/H past the canvas edge stops at the edge', async ({ page, request }) => {
    // The resize handle sits at the module's far corner and the canvas clips
    // at its border: a size past the edge is a module the editor loses.
    const mod = buildModuleInstance('text', { content: 'TOO BIG' });
    mod.position = { x: 100, y: 200 };
    mod.size = { w: 200, h: 160 };
    await selectModule(page, request, mod);

    await page.getByRole('button', { name: 'Position & Size', exact: true }).click();

    await autosaved(page, async () => {
      await page.getByLabel('W', { exact: true }).fill('5000');
    });
    await autosaved(page, async () => {
      await page.getByLabel('H', { exact: true }).fill('5000');
    });

    // 1080 - 100 by 1920 - 200 on the portrait canvas.
    await expect.poll(async () => (await moduleInstance(request)).size).toEqual({ w: 980, h: 1720 });
    await expect(page.getByLabel('W', { exact: true })).toHaveValue('980');
  });
});

test.describe('PropertyPanel Style', () => {
  // StyleSection lives in a collapsed "Style" accordion. We seed backdropBlur: 0
  // so opacity renders as a plain CSS `opacity` (ModuleWrapper bakes opacity into
  // the background alpha whenever backdropBlur > 0, which is the default). The
  // inner ModuleWrapper is the only descendant carrying a `background-color`
  // inline style, and it applies border-radius / font-size / opacity UNSCALED
  // (the outer DraggableModule wrapper multiplies by the canvas scale + is inside
  // a `zoom`, so its computed lengths are unreliable) — so we assert the inner
  // wrapper's inline `style` attribute, which is the exact pre-zoom source.

  /** Seed a greeting whose opacity is renderable (backdropBlur off) and open the Style accordion. */
  async function selectStyledGreeting(page: Page, request: APIRequestContext) {
    const mod = buildModuleInstance('greeting', { name: 'STYLE' });
    mod.style = { ...mod.style, backdropBlur: 0 };
    await selectModule(page, request, mod);
    await page.getByRole('button', { name: 'Style', exact: true }).click();
  }

  /**
   * The title lives in Module settings behind a three-way picker (the module's
   * own title / my own words / none), so every title test starts by asking for
   * its own words.
   */
  async function selectTitledGreeting(page: Page, request: APIRequestContext) {
    const mod = buildModuleInstance('greeting', { name: 'STYLE' });
    mod.style = { ...mod.style, backdropBlur: 0 };
    await selectModule(page, request, mod);
    // Module settings is open by default; the picker is its first field.
    await page.getByLabel('Title', { exact: true }).selectOption('custom');
  }

  /** The inner ModuleWrapper div — the sole descendant with an inline background-color. */
  function styledWrapper(page: Page) {
    return page.locator('[data-module-id="greeting-1"] div[style*="background-color"]').first();
  }

  test('border radius slider persists and enlarges the preview corner radius', async ({ page, request }) => {
    await selectStyledGreeting(page, request);

    // Slider default 12; End jumps to max (50) deterministically.
    await autosaved(page, async () => {
      const slider = page.getByRole('slider', { name: 'Border Radius' });
      await slider.focus();
      await slider.press('End');
    });

    expect((await moduleInstance(request)).style.borderRadius).toBe(50);
    await expect(styledWrapper(page)).toHaveAttribute('style', /border-radius:\s*50px/);
  });

  test('opacity slider persists and dims the preview', async ({ page, request }) => {
    await selectStyledGreeting(page, request);

    // Slider default 1 (max). Home → 0, then 10 steps of 0.05 → 0.5.
    await autosaved(page, async () => {
      const slider = page.getByRole('slider', { name: 'Opacity' });
      await slider.focus();
      await slider.press('Home');
      for (let i = 0; i < 10; i++) await slider.press('ArrowRight');
    });

    expect((await moduleInstance(request)).style.opacity).toBe(0.5);
    await expect(styledWrapper(page)).toHaveAttribute('style', /opacity:\s*0\.5/);
  });

  test('text size slider persists and enlarges the preview text', async ({ page, request }) => {
    await selectStyledGreeting(page, request);
    // The greeting fits its text to its box: Text size scales the fit, and the
    // size it paints is on the inner element, not the wrapper.
    const inner = page.locator('[data-module-id="greeting-1"] div[style*="background-color"] div[style*="font-size"]').first();
    const readPx = () => inner.evaluate((el) => parseFloat((el as HTMLElement).style.fontSize));
    const before = await readPx();
    expect(before).toBeGreaterThan(0);

    await autosaved(page, async () => {
      await page.getByRole('slider', { name: 'Text size' }).fill('200');
    });

    expect((await moduleInstance(request)).style.textScale).toBe(200);
    await expect.poll(readPx).toBeCloseTo(before * 2, 0);
  });

  test('background color picker persists and recolors the preview', async ({ page, request }) => {
    await selectStyledGreeting(page, request);

    // ColorPicker's text input commits on blur (see the colorText helper above).
    await autosaved(page, async () => {
      await colorText(page, 'Background').fill('#123456');
      await colorText(page, 'Background').blur();
    });

    expect((await moduleInstance(request)).style.backgroundColor).toBe('#123456');
    // The browser serializes the inline style color to rgb().
    await expect(styledWrapper(page)).toHaveAttribute('style', /background-color:\s*rgb\(18, 52, 86\)/);
  });

  test('font family picker persists and restyles the preview', async ({ page, request }) => {
    await selectStyledGreeting(page, request);

    // FontFamilyPicker is a <select> (label "Font Family") of registry font ids;
    // the stored value is the id, and the wrapper renders its resolved CSS stack.
    await autosaved(page, async () => {
      await page.getByLabel('Font Family').selectOption('poppins');
    });

    expect((await moduleInstance(request)).style.fontFamily).toBe('poppins');
    await expect(styledWrapper(page)).toHaveAttribute('style', /font-family:[^;]*Poppins/i);
  });

  // Font weight works via a class + CSS variable + !important rule in
  // globals.css (not an inline style like its siblings), because modules
  // hard-code their designed weights. So these assert the class attribute
  // and the COMPUTED weight of module text, not the wrapper's style attribute.

  test('font weight slider persists and forces hard-coded module weights', async ({ page, request }) => {
    await selectStyledGreeting(page, request);

    // Default position is 400 (Default); End jumps to max (900).
    await autosaved(page, async () => {
      const slider = page.getByRole('slider', { name: 'Font Weight' });
      await slider.focus();
      await slider.press('End');
    });

    expect((await moduleInstance(request)).style.fontWeight).toBe(900);
    await expect(styledWrapper(page)).toHaveClass(/module-weight-override/);
    // The greeting text is font-light (300) by design; the override must beat it.
    await expect(page.locator('[data-module-id="greeting-1"] p').first()).toHaveCSS('font-weight', '900');
  });

  test('font weight unset applies no override class and keeps designed weights', async ({ page, request }) => {
    await selectStyledGreeting(page, request);

    // Blast-radius guard: if this class ever appears without an explicit
    // weight, every module on the display flattens to one weight.
    await expect(styledWrapper(page)).not.toHaveClass(/module-weight-override/);
    expect((await moduleInstance(request)).style.fontWeight).toBeUndefined();
    await expect(page.locator('[data-module-id="greeting-1"] p').first()).toHaveCSS('font-weight', '300');
  });

  test('font weight reset removes the key and restores designed weights', async ({ page, request }) => {
    await selectStyledGreeting(page, request);

    await autosaved(page, async () => {
      const slider = page.getByRole('slider', { name: 'Font Weight' });
      await slider.focus();
      await slider.press('End');
    });
    await expect(styledWrapper(page)).toHaveClass(/module-weight-override/);

    await autosaved(page, async () => {
      await page.getByRole('button', { name: 'Reset to default' }).click();
    });

    expect((await moduleInstance(request)).style.fontWeight).toBeUndefined();
    await expect(styledWrapper(page)).not.toHaveClass(/module-weight-override/);
    await expect(page.locator('[data-module-id="greeting-1"] p').first()).toHaveCSS('font-weight', '300');
  });

  test('style font weight owns text module weight; markdown bold survives', async ({ page, request }) => {
    // TextConfig.fontWeight was removed in favor of ModuleStyle.fontWeight —
    // this pins the single-owner behavior on the module most likely to be
    // hand-styled, and pins the strong/b exclusion for user-typed emphasis.
    const mod = buildModuleInstance('text', { content: 'plain **bold** end', markdown: true });
    mod.style = { ...mod.style, fontWeight: 400 };
    await selectModule(page, request, mod);

    const textMod = page.locator('[data-module-id="text-1"]');
    await expect(textMod.locator('span', { hasText: 'plain' }).first()).toHaveCSS('font-weight', '400');
    // strong is excluded from the forced rule, so the UA's `font-weight: bolder`
    // applies RELATIVE to the forced weight: bolder(400) = 700. (At forced 300
    // it would compute 400 — emphasis scales with the chosen weight by design.)
    await expect(textMod.locator('strong', { hasText: 'bold' })).toHaveCSS('font-weight', '700');
  });

  // ── Title strip (Module settings › Title) ────────────────────────────────────────────
  // The strip renders inside ModuleWrapper (data-module-title), so these assert
  // the inner wrapper's inline style attribute for sizes (the exact pre-zoom
  // source, per the suite note above) and computed CSS for non-length props.

  test('title input persists and renders a centered strip on the card', async ({ page, request }) => {
    await selectTitledGreeting(page, request);

    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('Kitchen');
    });

    const inst = await moduleInstance(request);
    expect(inst.style.title).toBe('Kitchen');

    const strip = page.locator('[data-module-id="greeting-1"] [data-module-title]');
    await expect(strip).toHaveText('Kitchen');
    await expect(strip).toHaveCSS('text-align', 'center');
    // Single line with ellipsis, never a widening or wrapping strip.
    await expect(strip).toHaveCSS('white-space', 'nowrap');
    await expect(strip).toHaveCSS('text-overflow', 'ellipsis');

    // No explicit title size: the strip falls back to the module's font size
    // (DEFAULT_MODULE_STYLE 16 for a greeting with no registry defaultStyle).
    expect(inst.style.fontSize).toBe(16);
    await expect(strip).toHaveAttribute('style', /font-size:\s*16px/);
  });

  test('title size slider overrides the strip size and persists', async ({ page, request }) => {
    await selectTitledGreeting(page, request);
    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('Kitchen');
    });

    // End jumps the slider to its max (72) deterministically.
    await autosaved(page, async () => {
      const slider = page.getByRole('slider', { name: 'Title size' });
      await slider.focus();
      await slider.press('End');
    });

    expect((await moduleInstance(request)).style.titleFontSize).toBe(72);
    await expect(page.locator('[data-module-id="greeting-1"] [data-module-title]'))
      .toHaveAttribute('style', /font-size:\s*72px/);
  });

  test('a long title stays on one line without changing the module footprint', async ({ page, request }) => {
    await selectTitledGreeting(page, request);
    const before = (await page.locator('[data-module-id="greeting-1"]').boundingBox())!;

    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('The Extremely Long Kitchen Information Title');
    });

    const strip = page.locator('[data-module-id="greeting-1"] [data-module-title]');
    await expect(strip).toHaveText('The Extremely Long Kitchen Information Title');
    await expect(strip).toHaveCSS('white-space', 'nowrap');
    // Reserved geometry is constant: the module box never grows for text.
    const after = (await page.locator('[data-module-id="greeting-1"]').boundingBox())!;
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  test('forced module weight does not reach the title strip', async ({ page, request }) => {
    // Real-CSS companion to the ModuleWrapper unit test: the override rule in
    // globals.css spares [data-module-title] (and the inline 400 beats
    // inheritance from the wrapper element itself), so a module forced to 900
    // keeps a normal-weight title while its body text goes bold.
    const mod = buildModuleInstance('greeting', { name: 'STYLE' });
    mod.style = { ...mod.style, title: 'Kitchen', fontWeight: 900, backdropBlur: 0 };
    await selectModule(page, request, mod);

    await expect(page.locator('[data-module-id="greeting-1"] [data-module-title]')).toHaveText('Kitchen');
    await expect(page.locator('[data-module-id="greeting-1"] [data-module-title]')).toHaveCSS('font-weight', '400');
    await expect(page.locator('[data-module-id="greeting-1"] p').first()).toHaveCSS('font-weight', '900');
  });

  test('clearing the title removes the strip, the stored key, and the stored size', async ({ page, request }) => {
    await selectTitledGreeting(page, request);
    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('Kitchen');
    });
    await expect(page.locator('[data-module-id="greeting-1"] [data-module-title]')).toHaveText('Kitchen');
    await autosaved(page, async () => {
      const slider = page.getByRole('slider', { name: 'Title size' });
      await slider.focus();
      await slider.press('End');
    });
    expect((await moduleInstance(request)).style.titleFontSize).toBe(72);

    // Empty input omits the key entirely so configs stay clean — and takes
    // titleFontSize with it, so a title added later starts at the default.
    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('');
    });
    const style = (await moduleInstance(request)).style;
    expect(style.title).toBeUndefined();
    expect(style.titleFontSize).toBeUndefined();
    await expect(page.locator('[data-module-id="greeting-1"] [data-module-title]')).toHaveCount(0);
  });

  test('titles persist trimmed on every keystroke; whitespace-only never persists', async ({ page, request }) => {
    // The trim happens in onChange (not onBlur), so a tab closed mid-edit can
    // never leave padding or a whitespace-only title behind in the config.
    await selectTitledGreeting(page, request);
    const input = page.getByLabel('Title words', { exact: true });

    await autosaved(page, async () => {
      await input.fill('Kitchen   ');
    });
    // The input keeps the raw draft (so mid-word spaces aren't eaten)...
    await expect(input).toHaveValue('Kitchen   ');
    // ...while the stored value is already trimmed, without any blur.
    expect((await moduleInstance(request)).style.title).toBe('Kitchen');

    await autosaved(page, async () => {
      await input.fill('   ');
    });
    expect((await moduleInstance(request)).style.title).toBeUndefined();
  });

  test('the Title size slider appears only with a title and resets to the fallback', async ({ page, request }) => {
    await selectStyledGreeting(page, request);
    // Picker on "No title": no words field and no size slider, so
    // titleFontSize can never be written before a title exists.
    await expect(page.getByRole('slider', { name: 'Title size' })).toHaveCount(0);
    await expect(page.getByLabel('Title words', { exact: true })).toHaveCount(0);

    await page.getByLabel('Title', { exact: true }).selectOption('custom');
    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('Kitchen');
    });
    await autosaved(page, async () => {
      const slider = page.getByRole('slider', { name: 'Title size' });
      await slider.focus();
      await slider.press('End');
    });
    expect((await moduleInstance(request)).style.titleFontSize).toBe(72);

    // Reset to default drops the key: the strip returns to the module size.
    await autosaved(page, async () => {
      await page.getByRole('button', { name: 'Reset to default' }).last().click();
    });
    expect((await moduleInstance(request)).style.titleFontSize).toBeUndefined();
    await expect(page.locator('[data-module-id="greeting-1"] [data-module-title]'))
      .toHaveAttribute('style', /font-size:\s*16px/);
  });

  test('title controls are hidden for display-control (renders without a card)', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('display-control'));

    // This used to open the Style section and assert that only the title
    // control was missing, on the reasoning that the strip needs
    // ModuleWrapper. The same reasoning covers the rest of the section:
    // display-control never mounts the wrapper AND never reads `style`, so
    // every control in there was inert, not just the title. The section is now
    // hidden outright (see the 'PropertyPanel Style section' describe), which
    // is why there is no longer a Style button to click here.
    await expect(page.getByTestId('module-title-control')).toHaveCount(0);
    await expect(page.getByLabel('Title words', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Text size' })).toHaveCount(0);
  });

  test('only modules with a title of their own offer that option in the picker', async ({ page, request }) => {
    // The picker is what makes two stacked titles unreachable: a module that
    // has its own heading offers it as the default choice, one that doesn't
    // can only be given words or left bare.
    await selectModule(page, request, buildModuleInstance('todo'));
    const todoPicker = page.getByLabel('Title', { exact: true });
    await expect(todoPicker).toHaveValue('own');
    await expect(todoPicker.getByRole('option')).toHaveText([
      "The module's own title",
      'My own words',
      'No title',
    ]);

    await selectStyledGreeting(page, request);
    const greetingPicker = page.getByLabel('Title', { exact: true });
    await expect(greetingPicker.getByRole('option')).toHaveText(['My own words', 'No title']);
  });

  test('picking the module\'s own title clears the card title and turns its heading back on', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('todo'));
    const picker = page.getByLabel('Title', { exact: true });

    await autosaved(page, async () => {
      await picker.selectOption('custom');
    });
    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('Jobs');
    });
    let inst = await moduleInstance(request);
    expect(inst.style.title).toBe('Jobs');
    expect(inst.config.showTitle).toBe(false);

    await autosaved(page, async () => {
      await picker.selectOption('own');
    });
    inst = await moduleInstance(request);
    expect(inst.style.title).toBeUndefined();
    expect(inst.config.showTitle).toBeUndefined();

    await autosaved(page, async () => {
      await picker.selectOption('none');
    });
    inst = await moduleInstance(request);
    expect(inst.style.title).toBeUndefined();
    expect(inst.config.showTitle).toBe(false);
  });

  test('the strip carries its own inset on padding-0 media modules', async ({ page, request }) => {
    // Image forces the card padding to 0 so the picture runs edge to edge;
    // the strip must not sit flush against the rounded corners.
    const mod = buildModuleInstance('image', {
      src: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      alt: 'e2e',
    });
    await selectModule(page, request, mod);
    await page.getByLabel('Title', { exact: true }).selectOption('custom');
    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('Photo Frame');
    });

    const strip = page.locator('[data-module-id="image-1"] [data-module-title]');
    await expect(strip).toHaveText('Photo Frame');
    await expect(strip).toHaveAttribute('style', /padding:\s*16px 16px 8px/);

    // A padded card contributes its own gap, so its strip only pads below.
    await selectTitledGreeting(page, request);
    await autosaved(page, async () => {
      await page.getByLabel('Title words', { exact: true }).fill('Padded');
    });
    await expect(page.locator('[data-module-id="greeting-1"] [data-module-title]'))
      .toHaveAttribute('style', /padding:\s*0(px)? 0(px)? 8px/);
  });
});

test('Defaults › Display: changing the transition effect persists to the shared config', async ({ page, request }) => {
  // Complements settings.spec.ts, which only asserts the backlink banner on this
  // page (via a per-display override). Here we edit the default itself. The
  // transition <select> isn't label-associated, so target it by an option only
  // it carries ("Crossfade (overlap)"), mirroring standingsSelectByOption above.
  await putConfig(request, baseConfig()); // settings.transitionEffect defaults to 'fade'
  await page.goto('/editor/settings?section=defaults&page=screen');

  const transitionSelect = page
    .locator('select')
    .filter({ has: page.getByRole('option', { name: 'Crossfade (overlap)', exact: true }) });
  await expect(transitionSelect).toBeVisible();
  await transitionSelect.selectOption('crossfade');

  // The settings page autosaves on a 500ms debounce; poll the persisted config.
  await expect
    .poll(async () => (await getConfig(request)).settings.transitionEffect)
    .toBe('crossfade');
});

// ── Task 15: module-level Schedule + backgroundProvider toggle ──────────────
// These target two PropertyPanel structural sections that live on the
// ModuleInstance itself (mod.schedule / mod.backgroundProvider), not in
// mod.config. The screen-level schedule is covered in modals.spec.ts; this is
// the MODULE-level schedule accordion. The backgroundProvider toggle only
// renders for state-producing module types — no built-in declares
// providesState, so it is driven on the fixture plugin.

test.describe('PropertyPanel Schedule (module level)', () => {
  // Schedule lives at mod.schedule, so read the raw first-screen instance.
  async function moduleSchedule(request: APIRequestContext) {
    const config = await getConfig(request);
    return config.screens[0].modules[0].schedule as
      | { daysOfWeek?: number[]; startTime?: string; endTime?: string; invert?: boolean }
      | undefined;
  }

  test('enabling the schedule, toggling a day, and setting a time window persists to mod.schedule', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('text', { content: 'SCHEDULED' }));

    // The module Schedule lives in its own collapsed accordion.
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();

    // Enabling seeds every day, all day — a no-op the user then narrows,
    // rather than a silent Mon-Fri that hides weekend content.
    await autosaved(page, async () => {
      await page.getByRole('switch', { name: 'Only show at certain times' }).click();
    });
    await expect.poll(async () => (await moduleSchedule(request))?.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // Each day's chip now lives in the gutter of its row in the week strip,
    // and is a switch named for the day in full. Clicking an active one
    // removes it; the editor keeps the list sorted.
    await autosaved(page, async () => {
      await page.getByRole('switch', { name: 'Sunday', exact: true }).click();
    });
    await expect.poll(async () => (await moduleSchedule(request))?.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);

    // The From/Until <input type="time"> fields commit on change (not blur).
    await autosaved(page, async () => {
      await page.getByLabel('From', { exact: true }).fill('06:30');
    });
    await autosaved(page, async () => {
      await page.getByLabel('Until', { exact: true }).fill('09:15');
    });

    expect(await moduleSchedule(request)).toMatchObject({
      daysOfWeek: [1, 2, 3, 4, 5, 6],
      startTime: '06:30',
      endTime: '09:15',
    });
  });
});

test.describe('PropertyPanel background provider', () => {
  // "Run hidden in the background" only renders for state-producing module
  // types (isStateProducerType). The fixture plugin's manifest advertises a
  // state key, so its registered definition makes the toggle appear; built-ins
  // declare none. This complements shared-state.spec.ts, which seeds the flag
  // via config — here we exercise the editor UI path that sets it.
  function fixturePluginModule(): ModuleInstance {
    return {
      id: 'e2e-plugin-1',
      type: FIXTURE_PLUGIN_TYPE,
      position: { x: 0, y: 0 },
      size: { w: 320, h: 200 },
      zIndex: 1,
      style: { ...DEFAULT_MODULE_STYLE },
      config: { label: 'E2E PLUGIN' },
    } as ModuleInstance;
  }

  test('toggling Run hidden in the background persists backgroundProvider on the instance', async ({ page, request, sandboxDir }) => {
    seedFixturePlugin(sandboxDir);
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [fixturePluginModule()])],
    }));
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    // The toggle reads the registered plugin definition, which only exists once
    // the bundle loads; its on-canvas marker proves registration completed.
    await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();

    await page.locator('[data-module-id="e2e-plugin-1"]').click();
    await page.getByRole('button', { name: 'Visibility' }).click();

    const toggle = page.getByLabel('Run hidden in the background');
    await expect(toggle).toBeVisible();
    expect(await toggle.isChecked()).toBe(false);

    await autosaved(page, async () => {
      await toggle.check();
    });

    const config = await getConfig(request);
    expect(config.screens[0].modules[0].backgroundProvider).toBe(true);
  });
});

/**
 * The Style section is offered only where style can actually reach the module.
 *
 * Style arrives one of two ways: ModuleWrapper's card, or the module applying
 * `style` itself. A `fillsCanvas` module has neither. Neither does a `cardless`
 * one — display-control does not even accept the prop, so all ten controls in
 * the section were inert for it, and a user who set a background colour there
 * got nothing and no explanation.
 *
 * The plugin case is the guard, and it is the reason this is a test rather than
 * a one-line gate: plugins also render bare, but they re-implement the card
 * from `style` themselves (every shipped plugin carries a ModuleStyle-to-CSS
 * function), so hiding the section for them would take away controls that work.
 */
test.describe('PropertyPanel Style section', () => {
  const styleSection = (page: Page) => page.getByRole('button', { name: 'Style', exact: true });

  test('a card module offers it', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('text'));
    await expect(styleSection(page)).toBeVisible();
  });

  test('a cardless module does not — display-control ignores style entirely', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('display-control'));
    // Panel is open on the right module, so an absent Style section is the
    // gate working rather than a mis-selected module.
    await expect(page.getByRole('button', { name: 'Module settings' })).toBeVisible();
    await expect(styleSection(page)).toHaveCount(0);
  });

  test('a fillsCanvas module does not', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('fullscreen-weather'));
    await expect(styleSection(page)).toHaveCount(0);
  });

  // One Text size control, in percent of the module's normal size, on every
  // module. A module that still carries only the old pixel value reads it as
  // a percent of its base, so the slider says what the wall shows, and the
  // first edit writes the percent and resets the pixel field to the base.
  test('Text size reads an old pixel value as a percent and converts it on the first edit', async ({ page, request }) => {
    const mod = buildModuleInstance('text', { content: 'SIZED' });
    mod.style = { ...mod.style, fontSize: 32 };
    await selectModule(page, request, mod);
    await styleSection(page).click();
    const slider = page.getByRole('slider', { name: 'Text size' });
    await expect(slider).toHaveValue('200');
    await expect(page.getByRole('slider', { name: 'Font Size' })).toHaveCount(0);
    // Untouched, the file still holds only the pixel value.
    expect((await getConfig(request)).screens[0].modules[0].style.textScale).toBeUndefined();

    await autosaved(page, async () => {
      await slider.fill('150');
    });
    const style = (await getConfig(request)).screens[0].modules[0].style;
    expect(style.textScale).toBe(150);
    expect(style.fontSize).toBe(16);
    // And the preview renders base times percent: 16 * 1.5.
    await expect(page.locator('[data-module-id="text-1"] div[style*="background-color"]').first()).toHaveAttribute('style', /font-size:\s*24px/);
  });

  test('a module that fits its text is 100% at the fit and can go below it', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('clock'));
    await styleSection(page).click();
    const slider = page.getByRole('slider', { name: 'Text size' });
    await expect(slider).toHaveValue('100');
    const inner = page.locator('[data-module-id="clock-1"] [data-fitted-px]');
    const fitted = parseFloat((await inner.getAttribute('data-fitted-px')) ?? '0');
    expect(fitted).toBeGreaterThan(16);
    await autosaved(page, async () => {
      await slider.fill('50');
    });
    const style = (await getConfig(request)).screens[0].modules[0].style;
    expect(style.textScale).toBe(50);
    expect(style.fontSize).toBe(16);
    // The clock hands its size to its view, so read the largest type actually
    // painted inside the card rather than any one element's inline style.
    const largest = () => page.locator('[data-module-id="clock-1"]').evaluate((root) => {
      let max = 0;
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        if (!own) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (Number.isFinite(fs) && fs > max) max = fs;
      }
      return max;
    });
    await expect.poll(largest).toBeLessThan(fitted * 3 * 0.55);
    await expect.poll(largest).toBeGreaterThan(fitted * 3 * 0.45);
  });

  test('an old pixel floor above the fit reads as a percent of the fit and keeps its size', async ({ page, request }) => {
    // 60px stored on a greeting from before Text size existed, in a card that
    // fits smaller: the floor was what showed, so that is what 60 converts to.
    const mod = buildModuleInstance('greeting', { name: 'FLOOR' });
    mod.style = { ...mod.style, fontSize: 60 };
    await selectModule(page, request, mod);
    await styleSection(page).click();
    const inner = page.locator('[data-module-id="greeting-1"] [data-fitted-px]');
    const fitted = parseFloat((await inner.getAttribute('data-fitted-px')) ?? '0');
    expect(fitted).toBeGreaterThan(0);
    expect(fitted).toBeLessThan(60);
    const expected = Math.round((60 / fitted) * 100);
    await expect(page.getByRole('slider', { name: 'Text size' })).toHaveValue(String(expected));
    await expect(inner).toHaveAttribute('style', /font-size:\s*60px/);
  });

  test('a fitting module with its fit switched off reads Text size against its base, not the fit', async ({ page, request }) => {
    // A multi-month calendar from before `fitToBox` existed (the key is
    // absent) renders its literal 52px. Its 100% is the 26px base, so the
    // slider reads 200%, and the first nudge lands next to 52px rather than
    // shrinking it to 26 * 1.31 against a fit the calendar never uses.
    const mod = buildModuleInstance('multi-month', { fitToBox: undefined });
    mod.style = { ...mod.style, fontSize: 52 };
    await selectModule(page, request, mod);
    await styleSection(page).click();
    const slider = page.getByRole('slider', { name: 'Text size' });
    await expect(slider).toHaveValue('200');
    // What the grid paints (the fit may shrink 52px to the card; it never grows it).
    const grid = page.locator('[data-module-id="multi-month-1"] [data-fitted-px]');
    const painted = () => grid.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const before = await painted();
    expect(before).toBeGreaterThan(0);

    await autosaved(page, async () => {
      await slider.fill('201');
    });
    const style = (await getConfig(request)).screens[0].modules[0].style;
    expect(style.textScale).toBe(201);
    expect(style.fontSize).toBe(26);
    // 26 * 2.01 is the same picture as 52: the nudge did not shrink the calendar.
    await expect.poll(painted).toBeGreaterThanOrEqual(before * 0.98);
  });

  // A module that paints a field from its own settings (registry
  // `ownsStyleFields`) loses that control rather than being offered it inert:
  // the sticky note's paper is its Note colour setting and its ink is fixed
  // dark for that paper (plan 50, item 20).
  test('a module that owns a colour is not offered the Style control for it', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('sticky-note'));
    await styleSection(page).click();
    await expect(page.getByText('Border Color', { exact: true })).toBeVisible();
    await expect(page.getByText('Text Color', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Background', { exact: true })).toHaveCount(0);

    await selectModule(page, request, buildModuleInstance('text'));
    await styleSection(page).click();
    await expect(page.getByText('Text Color', { exact: true })).toBeVisible();
    await expect(page.getByText('Background', { exact: true })).toBeVisible();
  });

  test('a plugin keeps it — plugins paint their own card from style', async ({ page, request, sandboxDir }) => {
    seedFixturePlugin(sandboxDir);
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [{
        id: 'e2e-plugin-style', type: FIXTURE_PLUGIN_TYPE,
        position: { x: 0, y: 0 }, size: { w: 320, h: 200 }, zIndex: 1,
        style: { ...DEFAULT_MODULE_STYLE }, config: { label: 'E2E PLUGIN' },
      } as ModuleInstance])],
      settings: matrixSettings(),
    }));
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
    await page.locator('[data-module-id="e2e-plugin-style"]').click();
    await expect(styleSection(page)).toBeVisible();
  });
});
