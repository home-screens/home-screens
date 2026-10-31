// @vitest-environment jsdom

/**
 * The Mealie card's Test button answers in a plain sentence for every way the
 * connection can go, and the card's pill follows what the test found rather
 * than only which fields are filled in: an address and a token that Mealie
 * refuses are not "Connected".
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
}));

import MealieIntegrationCard from '../MealieIntegrationCard';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function answer(json: unknown, ok = true) {
  mocks.editorFetch.mockResolvedValue({ ok, json: async () => json });
}

async function runTest() {
  const view = render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <MealieIntegrationCard status={{ mealie_url: true, mealie_api_key: true }} onSaved={() => {}} defaultOpen />
    </I18nProvider>,
  );
  fireEvent.click(view.getByRole('button', { name: /^Test/ }));
  const result = await view.findByTestId('mealie-test-result');
  const pill = view.getByRole('button', { expanded: true }).textContent ?? '';
  return { text: result.textContent ?? '', pill };
}

describe('the Mealie card', () => {
  it('names the household and the version when Mealie takes the token', async () => {
    answer({ ok: true, version: '3.29.0', household: 'Family', user: 'Sam' });
    const { text, pill } = await runTest();
    expect(text).toContain('Connected to the Family household, Mealie 3.29.0');
    expect(pill).toContain('Connected');
    expect(mocks.editorFetch).toHaveBeenCalledWith('/api/mealie/validate');
  });

  it.each([
    ['unreachable', "We couldn't reach Mealie at that address."],
    ['key-rejected', "Mealie didn't accept that token."],
    ['not-mealie', "Something answered at that address, but it isn't Mealie."],
    ['bad-address', "That doesn't look like a web address."],
    ['not-set-up', 'Add the address and the token first.'],
  ])('says what went wrong for %s', async (failure, sentence) => {
    answer({ ok: false, failure });
    const { text, pill } = await runTest();
    expect(text).toContain(sentence);
    expect(pill).toContain('Not connected');
  });

  it('says which version is too old', async () => {
    answer({ ok: false, failure: 'too-old', version: '1.12.0' });
    const { text } = await runTest();
    expect(text).toContain('This Mealie is too old (version 1.12.0).');
    expect(text).toContain('Update it to 2.0 or newer, then test again.');
  });

  it('says the hub could not be asked when the check itself fails', async () => {
    mocks.editorFetch.mockRejectedValue(new Error('offline'));
    const { text } = await runTest();
    expect(text).toContain("We couldn't check right now.");
  });

  it('shows how many fields are saved until it is tested', () => {
    const view = render(
      <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
        <MealieIntegrationCard status={{ mealie_url: true }} onSaved={() => {}} />
      </I18nProvider>,
    );
    expect(view.getByRole('button', { expanded: false }).textContent).toContain('1 of 2');
  });
});
