// @vitest-environment jsdom

/**
 * The Mealie card's Test button answers in a plain sentence for every way the
 * connection can go, and the card asks the same once by itself when it is
 * shown with an address saved: its pill says what Mealie answered rather than
 * only which fields are filled in (an address and a token that Mealie refuses
 * are not "Connected"), and the address box shows the saved address. A
 * connected answer to a save or a Test asks whether the meal plan should live
 * in Mealie, while it does not yet.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
}));

import MealieIntegrationCard from '../MealieIntegrationCard';
import type { SecretStatus } from '../shared/SecretField';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function answer(json: unknown, ok = true) {
  mocks.editorFetch.mockResolvedValue({ ok, json: async () => json });
}

function renderCard(status: SecretStatus = { mealie_url: true, mealie_api_key: true }) {
  const view = render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <MealieIntegrationCard status={status} onSaved={() => {}} defaultOpen />
    </I18nProvider>,
  );
  const pill = () => view.getByRole('button', { expanded: true }).textContent ?? '';
  const addressBox = () => view.getByPlaceholderText('e.g. http://192.168.1.50:9925') as HTMLInputElement;
  return { view, pill, addressBox };
}

const validateCalls = () => mocks.editorFetch.mock.calls.filter(([url]) => url === '/api/mealie/validate').length;

const CONNECTED = { ok: true, version: '3.29.0', household: 'Family', user: 'Sam', url: 'http://mealie.local' };
const FAMILY_SETTINGS = { enabledSlots: ['breakfast', 'dinner'], weekStartDay: 'monday', defaultSlotTimes: { dinner: '18:00' } };

/**
 * A hub that answers the check with `check` and keeps the meal settings: a
 * GET of the meals reads them, a PUT replaces them (or fails, while
 * `saves.fail` is set).
 */
function hub(check: unknown, settings: Record<string, unknown> = FAMILY_SETTINGS) {
  const state = { settings, fail: false, puts: [] as Record<string, unknown>[] };
  mocks.editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/mealie/validate') return { ok: true, json: async () => check };
    if (url === '/api/meals/data' && init?.method === 'PUT') {
      if (state.fail) return { ok: false, json: async () => ({ error: 'Disk full' }) };
      state.settings = JSON.parse(String(init.body)).settings;
      state.puts.push(state.settings);
      return { ok: true, json: async () => ({ settings: state.settings }) };
    }
    if (url === '/api/meals/data') return { ok: true, json: async () => ({ settings: state.settings }) };
    throw new Error(`unexpected ${url}`);
  });
  return state;
}

const mealsReads = () => mocks.editorFetch.mock.calls.filter(([url, init]) => url === '/api/meals/data' && !init).length;

async function pressTest(view: ReturnType<typeof renderCard>['view']) {
  await view.findByTestId('mealie-test-result');
  fireEvent.click(view.getByRole('button', { name: /^Test/ }));
  await waitFor(() => expect(validateCalls()).toBe(2));
}

async function runTest() {
  const card = renderCard();
  // The check the card makes as it opens, then the Test button's.
  await card.view.findByTestId('mealie-test-result');
  fireEvent.click(card.view.getByRole('button', { name: /^Test/ }));
  await waitFor(() => expect(validateCalls()).toBe(2));
  const result = await card.view.findByTestId('mealie-test-result');
  return { text: result.textContent ?? '', pill: card.pill(), view: card.view };
}

describe('the Mealie card', () => {
  it('checks once by itself when shown, and says Connected only when Mealie takes the token', async () => {
    answer({ ok: true, version: '3.29.0', household: 'Family', user: 'Sam', url: 'http://192.168.1.50:9925' });
    const { view, pill, addressBox } = renderCard();
    expect(pill()).toContain('Checking');
    const result = await view.findByTestId('mealie-test-result');
    expect(result.textContent).toContain('Connected to the Family household, Mealie 3.29.0');
    expect(pill()).toContain('Connected');
    expect(addressBox().value).toBe('http://192.168.1.50:9925');
    // Not a poll: one check for one opening.
    expect(validateCalls()).toBe(1);
    // A family that may have answered long ago is not asked again every visit.
    expect(view.queryByTestId('mealie-plan-question')).toBeNull();
    expect(view.queryByRole('link', { name: /Meals settings/ })).toBeNull();
    expect(mealsReads()).toBe(0);
  });

  it('says the token is refused, with two boxes saved, as soon as the card is shown', async () => {
    answer({ ok: false, failure: 'key-rejected', version: '3.29.0', url: 'http://localhost:9925' });
    const { view, pill, addressBox } = renderCard();
    const result = await view.findByTestId('mealie-test-result');
    expect(result.textContent).toContain("Mealie didn't accept that token.");
    expect(pill()).toContain('Token not accepted');
    expect(pill()).not.toContain('Connected');
    expect(addressBox().value).toBe('http://localhost:9925');
  });

  it('names the household after Test and asks to plan in Mealie while the plan lives in Home Screens', async () => {
    hub(CONNECTED);
    const { text, pill, view } = await runTest();
    expect(text).toContain('Connected to the Family household, Mealie 3.29.0');
    expect(pill).toContain('Connected');
    const question = await view.findByTestId('mealie-plan-question');
    expect(question.textContent).toContain('Use Mealie for your meal plan?');
    expect(question.textContent).toContain('Your Home Screens plan is kept');
  });

  it('moves the plan to Mealie with one press, changing nothing else, and Undo moves it back', async () => {
    const state = hub(CONNECTED);
    const { view } = renderCard();
    await pressTest(view);
    const question = await view.findByTestId('mealie-plan-question');
    fireEvent.click(within(question).getByRole('button', { name: 'Use Mealie' }));

    await waitFor(() => expect(question.textContent).toContain('Your meal plan now comes from Mealie.'));
    expect(state.puts).toEqual([{ ...FAMILY_SETTINGS, planSource: 'mealie' }]);
    expect(within(question).getByRole('link', { name: /Meals settings/ }).getAttribute('href')).toContain('page=meals');

    fireEvent.click(within(question).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(question.textContent).toContain('Use Mealie for your meal plan?'));
    expect(state.puts[1]).toEqual(FAMILY_SETTINGS);
  });

  it('keeps asking, with a plain line, when the switch does not save', async () => {
    const state = hub(CONNECTED);
    state.fail = true;
    const { view } = renderCard();
    await pressTest(view);
    const question = await view.findByTestId('mealie-plan-question');
    fireEvent.click(within(question).getByRole('button', { name: 'Use Mealie' }));
    expect(await within(question).findByRole('alert')).toHaveProperty('textContent', "The switch didn't save. Try again.");
    expect(within(question).getByRole('button', { name: 'Use Mealie' })).toHaveProperty('disabled', false);
    expect(state.settings).toEqual(FAMILY_SETTINGS);
  });

  it('closes the question on Not now without saving anything', async () => {
    const state = hub(CONNECTED);
    const { view } = renderCard();
    await pressTest(view);
    fireEvent.click(within(await view.findByTestId('mealie-plan-question')).getByRole('button', { name: 'Not now' }));
    expect(view.queryByTestId('mealie-plan-question')).toBeNull();
    expect(state.puts).toEqual([]);
  });

  it('only says where the plan lives, with a link to the Meals page, when it already lives in Mealie', async () => {
    hub(CONNECTED, { ...FAMILY_SETTINGS, planSource: 'mealie' });
    const { view } = renderCard();
    await pressTest(view);
    await view.findByText('Your meal plan comes from Mealie.', { exact: false });
    expect(view.queryByTestId('mealie-plan-question')).toBeNull();
    expect(view.getByRole('link', { name: /Meals settings/ })).toBeTruthy();
  });

  it('asks nothing about the meal plan when Mealie refuses the token', async () => {
    hub({ ok: false, failure: 'key-rejected' });
    const { view } = renderCard();
    await pressTest(view);
    await waitFor(() => expect(view.getByTestId('mealie-test-result').textContent).toContain("Mealie didn't accept that token."));
    expect(view.queryByTestId('mealie-plan-question')).toBeNull();
  });

  it.each([
    ['unreachable', "We couldn't reach Mealie at that address.", 'Not answering'],
    ['key-rejected', "Mealie didn't accept that token.", 'Token not accepted'],
    ['not-mealie', "Something answered at that address, but it isn't Mealie.", "Can't use this Mealie"],
    ['bad-address', "That doesn't look like a web address.", "Can't use this Mealie"],
    ['not-set-up', 'Add the address and the token first.', 'Not connected'],
  ])('says what went wrong for %s', async (failure, sentence, pillText) => {
    answer({ ok: false, failure });
    const { text, pill } = await runTest();
    expect(text).toContain(sentence);
    expect(pill).toContain(pillText);
  });

  it('says which version is too old', async () => {
    answer({ ok: false, failure: 'too-old', version: '1.12.0' });
    const { text } = await runTest();
    expect(text).toContain('This Mealie is too old (version 1.12.0).');
    expect(text).toContain('Update it to 2.0 or newer, then test again.');
  });

  it('says the hub could not be asked when the check itself fails', async () => {
    mocks.editorFetch.mockRejectedValue(new Error('offline'));
    const { text, pill } = await runTest();
    expect(text).toContain("We couldn't check right now.");
    expect(pill).toContain("Couldn't check");
  });

  it('shows how many fields are saved, and the saved address, while one is missing', async () => {
    answer({ ok: false, failure: 'not-set-up', url: 'http://192.168.1.50:9925' });
    const { view, addressBox } = renderCard({ mealie_url: true });
    await waitFor(() => expect(addressBox().value).toBe('http://192.168.1.50:9925'));
    expect(view.getByRole('button', { expanded: true }).textContent).toContain('1 of 2');
    // The count already says what is missing.
    expect(view.queryByTestId('mealie-test-result')).toBeNull();
  });

  it('says Mealie is optional to a family that has not set it up, and asks nothing', () => {
    const { pill } = renderCard({});
    expect(pill()).toContain('Optional, not set up');
    expect(pill()).not.toContain('Not configured');
    expect(validateCalls()).toBe(0);
  });
});
