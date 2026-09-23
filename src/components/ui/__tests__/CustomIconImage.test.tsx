// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const catalog = vi.hoisted(() => ({ url: '/api/custom-icons/serve?h=a&mt=1' }));
vi.mock('@/hooks/useCustomIcons', () => ({
  useCustomIcons: () => ({
    loaded: true,
    byId: new Map([['abcdefghijkl', { id: 'abcdefghijkl', name: 'Taco', url: catalog.url }]]),
  }),
}));

import CustomIconImage from '../CustomIconImage';

describe('CustomIconImage', () => {
  it('shows the fallback when the picture will not load, and tries a new URL again', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = render(<CustomIconImage id="abcdefghijkl" fallback={<span>🍽️</span>} />);
    fireEvent.error(screen.getByRole('img', { name: 'Taco' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('🍽️')).toBeTruthy();

    // A refresh that hands out a new URL (a new token) gets a fresh try.
    catalog.url = '/api/custom-icons/serve?h=a&mt=2';
    rerender(<CustomIconImage id="abcdefghijkl" fallback={<span>🍽️</span>} />);
    expect(screen.getByRole('img', { name: 'Taco' }).getAttribute('src')).toBe(catalog.url);
  });

  it('falls back for an id the library does not hold', () => {
    render(<CustomIconImage id="zzzzzzzzzzzz" fallback={<span>🍽️</span>} />);
    expect(screen.getByText('🍽️')).toBeTruthy();
  });
});
