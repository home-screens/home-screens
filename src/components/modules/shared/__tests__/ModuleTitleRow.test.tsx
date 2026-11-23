// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ModuleTitleRow, TITLE_ROW_RIGHT_EM } from '../ModuleTitleRow';
import { TEXT_OPACITY } from '@/lib/constants';

afterEach(cleanup);

describe('ModuleTitleRow', () => {
  it('draws the title cut short rather than wrapped, and the note on the right', () => {
    render(<ModuleTitleRow title="Groceries for the long weekend away" right="3/5" />);
    const heading = screen.getByRole('heading', { name: 'Groceries for the long weekend away' });
    expect(heading.className).toContain('truncate');
    expect(heading.style.fontSize).toBe('1.125em');
    expect(heading.style.opacity).toBe(String(TEXT_OPACITY.heading));
    expect(screen.getByText('3/5').style.fontSize).toBe(`${TITLE_ROW_RIGHT_EM}em`);
  });

  it('keeps the note when the card hides its title', () => {
    render(<ModuleTitleRow right="12 tasks" />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('12 tasks')).toBeTruthy();
  });

  it('draws nothing with neither', () => {
    const { container } = render(<ModuleTitleRow />);
    expect(container.firstChild).toBeNull();
  });
});
