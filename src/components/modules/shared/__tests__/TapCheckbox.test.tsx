// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TapCheckbox } from '../TapCheckbox';

afterEach(cleanup);

const boxOf = (container: HTMLElement) => container.querySelector('[data-testid="tap-checkbox"]') as HTMLElement;

describe('TapCheckbox', () => {
  it('tints its pressed fill and ring with the accent, for a hex accent', () => {
    const { container } = render(<TapCheckbox checked={false} pressed color="#3b82f6" />);
    const box = boxOf(container);
    expect(box.style.backgroundColor).toBe('rgba(59, 130, 246, 0.25)');
    expect(box.style.boxShadow).toContain('rgba(59, 130, 246, 0.22)');
  });

  it('tints the same way for an accent typed as rgb(), instead of a white halo', () => {
    const { container } = render(<TapCheckbox checked={false} pressed color="rgb(255, 0, 0)" />);
    const box = boxOf(container);
    expect(box.style.backgroundColor).toBe('rgba(255, 0, 0, 0.25)');
    expect(box.style.boxShadow).toContain('rgba(255, 0, 0, 0.22)');
  });

  it('fills with the accent itself when checked', () => {
    const { container } = render(<TapCheckbox checked color="rgb(255, 0, 0)" />);
    expect(boxOf(container).style.backgroundColor).toBe('rgb(255, 0, 0)');
  });
});
