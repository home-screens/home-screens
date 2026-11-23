import { describe, it, expect, beforeEach, vi } from 'vitest';

let useConfirmStore: typeof import('@/stores/confirm-store').useConfirmStore;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('@/stores/confirm-store');
  useConfirmStore = mod.useConfirmStore;
});

const QUESTION = { message: 'Continue?', confirmLabel: 'Continue', variant: 'primary' } as const;

describe('confirm store', () => {
  it('starts in closed state', () => {
    const state = useConfirmStore.getState();
    expect(state.open).toBe(false);
    expect(state.resolve).toBeNull();
  });

  it('confirm() opens the dialog with options', () => {
    useConfirmStore.getState().confirm({
      title: 'Delete?',
      message: 'Are you sure?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });

    const state = useConfirmStore.getState();
    expect(state.open).toBe(true);
    expect(state.options).toMatchObject({
      kind: 'confirm',
      title: 'Delete?',
      message: 'Are you sure?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
  });

  it('confirm() resolves to true when respond(true) is called', async () => {
    const promise = useConfirmStore.getState().confirm(QUESTION);
    useConfirmStore.getState().respond(true);

    const result = await promise;
    expect(result).toBe(true);
    expect(useConfirmStore.getState().open).toBe(false);
  });

  it('confirm() resolves to false when respond(false) is called', async () => {
    const promise = useConfirmStore.getState().confirm(QUESTION);
    useConfirmStore.getState().respond(false);

    const result = await promise;
    expect(result).toBe(false);
    expect(useConfirmStore.getState().open).toBe(false);
  });

  it('alert() opens as an alert, leaving its words to the dialog', () => {
    useConfirmStore.getState().alert('Something happened');

    const state = useConfirmStore.getState();
    expect(state.open).toBe(true);
    // No English here: ConfirmModal says "Notice" and "OK" from the dictionary.
    expect(state.options).toEqual({ kind: 'alert', title: undefined, message: 'Something happened' });
  });

  it('alert() accepts a custom title', () => {
    useConfirmStore.getState().alert('Error!', 'Oops');

    const state = useConfirmStore.getState();
    expect(state.options.title).toBe('Oops');
  });

  it('alert() resolves when respond is called', async () => {
    const promise = useConfirmStore.getState().alert('Done');
    useConfirmStore.getState().respond(true);

    // alert returns Promise<void>, just verify it resolves without error
    await expect(promise).resolves.toBeUndefined();
    expect(useConfirmStore.getState().open).toBe(false);
  });

  it('respond() clears the resolve callback', () => {
    useConfirmStore.getState().confirm(QUESTION);
    expect(useConfirmStore.getState().resolve).not.toBeNull();

    useConfirmStore.getState().respond(true);
    expect(useConfirmStore.getState().resolve).toBeNull();
  });
});
