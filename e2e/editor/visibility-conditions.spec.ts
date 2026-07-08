import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';
import type { APIRequestContext, Page } from '@playwright/test';
import type { ModuleInstance, VisibilityCondition } from '@/types/config';

/**
 * Editor-form coverage for VisibilityConditionsSection.tsx: enabling the
 * conditions block, adding/filling a `state` condition, switching a leaf to
 * `numeric`, wrapping a leaf in an "All of…" group + nesting a child, and the
 * depth cap that hides group kinds at MAX_CONDITION_DEPTH.
 *
 * display/interactive.spec.ts already proves the *runtime* gating (a single
 * unknown-key state condition hiding the module on the display); this file
 * exercises the *authoring UI* instead.
 */

/** PUT a single-module config, open the editor, select the module, and open the Conditions accordion. */
async function openConditions(page: Page, request: APIRequestContext, mod: ModuleInstance): Promise<void> {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${mod.id}"]`).click();
  // The conditions UI is its own accordion (propertyPanel.sections.conditions),
  // collapsed by default and separate from the "Visibility" enabled/schedule one.
  await page.getByRole('button', { name: 'Conditions' }).click();
}

/** Persisted visibility block for the single module in the single screen. */
async function savedVisibility(request: APIRequestContext) {
  const config = await getConfig(request);
  return config.screens[0].modules[0].visibility;
}

test('enabling conditions and adding one persists an empty-conditions visibility block', async ({ page, request }) => {
  const mod = textModule('GATED');
  await openConditions(page, request, mod);

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show only when conditions match' }).click();
  });
  expect(await savedVisibility(request)).toEqual({ conditions: [] });

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add condition' }).click();
  });

  const visibility = await savedVisibility(request);
  expect(visibility!.conditions).toHaveLength(1);
  expect(visibility!.conditions[0]).toMatchObject({ kind: 'state', sourceKey: '', equals: '' });
});

test('filling a state condition source key and value persists on blur', async ({ page, request }) => {
  const mod = textModule('GATED', { visibility: { conditions: [{ kind: 'state', sourceKey: '', equals: '' }] } });
  await openConditions(page, request, mod);

  // Focusing Value blurs (and commits) the State key; Value.blur() commits the
  // value. Two commits can coalesce into one debounced PUT, so poll for the
  // final persisted shape rather than reading immediately after one save.
  await page.getByLabel('State key').fill('plugin:e2e-fixture:flag');
  await page.getByLabel('Value').fill('on');
  await page.getByLabel('Value').blur();

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' });
});

test('switching condition kind to numeric preserves the source key and exposes Above', async ({ page, request }) => {
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:count', equals: '5' }] },
  });
  await openConditions(page, request, mod);

  await autosaved(page, async () => {
    await page.getByLabel('Condition type').selectOption('numeric');
  });

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ kind: 'numeric', sourceKey: 'plugin:e2e-fixture:count' });

  // The numeric editor swaps the value field for Above/Below bounds.
  await page.getByLabel('Above').fill('10');
  await page.getByLabel('Above').blur();

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ above: 10 });
});

test('switching to a group kind wraps the leaf and supports adding a nested child', async ({ page, request }) => {
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' }] },
  });
  await openConditions(page, request, mod);

  await autosaved(page, async () => {
    await page.getByLabel('Condition type').first().selectOption('and');
  });

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({
      kind: 'and',
      conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' }],
    });

  // The group's own "Add condition" is nested inside it and therefore precedes
  // the section-level "Add condition" in the DOM, so it is .first(), not .last()
  // (the plan guessed .last()). Clicking it appends a second child to the group.
  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add condition' }).first().click();
  });

  const visibility = await savedVisibility(request);
  const group = visibility!.conditions[0] as Extract<VisibilityCondition, { kind: 'and' }>;
  expect(group.conditions).toHaveLength(2);
});

test('condition type options exclude group kinds at max nesting depth', async ({ page, request }) => {
  // MAX_CONDITION_DEPTH === 5. The UI hides group kinds once a ConditionEditor
  // renders at depth === MAX_CONDITION_DEPTH - 1 (4). Nest MAX_CONDITION_DEPTH - 1
  // (== 4) `and` groups ending in a leaf so the leaf editor sits at depth 4.
  const deep: VisibilityCondition = {
    kind: 'and',
    conditions: [{
      kind: 'and',
      conditions: [{
        kind: 'and',
        conditions: [{
          kind: 'and',
          conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' }],
        }],
      }],
    }],
  };
  const mod = textModule('GATED', { visibility: { conditions: [deep] } });
  await openConditions(page, request, mod);

  const kindSelects = page.getByLabel('Condition type');
  await expect(kindSelects).toHaveCount(5); // 4 groups + 1 leaf

  const optionValues = (locator: ReturnType<Page['getByLabel']>) =>
    locator.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

  // Root group (depth 0) still offers every kind.
  expect(await optionValues(kindSelects.first())).toEqual(['state', 'numeric', 'and', 'or', 'not']);

  // Innermost leaf (depth 4) drops the group kinds.
  expect(await optionValues(kindSelects.last())).toEqual(['state', 'numeric']);
});
