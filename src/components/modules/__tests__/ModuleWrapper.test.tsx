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

  it('pads 0 above and 8 below the strip text', () => {
    const { container } = renderWrapper({ title: 'Weather' });
    const strip = container.querySelector('[data-module-title]') as HTMLElement;
    expect(strip.style.paddingTop).toBe('');
    expect(strip.style.paddingBottom).toBe('8px');
  });

  it('keeps the strip at normal weight even under a forced module weight', () => {
    // The forced weight travels via the .module-weight-override class + CSS
    // variable (not inline), and the rule in globals.css spares
    // [data-module-title]. jsdom does not apply stylesheet rules, so what is
    // testable here is the inline 400 that beats the class's INHERITANCE
    // from the wrapper element itself.
    const { container } = renderWrapper({ title: 'Weather', fontWeight: 900 });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('module-weight-override');
    const strip = container.querySelector('[data-module-title]') as HTMLElement;
    expect(strip.style.fontWeight).toBe('400');
  });
});
