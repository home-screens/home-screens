// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import ColorPicker from '../ColorPicker';

function pick(value: string, hex: string) {
  const onChange = vi.fn();
  const { container } = render(<ColorPicker label="Background" value={value} onChange={onChange} />);
  fireEvent.change(container.querySelector('input[type="color"]')!, { target: { value: hex } });
  return onChange;
}

afterEach(cleanup);

describe('ColorPicker swatch pick', () => {
  it('lands solid when the colour was fully see-through', () => {
    expect(pick('transparent', '#3366ff')).toHaveBeenCalledWith('#3366ff');
    expect(pick('rgba(0, 0, 0, 0)', '#3366ff')).toHaveBeenCalledWith('#3366ff');
  });

  it('keeps a partial see-through amount', () => {
    expect(pick('rgba(0,0,0,0.5)', '#ff0000')).toHaveBeenCalledWith('rgba(255, 0, 0, 0.5)');
  });

  it('stays a plain hex for a solid colour', () => {
    expect(pick('#336699', '#ff0000')).toHaveBeenCalledWith('#ff0000');
  });
});

describe('ColorPicker accent swatches', () => {
  const renderAccent = (value: string, swatches: 'accent' | 'accent-or-none') => {
    const onChange = vi.fn();
    const { container } = render(
      <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
        <ColorPicker label="Accent Color" value={value} onChange={onChange} swatches={swatches} />
      </I18nProvider>,
    );
    return { onChange, container, group: screen.getByRole('group', { name: 'Accent Color' }) };
  };

  it('picks a swatch in one click and marks the chosen one', () => {
    const { onChange, group } = renderAccent('#3b82f6', 'accent');
    expect(within(group).getByRole('button', { name: 'Blue' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).queryByRole('button', { name: 'None' })).toBeNull();

    fireEvent.click(within(group).getByRole('button', { name: 'Green' }));
    expect(onChange).toHaveBeenCalledWith('#22c55e');
  });

  it('offers None for a module that draws no accent, and reads None instead of black', () => {
    const { onChange, group, container } = renderAccent('#000000', 'accent-or-none');
    expect(within(group).getByRole('button', { name: 'None' }).getAttribute('aria-pressed')).toBe('true');
    const box = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(box.value).toBe('');
    expect(box.placeholder).toBe('None');

    fireEvent.click(within(group).getByRole('button', { name: 'Pink' }));
    expect(onChange).toHaveBeenLastCalledWith('#ec4899');
  });

  it('goes back to no accent when the box is emptied', () => {
    const { onChange, container } = renderAccent('#ec4899', 'accent-or-none');
    const box = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(onChange).toHaveBeenLastCalledWith('#000000');
  });
});
