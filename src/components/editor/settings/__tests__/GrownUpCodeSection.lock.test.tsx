// @vitest-environment jsdom

/**
 * After too many wrong codes the whole hub waits up to ten minutes. A
 * signed-in grown-up sees that wait beside the code and can end it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string, vars?: Record<string, unknown>) => (vars?.count !== undefined ? `${key}:${vars.count}` : key) }));

const calls: Array<{ url: string; method: string }> = [];
let lockedSeconds = 0;
vi.mock('@/lib/editor-fetch', () => ({
  isSessionExpired: () => false,
  editorFetch: vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    if (url === '/api/grown-up-code/unlock') {
      lockedSeconds = 0;
      return { ok: true, json: async () => ({ lockedSeconds: 0 }) };
    }
    return { ok: true, json: async () => ({ set: true, actions: ['redeem'], unlockMinutes: 5, signedIn: true, ...(lockedSeconds ? { lockedSeconds } : {}) }) };
  }),
}));

import GrownUpCodeSection from '../GrownUpCodeSection';

beforeEach(() => { calls.length = 0; });
afterEach(cleanup);

describe('GrownUpCodeSection, the hub-wide wait', () => {
  it('shows the wait in whole minutes and ends it on a press', async () => {
    lockedSeconds = 401;
    render(<GrownUpCodeSection />);
    await act(async () => {});
    expect(screen.getByTestId('grown-up-code-locked').textContent).toContain('settings.familyPage.grownUp.lockedBody:7');

    await act(async () => { fireEvent.click(screen.getByTestId('grown-up-code-clear-lock')); });
    expect(calls.at(-1)).toEqual({ url: '/api/grown-up-code/unlock', method: 'DELETE' });
    expect(screen.queryByTestId('grown-up-code-locked')).toBeNull();
  });

  it('says nothing while the hub is not waiting', async () => {
    lockedSeconds = 0;
    render(<GrownUpCodeSection />);
    await act(async () => {});
    expect(screen.queryByTestId('grown-up-code-locked')).toBeNull();
  });
});
