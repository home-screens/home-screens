// @vitest-environment jsdom

/**
 * Which confirmation a version change gets.
 *
 * The update banner is honest about going backwards: when the chosen channel
 * offers a version older than the one running, it says "Switching installs the
 * older version". The confirmation behind it used to say "Upgrade" three times
 * regardless, and never mentioned that settings saved by the newer build may
 * not work in the older one. The version-history rows lower down the page had
 * the right copy all along, so both paths now ask the same helper which
 * dialog to show.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(async (_options: { title: string; message: string; confirmLabel: string }) => true),
  editorFetch: vi.fn(),
  version: {
    current: '1.13.0-beta.1',
    latest: '1.12.2',
    isDowngrade: true,
    updateAvailable: true,
    tags: [],
  } as Record<string, unknown>,
  storeState: {
    config: { settings: { updateChannel: 'stable', advancedMode: false } },
    updateSettings: vi.fn(),
    saveConfig: vi.fn(async () => {}),
  },
}));

vi.mock('@/stores/confirm-store', () => ({
  useConfirmStore: { getState: () => ({ confirm: mocks.confirm }) },
}));

vi.mock('@/stores/editor-store', () => {
  const useEditorStore = (selector?: (state: unknown) => unknown) =>
    (selector ? selector(mocks.storeState) : mocks.storeState);
  useEditorStore.getState = () => mocks.storeState;
  return { useEditorStore };
});

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
}));

import { useSystemActions } from '../useSystemActions';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      {children}
    </I18nProvider>
  );
}

async function mountActions() {
  const rendered = renderHook(
    () => useSystemActions({ onUpgrade: vi.fn(), onRollback: vi.fn() }),
    { wrapper },
  );
  // Let the version fetch land, so the direction is known before the click.
  await act(async () => { await Promise.resolve(); });
  return rendered.result;
}

/** The options the confirm dialog was opened with, as the user would read them. */
function dialog() {
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  return mocks.confirm.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValue(true);
  mocks.version.isDowngrade = true;
  mocks.editorFetch.mockImplementation(async () => ({
    ok: true,
    json: async () => mocks.version,
  }));
});

describe('confirming a version change', () => {
  it('asks about going back, not upgrading, when the offer is an older version', async () => {
    const actions = await mountActions();

    await act(async () => { await actions.current.handleUpgrade('v1.12.2'); });

    const { title, message, confirmLabel } = dialog();
    expect(title).toBe('Go back to v1.12.2?');
    expect(confirmLabel).toBe('Go back to v1.12.2');
    expect(message).toContain('Settings you changed since then may not work in v1.12.2');
    expect(`${title} ${message} ${confirmLabel}`).not.toMatch(/upgrade/i);
  });

  it('asks to update when the offer is a newer version', async () => {
    mocks.version.isDowngrade = false;
    const actions = await mountActions();

    await act(async () => { await actions.current.handleUpgrade('v1.14.0'); });

    const { title, message, confirmLabel } = dialog();
    expect(title).toBe('Update to v1.14.0?');
    expect(confirmLabel).toBe('Update');
    expect(message).not.toMatch(/upgrade|server/i);
  });

  it('gives a version-history row the same going-back copy', async () => {
    const actions = await mountActions();

    await act(async () => { await actions.current.handleRollback('v1.11.0'); });

    const { title, message, confirmLabel } = dialog();
    expect(title).toBe('Go back to v1.11.0?');
    expect(confirmLabel).toBe('Go back to v1.11.0');
    expect(message).toContain('Settings you changed since then may not work in v1.11.0');
  });
});
