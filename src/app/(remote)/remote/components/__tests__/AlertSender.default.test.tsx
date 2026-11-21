// @vitest-environment jsdom

/**
 * The Send alert sheet starts on the household's default length for the type
 * picked, and sends exactly the chip that is lit. It used to start on 10
 * seconds whatever the type and whatever the household had set, so an urgent
 * alert from the phone left after ten seconds.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));
vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('@/lib/editor-fetch', () => ({ editorFetch: (...args: unknown[]) => mocks.editorFetch(...args), isSessionExpired: () => false }));

import AlertSender from '../AlertSender';

const lit = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const show = (defaultDurationMs: number) => render(
  <AlertSender open onClose={() => {}} targetName={null} activeAlerts={0} defaultDurationMs={defaultDurationMs} onSent={() => {}} />,
);
async function send(): Promise<Record<string, unknown>> {
  fireEvent.change(screen.getByLabelText('alertSender.messageLabel'), { target: { value: 'Dinner' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'alertSender.sendButton' })); });
  const [url, init] = mocks.editorFetch.mock.calls.at(-1) as [string, RequestInit];
  expect(url).toBe('/api/display/alert');
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('AlertSender and the default length', () => {
  beforeEach(() => { mocks.editorFetch.mockReset().mockResolvedValue(new Response('{}', { status: 200 })); });
  afterEach(cleanup);

  it('follows the type while the household default is "each type its own"', () => {
    show(0);
    expect(lit()).toEqual(['alertSender.duration10s']);
    fireEvent.click(screen.getByRole('button', { name: 'alertSender.typeWarning' }));
    expect(lit()).toEqual(['alertSender.duration30s']);
    fireEvent.click(screen.getByRole('button', { name: 'alertSender.typeUrgent' }));
    expect(lit()).toEqual(['alertSender.durationPersistent']);
  });

  it('sends an urgent alert that stays up, as a real 0', async () => {
    show(0);
    fireEvent.click(screen.getByRole('button', { name: 'alertSender.typeUrgent' }));
    expect(await send()).toEqual({ type: 'urgent', message: 'Dinner', duration: 0 });
  });

  it('starts on the household default, whatever the type', async () => {
    show(60_000);
    fireEvent.click(screen.getByRole('button', { name: 'alertSender.typeUrgent' }));
    expect(lit()).toEqual(['alertSender.duration1Min']);
    expect((await send()).duration).toBe(60_000);
  });

  it('lights and sends the closest chip for a default the chips do not hold', async () => {
    show(45_000);
    expect(lit()).toEqual(['alertSender.duration1Min']);
    expect((await send()).duration).toBe(60_000);
  });

  it('keeps a chip picked by hand when the type changes', async () => {
    show(0);
    fireEvent.click(screen.getByRole('button', { name: 'alertSender.duration5Min' }));
    fireEvent.click(screen.getByRole('button', { name: 'alertSender.typeUrgent' }));
    expect(lit()).toEqual(['alertSender.duration5Min']);
    expect((await send()).duration).toBe(300_000);
  });
});
