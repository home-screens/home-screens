// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ConditionValueControl } from '../ConditionTreeEditor';
import type { StateKeyDescriptor } from '@/types/plugins';
import type { TranslateFn } from '@/i18n';

/**
 * Value entry for `state` conditions: with an enum descriptor the control is
 * a select over the key's raw vocabulary ("Alert (on)" STORES `on`), with a
 * "Custom value…" escape hatch back to free text. Without a descriptor it is
 * exactly the old free-text input. The three-vocabularies trap (card label vs
 * HA UI label vs raw state) is eliminated by construction: every pickable
 * option carries the raw value.
 */

const t = ((key: string) => key) as TranslateFn;

const DOOR: StateKeyDescriptor = {
  key: 'plugin:ha:binary_sensor.door',
  label: 'Back Door',
  valueType: 'enum',
  valueOptions: [
    { value: 'on', label: 'Open' },
    { value: 'off', label: 'Closed' },
  ],
};

afterEach(cleanup);

describe('ConditionValueControl', () => {
  it('renders a plain text input when no descriptor is known', () => {
    const { container } = render(
      <ConditionValueControl value="on" onCommit={() => {}} descriptor={null} t={t} />,
    );
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('input')!.value).toBe('on');
  });

  it('renders "Friendly (raw)" options and commits the RAW value on pick', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <ConditionValueControl value="" onCommit={onCommit} descriptor={DOOR} t={t} />,
    );
    const select = container.querySelector('select')!;
    const texts = Array.from(select.options).map((o) => o.textContent);
    expect(texts).toContain('Open (on)');
    expect(texts).toContain('Closed (off)');

    fireEvent.change(select, { target: { value: 'on' } });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('on');
  });

  it('round-trips an existing raw value: the option is pre-selected, no text input', () => {
    const { container } = render(
      <ConditionValueControl value="off" onCommit={() => {}} descriptor={DOOR} t={t} />,
    );
    expect(container.querySelector('select')!.value).toBe('off');
    expect(container.querySelector('input')).toBeNull();
  });

  it('a value outside the vocabulary (comma list, custom) opens the text input', () => {
    const { container } = render(
      <ConditionValueControl value="on, off" onCommit={() => {}} descriptor={DOOR} t={t} />,
    );
    expect(container.querySelector('select')!.value).toBe('__hs_custom__');
    expect(container.querySelector('input')!.value).toBe('on, off');
  });

  it('picking "Custom value…" opens the text input without committing anything', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <ConditionValueControl value="on" onCommit={onCommit} descriptor={DOOR} t={t} />,
    );
    fireEvent.change(container.querySelector('select')!, { target: { value: '__hs_custom__' } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.querySelector('input')).not.toBeNull();
  });

  it('picking a real option after custom mode closes the text input again', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <ConditionValueControl value="on" onCommit={onCommit} descriptor={DOOR} t={t} />,
    );
    const select = container.querySelector('select')!;
    fireEvent.change(select, { target: { value: '__hs_custom__' } });
    expect(container.querySelector('input')).not.toBeNull();
    fireEvent.change(select, { target: { value: 'off' } });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('off');
    expect(container.querySelector('input')).toBeNull();
  });

  it('a non-enum descriptor renders the free-text input', () => {
    const { container } = render(
      <ConditionValueControl
        value="72"
        onCommit={() => {}}
        descriptor={{ key: 'plugin:ha:sensor.t', label: 'Temp', valueType: 'numeric', unit: '°F' }}
        t={t}
      />,
    );
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('input')!.value).toBe('72');
  });

  it('an option whose label equals its value renders once, not "on (on)"', () => {
    const descriptor: StateKeyDescriptor = {
      key: 'plugin:ha:switch.fan',
      label: 'Fan',
      valueType: 'enum',
      valueOptions: [{ value: 'on', label: 'on' }, { value: 'off' }],
    };
    const { container } = render(
      <ConditionValueControl value="" onCommit={() => {}} descriptor={descriptor} t={t} />,
    );
    const texts = Array.from(container.querySelector('select')!.options).map((o) => o.textContent);
    expect(texts).toContain('on');
    expect(texts).toContain('off');
    expect(texts).not.toContain('on (on)');
  });
});
