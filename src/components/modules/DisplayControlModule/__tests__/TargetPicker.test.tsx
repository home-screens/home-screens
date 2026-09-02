// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TargetPicker, displayLabel } from '../TargetPicker';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import enUSModules from '@/translations/en-US/modules.json';

afterEach(() => {
  cleanup();
  __resetLoaderForTests();
});

function wrap(children: ReactNode) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

const displays = [
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'hallway', name: 'Hallway' },
];

describe('displayLabel', () => {
  it('prefers the friendly name and falls back to the id', () => {
    expect(displayLabel({ id: 'kitchen', name: 'Kitchen' })).toBe('Kitchen');
    expect(displayLabel({ id: 'test', name: '' })).toBe('test');
    expect(displayLabel({ id: 'test', name: '   ' })).toBe('test');
  });
});

describe('TargetPicker', () => {
  it('shows "Controls" and the selected display name on the pill', () => {
    render(wrap(<TargetPicker value="kitchen" onChange={() => {}} options={displays} selfId="kitchen" />));
    expect(screen.getByText('Controls')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kitchen' })).toBeTruthy();
  });

  it('reads "This display" when the target is this display but its id is unknown (editor)', () => {
    render(wrap(<TargetPicker value={undefined} onChange={() => {}} options={displays} />));
    expect(screen.getByRole('button', { name: 'This display' })).toBeTruthy();
  });

  it('lists friendly names, marks this display, and puts All displays last', () => {
    render(wrap(<TargetPicker value="kitchen" onChange={() => {}} options={displays} selfId="kitchen" />));
    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((el) => el.textContent)).toEqual(['Kitchenthis display', 'Hallway', 'All displays']);
  });

  it('falls back to the id for a display with no name', () => {
    render(wrap(<TargetPicker value="all" onChange={() => {}} options={[{ id: 'test', name: '' }]} />));
    fireEvent.click(screen.getByRole('button', { name: 'All displays' }));
    expect(screen.getByRole('menuitem', { name: 'test' })).toBeTruthy();
  });

  it('fires onChange and closes the list when an entry is chosen', () => {
    const onChange = vi.fn();
    render(wrap(<TargetPicker value="all" onChange={onChange} options={displays} />));
    fireEvent.click(screen.getByRole('button', { name: 'All displays' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hallway' }));
    expect(onChange).toHaveBeenCalledWith('hallway');
    expect(screen.queryByRole('menuitem', { name: 'Hallway' })).toBeNull();
  });

  it('chooses "all" from the All displays entry', () => {
    const onChange = vi.fn();
    render(wrap(<TargetPicker value="kitchen" onChange={onChange} options={displays} selfId="kitchen" />));
    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'All displays' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('tells the layout when the list opens and closes', () => {
    const onOpenChange = vi.fn();
    render(wrap(<TargetPicker value="kitchen" onChange={() => {}} options={displays} onOpenChange={onOpenChange} />));
    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hallway' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
