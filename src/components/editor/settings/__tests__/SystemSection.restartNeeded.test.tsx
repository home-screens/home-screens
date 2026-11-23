// @vitest-environment jsdom

/**
 * The "restart to finish the update" notice on the System page.
 *
 * Some of an update (the kiosk launcher, new packages the wall runs) only
 * takes effect once the device restarts, and nothing used to say so: the
 * power-off setting did nothing for a household until they happened to
 * reboot. The notice offers the page's own restart, through the same confirm
 * dialog, and shows how the request went where the button was pressed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(async (_options: { title: string; message: string; confirmLabel: string }) => true),
  editorFetch: vi.fn(),
  power: [] as Array<() => Response>,
  version: {} as Record<string, unknown>,
  storeState: {
    config: { settings: { updateChannel: 'stable', advancedMode: false, timezone: 'UTC' } },
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
  isSessionExpired: () => false,
}));

import SystemSection from '../SystemSection';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

const copy = enUSEditor.settings.systemPage;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function versionPayload(restartNeeded: unknown) {
  return {
    current: '1.14.0',
    currentCommit: 'abc1234',
    currentChannel: 'stable',
    latest: '1.14.0',
    latestCommit: 'abc1234',
    updateAvailable: false,
    isDowngrade: false,
    installedVia: 'tarball',
    branch: 'main',
    tags: [],
    upgradeRunning: false,
    lastFailedUpdate: null,
    restartNeeded,
    localSchema: 13,
    autoUpdate: { enabled: false, lastRun: null, nextRunAt: null },
  };
}

const OWED = { reasons: ['session-packages', 'launcher'], tag: 'v1.14.0', at: '2026-09-27T12:00:00Z' };

async function renderPage() {
  render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <SystemSection onUpgrade={vi.fn()} onRollback={vi.fn()} />
    </I18nProvider>,
  );
  await act(async () => { await Promise.resolve(); });
}

function powerCalls() {
  return mocks.editorFetch.mock.calls.filter(([url]) => url === '/api/system/power');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValue(true);
  mocks.power = [];
  mocks.version = versionPayload(OWED);
  mocks.editorFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/system/version')) return json(mocks.version);
    if (url.startsWith('/api/system/changelog')) return json({ releases: [] });
    if (url === '/api/system/power') {
      const next = mocks.power.shift();
      return next ? next() : json({ ok: true });
    }
    if (url === '/api/system/sudo-grant') return json({ ok: true });
    return json({});
  });
});

afterEach(() => {
  cleanup();
});

describe('restart-to-finish notice', () => {
  it('is absent when no restart is owed', async () => {
    mocks.version = versionPayload(null);
    await renderPage();
    expect(screen.queryByTestId('system-restart-needed')).toBeNull();
  });

  it('says a restart finishes the update and offers it', async () => {
    await renderPage();
    const notice = screen.getByTestId('system-restart-needed');
    expect(notice.textContent).toContain(copy.restartNeeded.title);
    expect(notice.textContent).toContain(copy.restartNeeded.line);
    expect(within(notice).getByRole('button', { name: copy.restartNeeded.button })).toBeTruthy();
  });

  it('restarts through the page\'s own confirm and shows the outcome in the notice', async () => {
    await renderPage();
    const notice = screen.getByTestId('system-restart-needed');

    await act(async () => {
      fireEvent.click(within(notice).getByRole('button', { name: copy.restartNeeded.button }));
    });

    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirm.mock.calls[0][0]).toMatchObject({
      title: copy.powerDialog.rebootTitle,
      confirmLabel: copy.powerDialog.rebootConfirm,
    });
    expect(powerCalls()).toHaveLength(1);
    expect(JSON.parse(powerCalls()[0][1].body)).toEqual({ action: 'reboot' });
    expect(within(notice).getByRole('status').textContent).toBe(copy.powerStatus.rebootScheduled);
    // Shown once, where the button was pressed, not again under the page's
    // own restart buttons.
    expect(screen.getAllByText(copy.powerStatus.rebootScheduled)).toHaveLength(1);
    expect((within(notice).getByRole('button', { name: copy.restartNeeded.button }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does nothing when the confirm is declined', async () => {
    mocks.confirm.mockResolvedValue(false);
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.restartNeeded.button }));
    });

    expect(powerCalls()).toHaveLength(0);
  });

  it('asks for the device password when the device needs it, then restarts without asking twice', async () => {
    mocks.power = [() => json({ ok: false, error: 'needs password', needsSudoPassword: true }, 409)];
    await renderPage();
    const notice = screen.getByTestId('system-restart-needed');

    await act(async () => {
      fireEvent.click(within(notice).getByRole('button', { name: copy.restartNeeded.button }));
    });
    const prompt = within(notice).getByTestId('sudo-password-prompt');
    expect(screen.queryByText('needs password')).toBeNull();

    fireEvent.change(within(prompt).getByLabelText(enUSEditor.sudoPrompt.passwordLabel), { target: { value: 'screens' } });
    await act(async () => {
      fireEvent.submit(prompt);
    });

    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(powerCalls()).toHaveLength(2);
    expect(within(notice).queryByTestId('sudo-password-prompt')).toBeNull();
    expect(within(notice).getByRole('status').textContent).toBe(copy.powerStatus.rebootScheduled);
  });

  it('lets a failed restart be tried again', async () => {
    mocks.power = [() => json({ ok: false, error: 'Power action failed' }, 500)];
    await renderPage();
    const notice = screen.getByTestId('system-restart-needed');
    const button = within(notice).getByRole('button', { name: copy.restartNeeded.button }) as HTMLButtonElement;

    await act(async () => { fireEvent.click(button); });
    // The hub's English is for its log; the notice says the editor's own words.
    expect(within(notice).getByRole('alert').textContent).not.toContain('Power action failed');
    expect(button.disabled).toBe(false);

    await act(async () => { fireEvent.click(button); });
    expect(powerCalls()).toHaveLength(2);
    expect(within(notice).getByRole('status').textContent).toBe(copy.powerStatus.rebootScheduled);
  });

  it('gives the page\'s own restart buttons the password prompt too', async () => {
    mocks.version = versionPayload(null);
    mocks.power = [() => json({ ok: false, error: 'needs password', needsSudoPassword: true }, 409)];
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.actions.rebootSystem }));
    });

    expect(screen.getByTestId('sudo-password-prompt')).toBeTruthy();
    expect(screen.queryByText('needs password')).toBeNull();
  });
});
