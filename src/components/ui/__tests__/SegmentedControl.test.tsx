// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LabeledField from '../LabeledField';
import SegmentedControl from '../SegmentedControl';

const OPTIONS = [
  { value: 'less', label: 'Less' },
  { value: 'some', label: 'Some' },
  { value: 'more', label: 'More' },
] as const;

afterEach(cleanup);

function radios() {
  return screen.getAllByRole('radio');
}

describe('SegmentedControl', () => {
  it('draws a radio group whose chosen option is the only checked one', () => {
    render(<SegmentedControl label="Detail" value="some" onChange={vi.fn()} options={OPTIONS} />);

    const group = screen.getByRole('radiogroup', { name: 'Detail' });
    expect(group).toBeTruthy();
    expect(radios().map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    // A value picker, not a set of toggle buttons.
    expect(radios().every((radio) => radio.getAttribute('aria-pressed') === null)).toBe(true);
  });

  it('keeps one tab stop and moves it with the chosen option', () => {
    const { rerender } = render(<SegmentedControl value="less" onChange={vi.fn()} options={OPTIONS} />);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);

    rerender(<SegmentedControl value="more" onChange={vi.fn()} options={OPTIONS} />);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('moves between options with the arrow keys and wraps at both ends', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SegmentedControl label="Detail" value="some" onChange={onChange} options={OPTIONS} />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Detail' });

    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('more');
    expect(document.activeElement).toBe(radios()[2]);

    rerender(<SegmentedControl label="Detail" value="more" onChange={onChange} options={OPTIONS} />);
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('less');

    rerender(<SegmentedControl label="Detail" value="less" onChange={onChange} options={OPTIONS} />);
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('more');

    fireEvent.keyDown(group, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('more');

    rerender(<SegmentedControl label="Detail" value="more" onChange={onChange} options={OPTIONS} />);
    fireEvent.keyDown(group, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('less');
  });

  it('also answers to the up and down arrows', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Detail" value="less" onChange={onChange} options={OPTIONS} />);
    const group = screen.getByRole('radiogroup', { name: 'Detail' });

    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('some');
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('more');
  });

  it('reports the value a click picked, and nothing when the value is unchanged', () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="some" onChange={onChange} options={OPTIONS} />);

    fireEvent.click(screen.getByRole('radio', { name: 'More' }));
    expect(onChange).toHaveBeenCalledWith('more');

    onChange.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: 'Some' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes no input at all while disabled', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Detail" value="some" onChange={onChange} options={OPTIONS} disabled />);
    const group = screen.getByRole('radiogroup', { name: 'Detail' });

    expect(group.getAttribute('aria-disabled')).toBe('true');
    expect(radios().every((radio) => (radio as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'More' }));
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards an id, so a LabeledField caption has something to point at', () => {
    render(
      <LabeledField label="Detail" as="div">
        <SegmentedControl label="Detail" value="some" onChange={vi.fn()} options={OPTIONS} />
      </LabeledField>,
    );

    const caption = screen.getByText('Detail', { selector: 'label' }) as HTMLLabelElement;
    const group = screen.getByRole('radiogroup', { name: 'Detail' });
    expect(caption.htmlFor).toBeTruthy();
    expect(group.id).toBe(caption.htmlFor);
  });

  it('steps over an option that is switched off, by arrow and by click', () => {
    const onChange = vi.fn();
    const options = [
      { value: 'less', label: 'Less' },
      { value: 'some', label: 'Some', disabled: true },
      { value: 'more', label: 'More' },
    ] as const;
    render(<SegmentedControl label="Detail" value="less" onChange={onChange} options={options} />);
    const group = screen.getByRole('radiogroup', { name: 'Detail' });

    expect((screen.getByRole('radio', { name: 'Some' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Some' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('more');
  });

  it('gives the tab stop to the first option it can take when the chosen one is switched off', () => {
    const options = [
      { value: 'less', label: 'Less', disabled: true },
      { value: 'some', label: 'Some' },
    ] as const;
    render(<SegmentedControl value="less" onChange={vi.fn()} options={options} />);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, 0]);
  });

  it('draws an icon before the label and keeps the label as the spoken name', () => {
    const options = [
      { value: 'less', label: 'Less', icon: <svg aria-hidden="true" data-testid="less-icon" />, testId: 'opt-less' },
      { value: 'more', label: 'More' },
    ] as const;
    render(<SegmentedControl value="less" onChange={vi.fn()} options={options} />);
    const less = screen.getByRole('radio', { name: 'Less' });
    expect(less.getAttribute('data-testid')).toBe('opt-less');
    expect(less.querySelector('[data-testid="less-icon"]')).not.toBeNull();
  });

  it('sizes the track to its options with fit="content"', () => {
    render(<SegmentedControl label="Detail" value="some" onChange={vi.fn()} options={OPTIONS} fit="content" />);
    const group = screen.getByRole('radiogroup', { name: 'Detail' });
    expect(group.classList.contains('w-fit')).toBe(true);
    expect(group.classList.contains('w-full')).toBe(false);
    expect(radios().some((radio) => radio.classList.contains('flex-1'))).toBe(false);
  });
});
