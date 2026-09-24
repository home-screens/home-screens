// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import ConfirmModal from '../ConfirmModal';
import { useConfirmStore } from '@/stores/confirm-store';

function mount() {
  render(
    <I18nProvider locale="en-US" blob={{ core: enUSCore }}>
      <ConfirmModal />
    </I18nProvider>,
  );
}

async function ask() {
  let answer: boolean | undefined;
  await act(async () => {
    void useConfirmStore.getState().confirm({ title: 'Delete chore?', message: 'It goes for good.', confirmLabel: 'Delete' })
      .then((value) => { answer = value; });
  });
  return () => answer;
}

afterEach(() => {
  cleanup();
  act(() => { useConfirmStore.getState().respond(false); });
});

describe('ConfirmModal', () => {
  it('opens on Cancel, so Enter never deletes by default', async () => {
    mount();
    const answer = await ask();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    // Focus lost (a click on the message text): Enter still does not confirm.
    (document.activeElement as HTMLElement).blur();
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Enter' }); });
    expect(useConfirmStore.getState().open).toBe(true);
    expect(answer()).toBeUndefined();
  });

  it('keeps every key but Tab from what is behind it, and Escape cancels only the dialog', async () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    mount();
    const answer = await ask();
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowRight' }); });
    expect(behind).not.toHaveBeenCalled();
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }); });
    expect(behind).not.toHaveBeenCalled();
    expect(answer()).toBe(false);
    window.removeEventListener('keydown', behind);
  });

  it('never lets a key reach a button behind it, and takes focus back', async () => {
    const behind = document.createElement('button');
    const pressed = vi.fn();
    behind.addEventListener('click', pressed);
    document.body.appendChild(behind);
    mount();
    const answer = await ask();
    behind.focus();
    await act(async () => { fireEvent.keyDown(behind, { key: 'Enter' }); });
    expect(pressed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    // Tab stays inside: Cancel, Delete, Cancel.
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'Tab' }); });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }));
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'Tab' }); });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(answer()).toBeUndefined();
    behind.remove();
  });

  it('answers a second question "no" while one is open, keeping the first', async () => {
    mount();
    await ask();
    let second: boolean | undefined;
    await act(async () => { second = await useConfirmStore.getState().confirm('Another?'); });
    expect(second).toBe(false);
    expect(screen.getByText('It goes for good.')).toBeTruthy();
  });

  it('cancels on a click on the backdrop', async () => {
    mount();
    const answer = await ask();
    await act(async () => { fireEvent.click(screen.getByRole('dialog')); });
    expect(answer()).toBe(false);
  });
});
