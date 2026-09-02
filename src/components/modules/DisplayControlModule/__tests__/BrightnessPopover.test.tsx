// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BrightnessPopover } from '../BrightnessPopover';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import enUSModules from '@/translations/en-US/modules.json';

afterEach(() => {
  cleanup();
  __resetLoaderForTests();
});

function wrap(children: ReactNode) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

describe('BrightnessPopover', () => {
  it('renders a slider with the reported value', () => {
    render(wrap(<BrightnessPopover initial={72} onCommit={() => {}} onDismiss={() => {}} />));
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('72');
    expect(screen.getByText('72%')).toBeTruthy();
  });

  it('shows a dash and an unpainted track until a value is reported', () => {
    render(wrap(<BrightnessPopover initial={null} onCommit={() => {}} onDismiss={() => {}} />));
    expect(screen.getByText('–')).toBeTruthy();
    const slider = screen.getByRole('slider', { name: 'Brightness, not reported yet' }) as HTMLInputElement;
    expect(slider.style.background).not.toContain('gradient');
  });

  it('does not fire onCommit on every drag tick', () => {
    const onCommit = vi.fn();
    render(wrap(<BrightnessPopover initial={10} onCommit={onCommit} onDismiss={() => {}} />));
    const slider = screen.getByRole('slider');
    fireEvent.input(slider, { target: { value: '40' } });
    fireEvent.input(slider, { target: { value: '80' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('fires onCommit with the final value on pointerup', () => {
    const onCommit = vi.fn();
    render(wrap(<BrightnessPopover initial={10} onCommit={onCommit} onDismiss={() => {}} />));
    const slider = screen.getByRole('slider');
    fireEvent.input(slider, { target: { value: '80' } });
    fireEvent.pointerUp(slider);
    expect(onCommit).toHaveBeenCalledWith(80);
  });

  it('does not fire onCommit on a release that never moved the slider', () => {
    const onCommit = vi.fn();
    render(wrap(<BrightnessPopover initial={null} onCommit={onCommit} onDismiss={() => {}} />));
    fireEvent.pointerUp(screen.getByRole('slider'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('dismisses on outside click', () => {
    const onDismiss = vi.fn();
    render(wrap(
      <>
        <div data-testid="outside">outside</div>
        <BrightnessPopover initial={50} onCommit={() => {}} onDismiss={onDismiss} />
      </>,
    ));
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
