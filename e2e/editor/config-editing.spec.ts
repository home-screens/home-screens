import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { getConfig } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { autosaved, moduleConfig, selectModule } from '../helpers/editor';

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

test('date: switching View persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('date'));

  await autosaved(page, async () => {
    await viewSelect(page).selectOption('banner');
  });

  expect((await moduleConfig(request, 'date')).view).toBe('banner');
});

test('calendar: switching View Mode persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('calendar'));

  await autosaved(page, async () => {
    await page.getByLabel('View Mode').selectOption('month');
  });

  expect((await moduleConfig(request, 'calendar')).viewMode).toBe('month');
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

test('todo: editing Title persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('todo', {
    items: [{ id: 't1', text: 'E2E TASK', completed: false }],
  }));

  await autosaved(page, async () => {
    await page.getByLabel('Title').fill('MY TODOS');
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

test('photo-slideshow: switching Transition persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('photo-slideshow'));

  // Transitions: fade (default) / none — index 1 is none.
  await autosaved(page, async () => {
    await page.getByLabel('Transition').selectOption({ index: 1 });
  });

  expect((await moduleConfig(request, 'photo-slideshow')).transition).toBe('none');
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

test('fullscreen-photo: switching Mode persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('fullscreen-photo'));

  // There is no `mode` config field: the Mode select toggles slideshow vs
  // single by (un)setting `file`. Selecting Single Photo persists file: ''.
  await autosaved(page, async () => {
    await page.getByLabel('Mode').selectOption('single');
  });

  expect((await moduleConfig(request, 'fullscreen-photo')).file).toBe('');
});
