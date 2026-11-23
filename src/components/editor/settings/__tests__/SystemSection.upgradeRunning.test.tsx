// @vitest-environment jsdom

/**
 * The System page while an update is running.
 *
 * The hub turns down a second update while one runs, so the buttons that
 * would start one (the update banner's, and each "go back to" row) are off
 * for as long as the page knows an update is under way.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  editorFetch: vi.fn(),
  version: {} as Record<string, unknown>,
  storeState: {
    config: { settings: { updateChannel: 'stable', advancedMode: false, timezone: 'UTC' } },
    updateSettings: vi.fn(),
    saveConfig: vi.fn(async () => {}),
  },
}));

vi.mock('@/stores/confirm-store', () => ({
  useConfirmStore: { getState: () => ({ confirm: vi.fn(async () => true) }) },
}));

vi.mock('@/stores/editor-store', () => {
  const useEditorStore = (selector?: (state: unknown) => unknown) =>
    (selector ? selector(mocks.storeState) : mocks.storeState);
  useEditorStore.getState = () => mocks.storeState;
  return { useEditorStore };
});

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
  isSessionExpired: () => false,
}));

import SystemSection from '../SystemSection';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

const copy = enUSEditor.settings.systemPage;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function versionPayload(upgradeRunning: boolean) {
  return {
    current: '1.14.0',
    currentCommit: 'abc1234',
    currentChannel: 'stable',
    latest: '1.15.0',
    latestCommit: 'def5678',
    updateAvailable: true,
    isDowngrade: false,
    installedVia: 'tarball',
    branch: 'main',
    tags: [
      { tag: 'v1.14.0', version: '1.14.0' },
      { tag: 'v1.13.0', version: '1.13.0' },
    ],
    upgradeRunning,
    lastFailedUpdate: null,
    restartNeeded: null,
    localSchema: 13,
    autoUpdate: { enabled: false, lastRun: null, nextRunAt: null },
  };
}

async function renderPage(upgradeRunning: boolean) {
  mocks.version = versionPayload(upgradeRunning);
  render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <SystemSection onUpgrade={vi.fn()} onRollback={vi.fn()} />
    </I18nProvider>,
  );
  await act(async () => { await Promise.resolve(); });
}

const updateButton = () =>
  within(screen.getByTestId('system-update-banner')).getByRole('button') as HTMLButtonElement;
const goBackButtons = () =>
  screen.getAllByRole('button', { name: copy.history.rollback }) as HTMLButtonElement[];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.editorFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/system/version')) return json(mocks.version);
    if (url.startsWith('/api/system/changelog')) return json({ releases: [] });
    return json({});
  });
});

afterEach(() => {
  cleanup();
});

describe('the System page while an update is running', () => {
  it('offers the update and the earlier versions when nothing is running', async () => {
    await renderPage(false);
    expect(updateButton().disabled).toBe(false);
    expect(goBackButtons().length).toBeGreaterThan(0);
    for (const button of goBackButtons()) expect(button.disabled).toBe(false);
  });

  it('turns off every button that would start another one, and leaves Stop on', async () => {
    await renderPage(true);
    expect(updateButton().disabled).toBe(true);
    expect(goBackButtons().length).toBeGreaterThan(0);
    for (const button of goBackButtons()) expect(button.disabled).toBe(true);
    const stop = screen.getByRole('button', { name: copy.upgradeInProgress.cancelButton }) as HTMLButtonElement;
    expect(stop.disabled).toBe(false);
  });
});
