// @vitest-environment jsdom

/**
 * Save-flow contract test for `<TimeFormatFields>`.
 *
 * Changing the time-format picker must stage the change in the store and
 * flush it to disk — and nothing else:
 *
 *   1. `updateSettings({ timeFormat: … })` — stage the change in store
 *   2. `await saveConfig()`                  — flush to disk
 *
 * Unlike the language picker (see `LanguageFields.test.tsx`), a time-format
 * change affects only client-rendered module content, not server-rendered
 * chrome, so the component must NOT call `router.refresh()` or any of the
 * locale-cache helpers. This test pins the storage rule too: picking 12h
 * stores `undefined` (the field is dropped — 12h is the absent-value
 * default, keeping on-disk config tidy), picking 24h stores `'24h'`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────
//
// The store is mocked so the test pins the call contract, not the real
// Zustand wiring (which has its own tests). `vi.mock` factories are hoisted
// above `const` declarations, so shared fixtures the factories close over
// must live inside `vi.hoisted`.
const mocks = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  saveConfig: vi.fn(async () => {}),
  // Asserted NOT to fire — see the header comment: unlike the language
  // picker, a time-format change must not trigger a router refresh.
  refresh: vi.fn(),
  // The mock below replaces `useEditorStore` wholesale, so no selector /
  // `useSyncExternalStore` machinery runs — this object only needs to
  // satisfy what the component destructures.
  storeState: {
    config: { settings: { timeFormat: '24h' } },
  } as { config: { settings: { timeFormat?: TimeFormat } } },
}));

vi.mock('@/stores/editor-store', () => ({
  useEditorStore: () => ({
    ...mocks.storeState,
    updateSettings: mocks.updateSettings,
    saveConfig: mocks.saveConfig,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

// Import after mocks are registered so the module sees the mocked deps.
// The real `@/i18n` is used (no mock needed — the component touches none of
// its mutable exports), with the component wrapped in `<I18nProvider>` and
// the real en-US editor dictionary so `getByLabelText` resolves against the
// actual shipped strings.
import TimeFormatFields from '../TimeFormatFields';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import type { TimeFormat } from '@/types/config';

function renderField() {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <TimeFormatFields />
    </I18nProvider>,
  );
}

describe('TimeFormatFields save flow', () => {
  beforeEach(() => {
    mocks.updateSettings.mockClear();
    mocks.saveConfig.mockClear();
    mocks.refresh.mockClear();
    // Reset to a clean default async impl in case a prior test stubbed it.
    mocks.saveConfig.mockImplementation(async () => {});
    mocks.storeState.config = { settings: { timeFormat: '24h' } };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the stored value', () => {
    const { getByLabelText } = renderField();
    const select = getByLabelText('Time format') as HTMLSelectElement;
    expect(select.value).toBe('24h');
  });

  it('falls back to 12h when the setting is unset', () => {
    mocks.storeState.config = { settings: {} };
    const { getByLabelText } = renderField();
    const select = getByLabelText('Time format') as HTMLSelectElement;
    expect(select.value).toBe('12h');
  });

  it('persists a switch to 12h as a dropped field', async () => {
    const { getByLabelText } = renderField();
    const select = getByLabelText('Time format') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: '12h' } });
      // Drain the chained promise sequence: updateSettings → saveConfig.
      // Two microtask flushes is enough since the handler `await`s exactly
      // one promise.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.updateSettings).toHaveBeenCalledWith({ timeFormat: undefined });
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    // Time format affects only client-rendered content, so unlike a locale
    // change this must not refresh the server-rendered tree.
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('persists a switch to 24h as an explicit override', async () => {
    mocks.storeState.config = { settings: {} };
    const { getByLabelText } = renderField();
    const select = getByLabelText('Time format') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: '24h' } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.updateSettings).toHaveBeenCalledWith({ timeFormat: '24h' });
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
