// @vitest-environment jsdom

/**
 * The Mealie card's Test button answers in a plain sentence for every way the
 * connection can go, and the card asks the same once by itself when it is
 * shown with an address saved: its pill says what Mealie answered rather than
 * only which fields are filled in (an address and a token that Mealie refuses
 * are not "Connected"), and the address box shows the saved address.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
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
    // A family already using it is not sent on to the Meals page every visit.
    expect(view.queryByRole('link', { name: /Meals settings/ })).toBeNull();
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

  it('names the household and links on to the Meals page after Test', async () => {
    answer({ ok: true, version: '3.29.0', household: 'Family', user: 'Sam', url: 'http://mealie.local' });
    const { text, pill, view } = await runTest();
    expect(text).toContain('Connected to the Family household, Mealie 3.29.0');
    expect(pill).toContain('Connected');
    expect(view.getByRole('link', { name: /Meals settings/ })).toBeTruthy();
    expect(mocks.editorFetch).toHaveBeenCalledWith('/api/mealie/validate');
  });

  it.each([
    ['unreachable', "We couldn't reach Mealie at that address.", 'Not answering'],
    ['key-rejected', "Mealie didn't accept that token.", 'Token not accepted'],
    ['not-mealie', "Something answered at that address, but it isn't Mealie.", 'Not connected'],
    ['bad-address', "That doesn't look like a web address.", 'Not connected'],
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
