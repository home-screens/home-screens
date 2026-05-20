// @vitest-environment jsdom

/**
 * Save-flow contract test for `<LanguageFields>`.
 *
 * Changing the language picker has to fire a precise sequence of side
 * effects so the editor surface, the loader cache, and any loaded
 * plugin dictionaries all flip to the new locale without a hard
 * reload:
 *
 *   1. `updateSettings({ locale })`            — stage the change in store
 *   2. `await saveConfig()`                    — flush to disk
 *   3. `revalidateLoaderCache(next)`           — drop loader's negative
 *                                                cache for the new tag
 *   4. `clearActiveLocaleCache()`              — drop plugin-loader's 5s
 *                                                memo of the active tag
 *   5. `reloadPluginTranslations()`            — re-fetch plugin dicts
 *   6. `router.refresh()`                      — re-run the server layout
 *                                                so `<I18nProvider locale>`
 *                                                flips
 *
 * Steps 3+4 in particular were silently absent on a prior revision —
 * leaving plugin translations stale for 5 seconds (B2) and editor
 * locale-cache regressions invisible until manual QA. This test pins
 * the wiring so neither lapses again.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────
//
// Every collaborator is mocked: the test is about the call-sequence
// contract, not about exercising the real store, real router, or real
// plugin-loader internals (those have their own tests).

// `vi.mock` factories are hoisted above `const` declarations, so any
// shared fixtures the factories close over must be created inside
// `vi.hoisted` — that's the only block Vitest hoists alongside the
// mocks.
const mocks = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  saveConfig: vi.fn(async () => {}),
  refresh: vi.fn(),
  revalidateLoaderCache: vi.fn(),
  reloadPluginTranslations: vi.fn(),
  clearActiveLocaleCache: vi.fn(),
  // Stable store object — Zustand selectors run on every render, and
  // returning a fresh object each time would trigger an infinite
  // re-render loop via React's reference-equality bailout.
  storeState: {
    config: { settings: { locale: 'en-US', formattingLocale: '' } },
  } as { config: { settings: { locale: string; formattingLocale: string } } },
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

vi.mock('@/i18n', async () => {
  // Pull through the real `useTranslate` so the component doesn't crash,
  // but stub `revalidateLoaderCache` so we can assert on its calls.
  // The component is wrapped in `<I18nProvider>` below to satisfy the
  // hook's context check.
  const actual = await vi.importActual<typeof import('@/i18n')>('@/i18n');
  return {
    ...actual,
    revalidateLoaderCache: mocks.revalidateLoaderCache,
  };
});

vi.mock('@/lib/plugin-loader', () => ({
  reloadPluginTranslations: mocks.reloadPluginTranslations,
  clearActiveLocaleCache: mocks.clearActiveLocaleCache,
}));

// Import after mocks are registered so the module sees the mocked deps.
import LanguageFields from '../LanguageFields';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

function renderField() {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <LanguageFields />
    </I18nProvider>,
  );
}

describe('LanguageFields save flow', () => {
  beforeEach(() => {
    mocks.updateSettings.mockClear();
    mocks.saveConfig.mockClear();
    mocks.refresh.mockClear();
    mocks.revalidateLoaderCache.mockClear();
    mocks.reloadPluginTranslations.mockClear();
    mocks.clearActiveLocaleCache.mockClear();
    // Reset to a clean default async impl in case a prior test stubbed it.
    mocks.saveConfig.mockImplementation(async () => {});
    mocks.storeState.config = { settings: { locale: 'en-US', formattingLocale: '' } };
  });

  afterEach(() => {
    cleanup();
  });

  it('fires every save-flow side effect on language change', async () => {
    const { getByLabelText } = renderField();

    const select = getByLabelText('Language') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'de-DE' } });
      // Drain the chained promise sequence: updateSettings → saveConfig
      // resolves → cache invalidations + plugin reload + router.refresh.
      // Two microtask flushes is enough since the handler `await`s exactly
      // one promise before the synchronous helpers fire.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.updateSettings).toHaveBeenCalledWith({ locale: 'de-DE' });
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateLoaderCache).toHaveBeenCalledWith('de-DE');
    // B2 — without this call, the plugin-loader's 5s active-locale memo
    // makes `reloadPluginTranslations` re-fetch against the *previous*
    // locale for up to 5s after the switch.
    expect(mocks.clearActiveLocaleCache).toHaveBeenCalledTimes(1);
    expect(mocks.reloadPluginTranslations).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('runs cache invalidations *after* saveConfig resolves', async () => {
    const order: string[] = [];
    mocks.saveConfig.mockImplementation(async () => {
      order.push('save');
    });
    mocks.revalidateLoaderCache.mockImplementation(() => { order.push('revalidate'); });
    mocks.clearActiveLocaleCache.mockImplementation(() => { order.push('clearActive'); });
    mocks.reloadPluginTranslations.mockImplementation(() => { order.push('reloadPlugins'); });
    mocks.refresh.mockImplementation(() => { order.push('refresh'); });

    const { getByLabelText } = renderField();
    const select = getByLabelText('Language') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'fr-FR' } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(order).toEqual([
      'save',
      'revalidate',
      'clearActive',
      'reloadPlugins',
      'refresh',
    ]);
  });

  it('does not invoke plugin-loader helpers on formatting-locale change', async () => {
    const { getByText, getByLabelText } = renderField();

    // Expand the "More options" disclosure so the formatting-locale
    // select is in the DOM.
    fireEvent.click(getByText('More options'));

    const select = getByLabelText('Formatting locale') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'fr-FR' } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.updateSettings).toHaveBeenCalledWith({ formattingLocale: 'fr-FR' });
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    // Formatting-locale changes don't affect the i18n provider tag, so
    // none of the locale-cache helpers should fire — gratuitous calls
    // would invalidate plugin dictionaries that don't need re-fetching.
    expect(mocks.revalidateLoaderCache).not.toHaveBeenCalled();
    expect(mocks.clearActiveLocaleCache).not.toHaveBeenCalled();
    expect(mocks.reloadPluginTranslations).not.toHaveBeenCalled();
  });
});
