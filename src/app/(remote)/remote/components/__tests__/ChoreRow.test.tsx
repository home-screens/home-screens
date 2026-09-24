// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import { UNCHECK_HOLD_MS } from '@/hooks/useHoldToUncheck';
import ChoreRow, { type ChoreRowAssignment } from '../ChoreRow';

/**
 * The kid tablet's half of press-and-hold to un-check. The wall chart now
 * shares the same gesture, so this pins the behaviour the shared hook has to
 * keep: a tap checks off, only a hold un-checks, and the trailing click a
 * completed hold fires is swallowed.
 */

function render(children: ReactNode) {
  return renderUI(children, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, modules, remote }}>{children}</I18nProvider>
    ),
  });
}

function assignment(isCompleted: boolean): ChoreRowAssignment {
  return { choreId: 'c1', choreName: 'Make your bed', choreEmoji: '', points: 2, isCompleted };
}

function row(opts: { isCompleted: boolean; holdToUncheck?: boolean; readOnly?: boolean }) {
  const onToggle = vi.fn();
  render(
    <ChoreRow
      assignment={assignment(opts.isCompleted)}
      isToggling={false}
      readOnly={opts.readOnly ?? false}
      holdToUncheck={opts.holdToUncheck ?? true}
      checkedColor="#f59e0b"
      showPoints
      onToggle={onToggle}
      view="kid:2026-09-23"
    />,
  );
  return { onToggle, button: screen.getByRole('button') };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('ChoreRow press-and-hold', () => {
  it('checks an unfinished chore off on a single tap', () => {
    const { onToggle, button } = row({ isCompleted: false });

    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.click(button, { detail: 1 });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('ignores a tap on a finished chore and shows the hint instead', () => {
    const { onToggle, button } = row({ isCompleted: true });

    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.click(button, { detail: 1 });

    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Press and hold to un-check');
  });

  it('un-checks once on a completed hold, swallowing the click that follows', () => {
    const { onToggle, button } = row({ isCompleted: true });

    fireEvent.pointerDown(button);
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(button);
    fireEvent.click(button, { detail: 1 });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('lets a keyboard un-check, since a key cannot be held', () => {
    const { onToggle, button } = row({ isCompleted: true });

    fireEvent.click(button, { detail: 0 });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('taps straight through when the hold is not asked for', () => {
    const { onToggle, button } = row({ isCompleted: true, holdToUncheck: false });

    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.click(button, { detail: 1 });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
