// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PropertyGroup from '../PropertyGroup';

describe('PropertyGroup', () => {
  afterEach(() => cleanup());

  it('renders title and children', () => {
    render(
      <PropertyGroup title="Shape">
        <div data-testid="child">inside</div>
      </PropertyGroup>,
    );
    expect(screen.getByText('Shape')).toBeDefined();
    expect(screen.getByTestId('child').textContent).toBe('inside');
  });

  it('renders title as an h4 for accessibility', () => {
    render(<PropertyGroup title="Effects"><span /></PropertyGroup>);
    expect(screen.getByRole('heading', { name: 'Effects', level: 4 })).toBeDefined();
  });

  it('applies accent-1 underline color by default', () => {
    render(<PropertyGroup title="A"><span /></PropertyGroup>);
    const title = screen.getByText('A');
    expect(title.className).toContain('border-hs-group-accent-1');
  });

  it.each([
    [1, 'border-hs-group-accent-1'],
    [2, 'border-hs-group-accent-2'],
    [3, 'border-hs-group-accent-3'],
    [4, 'border-hs-group-accent-4'],
  ] as const)('applies accent-%s class when accent=%s', (accent, cls) => {
    render(<PropertyGroup title="T" accent={accent}><span /></PropertyGroup>);
    expect(screen.getByText('T').className).toContain(cls);
  });
});
