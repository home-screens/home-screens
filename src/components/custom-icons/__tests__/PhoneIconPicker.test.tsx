// @vitest-environment jsdom

/**
 * The phone's one icon chooser, on the chore, reward, person, meal and
 * routine forms. It replaced a dropdown on three forms and an always-open
 * grid on the other two, and the dropdown drew a chosen emoji twice.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import dictionary from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useCustomIcons', () => ({
  useCustomIcons: () => ({ icons: [], byId: new Map(), loaded: true }),
  refreshCustomIcons: vi.fn(),
}));

import PhoneIconPicker from '../PhoneIconPicker';

function show(children: ReactNode) {
  return render(<I18nProvider locale="en-US" blob={{ core: dictionary, modules }}>{children}</I18nProvider>);
}

afterEach(cleanup);

describe('PhoneIconPicker', () => {
  it('shows a plain emoji once, with no name beside it', () => {
    show(<PhoneIconPicker value="🍽️" onChange={() => {}} choices={{ kind: 'icons', names: ['broom'] }} label="Icon" />);
    const row = screen.getByRole('button', { name: 'Icon: 🍽️' });
    expect(row.textContent?.match(/🍽️/g) ?? []).toHaveLength(1);
  });

  it('names a built-in icon, and opens the grid that picks and closes', () => {
    const onChange = vi.fn();
    show(<PhoneIconPicker value="lucide:crown" onChange={onChange} choices={{ kind: 'icons', names: ['crown', 'cat'] }} label="Icon" />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon: Royal' }));
    expect(screen.getByTestId('custom-icon-section')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Royal', pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cat' }));
    expect(onChange).toHaveBeenCalledWith('lucide:cat');
    expect(screen.queryByTestId('custom-icon-section')).toBeNull();
  });

  it('offers everyday emoji the same way, the chosen one first when it is not on the list', () => {
    const onChange = vi.fn();
    show(<PhoneIconPicker value="🦄" onChange={onChange} choices={{ kind: 'emoji', emoji: ['🍕', '🌮'] }} label="Icon" />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon: 🦄' }));
    const tiles = screen.getAllByRole('button', { pressed: true });
    expect(tiles.map((b) => b.textContent)).toContain('🦄');
    fireEvent.click(screen.getByRole('button', { name: '🌮' }));
    expect(onChange).toHaveBeenCalledWith('🌮');
  });

  it('says None when nothing is picked', () => {
    show(<PhoneIconPicker value="" onChange={() => {}} choices={{ kind: 'icons', names: ['cat'] }} label="Icon" />);
    expect(screen.getByRole('button', { name: 'Icon: None' })).toBeTruthy();
  });
});
