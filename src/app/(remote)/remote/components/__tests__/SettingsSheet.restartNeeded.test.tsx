// @vitest-environment jsdom

/**
 * The phone's Settings sheet says when an update still needs the device to
 * restart, because the parents who manage the family from the phone may never
 * open the editor. Its button asks through the same confirm as Restart everything.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeLocalStorage } from '@/test-utils';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  editorFetch: vi.fn(),
  stats: {} as Record<string, unknown>,
}));

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
  isSessionExpired: () => false,
}));

vi.mock('@/hooks/useCustomIcons', () => ({
  useCustomIcons: () => ({ icons: [], loaded: true }),
  refreshCustomIcons: vi.fn(async () => {}),
}));

import SettingsSheet from '../SettingsSheet';
import { I18nProvider } from '@/i18n/provider';
import enUSRemote from '@/translations/en-US/remote.json';
import enUSCore from '@/translations/en-US/core.json';

const copy = enUSRemote.settingsSheet.power;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function statsPayload(restartNeeded: unknown) {
  return {
    disk: { total: 32e9, used: 8e9, free: 24e9, dataDir: { config: 1, backups: 1, backgrounds: 1, total: 3 } },
    os: { hostname: 'home-screens', platform: 'linux', arch: 'arm64', uptime: 3600, nodeVersion: 'v24.0.0', timeZoneData: '2026e' },
    memory: { total: 4e9, free: 2e9, used: 2e9 },
    app: { screens: 2, modules: 6, moduleTypes: {}, profiles: 0, configuredSecrets: [], googleApps: null, configSize: 1 },
    hardware: null,
    restartNeeded,
  };
}

async function renderSheet(onPowerAction = vi.fn()) {
  render(
    <I18nProvider locale="en-US" blob={{ remote: enUSRemote, core: enUSCore }}>
      <SettingsSheet open onClose={vi.fn()} onBackup={vi.fn(async () => true)} backupBusy={false} onPowerAction={onPowerAction} />
    </I18nProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  return onPowerAction;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  mocks.stats = statsPayload({ reasons: ['launcher'], tag: 'v1.14.0', at: '2026-09-27T12:00:00Z' });
  mocks.editorFetch.mockImplementation(async (url: string) => {
    if (url === '/api/system/stats') return json(mocks.stats);
    return json({ ok: true });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Settings sheet restart notice', () => {
  it('is absent when no restart is owed', async () => {
    mocks.stats = statsPayload(null);
    await renderSheet();
    expect(screen.queryByTestId('remote-restart-needed')).toBeNull();
  });

  it('says a restart finishes the update, above the power rows', async () => {
    await renderSheet();
    const notice = await screen.findByTestId('remote-restart-needed');
    expect(notice.textContent).toContain(copy.restartNeeded.title);
    expect(notice.textContent).toContain(copy.restartNeeded.description);
    // Before the Restart everything row in reading order.
    const rebootRow = screen.getByText(copy.reboot.label);
    expect(notice.compareDocumentPosition(rebootRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('asks through the Reboot Device confirm, then reboots and hands over to the reconnecting screen', async () => {
    const onPowerAction = await renderSheet();
    const notice = await screen.findByTestId('remote-restart-needed');

    fireEvent.click(within(notice).getByRole('button', { name: copy.restartNeeded.button }));

    const dialog = screen.getByRole('dialog', { name: copy.reboot.confirmTitle });
    expect(dialog.textContent).toContain(copy.reboot.confirmBody);
    expect(mocks.editorFetch.mock.calls.some(([url]) => url === '/api/system/power')).toBe(false);

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: copy.reboot.confirmButton }));
    });

    const power = mocks.editorFetch.mock.calls.filter(([url]) => url === '/api/system/power');
    expect(power).toHaveLength(1);
    expect(JSON.parse(power[0][1].body)).toEqual({ action: 'reboot' });
    expect(onPowerAction).toHaveBeenCalledWith('reboot');
  });

  it('keeps its tap target finger-sized', async () => {
    await renderSheet();
    const notice = await screen.findByTestId('remote-restart-needed');
    const button = within(notice).getByRole('button', { name: copy.restartNeeded.button });
    expect(button.style.minHeight).toBe('48px');
  });
});

describe('SettingsSheet: the grown-up code wait', () => {
  it('shows the hub-wide wait to a signed-in phone and ends it on a press', async () => {
    mocks.editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/system/stats') return json(mocks.stats);
      if (url === '/api/grown-up-code') return json({ set: true, actions: ['redeem'], unlockMinutes: 5, signedIn: true, lockedSeconds: 125 });
      if (url === '/api/grown-up-code/unlock' && init?.method === 'DELETE') return json({ lockedSeconds: 0 });
      return json({ ok: true });
    });
    await renderSheet();
    const card = screen.getByTestId('grown-up-lock-card');
    expect(card.textContent).toContain(enUSCore.grownUp.lockedTitle);
    expect(card.textContent).toContain(enUSRemote.settingsSheet.grownUpLock.body.other.replace('{count}', '3'));

    await act(async () => { fireEvent.click(screen.getByTestId('grown-up-lock-clear')); });
    expect(mocks.editorFetch).toHaveBeenCalledWith('/api/grown-up-code/unlock', { method: 'DELETE' });
    expect(screen.queryByTestId('grown-up-lock-card')).toBeNull();
  });

  it('shows no card while nothing waits', async () => {
    await renderSheet();
    expect(screen.queryByTestId('grown-up-lock-card')).toBeNull();
  });
});

