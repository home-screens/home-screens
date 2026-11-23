// @vitest-environment jsdom

/**
 * The selected module's status chip, on the canvas and in the property panel,
 * is the shared status pill in a theme tone: no raw palette colours, so it
 * reads the same in both themes as every other status label.
 */

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import type { ModuleInstance, ScreenConfiguration } from '@/types/config';
import { STATUS_BADGE_CLASS } from '@/lib/module-status';
import ModuleStatusChips from '../ModuleStatusChips';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, editor }}>{children}</I18nProvider>;
}

const hiddenClock = {
  id: 'clock-1',
  type: 'clock',
  enabled: false,
  position: { x: 0, y: 0 },
  size: { w: 200, h: 100 },
  config: {},
  style: {},
} as unknown as ModuleInstance;

beforeEach(() => {
  useEditorStore.setState({
    config: { screens: [], settings: { timeFormat: '12h' } } as unknown as ScreenConfiguration,
  });
});

afterEach(() => {
  cleanup();
  useEditorStore.setState({ config: null });
});

describe('ModuleStatusChips', () => {
  it('draws a hidden module as a danger pill with a solid backing on the canvas', () => {
    render(<ModuleStatusChips mod={hiddenClock} now={new Date()} compact />, { wrapper: Wrapper });
    const pill = screen.getByText('Hidden').closest('[data-status-pill]');
    expect(pill?.getAttribute('data-status-pill')).toBe('danger');
    expect(pill?.parentElement?.className).toContain('bg-hs-panel');
  });

  it('has no backing in the property panel, where it sits on the panel itself', () => {
    render(<ModuleStatusChips mod={hiddenClock} now={new Date()} withDetail />, { wrapper: Wrapper });
    const pill = screen.getByText('Hidden').closest('[data-status-pill]');
    expect(pill?.parentElement?.className).not.toContain('bg-hs-panel');
  });

  it('keeps the canvas corner badges on theme colours', () => {
    for (const classes of Object.values(STATUS_BADGE_CLASS)) {
      expect(classes).not.toMatch(/\b(?:bg|text|border)-(?:red|amber|slate)-\d/);
    }
  });
});
