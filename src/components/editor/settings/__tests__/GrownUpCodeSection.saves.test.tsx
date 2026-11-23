// @vitest-environment jsdom

/**
 * The jobs list is saved whole, built from what the last answer left. A second
 * tick made while the first save is still out would be built from the list
 * before it and undo it, so the section sends one save at a time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GrownUpStatus } from '@/lib/grown-up-code';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));

// A stand-in hub with the route's own rule (a sent list replaces the saved
// one), whose answers wait until the test lets them go.
let hub: GrownUpStatus;
const puts: Array<Record<string, unknown>> = [];
let release: Array<() => void> = [];

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Partial<GrownUpStatus>;
      puts.push(body);
      await new Promise<void>((resolve) => release.push(resolve));
      hub = { ...hub, ...body };
    }
    const answer = hub;
    return { ok: true, json: async () => answer };
  }),
}));

import GrownUpCodeSection from '../GrownUpCodeSection';

const job = (action: string) => screen.getByTestId(`grown-up-job-${action}`) as HTMLInputElement;
const minutes = () => screen.getByTestId('grown-up-unlock-minutes') as HTMLSelectElement;

async function answerNext() {
  await act(async () => {
    release.shift()!();
    await Promise.resolve();
  });
}

beforeEach(() => {
  hub = { set: true, actions: ['redeem'], unlockMinutes: 5 };
  puts.length = 0;
  release = [];
});
afterEach(cleanup);

describe('GrownUpCodeSection saves', () => {
  it('keeps the first tick when a second one is made before its save comes back', async () => {
    render(<GrownUpCodeSection />);
    await act(async () => {});

    fireEvent.click(job('untick'));
    // The first save is out: nothing else can be changed until it answers.
    expect(job('todoist-close').disabled).toBe(true);
    expect(minutes().disabled).toBe(true);
    fireEvent.click(job('todoist-close'));
    fireEvent.change(minutes(), { target: { value: '15' } });
    expect(puts).toEqual([{ actions: ['redeem', 'untick'] }]);

    await answerNext();
    expect(job('untick').checked).toBe(true);
    expect(job('todoist-close').disabled).toBe(false);
    expect(minutes().disabled).toBe(false);

    fireEvent.click(job('todoist-close'));
    await answerNext();
    expect(puts[1]).toEqual({ actions: ['redeem', 'untick', 'todoist-close'] });
    expect(hub.actions).toEqual(['redeem', 'untick', 'todoist-close']);
    expect(job('untick').checked).toBe(true);
    expect(job('todoist-close').checked).toBe(true);
  });

  it('lets the controls go again after a save that failed', async () => {
    const { editorFetch } = await import('@/lib/editor-fetch');
    render(<GrownUpCodeSection />);
    await act(async () => {});

    vi.mocked(editorFetch).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.click(job('untick')); });
    expect(screen.getByRole('alert').textContent).toBe('refusals.saveFailed');
    expect(job('untick').disabled).toBe(false);
    expect(job('untick').checked).toBe(false);
  });
});
