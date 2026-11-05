// @vitest-environment jsdom

/**
 * The update window survives a dropped stream.
 *
 * A kiosk Pi on WiFi loses a socket now and then. The install keeps running
 * on the server, which replays the current step to every new subscriber,
 * and the browser retries the stream on its own as long as it stays open.
 * So a drop mid-install is a line under the console, not a failed install:
 * the window waits for the stream to come back, takes the replayed step
 * from there, and only gives up after a long while. A replayed "idle" after
 * real steps can only come from the process the restart step started, so
 * it ends the install the way a drop during the restart step always has.
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
import { RECONNECT_GIVE_UP_MS } from '../useUpgradeStream';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

/** The server's progress stream, driven by the test, with the browser's retry loop left to the test. */
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
  /** The socket went away; the browser will retry unless close() was called. */
  drop() {
    this.onerror?.();
  }
  /** A retry succeeded; the server replays its current state right after. */
  reopen(replay: unknown) {
    this.onopen?.();
    this.emit('progress', replay);
  }
}

const onComplete = vi.fn();

async function renderModal() {
  render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <UpgradeModal targetTag="v1.15.0" isRollback={false} currentVersion="1.14.0" onComplete={onComplete} onClose={vi.fn()} />
    </I18nProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  const stream = FakeEventSource.last!;
  await act(async () => {
    stream.emit('progress', { type: 'progress', step: 'idle', progress: 0, message: 'Idle' });
    stream.emit('progress', { type: 'progress', step: 'preflight', progress: 5, message: 'Checking...' });
    stream.emit('progress', { type: 'progress', step: 'setup-system', progress: 75, message: 'Applying system configuration...' });
    stream.emit('output', { type: 'output', step: 'setup-system', line: "Updated the display's programs: chromium" });
  });
  return stream;
}

async function wait(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

const reconnectingLine = () => screen.queryByTestId('upgrade-console-reconnecting');
const quietLine = () => screen.queryByTestId('upgrade-console-quiet');
const failedBadge = () => screen.queryByText(enUSEditor.upgradeModal.status.failed);
const completeBadge = () => screen.queryByText(enUSEditor.upgradeModal.status.complete);
const inProgressBadge = () => screen.queryByText(enUSEditor.upgradeModal.status.inProgress);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', FakeEventSource);
  FakeEventSource.last = null;
  mocks.editorFetch.mockImplementation(async (url: string) => {
    if (url === '/api/system/upgrade') return new Response('{}', { status: 200 });
    return new Response(JSON.stringify({ upgradeRunning: true }), { status: 200 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a stream dropped mid-install', () => {
  it('keeps the install running and says it is reconnecting, without the quiet line', async () => {
    const stream = await renderModal();
    await act(async () => { stream.drop(); });
    expect(stream.closed).toBe(false);
    expect(inProgressBadge()).not.toBeNull();
    expect(failedBadge()).toBeNull();
    expect(reconnectingLine()?.textContent).toContain('Connection lost, reconnecting...');
    await wait(45_000);
    expect(quietLine()).toBeNull();
    expect(reconnectingLine()).not.toBeNull();
  });

  it('picks up from the replayed step once the stream is back', async () => {
    const stream = await renderModal();
    await act(async () => { stream.drop(); });
    // The browser's retries fail a few times first.
    await wait(3000);
    await act(async () => { stream.drop(); });
    await wait(3000);
    await act(async () => {
      stream.reopen({ type: 'progress', step: 'restart', progress: 92, message: 'Restarting service...', restartNeeded: true });
    });
    expect(reconnectingLine()).toBeNull();
    expect(inProgressBadge()).not.toBeNull();
    await wait(1000);
    expect(screen.getByTestId('upgrade-step-elapsed').closest('button')!.textContent)
      .toContain(enUSEditor.upgradeModal.stepLabels.restart);
    // Now the restart really drops the stream: the familiar path.
    await act(async () => { stream.drop(); });
    expect(completeBadge()).not.toBeNull();
    expect(screen.getByTestId('upgrade-restart-needed')).toBeTruthy();
    expect(stream.closed).toBe(true);
  });

  it('counts the silence again from the moment the stream is back', async () => {
    const stream = await renderModal();
    await wait(20_000);
    await act(async () => { stream.drop(); });
    await wait(20_000);
    await act(async () => {
      stream.reopen({ type: 'progress', step: 'setup-system', progress: 75, message: 'Applying system configuration...' });
    });
    await wait(29_000);
    expect(quietLine()).toBeNull();
    await wait(1000);
    expect(quietLine()?.textContent).toBe('Still working, nothing new for 30s');
  });

  it('takes a replayed idle from a fresh server as the install having finished', async () => {
    const stream = await renderModal();
    await act(async () => { stream.drop(); });
    await wait(6000);
    await act(async () => {
      stream.reopen({ type: 'progress', step: 'idle', progress: 0, message: 'Idle' });
    });
    expect(completeBadge()).not.toBeNull();
    expect(failedBadge()).toBeNull();
    expect(stream.closed).toBe(true);
  });

  it('takes a replayed error as the failure it is', async () => {
    const stream = await renderModal();
    await act(async () => { stream.drop(); });
    await wait(3000);
    await act(async () => {
      stream.reopen({ type: 'progress', step: 'error', progress: 0, message: 'setup-system failed', error: 'setup-system failed' });
    });
    expect(failedBadge()).not.toBeNull();
    // The header's message and the error panel both carry the server's words.
    expect(screen.getAllByText('setup-system failed').length).toBeGreaterThan(0);
    expect(stream.closed).toBe(true);
  });

  it('gives up after a long while and names the step it lost', async () => {
    const stream = await renderModal();
    await act(async () => { stream.drop(); });
    await wait(RECONNECT_GIVE_UP_MS - 1000);
    expect(failedBadge()).toBeNull();
    await wait(1000);
    expect(failedBadge()).not.toBeNull();
    expect(stream.closed).toBe(true);
    expect(reconnectingLine()).toBeNull();
    expect(screen.getByText('Connection lost during "Apply system configuration"')).toBeTruthy();
  });

  it('still fails at once when nothing was ever heard', async () => {
    render(
      <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
        <UpgradeModal targetTag="v1.15.0" isRollback={false} onComplete={onComplete} onClose={vi.fn()} />
      </I18nProvider>,
    );
    await act(async () => { await Promise.resolve(); });
    const stream = FakeEventSource.last!;
    await act(async () => { stream.drop(); });
    expect(failedBadge()).not.toBeNull();
    expect(stream.closed).toBe(true);
  });
});
