// @vitest-environment jsdom

/**
 * The phone's "Your meal plan lives in" asks the hub about Mealie once as the
 * meal settings open, the same check the computer's Settings > Meals makes:
 * it names the household when Mealie takes the token, and says so, in the
 * Plan tab's words, when Mealie refuses it, whichever way the plan is set.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import type { MealPlanSource } from '@/types/config';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
}));

import MealsSettingsPlanSourceSection from '../MealsSettingsPlanSourceSection';
import { I18nProvider } from '@/i18n/provider';
import remote from '@/translations/en-US/remote.json';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function answer(json: unknown, ok = true) {
  mocks.editorFetch.mockResolvedValue({ ok, json: async () => json });
}

function renderSection(planSource: MealPlanSource | undefined, savedPlanSource = planSource, mealieConnected = true) {
  return render(
    <I18nProvider locale="en-US" blob={{ remote }}>
      <MealsSettingsPlanSourceSection planSource={planSource} savedPlanSource={savedPlanSource} mealieConnected={mealieConnected} onChange={() => {}} />
    </I18nProvider>,
  );
}

const REFUSED = { ok: false, failure: 'key-rejected', version: '3.29.0', url: 'http://192.168.1.50:9925' };

describe('the phone meal settings: where the plan lives', () => {
  it('names the household Mealie answers for', async () => {
    answer({ ok: true, version: '3.29.0', household: 'Family', user: 'Sam', url: 'http://192.168.1.50:9925' });
    const view = renderSection(undefined);
    await view.findByText(/connected to the Family household/);
    expect(mocks.editorFetch).toHaveBeenCalledWith('/api/mealie/validate');
    expect(view.queryByTestId('meals-plan-source-token')).toBeNull();
  });

  it('says Mealie refuses the token, and how to fix it, on Home Screens and on Mealie', async () => {
    for (const source of [undefined, 'mealie'] as const) {
      cleanup();
      answer(REFUSED);
      const view = renderSection(source);
      const note = await view.findByTestId('meals-plan-source-token');
      expect(note.textContent).toContain("Mealie isn't letting Home Screens in");
      expect(note.textContent).toContain('Settings > API keys');
      expect(view.queryByText(/Mealie is connected/)).toBeNull();
    }
  });

  it('warns before a switch to Mealie, but a switch back home still says what Save does', async () => {
    answer(REFUSED);
    const toMealie = renderSection('mealie', undefined);
    await toMealie.findByTestId('meals-plan-source-token');
    expect(toMealie.queryByText(/After you save, meals come from Mealie/)).toBeNull();

    cleanup();
    answer(REFUSED);
    const toHome = renderSection(undefined, 'mealie');
    await toHome.findByText(/go back to the Home Screens plan/);
    expect(toHome.queryByTestId('meals-plan-source-token')).toBeNull();
  });

  it('does not ask, and says nothing about a token, when Mealie is not set up', () => {
    const view = renderSection(undefined, undefined, false);
    expect(mocks.editorFetch).not.toHaveBeenCalled();
    expect(view.getByText(/separate recipe app/)).toBeTruthy();
  });

  it('reads as plainly connected when the hub itself cannot be asked', async () => {
    mocks.editorFetch.mockRejectedValue(new Error('offline'));
    const view = renderSection(undefined);
    await act(async () => {});
    expect(mocks.editorFetch).toHaveBeenCalledWith('/api/mealie/validate');
    expect(view.getByText(/Mealie is connected\. Choose it/)).toBeTruthy();
    expect(view.queryByTestId('meals-plan-source-token')).toBeNull();
  });
});
