// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TargetPicker } from '../TargetPicker';

afterEach(cleanup);

const displays = [
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'hallway', name: 'Hallway' },
];

describe('TargetPicker (chips mode)', () => {
  it('renders an "All" chip plus one per display', () => {
    render(<TargetPicker mode="chips" value="all" onChange={() => {}} options={displays} />);
    expect(screen.getByRole('button', { name: /^all$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kitchen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hallway' })).toBeTruthy();
  });

  it('highlights the currently-selected chip', () => {
    render(<TargetPicker mode="chips" value="kitchen" onChange={() => {}} options={displays} />);
    const kitchen = screen.getByRole('button', { name: 'Kitchen' });
    expect(kitchen.getAttribute('aria-pressed')).toBe('true');
  });

  it('fires onChange with the chip id when tapped', () => {
    const onChange = vi.fn();
    render(<TargetPicker mode="chips" value="all" onChange={onChange} options={displays} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hallway' }));
    expect(onChange).toHaveBeenCalledWith('hallway');
  });
});

describe('TargetPicker (dropdown mode)', () => {
  it('renders a pill showing the current selection name', () => {
    render(<TargetPicker mode="dropdown" value="kitchen" onChange={() => {}} options={displays} />);
    expect(screen.getByRole('button', { name: /kitchen/i })).toBeTruthy();
  });

  it('opens the menu on pill tap and lists options', () => {
    render(<TargetPicker mode="dropdown" value="all" onChange={() => {}} options={displays} />);
    fireEvent.click(screen.getByRole('button', { name: /all/i }));
    expect(screen.getByRole('menuitem', { name: 'Kitchen' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Hallway' })).toBeTruthy();
  });

  it('fires onChange and closes the menu when a menu item is chosen', () => {
    const onChange = vi.fn();
    render(<TargetPicker mode="dropdown" value="all" onChange={onChange} options={displays} />);
    fireEvent.click(screen.getByRole('button', { name: /all/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hallway' }));
    expect(onChange).toHaveBeenCalledWith('hallway');
    expect(screen.queryByRole('menuitem', { name: 'Hallway' })).toBeNull();
  });
});
