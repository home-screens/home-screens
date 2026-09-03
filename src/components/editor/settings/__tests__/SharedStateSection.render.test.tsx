// @vitest-environment jsdom

/**
 * Render test for the "Available" tab's warning/empty branches that the E2E
 * suite can't reach cheaply: the truncation banner only trips when a
 * producer's search returns BROWSE_SEARCH_LIMIT (5000) raw hits, far past
 * what a fixture plugin reasonably emits over HTTP. The search hook is
 * mocked, so the full result-set path (merge → group → preview) runs against
 * a cap-sized array while everything renders through the real component and
 * real en-US strings.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import type { SearchedStateKey } from '@/lib/state-key-search';

const mocks = vi.hoisted(() => ({
  // Stable store object — Zustand selectors run on every render, and a fresh
  // object each time would defeat React's reference-equality bailout.
  editorState: {
    config: { screens: [], settings: {} },
    selectedDisplayId: null,
    setSelectedDisplay: () => {},
  } as Record<string, unknown>,
  searchResult: {
    results: [] as unknown[],
    searching: false,
    searchable: true,
  },
}));

vi.mock('@/stores/editor-store', () => ({
  useEditorStore: (sel: (s: unknown) => unknown) => sel(mocks.editorState),
  getActiveScreens: () => [],
  getActiveRules: () => [],
}));

vi.mock('@/hooks/useEditorSharedState', () => ({
  useEditorSharedState: () => ({ entries: {}, providerHealth: {}, source: null, reportedAt: null }),
}));

vi.mock('@/hooks/useStateKeySearch', () => ({
  useStateKeySearch: () => mocks.searchResult,
}));

// Import after mocks are registered so the module sees the mocked deps.
import SharedStateSection from '../SharedStateSection';
import { BROWSE_SEARCH_LIMIT } from '@/lib/state-key-search';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

const descriptor = (i: number): SearchedStateKey => ({
  key: `plugin:bulk:sensor_${i}`,
  label: `Sensor ${i}`,
  valueType: 'string',
  pluginName: 'Bulk Plugin',
});

function renderAvailableTab() {
  const utils = render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <SharedStateSection />
    </I18nProvider>,
  );
  fireEvent.click(utils.getByTestId('shared-state-tab-available'));
  return utils;
}

afterEach(() => {
  cleanup();
});

describe('AvailableTab warning branches', () => {
  it('renders the truncation banner when a producer hits the request cap, still previewing only the first rows', () => {
    mocks.searchResult = {
      results: Array.from({ length: BROWSE_SEARCH_LIMIT }, (_, i) => descriptor(i)),
      searching: false,
      searchable: true,
    };
    const { getByText, getByTestId, container } = renderAvailableTab();

    // The cap-hit warning with the interpolated limit, and the preview cap
    // holding despite the huge result set (plus its show-more toggle).
    expect(getByText(/Search to find more/)).toBeTruthy();
    expect(container.querySelectorAll('[data-available-key]')).toHaveLength(10);
    expect(getByTestId('shared-state-available-run-toggle')).toBeTruthy();
  });

  it('does not render the banner below the cap, and the summary singularizes one value', () => {
    mocks.searchResult = { results: [descriptor(0)], searching: false, searchable: true };
    const { queryByText, getByTestId } = renderAvailableTab();

    expect(queryByText(/Search to find more/)).toBeNull();
    expect(getByTestId('shared-state-available-summary').textContent).toBe(
      '1 value available from your add-ons',
    );
  });

  it('explains when no add-on can provide values (no static keys, no search-capable plugin)', () => {
    mocks.searchResult = { results: [], searching: false, searchable: false };
    const { getByText } = renderAvailableTab();

    expect(getByText(/Nothing is available to share yet/)).toBeTruthy();
  });
});
