// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FieldHint, { FieldSurfaceProvider } from '../FieldHint';
import LabeledField from '../LabeledField';
import Slider from '../Slider';
import Toggle from '../Toggle';

afterEach(cleanup);

describe('FieldHint', () => {
  it('takes the property panel size by default and the page size inside a page surface', () => {
    const { rerender } = render(<FieldHint>Shown on every screen.</FieldHint>);
    expect(screen.getByText('Shown on every screen.').className).toContain('text-[11px]');

    rerender(
      <FieldSurfaceProvider surface="page">
        <FieldHint className="mt-1">Shown on every screen.</FieldHint>
      </FieldSurfaceProvider>,
    );
    const hint = screen.getByText('Shown on every screen.');
    expect(hint.className).toContain('text-xs');
    expect(hint.className).not.toContain('text-[11px]');
    expect(hint.className).toContain('mt-1');
    expect(hint.className).toContain('text-hs-text-faint');
  });

  it('reads at the prose tier on a prose surface', () => {
    render(
      <FieldSurfaceProvider surface="prose">
        <FieldHint>Pick a subject, then drag across the week.</FieldHint>
      </FieldSurfaceProvider>,
    );
    expect(screen.getByText('Pick a subject, then drag across the week.').className).toContain('text-[13px]');
  });

  it('turns amber in its warning tone and keeps its size', () => {
    render(<FieldHint tone="warning">Nobody is in this group yet.</FieldHint>);
    const hint = screen.getByText('Nobody is in this group yet.');
    expect(hint.className).toContain('text-hs-warning');
    expect(hint.className).not.toContain('text-hs-text-faint');
    expect(hint.className).toContain('text-[11px]');
  });
});

describe('Toggle description', () => {
  it('draws the help line and reads it out with the switch', () => {
    render(<Toggle label="Keep running" checked={false} onChange={vi.fn()} description="Keeps its data fresh." />);
    const toggle = screen.getByRole('switch', { name: 'Keep running' });
    const describedBy = toggle.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Keeps its data fresh.');
  });

  it('has no help line, and points at none, without a description', () => {
    render(<Toggle label="Keep running" checked onChange={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Keep running' }).getAttribute('aria-describedby')).toBeNull();
  });
});

describe('LabeledField and Slider hints', () => {
  it('points the field at its hint, and keeps the hint out of the name', () => {
    render(
      <LabeledField label="Name" hint="Shown at the top.">
        <input type="text" />
      </LabeledField>,
    );
    const box = screen.getByRole('textbox', { name: 'Name' });
    expect(document.getElementById(box.getAttribute('aria-describedby')!)?.textContent).toBe('Shown at the top.');
  });

  it('does the same for a slider', () => {
    render(<Slider label="Size" value={3} min={1} max={5} onChange={vi.fn()} hint="Bigger reads from across the room." />);
    const slider = screen.getByRole('slider');
    expect(document.getElementById(slider.getAttribute('aria-describedby')!)?.textContent).toBe('Bigger reads from across the room.');
  });
});
