// @vitest-environment jsdom

/**
 * Settings > Meals "Reset to defaults" asks first, and changes nothing when
 * the answer is no: it used to apply at once, with no way back for the
 * default serving times it clears.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import { useConfirmStore } from '@/stores/confirm-store';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
}));

import MealsSection from '../MealsSection';

const HOUSEHOLD = {
  enabledSlots: ['breakfast', 'snack', 'dinner'],
  weekStartDay: 'monday',
  defaultSlotTimes: { breakfast: '07:15', dinner: '18:00' },
  timeFormat: '24h',
};

const puts = () => mocks.editorFetch.mock.calls
  .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
  .map(([, init]) => JSON.parse((init as RequestInit).body as string));

beforeEach(() => {
  mocks.editorFetch.mockImplementation(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => (init?.method === 'PUT' ? JSON.parse(init.body as string) : { settings: HOUSEHOLD, mealieConnected: false }),
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useConfirmStore.setState({ open: false, resolve: null });
});

async function clickReset() {
  const view = render(
    <I18nProvider locale="en-US" blob={{ core, editor, modules }}>
      <MealsSection />
    </I18nProvider>,
  );
  fireEvent.click(await view.findByRole('button', { name: 'Reset to defaults' }));
  await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
  return view;
}

describe('Settings > Meals reset', () => {
  it('asks first, says what it does, and keeps everything on Cancel', async () => {
    await clickReset();
    const { options } = useConfirmStore.getState();
    expect(options.title).toBe('Reset meal settings?');
    expect(options.message).toContain('follows the global time format');
    expect(options.message).not.toContain('12-hour');

    await act(async () => { useConfirmStore.getState().respond(false); });
    expect(puts()).toEqual([]);
  });

  it('resets once the answer is yes', async () => {
    await clickReset();
    await act(async () => { useConfirmStore.getState().respond(true); });

    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].settings).toEqual({ enabledSlots: ['breakfast', 'lunch', 'dinner'], weekStartDay: 'sunday', defaultSlotTimes: {} });
  });
});
