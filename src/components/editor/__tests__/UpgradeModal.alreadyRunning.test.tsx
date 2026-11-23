// @vitest-environment jsdom

/**
 * Update pressed while another update is running.
 *
 * A tab left open does not know an automatic update, or one started from
 * another tab, is under way, so its Update button still works. The hub turns
 * the second one down. The window must not call that a failure and advise a
 * restart, the one harmful thing to do mid-update: it says an update is
 * already running and follows that one on the stream it already has open.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  editorFetch: vi.fn(),
}));

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
  isSessionExpired: () => false,
}));

import UpgradeModal from '../UpgradeModal';
import { UPGRADE_RUNNING_CODE } from '@/lib/upgrade-refusal';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

/** Open the window with the hub answering the start request as given. */
async function renderModal(answer: Response) {
  mocks.editorFetch.mockImplementation(async () => answer);
  render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <UpgradeModal targetTag="v1.15.0" isRollback={false} currentVersion="1.14.0" onComplete={vi.fn()} onClose={vi.fn()} />
    </I18nProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return FakeEventSource.last!;
}

const words = enUSEditor.upgradeModal;
const failedBadge = () => screen.queryByText(words.status.failed);
const inProgressBadge = () => screen.queryByText(words.status.inProgress);
const alreadyRunning = () => screen.queryByTestId('upgrade-already-running');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('EventSource', FakeEventSource);
  FakeEventSource.last = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Update pressed while another update is running', () => {
  const turnedDown = () =>
    new Response(JSON.stringify({ error: 'An upgrade is already in progress', code: UPGRADE_RUNNING_CODE }), { status: 409 });

  it('says an update is already running, not that this one failed, and never advises a restart', async () => {
    await renderModal(turnedDown());
    expect(alreadyRunning()?.textContent).toBe(words.alreadyRunning);
    expect(failedBadge()).toBeNull();
    expect(inProgressBadge()).not.toBeNull();
    expect(screen.queryByText(words.errors.startFailed)).toBeNull();
    expect(screen.queryByText(words.errors.startFailedHelp)).toBeNull();
  });

  it('keeps the stream open and follows the update that is running to its end', async () => {
    const stream = await renderModal(turnedDown());
    expect(stream.closed).toBe(false);
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'download', progress: 30, message: 'Downloading...' });
      stream.emit('output', { type: 'output', step: 'download', line: 'fetched 12 MB' });
    });
    expect(screen.getByText('fetched 12 MB')).toBeTruthy();
    expect(inProgressBadge()).not.toBeNull();
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'complete', progress: 100, message: 'Done' });
    });
    expect(screen.queryByText(words.status.complete)).not.toBeNull();
    // Finished: nothing is running any more, so the line goes.
    expect(alreadyRunning()).toBeNull();
  });

  it('still calls any other refusal a start that failed', async () => {
    const stream = await renderModal(new Response(JSON.stringify({ error: 'Invalid tag' }), { status: 400 }));
    expect(stream.closed).toBe(true);
    expect(failedBadge()).not.toBeNull();
    expect(screen.queryByText(words.errors.startFailedHelp)).not.toBeNull();
    expect(alreadyRunning()).toBeNull();
  });
});
