// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';

function renderWrapper(style: Partial<ModuleStyle> = {}) {
  return render(
    <ModuleWrapper style={{ ...DEFAULT_MODULE_STYLE, ...style }}>
      <div data-testid="content">body</div>
    </ModuleWrapper>,
  );
}

afterEach(cleanup);

describe('ModuleWrapper title strip', () => {
  it('renders no strip and no flex column when the title is empty', () => {
    const { container } = renderWrapper();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.querySelector('[data-module-title]')).toBeNull();
    // Title-less modules keep the exact original structure: a single child,
    // no flex column, no content box.
    expect(wrapper.className).not.toContain('flex');
    expect(wrapper.childElementCount).toBe(1);
    expect(wrapper.firstElementChild?.getAttribute('data-testid')).toBe('content');
  });

  it('treats a whitespace-only title as absent', () => {
    const { container } = renderWrapper({ title: '   ' });
    expect(container.querySelector('[data-module-title]')).toBeNull();
    expect((container.firstElementChild as HTMLElement).className).not.toContain('flex');
  });

  it('renders a centered strip above a flexed content box when titled', () => {
    const { container } = renderWrapper({ title: 'Weather' });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('flex');
    const strip = wrapper.querySelector('[data-module-title]');
    expect(strip?.textContent).toBe('Weather');
    // Single line with ellipsis truncation.
    expect(strip?.className).toContain('truncate');
    expect(strip?.className).toContain('text-center');
    // Content moves into the flex-1 remainder box.
    const content = wrapper.querySelector(':scope > div > [data-testid="content"]');
    expect(content).not.toBeNull();
  });

  it('falls back to the module font size when titleFontSize is unset', () => {
    const { container } = renderWrapper({ title: 'Weather', fontSize: 22 });
    const strip = container.querySelector('[data-module-title]') as HTMLElement;
    expect(strip.style.fontSize).toBe('22px');
  });

  it('uses titleFontSize when set', () => {
    const { container } = renderWrapper({ title: 'Weather', fontSize: 22, titleFontSize: 34 });
    const strip = container.querySelector('[data-module-title]') as HTMLElement;
    expect(strip.style.fontSize).toBe('34px');
  });

  it('falls back to the module font size when titleFontSize is invalid', () => {
    // Hand-edited configs can carry 0 / negative values; an invalid size must
    // not render an invisible strip — it falls back like an unset one.
    const { container } = renderWrapper({ title: 'Weather', fontSize: 22, titleFontSize: 0 });
    const strip = container.querySelector('[data-module-title]') as HTMLElement;
    expect(strip.style.fontSize).toBe('22px');
    const { container: neg } = renderWrapper({ title: 'Weather', fontSize: 22, titleFontSize: -4 });
    expect((neg.querySelector('[data-module-title]') as HTMLElement).style.fontSize).toBe('22px');
  });

  it('pads 0 above and 8 below the strip text on a padded card', () => {
    const { container } = renderWrapper({ title: 'Weather' });
    const strip = container.querySelector('[data-module-title]') as HTMLElement;
    expect(strip.style.paddingTop).toBe('0px');
    expect(strip.style.paddingLeft).toBe('0px');
    expect(strip.style.paddingBottom).toBe('8px');
  });

  it('carries the default card inset itself when the card padding is 0', () => {
    // Media modules (image, video, slideshow, iframe) force padding: 0 so
    // content runs edge to edge — the strip must not sit flush against the
    // card corners, so it brings the default inset (16px) along.
    const { container } = renderWrapper({ title: 'Weather', padding: 0 });
    const strip = container.querySelector('[data-module-title]') as HTMLElement;
    expect(strip.style.paddingTop).toBe('16px');
    expect(strip.style.paddingLeft).toBe('16px');
    expect(strip.style.paddingRight).toBe('16px');
    expect(strip.style.paddingBottom).toBe('8px');
  });

  it('keeps the strip outside the forced-weight subtree when titled', () => {
    // The forced weight travels via the .module-weight-override class + CSS
    // variable. On titled cards the class sits on the CONTENT BOX, not the
    // wrapper, so the strip is a sibling the override rule can never reach —
    // no inline 400 or per-element CSS carve-out needed.
    const { container } = renderWrapper({ title: 'Weather', fontWeight: 900 });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toContain('module-weight-override');
    const strip = container.querySelector('[data-module-title]') as HTMLElement;
    expect(strip.style.fontWeight).toBe('');
    const contentBox = strip.nextElementSibling as HTMLElement;
    expect(contentBox.className).toContain('module-weight-override');
    expect(contentBox.querySelector('[data-testid="content"]')).not.toBeNull();
  });

  it('keeps the forced-weight class on the wrapper itself when untitled', () => {
    // Untitled modules preserve the original single-element structure, so the
    // class stays where it always was.
    const { container } = renderWrapper({ fontWeight: 900 });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('module-weight-override');
    expect(wrapper.childElementCount).toBe(1);
  });
});
