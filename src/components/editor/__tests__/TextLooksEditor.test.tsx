// @vitest-environment jsdom

/**
 * The Text module's Looks list: a fresh look opens with a warning that it
 * changes nothing, the Then switches write and clear properties, and the
 * header pill follows the same evaluator the wall runs over the editor's
 * own bus when no display has reported.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { useEditorStore } from '@/stores/editor-store';
import { sharedStateStore } from '@/lib/shared-state-store';
import type { ScreenConfiguration, TextLook } from '@/types/config';

// No display has ever reported, so verdicts come from the editor's own bus.
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: async () => new Response('null', { status: 404 }),
  isSessionExpired: () => false,
  throwIfNotOk: () => {},
}));

import { TextLooksEditor } from '../config-sections/TextLooksEditor';

function Harness({ initial, ref }: { initial: TextLook[] | undefined; ref: { current: TextLook[] | undefined } }) {
  const [looks, setLooks] = useState<TextLook[] | undefined>(initial);
  ref.current = looks;
  return (
    <I18nProvider locale="en-US" blob={{ core, editor }}>
      <TextLooksEditor looks={looks} onChange={setLooks} />
    </I18nProvider>
  );
}

function renderLooks(initial: TextLook[] | undefined) {
  const ref: { current: TextLook[] | undefined } = { current: undefined };
  const utils = render(<Harness initial={initial} ref={ref} />);
  return { ...utils, ref };
}

const card = (container: HTMLElement, i = 0) => container.querySelectorAll('[data-text-looks] [data-rule-card]')[i];
const click = async (el: Element | null | undefined) => {
  await act(async () => { fireEvent.click(el!); });
};
const switchNamed = (scope: Element, name: string) =>
  Array.from(scope.querySelectorAll('label')).find((l) => l.textContent?.trim() === name)?.querySelector('[role=switch]');

beforeEach(() => {
  useEditorStore.setState({
    config: { screens: [], settings: { timezone: 'America/Chicago' } } as unknown as ScreenConfiguration,
    selectedDisplayId: null,
  });
});

afterEach(() => {
  cleanup();
  // A cleared key would stay on the bus as a tombstone for 15 s, and the
  // tests that start from an empty bus need it truly empty.
  sharedStateStore.__resetForTests();
  useEditorStore.setState({ config: null });
});

describe('TextLooksEditor', () => {
  it('starts empty with the hint and adds a look that warns it changes nothing', async () => {
    const { container, getByText, ref } = renderLooks(undefined);
    expect(getByText(editor.configSections.textLooks.empty)).toBeTruthy();

    await click(getByText(editor.configSections.textLooks.addLook));
    expect(ref.current).toHaveLength(1);
    expect(ref.current![0].when).toEqual([]);

    const c = card(container);
    expect(c.querySelector('[data-look-sets-nothing]')).toBeTruthy();
    expect(c.querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('always');
    expect(c.querySelector('[data-rule-summary]')?.textContent).toContain('always');
  });

  it('the Then switches write a default and clear on the way back', async () => {
    const { container, ref } = renderLooks([{ id: 'a', when: [] }]);
    await click(card(container).querySelector('[data-rule-toggle]'));
    const c = card(container);

    await click(switchNamed(c, editor.configSections.textLooks.borderColor));
    expect(ref.current![0].borderColor).toBe('#3b82f6');
    expect(c.querySelector('[data-look-sets-nothing]')).toBeNull();
    // A look with no conditions that sets something is in effect, not "always".
    expect(c.querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('showing');

    await click(switchNamed(c, editor.configSections.textLooks.showTextAs));
    expect(ref.current![0].text).toBe('');

    await click(switchNamed(c, editor.configSections.textLooks.fade));
    expect(ref.current![0].opacity).toBe(0.5);

    await click(switchNamed(c, editor.configSections.textLooks.borderColor));
    expect(ref.current![0].borderColor).toBeUndefined();
  });

  it('titles an unnamed card the way the canvas chip names it, and names the key in its summary', () => {
    const { container } = renderLooks([
      { id: 'a', when: [{ kind: 'numeric', sourceKey: 'plugin:foo:temp', above: 24 }], textColor: '#f00' },
      { id: 'b', when: [{ kind: 'state', sourceKey: 'plugin:foo:alert', equals: 'true' }], textColor: '#ff0' },
    ]);
    expect(card(container, 0).querySelector('[data-rule-name]')?.textContent).toBe('Look 1');
    expect(card(container, 1).querySelector('[data-rule-name]')?.textContent).toBe('Look 2');
    expect(card(container, 0).querySelector('[data-rule-summary]')?.textContent).toBe('temp above 24');
    expect(card(container, 1).querySelector('[data-rule-summary]')?.textContent).toBe('alert');
  });

  it('tells a look on a key nobody publishes that it changes nothing, not that the module waits', async () => {
    const { container } = renderLooks([{ id: 'a', when: [{ kind: 'state', sourceKey: 'garage.door', equals: 'open' }], textColor: '#f00' }]);
    await click(card(container).querySelector('[data-rule-toggle]'));
    expect(container.textContent).toContain('this look changes nothing');
    expect(container.textContent).not.toContain('Before data arrives');
  });

  it('judges a key-reading look on the editor bus and says what it is waiting for', async () => {
    const look: TextLook = {
      id: 'hot',
      name: 'Too warm',
      when: [{ kind: 'numeric', sourceKey: 'plugin:foo:temp', above: 24 }],
      textColor: '#f00',
    };
    const { container } = renderLooks([look]);
    // Nothing published anywhere: no verdict at all, never a guess.
    expect(card(container).querySelector('[data-look-verdict]')).toBeNull();
    expect(card(container).querySelector('[data-rule-summary]')?.textContent).toContain('above 24');
    expect(card(container).querySelector('[data-look-swatches]')).toBeTruthy();

    await act(async () => { sharedStateStore.publish('plugin:foo:temp', '21'); });
    expect(card(container).querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('unmet');

    await act(async () => { sharedStateStore.publish('plugin:foo:temp', '25'); });
    expect(card(container).querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('showing');
  });

  it('keeps the pill of an unconditional look above a key-reading one while nothing is published', async () => {
    const looks: TextLook[] = [
      { id: 'base', name: 'Base', when: [], textColor: '#111' },
      { id: 'hot', name: 'Too warm', when: [{ kind: 'numeric', sourceKey: 'plugin:foo:temp', above: 24 }], borderColor: '#f00' },
      { id: 'below', name: 'Below', when: [], backgroundColor: '#222' },
    ];
    const { container } = renderLooks(looks);
    expect(card(container, 0).querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('showing');
    // The key-reading look and everything under it have no verdict, not Waiting.
    expect(card(container, 1).querySelector('[data-look-verdict]')).toBeNull();
    expect(card(container, 2).querySelector('[data-look-verdict]')).toBeNull();

    await act(async () => { sharedStateStore.publish('plugin:foo:temp', '25'); });
    expect(card(container, 1).querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('showing');
    expect(card(container, 2).querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('showing');
  });

  it('marks a matching look that a higher one beats on every property as overruled', async () => {
    const looks: TextLook[] = [
      { id: 'a', name: 'First', when: [], textColor: '#111' },
      { id: 'b', name: 'Second', when: [], textColor: '#222' },
    ];
    const { container } = renderLooks(looks);
    expect(card(container, 0).querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('showing');
    expect(card(container, 1).querySelector('[data-look-verdict]')?.getAttribute('data-look-verdict')).toBe('overruled');
  });
});
