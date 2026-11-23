// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { useWallTyping } from '../useWallTyping';
import { WallTypingSheet } from '../WallTypingSheet';
import { WallNotice } from '../WallNotice';

afterEach(cleanup);

function Sheet({ onAction, onClose, maxLength = 80 }: { onAction: (text: string) => void; onClose: () => void; maxLength?: number }) {
  const typing = useWallTyping({ maxLength, capitalize: true });
  return (
    <WallTypingSheet
      label="Add to Shopping"
      kicker="Add to"
      title="Shopping"
      aside="5 left"
      theme={getThemeTokens('charcoal')}
      accent="#3b82f6"
      typing={typing}
      placeholder="Type it here"
      actionLabel="Add"
      onAction={() => { onAction(typing.text.trim()); typing.clear(); }}
      onClose={onClose}
    >
      <WallNotice tone="info" P={(n) => n}>Type one thing, then tap Add.</WallNotice>
    </WallTypingSheet>
  );
}

function open(props: Partial<Parameters<typeof Sheet>[0]> = {}) {
  const onAction = props.onAction ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  render(
    <I18nProvider locale="en-US" blob={{ core, modules }}>
      <Sheet onAction={onAction} onClose={onClose} maxLength={props.maxLength} />
    </I18nProvider>,
  );
  const keyboard = screen.getByTestId('wall-keyboard');
  const tap = (key: string) => fireEvent.click(within(keyboard).getByText((_, el) => el?.getAttribute('data-key') === key));
  const words = () => screen.getByTestId('wall-text-field-words').textContent?.replace('Type it here', '') ?? '';
  return { onAction, onClose, keyboard, tap, words };
}

describe('WallTypingSheet', () => {
  it('starts with a capital by itself, then types small letters', () => {
    const { tap, words, keyboard } = open();
    expect(within(keyboard).getByRole('button', { name: 'Capital letter' }).getAttribute('aria-pressed')).toBe('true');
    tap('P');
    for (const key of 'aper') tap(key);
    tap('space');
    for (const key of 'towels') tap(key);
    expect(words()).toBe('Paper towels');
  });

  it('gives one capital for a tap on Shift, then goes back to small letters', () => {
    const { tap, words, keyboard } = open();
    tap('M');
    tap('r');
    tap('space');
    fireEvent.click(within(keyboard).getByRole('button', { name: 'Capital letter' }));
    tap('L');
    tap('e');
    expect(words()).toBe('Mr Le');
  });

  it('keeps the 123 page after a space, until abc is tapped', () => {
    const { tap, words, keyboard } = open();
    tap('B');
    tap('numbers');
    expect(keyboard.getAttribute('data-page')).toBe('numbers');
    tap('(');
    tap('space');
    tap('2');
    expect(keyboard.getAttribute('data-page')).toBe('numbers');
    tap('letters');
    tap('x');
    expect(words()).toBe('B( 2x');
  });

  it('starts the next line on the letters with a capital, after a line ended on the 123 page', () => {
    const { tap, keyboard, words } = open();
    tap('B');
    tap('numbers');
    tap('2');
    tap('action');
    expect(keyboard.getAttribute('data-page')).toBe('letters');
    tap('M');
    expect(words()).toBe('M');
  });

  it('does nothing on Add until something is typed, then hands over the words', () => {
    const { tap, onAction, words } = open();
    tap('action');
    expect(onAction).not.toHaveBeenCalled();
    for (const key of ['M', 'i', 'l', 'k']) tap(key);
    tap('action');
    expect(onAction).toHaveBeenCalledWith('Milk');
    expect(words()).toBe('');
  });

  it('counts down near the cap and stops there', () => {
    const { tap } = open({ maxLength: 12 });
    tap('A');
    expect(screen.queryByTestId('wall-text-field-left')).toBeNull();
    for (let i = 0; i < 3; i++) tap('a');
    expect(screen.getByTestId('wall-text-field-left').textContent).toBe('8 left');
    for (let i = 0; i < 20; i++) tap('a');
    expect(screen.getByTestId('wall-text-field-left').textContent).toBe('0 left');
  });

  it('closes from its Close button', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByTestId('wall-typing-sheet-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes from a tap on the dark part only while nothing is typed', () => {
    vi.useFakeTimers();
    try {
      const { onClose, tap } = open();
      // Past the double tap that opened it.
      vi.advanceTimersByTime(1000);
      tap('P');
      fireEvent.click(screen.getByTestId('wall-typing-sheet'));
      expect(onClose).not.toHaveBeenCalled();
      tap('delete');
      fireEvent.click(screen.getByTestId('wall-typing-sheet'));
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws the slot under the field', () => {
    open();
    expect(screen.getByRole('status').textContent).toContain('Type one thing');
  });
});
