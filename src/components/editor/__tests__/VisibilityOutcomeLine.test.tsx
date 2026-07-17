// @vitest-environment jsdom

/**
 * Tests for the outcome line's neutral (no live data) branches: a display
 * that NEVER reported gets the generic line, a display that reported once
 * but went quiet names how long ago (the stale window is impractical to
 * reach in E2E, so the branch is pinned here).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { VisibilityOutcomeLine } from '../VisibilityConditionsSection';
import type { ModuleVisibility } from '@/types/config';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { TranslateFn } from '@/i18n';

// Echo translator: key alone, or `key[param=value,…]` — assertions match on
// the key so the test is locale-independent.
const t = ((key: string, params?: Record<string, string | number>) =>
  params ? `${key}[${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')}]` : key
) as TranslateFn;

const visibility: ModuleVisibility = {
  conditions: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'on' }],
};

afterEach(cleanup);

describe('VisibilityOutcomeLine (no live data)', () => {
  it('renders the generic neutral line when the display never reported', () => {
    render(<VisibilityOutcomeLine visibility={visibility} states={null} reportedAt={null} t={t} />);
    const line = screen.getByText(/visibilityConditions\.outcome\.noLiveData/);
    expect(line.getAttribute('data-visibility-outcome')).toBe('offline');
  });

  it('names how long the display has been quiet when it reported before', () => {
    render(
      <VisibilityOutcomeLine
        visibility={visibility}
        states={null}
        reportedAt={Date.now() - 5 * 60_000}
        t={t}
      />,
    );
    const line = screen.getByText(/visibilityConditions\.outcome\.offlineSince\[time=/);
    expect(line.getAttribute('data-visibility-outcome')).toBe('offline');
  });
});

describe('VisibilityOutcomeLine (source-aware live outcome)', () => {
  // door === 'on' satisfies the fixture condition, so the outcome is "shown".
  const states = new Map<string, SharedStateEntry>([
    ['plugin:ha:door', { value: 'on', updatedAt: Date.now() }],
  ]);

  it('uses the display-worded outcome when values come from a display', () => {
    render(<VisibilityOutcomeLine visibility={visibility} states={states} source="display" t={t} />);
    const line = screen.getByText('visibilityConditions.outcome.shownNow');
    expect(line.getAttribute('data-visibility-outcome')).toBe('shown');
  });

  it('uses the editor-worded outcome when values come from the editor tab', () => {
    render(<VisibilityOutcomeLine visibility={visibility} states={states} source="editor" t={t} />);
    const line = screen.getByText('visibilityConditions.outcome.shownNowEditor');
    // data-attribute is source-agnostic — E2E keys on it.
    expect(line.getAttribute('data-visibility-outcome')).toBe('shown');
  });
});
