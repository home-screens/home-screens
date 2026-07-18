import { writeFileSync } from 'fs';
import path from 'path';
import { test, expect } from '../fixtures';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';
import type { DisplayRule, ScreenConfiguration } from '@/types/config';

/**
 * Editor › Defaults › Rules (`RulesSection` + `SortableRuleCard`). Mirrors
 * profiles-settings.spec.ts: the section auto-saves every mutation via a
 * 500ms `useDebouncedSave`, so each action is wrapped in `autosaved`.
 *
 * `BaseConfigOverrides` has no `rules` field, so rules are attached to the
 * built config rather than passed to `baseConfig`.
 */

function twoScreenConfig(rules?: DisplayRule[]): ScreenConfiguration {
  const config = baseConfig({
    screens: [
      makeScreen('home', 'Home', [textModule('HOME', { id: 'home-text' })]),
      makeScreen('cameras', 'Cameras', [textModule('CAMS', { id: 'cams-text' })]),
    ],
  });
  if (rules) config.rules = rules;
  return config;
}

function seededRule(overrides: Partial<DisplayRule> = {}): DisplayRule {
  return {
    id: 'rule-1',
    name: 'Doorbell',
    when: [{ kind: 'state', sourceKey: 'plugin:ha:doorbell', equals: 'on' }],
    action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 60 },
    ...overrides,
  };
}

/** A rule card, addressed via its name span's `rounded-lg` root ancestor. */
function ruleCard(page: import('@playwright/test').Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
}

test('adding a rule persists with a valid default action targeting the first screen', async ({ page, request }) => {
  await putConfig(request, twoScreenConfig());
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');
  await expect(page.getByRole('button', { name: 'Add Rule' })).toBeVisible();

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add Rule' }).click();
  });

  await expect(ruleCard(page, 'Rule 1')).toBeVisible();
  const config = await getConfig(request);
  expect(config.rules).toHaveLength(1);
  expect(config.rules![0].name).toBe('Rule 1');
  expect(config.rules![0].when).toEqual([]);
  expect(config.rules![0].action).toEqual({ kind: 'showScreen', screenId: 'home', mode: 'for', seconds: 60 });
});

test('editing the action (screen, mode, cooldown) persists', async ({ page, request }) => {
  await putConfig(request, twoScreenConfig([seededRule()]));
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');

  // Expand the card.
  await ruleCard(page, 'Doorbell').getByText('Doorbell', { exact: true }).click();
  await expect(page.getByLabel('Action')).toBeVisible();

  // Switch mode to while — the seconds field disappears and `seconds` drops.
  await autosaved(page, async () => {
    await page.getByLabel('How long').selectOption('while');
  });
  await expect(page.getByLabel('Seconds', { exact: true })).toHaveCount(0);
  let config = await getConfig(request);
  expect(config.rules![0].action).toEqual({ kind: 'showScreen', screenId: 'cameras', mode: 'while' });

  // Retarget to the other screen.
  await autosaved(page, async () => {
    await page.getByLabel('Screen', { exact: true }).selectOption('home');
  });
  config = await getConfig(request);
  expect((config.rules![0].action as { screenId: string }).screenId).toBe('home');

  // Cooldown commits on blur.
  await autosaved(page, async () => {
    await page.getByLabel('Cooldown (seconds)').fill('120');
    await page.getByLabel('Cooldown (seconds)').blur();
  });
  config = await getConfig(request);
  expect(config.rules![0].cooldownSeconds).toBe(120);

  // Switch to the wake action — screen/mode controls go away.
  await autosaved(page, async () => {
    await page.getByLabel('Action', { exact: true }).selectOption('wake');
  });
  await expect(page.getByLabel('Screen', { exact: true })).toHaveCount(0);
  config = await getConfig(request);
  expect(config.rules![0].action).toEqual({ kind: 'wake' });
});

test('adding a condition through the tree editor persists into rule.when', async ({ page, request }) => {
  await putConfig(request, twoScreenConfig([seededRule({ when: [] })]));
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');

  await ruleCard(page, 'Doorbell').getByText('Doorbell', { exact: true }).click();
  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add condition' }).click();
  });

  // Type a key manually (combobox is a free-text input) and a value; both
  // commit on blur.
  const keyInput = page.getByPlaceholder('Search sensors, lights, and more…');
  await autosaved(page, async () => {
    await keyInput.fill('plugin:ha:door');
    await keyInput.blur();
  });
  const valueInput = page.getByPlaceholder('on');
  await autosaved(page, async () => {
    await valueInput.fill('open');
    await valueInput.blur();
  });

  const config = await getConfig(request);
  expect(config.rules![0].when).toEqual([{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'open' }]);
});

test('the enabled toggle and delete both persist', async ({ page, request }) => {
  await putConfig(request, twoScreenConfig([seededRule()]));
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');

  await ruleCard(page, 'Doorbell').getByText('Doorbell', { exact: true }).click();
  await autosaved(page, async () => {
    await page.getByText('Rule is on').click();
  });
  await expect(ruleCard(page, 'Doorbell').getByText('Off', { exact: true })).toBeVisible();
  let config = await getConfig(request);
  expect(config.rules![0].enabled).toBe(false);

  // Delete via the trash button + confirm dialog.
  await autosaved(page, async () => {
    await ruleCard(page, 'Doorbell').getByTitle('Delete rule').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
  });
  await expect(page.getByText('Doorbell', { exact: true })).toHaveCount(0);
  config = await getConfig(request);
  expect(config.rules).toEqual([]);
});

test('reordering rules via drag persists the new priority order', async ({ page, request }) => {
  await putConfig(request, twoScreenConfig([
    seededRule({ id: 'rule-1', name: 'First' }),
    seededRule({ id: 'rule-2', name: 'Second' }),
  ]));
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');

  const first = ruleCard(page, 'First');
  const second = ruleCard(page, 'Second');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();

  // Same drag choreography as profiles-settings.spec.ts: the handle is the
  // GripVertical button (dnd-kit's listeners live there, not on the card),
  // and PointerSensor needs >5px of travel before the drag activates.
  const handle = first.locator('button').first();
  const handleBox = (await handle.boundingBox())!;
  const secondBox = (await second.boundingBox())!;
  if (!handleBox || !secondBox) throw new Error('rule card / handle not found');

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 12, { steps: 5 });
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2 + 8, { steps: 10 });
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height, { steps: 5 });
  await page.mouse.up();

  // Priority is list order — the reorder is the write path that establishes it.
  await expect
    .poll(async () => (await getConfig(request)).rules?.map((r) => r.id))
    .toEqual(['rule-2', 'rule-1']);
});

test('the seconds field reverts invalid input on blur instead of saving it', async ({ page, request }) => {
  await putConfig(request, twoScreenConfig([seededRule()])); // for-mode, seconds 60
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');

  await ruleCard(page, 'Doorbell').getByText('Doorbell', { exact: true }).click();
  const seconds = page.getByLabel('Seconds', { exact: true });
  await expect(seconds).toHaveValue('60');

  // Clearing a REQUIRED seconds field reverts to the last value — an empty
  // for-mode duration is unsaveable and must never reach the autosave PUT.
  await seconds.fill('');
  await seconds.blur();
  await expect(seconds).toHaveValue('60');

  // Zero (and anything non-positive) reverts the same way.
  await seconds.fill('0');
  await seconds.blur();
  await expect(seconds).toHaveValue('60');

  // Nothing was committed, so nothing autosaved: past the 500ms debounce the
  // stored rule still carries the seeded 60.
  await page.waitForTimeout(800);
  const config = await getConfig(request);
  expect((config.rules![0].action as { seconds?: number }).seconds).toBe(60);
});

test('a rule made invalid outside the editor shows the inline invalid banner', async ({ page, sandboxDir }) => {
  // The write gate rejects invalid rules, so the only way a saved config can
  // carry one is a hand edit of data/config.json — write it directly, as a
  // user poking the file would.
  const config = twoScreenConfig([
    seededRule({ action: { kind: 'showScreen', screenId: 'ghost', mode: 'for', seconds: 60 } }),
  ]);
  writeFileSync(path.join(sandboxDir, 'data', 'config.json'), JSON.stringify(config, null, 2));

  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');
  await ruleCard(page, 'Doorbell').getByText('Doorbell', { exact: true }).click();

  // The banner mirrors what the write gate will reject, with the reason.
  await expect(page.getByText("This rule can't be saved yet:")).toBeVisible();
  await expect(page.getByText(/references unknown screen/)).toBeVisible();
});

test('the sleep action option persists and shows its hint', async ({ page, request }) => {
  await putConfig(request, twoScreenConfig([seededRule()]));
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');

  await ruleCard(page, 'Doorbell').getByText('Doorbell', { exact: true }).click();
  await autosaved(page, async () => {
    await page.getByLabel('Action', { exact: true }).selectOption('sleep');
  });
  // Screen/mode controls disappear; the sleep hint appears.
  await expect(page.getByLabel('Screen', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Turns the screen off/)).toBeVisible();

  const config = await getConfig(request);
  expect(config.rules![0].action).toEqual({ kind: 'sleep' });
});

test('copy to display clones the rule onto another display', async ({ page, request }) => {
  const config = baseConfig({
    displays: [
      {
        id: 'main',
        name: 'Main Display',
        screens: [makeScreen('m1', 'M1', [textModule('M1', { id: 'm1-text' })])],
        rules: [seededRule({ action: { kind: 'showScreen', screenId: 'm1', mode: 'for', seconds: 60 } })],
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k1', 'K1', [textModule('K1', { id: 'k1-text' })])],
      },
    ],
  });
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');

  // Select Main explicitly so the store's selectedDisplayId is set to it, then
  // expand the rule and copy it to Kitchen.
  await page.getByLabel('Editing automation for').selectOption('main');
  await ruleCard(page, 'Doorbell').getByText('Doorbell', { exact: true }).click();
  await autosaved(page, async () => {
    await page.getByLabel('Copy to another display').selectOption('kitchen');
  });
  await expect(page.getByText(/Copied to Kitchen/)).toBeVisible();

  const saved = await getConfig(request);
  const kitchen = saved.displays!.find((d) => d.id === 'kitchen')!;
  expect(kitchen.rules).toHaveLength(1);
  expect(kitchen.rules![0].name).toBe('Doorbell');
  expect(kitchen.rules![0].enabled).toBeUndefined();
  // Screen target is blanked — screens are per-display, so it can't carry over.
  expect((kitchen.rules![0].action as { screenId: string }).screenId).toBe('');
  // Source display keeps its own rule.
  expect(saved.displays!.find((d) => d.id === 'main')!.rules).toHaveLength(1);

  // Switching to Kitchen shows the copied rule in that display's list.
  await page.getByLabel('Editing automation for').selectOption('kitchen');
  await expect(ruleCard(page, 'Doorbell')).toBeVisible();
});

test('rules edit the selected display in multi-display mode', async ({ page, request }) => {
  const config = baseConfig({
    displays: [
      {
        id: 'main',
        name: 'Main Display',
        screens: [makeScreen('m1', 'M1', [textModule('M1', { id: 'm1-text' })])],
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k1', 'K1', [textModule('K1', { id: 'k1-text' })])],
      },
    ],
  });
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=automation&panel=rules');

  // The display picker appears; switch to Kitchen and add a rule there.
  await page.getByLabel('Editing automation for').selectOption('kitchen');
  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add Rule' }).click();
  });

  const saved = await getConfig(request);
  const kitchen = saved.displays!.find((d) => d.id === 'kitchen')!;
  const main = saved.displays!.find((d) => d.id === 'main')!;
  expect(kitchen.rules).toHaveLength(1);
  // The default action targets the KITCHEN's first screen, not main's.
  expect((kitchen.rules![0].action as { screenId: string }).screenId).toBe('k1');
  expect(main.rules ?? []).toHaveLength(0);
  expect(saved.rules ?? []).toHaveLength(0);
});
