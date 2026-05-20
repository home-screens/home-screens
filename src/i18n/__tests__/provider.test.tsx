// @vitest-environment jsdom

/**
 * Tests for the `<I18nProvider>` provider + `useTranslate` hook.
 *
 * Focuses on the "runtime locale change" path that the original code
 * review flagged: when the active locale changes, every namespace must be
 * re-fetched under the new tag rather than short-circuiting on a
 * locale-agnostic "already requested" set.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider, useTranslate, useFormattingLocale, useLocale } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('I18nProvider', () => {
  beforeEach(() => {
    __resetLoaderForTests();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('hydrates from a server blob so the first render resolves keys', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ core: {} }), { status: 200 }),
    );

    function Sample() {
      const t = useTranslate('core');
      return <span data-testid="out">{t('hello')}</span>;
    }

    const { getByTestId } = render(
      <I18nProvider locale="en-US" blob={{ core: { hello: 'Hello' } }}>
        <Sample />
      </I18nProvider>,
    );

    // The blob is applied in the lazy initializer, so the first render
    // already resolves the key — no waiting on a fetch.
    expect(getByTestId('out').textContent).toBe('Hello');
    // Drain effects; the loader effect skips the load entirely when the
    // (locale, namespace) pair was seeded by the blob, so for the
    // configured locale (en-US) no fetch should fire.
    await act(async () => {
      await flushPromises();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refetches the namespace when the locale prop changes at runtime', async () => {
    // The route returns `{ <ns>: <dict> }`. We branch on the URL to feed
    // each locale a distinct dictionary so we can prove which one wins.
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/de-DE')) {
        return new Response(JSON.stringify({ core: { hello: 'Hallo' } }), { status: 200 });
      }
      if (url.includes('/fr-FR')) {
        return new Response(JSON.stringify({ core: { hello: 'Bonjour' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ core: { hello: 'Hello' } }), { status: 200 });
    });

    function Sample() {
      const t = useTranslate('core');
      return <span data-testid="out">{t('hello')}</span>;
    }

    function Harness({ locale }: { locale: string }) {
      return (
        <I18nProvider locale={locale}>
          <Sample />
        </I18nProvider>
      );
    }

    const { rerender, getByTestId } = render(<Harness locale="de-DE" />);

    // Initial render hasn't loaded yet → t returns the raw key.
    expect(getByTestId('out').textContent).toBe('hello');

    // Drain the loader effect for de-DE.
    await act(async () => {
      await flushPromises();
      await flushPromises();
    });
    expect(getByTestId('out').textContent).toBe('Hallo');
    const deCalls = fetchSpy.mock.calls.length;
    expect(deCalls).toBeGreaterThan(0);

    // Switch locales — a fresh fetch must go out for fr-FR even though
    // `core` was already loaded under de-DE. This is the regression the
    // (locale, namespace) keying fixes.
    rerender(<Harness locale="fr-FR" />);
    await act(async () => {
      await flushPromises();
      await flushPromises();
    });
    expect(getByTestId('out').textContent).toBe('Bonjour');

    const frCalls = fetchSpy.mock.calls
      .map((c) => (typeof c[0] === 'string' ? c[0] : (c[0] as Request).url))
      .filter((u) => u.includes('/fr-FR'));
    expect(frCalls.length).toBeGreaterThan(0);
  });

  it('useFormattingLocale returns the formattingLocale prop when set (decoupled from UI locale)', () => {
    // Captures the regression where date/number formatters silently
    // followed the UI locale even when the household configured a
    // distinct `formattingLocale`. The provider should expose them
    // as separate values.
    const captured = { locale: '', formattingLocale: '' };
    function Probe() {
      captured.locale = useLocale();
      captured.formattingLocale = useFormattingLocale();
      return null;
    }

    render(
      <I18nProvider locale="en-US" formattingLocale="de-DE">
        <Probe />
      </I18nProvider>,
    );

    expect(captured.locale).toBe('en-US');
    expect(captured.formattingLocale).toBe('de-DE');
  });

  it('useFormattingLocale falls back to locale when formattingLocale is unset', () => {
    // The cascade: `formattingLocale ?? locale ?? DEFAULT_LOCALE`.
    // When the household never set formattingLocale, both hooks return
    // the same UI tag — proving the cascade and not a stale default.
    let observed = '';
    function Probe() {
      observed = useFormattingLocale();
      return null;
    }

    render(
      <I18nProvider locale="fr-FR">
        <Probe />
      </I18nProvider>,
    );

    expect(observed).toBe('fr-FR');
  });

  it('eagerly loads namespaces listed in the `namespaces` prop', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ modules: { weather: { sunny: 'Sunny' } } }), { status: 200 }),
    );

    function Empty() {
      // Doesn't call useTranslate — proves the preload path triggers
      // on its own.
      return null;
    }

    render(
      <I18nProvider locale="en-US" namespaces={['modules']}>
        <Empty />
      </I18nProvider>,
    );

    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    const calls = fetchSpy.mock.calls.map((c) =>
      typeof c[0] === 'string' ? c[0] : (c[0] as Request).url,
    );
    expect(calls.some((u) => u.includes('ns=modules'))).toBe(true);
  });
});
