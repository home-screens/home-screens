// @vitest-environment jsdom

/**
 * `<PluginGlobals>` and `<PluginGlobalsEditor>` install into one shared
 * `window.__HS_SDK__` object. The base installer used to rebuild that object
 * whenever the locale changed, which silently deleted every editor-only member
 * the editor installer had bolted on with `[]` deps.
 *
 * Changing the language in settings calls `router.refresh()` on purpose (so the
 * editor doesn't remount), which is exactly the trigger. The next plugin
 * ConfigSection to render then got `undefined` for `AccordionSection`, rendered
 * it as a component, and React threw.
 *
 * These tests pin the two invariants that prevent it: the SDK object survives a
 * locale change with its editor members intact, and locale-dependent members
 * still return values for the *new* locale afterwards (the reason the rebuild
 * existed in the first place).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import PluginGlobals from '@/components/PluginGlobals';
import PluginGlobalsEditor from '@/components/PluginGlobalsEditor';

const EDITOR_ONLY = ['AccordionSection', 'useModuleConfig'] as const;

function sdk() {
  const s = window.__HS_SDK__;
  if (!s) throw new Error('__HS_SDK__ was not installed by PluginGlobals');
  return s;
}

function Harness({ locale }: { locale: string }) {
  return (
    <I18nProvider locale={locale} blob={{}}>
      <PluginGlobals />
      <PluginGlobalsEditor />
    </I18nProvider>
  );
}

describe('__HS_SDK__ across a locale change', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ core: {} }), { status: 200 }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.__HS_SDK__;
  });

  it('keeps editor-only members installed when the locale changes', async () => {
    const { rerender } = render(<Harness locale="en-US" />);
    await act(async () => {});

    for (const member of EDITOR_ONLY) {
      expect(sdk()[member], `${member} missing before the locale change`).toBeDefined();
    }

    await act(async () => { rerender(<Harness locale="de-DE" />); });

    // Before the fix all of these were undefined, and rendering one as a
    // component took the entire editor tree down.
    for (const member of EDITOR_ONLY) {
      expect(sdk()[member], `${member} was wiped by the locale change`).toBeDefined();
    }
  });

  it('keeps the real editor implementations, not the display stubs', async () => {
    const { rerender } = render(<Harness locale="en-US" />);
    await act(async () => {});

    const editorStartAuth = sdk().startAuth;
    await act(async () => { rerender(<Harness locale="de-DE" />); });

    // startAuth/setPluginSettings are always present (the display installs
    // no-op stubs), so identity is what distinguishes "still the editor's real
    // one" from "silently reverted to a stub that does nothing".
    expect(sdk().startAuth).toBe(editorStartAuth);
  });

  it('still reports the new locale after the change', async () => {
    const { rerender } = render(<Harness locale="en-US" />);
    await act(async () => {});
    expect(sdk().locale).toBe('en-US');

    await act(async () => { rerender(<Harness locale="de-DE" />); });

    // The object is no longer rebuilt, so the locale-dependent surface has to
    // stay live some other way (refs + an explicit push for this data property).
    expect(sdk().locale).toBe('de-DE');
  });

  it('formats numbers with the new locale after the change', async () => {
    const { rerender } = render(<Harness locale="en-US" />);
    await act(async () => {});
    expect(sdk().formatNumber(1234.5)).toBe('1,234.5');

    await act(async () => { rerender(<Harness locale="de-DE" />); });

    // Proves the closures read the ref at call time rather than having captured
    // the mount-time locale forever.
    expect(sdk().formatNumber(1234.5)).toBe('1.234,5');
  });

  it('restores display stubs rather than holes when the editor unmounts', async () => {
    const { unmount } = render(<Harness locale="en-US" />);
    await act(async () => {});

    unmount();

    // Editor-only members go away entirely; the two with display fallbacks must
    // stay callable so a plugin gets a no-op instead of a TypeError.
    for (const member of EDITOR_ONLY) {
      expect(sdk()[member]).toBeUndefined();
    }
    expect(typeof sdk().startAuth).toBe('function');
    await expect(sdk().setPluginSettings('x', {})).resolves.toEqual({
      ok: false,
      error: 'setPluginSettings is editor-only',
    });
  });
});
