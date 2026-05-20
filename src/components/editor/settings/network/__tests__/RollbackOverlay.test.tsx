// @vitest-environment jsdom

/**
 * Render-time i18n contract test for `<RollbackOverlay>`.
 *
 * RollbackOverlay's internal `status: 'polling' | 'confirmed' | 'reverted'`
 * union renders three distinct sub-trees, each calling 3-4 dictionary
 * paths under `settings.networkPage.rollback.*`. A single typo in one
 * of those paths would only surface at runtime — and the `reverted` /
 * `confirmed` branches are rare-path UX that most testing sessions
 * never exercise. This test forces each branch to render and asserts
 * the raw dotted-path key never leaks into the DOM (which is what
 * `t()` returns on a miss).
 *
 * Establishes the convention for tests under
 * `src/components/editor/settings/**\/__tests__/`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import RollbackOverlay from '../RollbackOverlay';
import enUSEditor from '@/translations/en-US/editor.json';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const RAW_KEY_PATTERN = /settings\.networkPage\.rollback\./;

function renderOverlay() {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <RollbackOverlay
        rollbackId="test-rollback-id"
        onConfirmed={() => {}}
        onReverted={() => {}}
        onDismiss={() => {}}
      />
    </I18nProvider>,
  );
}

describe('RollbackOverlay i18n', () => {
  beforeEach(() => {
    __resetLoaderForTests();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders translated copy for status=polling (initial render, fetch not yet resolved)', async () => {
    // Block the fetch so the component stays in the initial 'polling'
    // state for the duration of the assertion.
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => { /* never resolves */ }),
    );

    const { container } = renderOverlay();

    // The polling sub-tree should be rendered with translated copy.
    expect(container.textContent).toContain('Verifying connectivity...');
    // No raw dotted-path key may leak through any of the three sub-trees.
    expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
  });

  it('renders translated copy for status=reverted (fetch reports no pending rollback)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ pending: false }), { status: 200 }),
    );

    const { container } = renderOverlay();

    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    expect(container.textContent).toContain('Change reverted');
    expect(container.textContent).toContain('Dismiss');
    expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
  });

  it('renders translated copy for status=confirmed (fetch reports pending rollback then accepts confirmation)', async () => {
    // First call (GET) returns pending=true; second call (POST) returns ok=true.
    let callIndex = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callIndex += 1;
      if (callIndex === 1) {
        return new Response(
          JSON.stringify({ pending: true, remainingMs: 28000 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const { container } = renderOverlay();

    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    expect(container.textContent).toContain('Connection confirmed!');
    expect(container.textContent).toContain('Dismiss');
    expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
  });
});
