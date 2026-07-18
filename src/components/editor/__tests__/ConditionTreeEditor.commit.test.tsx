// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SourceKeyInput, ConditionValueInput, ConditionBoundInput, isCaseOnlyMismatch } from '../ConditionTreeEditor';
import type { TranslateFn } from '@/i18n';

/**
 * On-blur commit semantics for the condition inputs. Per-keystroke commits
 * flowed through updateModule → autosave (800ms) → display poll (3s), so a
 * pause mid-key ("plugin:home-assis") saved a charset-valid but unknown key
 * and hid the edited module on the kiosk until typing finished. Keystrokes
 * must stay local; only blur (or Enter) may reach the store.
 */

const t = ((key: string) => key) as TranslateFn;

const OPTIONS = [
  { key: 'plugin:ha:door', label: 'Door', sampleValues: ['open', 'closed'] },
  { key: 'plugin:ha:temp', label: 'Temperature' },
];

function renderSourceKey(onChange: (key: string) => void, value = '') {
  const utils = render(
    <SourceKeyInput value={value} onChange={onChange} options={OPTIONS} t={t} />,
  );
  return utils.container.querySelector('input')!;
}

afterEach(cleanup);

describe('SourceKeyInput commit-on-blur', () => {
  it('does not call onChange while typing', () => {
    const onChange = vi.fn();
    const input = renderSourceKey(onChange);
    fireEvent.change(input, { target: { value: 'plugin:home-assis' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('plugin:home-assis');
  });

  it('commits the draft on blur', () => {
    const onChange = vi.fn();
    const input = renderSourceKey(onChange);
    fireEvent.change(input, { target: { value: 'plugin:ha:door' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('plugin:ha:door');
  });

  it('commits on Enter (via blur)', () => {
    const onChange = vi.fn();
    const input = renderSourceKey(onChange);
    fireEvent.change(input, { target: { value: 'plugin:ha:door' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // jsdom does not blur on keyDown by itself — the handler calls blur()
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('plugin:ha:door');
  });

  it('does not commit an unchanged value on blur', () => {
    const onChange = vi.fn();
    const input = renderSourceKey(onChange, 'plugin:ha:door');
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('resets the draft when the committed value changes externally', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <SourceKeyInput value="a" onChange={onChange} options={[]} t={t} />,
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'half-typed' } });
    rerender(
      <SourceKeyInput value="b.key" onChange={onChange} options={[]} t={t} />,
    );
    expect(input.value).toBe('b.key');
  });

  it('shows the unknown-key warning against the draft while typing', () => {
    const { container } = render(
      <SourceKeyInput value="plugin:ha:door" onChange={() => {}} options={OPTIONS} t={t} />,
    );
    const input = container.querySelector('input')!;
    expect(container.textContent).not.toContain('sourceKeyUnknown');
    fireEvent.change(input, { target: { value: 'plugin:ha:do' } });
    expect(container.textContent).toContain('sourceKeyUnknown');
  });

  it('does not flag an empty draft as invalid (incomplete, not wrong)', () => {
    const { container } = render(
      <SourceKeyInput value="" onChange={() => {}} options={OPTIONS} t={t} />,
    );
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(container.textContent).not.toContain('sourceKeyInvalid');
    expect(container.textContent).not.toContain('sourceKeyUnknown');
  });
});

describe('SourceKeyInput suggestion dropdown', () => {
  function renderWithDropdown(onChange: (key: string) => void = () => {}, value = '') {
    const utils = render(
      <SourceKeyInput value={value} onChange={onChange} options={OPTIONS} t={t} />,
    );
    return { ...utils, input: utils.container.querySelector('input')! };
  }

  it('opens on focus with all options when the field is empty', () => {
    const { container, input } = renderWithDropdown();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    fireEvent.focus(input);
    const items = container.querySelectorAll('[role="option"]');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('plugin:ha:door');
    expect(items[0].textContent).toContain('open, closed');
  });

  it('stays open (full list) when the value already matches a provided key', () => {
    const { container, input } = renderWithDropdown(() => {}, 'plugin:ha:door');
    fireEvent.focus(input);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
  });

  it('filters options as the user types', () => {
    const { container, input } = renderWithDropdown();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'temp' } });
    const items = container.querySelectorAll('[role="option"]');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('plugin:ha:temp');
  });

  it('commits immediately on option click and closes the list', () => {
    const onChange = vi.fn();
    const { container, input } = renderWithDropdown(onChange);
    fireEvent.focus(input);
    const option = container.querySelectorAll('[role="option"]')[1];
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('plugin:ha:temp');
    expect(input.value).toBe('plugin:ha:temp');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('supports arrow-key navigation and Enter to pick', () => {
    const onChange = vi.fn();
    const { input } = renderWithDropdown(onChange);
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('plugin:ha:temp');
  });

  it('closes on Escape and on blur', () => {
    const { container, input } = renderWithDropdown();
    fireEvent.focus(input);
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(container.querySelector('[role="listbox"]')).toBeNull();

    fireEvent.focus(input);
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    fireEvent.blur(input);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('is not wrapped in a label (label click-forwarding opened the dropdown from the whole panel)', () => {
    const { container } = render(
      <SourceKeyInput value="" onChange={() => {}} options={OPTIONS} t={t} />,
    );
    expect(container.querySelector('label')).toBeNull();
    expect(container.querySelector('input')!.getAttribute('aria-label')).toBe(
      'visibilityConditions.sourceKeyLabel',
    );
  });

  it('renders no dropdown when there are no providers', () => {
    const { container } = render(
      <SourceKeyInput value="" onChange={() => {}} options={[]} t={t} />,
    );
    const input = container.querySelector('input')!;
    fireEvent.focus(input);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe('isCaseOnlyMismatch', () => {
  it('flags a value that differs from the live value only by case', () => {
    expect(isCaseOnlyMismatch('On', 'on')).toBe(true);
    expect(isCaseOnlyMismatch(['Clear', 'Alert'], 'clear')).toBe(true);
  });

  it('does not flag exact matches or genuinely different values', () => {
    expect(isCaseOnlyMismatch('on', 'on')).toBe(false);
    expect(isCaseOnlyMismatch(['on', 'off'], 'off')).toBe(false);
    expect(isCaseOnlyMismatch('open', 'closed')).toBe(false);
  });

  it('is silent when there is no expectation or no live value', () => {
    expect(isCaseOnlyMismatch(undefined, 'on')).toBe(false);
    expect(isCaseOnlyMismatch('on', undefined)).toBe(false);
  });
});

describe('ConditionValueInput commit-on-blur', () => {
  it('keeps keystrokes local and commits the raw string on blur', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <ConditionValueInput value="" onCommit={onCommit} placeholder="value" />,
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'on, off' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('on, off');
  });
});

describe('ConditionBoundInput commit-on-blur', () => {
  function renderBound(onCommit: (bound: number | undefined) => void, value?: number) {
    const utils = render(<ConditionBoundInput value={value} onCommit={onCommit} label="above" />);
    return utils.container.querySelector('input')!;
  }

  it('does not commit half-typed values like "-" (would transiently drop the bound)', () => {
    // A number input exposes partial numeric input ("-", "1e") as '' — with
    // per-keystroke commits that '' parsed to "no bound" and transiently
    // flipped the gated module's visibility. Nothing may commit until blur.
    const onCommit = vi.fn();
    const input = renderBound(onCommit, 5);
    fireEvent.change(input, { target: { value: '-' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits the parsed number on blur', () => {
    const onCommit = vi.fn();
    const input = renderBound(onCommit);
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(-5);
  });

  it('commits undefined (no bound) when cleared', () => {
    const onCommit = vi.fn();
    const input = renderBound(onCommit, 5);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('does not commit an unchanged value on blur', () => {
    const onCommit = vi.fn();
    const input = renderBound(onCommit, 5);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
