// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import type { ModuleInstance, ScreenConfiguration, VisibilityCondition } from '@/types/config';

// No display has ever reported.
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: async () => new Response('null', { status: 404 }),
  isSessionExpired: () => false,
  throwIfNotOk: () => {},
}));

import VisibilityConditionsSection from '../VisibilityConditionsSection';

function renderSection(conditions: VisibilityCondition[]) {
  const mod = { id: 'm', type: 'text', config: {}, visibility: { conditions } } as unknown as ModuleInstance;
  return render(
    <I18nProvider locale="en-US" blob={{ core, editor }}>
      <VisibilityConditionsSection mod={mod} screenId="s" />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 8:00 AM in Chicago.
  vi.setSystemTime(new Date('2026-09-24T13:00:00Z'));
  useEditorStore.setState({
    config: { screens: [], settings: { timezone: 'America/Chicago' } } as unknown as ScreenConfiguration,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useEditorStore.setState({ config: null });
});

describe('visibility conditions that only read the clock', () => {
  const morning: VisibilityCondition = { kind: 'time', startTime: '07:00', endTime: '09:00' };

  it("judge themselves on the household's clock with no display reporting", () => {
    renderSection([morning]);
    expect(screen.getByText(editor.visibilityConditions.outcome.shownNowEditor)).toBeTruthy();
    expect(screen.queryByText(editor.visibilityConditions.outcome.noLiveData)).toBeNull();
  });

  it('do not offer "Before data arrives", which only matters for a live value', () => {
    renderSection([morning]);
    expect(screen.queryByText(editor.visibilityConditions.whenUnknownTitle)).toBeNull();
  });

  it('still offer it, and still wait, once a condition reads a live value', () => {
    renderSection([morning, { kind: 'state', sourceKey: 'door', equals: 'open' }]);
    expect(screen.getByText(editor.visibilityConditions.whenUnknownTitle)).toBeTruthy();
    expect(screen.getByText(editor.visibilityConditions.outcome.noLiveData)).toBeTruthy();
  });
});
